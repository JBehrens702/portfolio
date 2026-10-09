"use server";

import { updateTag } from "next/cache";
import { requireOwner } from "@/lib/auth/owner";
import { collectMediaGarbage, createMediaStorageFromEnv, siteMedia } from "@/lib/content/media-gc";
import {
  addExperience as addExperienceTo,
  moveExperience as moveExperienceIn,
  removeExperience as removeExperienceFrom,
  type Direction,
} from "@/lib/content/order";
import { publish } from "@/lib/content/publish";
import {
  ContentValidationError,
  parseSite,
  type Experience,
  type Media,
  type Site,
  type SoftwareCard,
} from "@/lib/content/schema";
import { CONTENT_TAG, createContentStoreFromEnv, saveDraft, type ContentStore } from "@/lib/content/store";
import { ALLOWED_CONTENT_TYPES } from "@/lib/content/upload-rules";

// The admin's server actions (U6). Each one checks the owner first (3.4.1),
// works on the DRAFT only (2.4.6), and validates the whole document before it
// writes: an invalid change is refused and the draft stays unchanged. Every
// argument comes from the browser, so it is treated as untrusted input.
//
// A file reaches the draft in two steps: the browser uploads it to Blob with a
// presigned URL from /api/admin/upload, then saves the returned file information with
// one of the save actions below.

export type ActionResult =
  | { ok: true; savedAt: string }
  | { ok: false; message: string; issues?: string[] };

export type AddExperienceResult = { ok: true; slug: string; savedAt: string } | { ok: false; message: string; issues?: string[] };

export type PublishActionResult =
  | { ok: true; publishedAt: string; cleanup: { deleted: number } | { error: string } | null }
  | { ok: false; reason: "no-draft" | "invalid" | "unapproved-labels"; message: string; labels?: { key: string; text: string }[]; issues?: string[] };

function refused(message: string, issues?: string[]): { ok: false; message: string; issues?: string[] } {
  return issues ? { ok: false, message, issues } : { ok: false, message };
}

function getStore(): ContentStore {
  const store = createContentStoreFromEnv();
  if (!store) throw new Error("No content store is configured (CONTENT_SOURCE, CONTENT_ROOT, Blob store).");
  return store;
}

type Loaded = { ok: true; store: ContentStore; draft: Site } | { ok: false; message: string; issues?: string[] };

async function loadDraft(): Promise<Loaded> {
  const store = getStore();
  try {
    const draft = await store.readDraft();
    if (!draft) return refused("There is no draft yet.");
    return { ok: true, store, draft };
  } catch (error) {
    if (error instanceof ContentValidationError) return refused("The stored draft is not valid.", error.issues);
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A file that is new in this save must be one that this site uploaded: under
 * the content root's media prefix, on a Vercel Blob host, of an allowed type.
 * Files that the draft already holds (for example the seed files) pass as they are.
 */
function mediaProblems(next: Site, before: Site, mediaPrefix: string): string[] {
  const known = new Set(siteMedia(before).map((media) => `${media.url} ${media.pathname}`));
  const problems: string[] = [];
  for (const media of siteMedia(next)) {
    if (known.has(`${media.url} ${media.pathname}`)) continue;
    if (!isUploadedMedia(media, mediaPrefix)) problems.push(`file "${media.pathname}": not a file uploaded for this site`);
  }
  return problems;
}

function isUploadedMedia(media: Media, mediaPrefix: string): boolean {
  if (!media.pathname.startsWith(mediaPrefix) || !ALLOWED_CONTENT_TYPES.includes(media.contentType)) return false;
  try {
    const url = new URL(media.url);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com") &&
      decodeURIComponent(url.pathname) === `/${media.pathname}`
    );
  } catch {
    return false;
  }
}

/** Validates the changed document and writes it as the draft, or refuses and writes nothing. */
async function commit(store: ContentStore, before: Site, next: unknown): Promise<ActionResult> {
  const parsed = parseSite(next);
  if (!parsed.ok) return refused("Not saved: the change is not valid.", parsed.issues);
  const problems = mediaProblems(parsed.site, before, store.paths.mediaPrefix);
  if (problems.length > 0) return refused("Not saved: a file is not valid.", problems);
  const result = await saveDraft(store, parsed.site);
  if (!result.ok) return refused("Not saved: the change is not valid.", result.issues);
  return { ok: true, savedAt: new Date().toISOString() };
}

// ---- Profile, contact, and labels ----

export interface ProfileInput {
  name: string;
  tagline: string;
  introParagraphs: string[];
  heroPhoto?: Media;
  resumeFile?: Media;
  contact: Site["contact"];
}

/** Saves the profile and the contact links. A missing file field removes that file. */
export async function saveProfile(input: ProfileInput): Promise<ActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  if (!isRecord(input)) return refused("Not saved: no profile was sent.");
  const { draft, store } = loaded;
  const profile: Record<string, unknown> = {
    ...draft.profile,
    name: input.name,
    tagline: input.tagline,
    introParagraphs: input.introParagraphs,
  };
  delete profile.heroPhoto;
  delete profile.resumeFile;
  if (input.heroPhoto !== undefined) profile.heroPhoto = input.heroPhoto;
  if (input.resumeFile !== undefined) profile.resumeFile = input.resumeFile;
  return commit(store, draft, { ...draft, profile, contact: input.contact });
}

export type LabelsInput = Record<string, { text: string; approved: boolean }>;

/**
 * Saves the label texts and approvals (KTD9). The set of label keys is fixed by
 * the layout: a save must send exactly the draft's keys. A label whose text the
 * owner rewrote counts as approved, because the owner wrote it (1.2.7).
 */
export async function saveLabels(input: LabelsInput): Promise<ActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  if (!isRecord(input)) return refused("Not saved: no labels were sent.");
  const { draft, store } = loaded;
  const keys = Object.keys(draft.labels).sort();
  const sent = Object.keys(input).sort();
  if (keys.join("\n") !== sent.join("\n")) return refused("Not saved: the labels do not match the draft. Reload the page.");
  const labels: Record<string, unknown> = {};
  for (const key of keys) {
    const label = input[key];
    if (!isRecord(label) || typeof label.text !== "string" || typeof label.approved !== "boolean") {
      return refused(`Not saved: label "${key}" is not valid.`);
    }
    const rewritten = label.text !== draft.labels[key].text;
    labels[key] = { text: label.text, approved: rewritten || label.approved };
  }
  return commit(store, draft, { ...draft, labels });
}

/** Approves one label as it is (AE6). */
export async function approveLabel(key: string): Promise<ActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  const { draft, store } = loaded;
  if (typeof key !== "string" || !Object.hasOwn(draft.labels, key)) return refused("Not saved: unknown label.");
  return commit(store, draft, { ...draft, labels: { ...draft.labels, [key]: { ...draft.labels[key], approved: true } } });
}

// ---- Experiences ----

/** Adds an experience with a title at the end of the list (2.4.4). */
export async function addExperience(title: string): Promise<AddExperienceResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  if (typeof title !== "string" || title.trim() === "") return refused("Not saved: the new experience needs a title.");
  const { draft, store } = loaded;
  const { site, slug } = addExperienceTo(draft, title.trim());
  const result = await commit(store, draft, site);
  return result.ok ? { ok: true, slug, savedAt: result.savedAt } : result;
}

/** Removes an experience with its home block and full page. The admin page asks for confirmation first. */
export async function removeExperience(slug: string): Promise<ActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  const { draft, store } = loaded;
  if (!draft.experiences.some((e) => e.slug === slug)) return refused("Not saved: unknown experience.");
  return commit(store, draft, removeExperienceFrom(draft, slug));
}

/** Moves an experience one place up or down (2.4.5). */
export async function moveExperience(slug: string, direction: Direction): Promise<ActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  const { draft, store } = loaded;
  if (!draft.experiences.some((e) => e.slug === slug)) return refused("Not saved: unknown experience.");
  if (direction !== "up" && direction !== "down") return refused("Not saved: unknown direction.");
  return commit(store, draft, moveExperienceIn(draft, slug, direction));
}

/**
 * Saves one experience: its fields and its ordered blocks (KTD6). The slug
 * stays the one in the address; the page edits everything else.
 */
export async function saveExperience(slug: string, input: Experience): Promise<ActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  const { draft, store } = loaded;
  const index = draft.experiences.findIndex((e) => e.slug === slug);
  if (index < 0) return refused("Not saved: unknown experience. It may have been removed.");
  if (!isRecord(input)) return refused("Not saved: no experience was sent.");
  const experiences = draft.experiences.map((e, i) => (i === index ? { ...input, slug } : e));
  return commit(store, draft, { ...draft, experiences });
}

// ---- Software cards ----

/** Saves the software cards: their fields, which cards exist, and their order (2.4.5). */
export async function saveSoftware(cards: SoftwareCard[]): Promise<ActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  if (!Array.isArray(cards)) return refused("Not saved: no software cards were sent.");
  const { draft, store } = loaded;
  return commit(store, draft, { ...draft, software: cards });
}

// ---- Publish ----

/**
 * Publishes the draft (F2): refused while any label is unapproved (KTD9) or the
 * draft is not valid. On success the public pages refresh at once (CONTENT_TAG),
 * then the media files that no document uses are deleted.
 */
export async function publishSite(): Promise<PublishActionResult> {
  await requireOwner();
  const store = getStore();
  const result = await publish(store, { afterPublish: () => updateTag(CONTENT_TAG) });
  if (!result.ok) {
    if (result.reason === "unapproved-labels") {
      const draft = await store.readDraft();
      const labels = result.labels.map((key) => ({ key, text: draft?.labels[key]?.text ?? "" }));
      return { ok: false, reason: result.reason, message: "Not published: approve these labels first.", labels };
    }
    if (result.reason === "invalid") {
      return { ok: false, reason: result.reason, message: "Not published: the draft is not valid.", issues: result.issues };
    }
    return { ok: false, reason: result.reason, message: "Not published: there is no draft." };
  }

  let cleanup: { deleted: number } | { error: string } | null = null;
  const storage = createMediaStorageFromEnv();
  if (storage) {
    try {
      cleanup = { deleted: (await collectMediaGarbage(store, storage)).deleted.length };
    } catch (error) {
      // The site is published; only the cleanup failed. The next Publish tries again.
      console.error("Media cleanup after Publish failed:", error);
      cleanup = { error: "The cleanup of unused files failed. The next Publish tries again." };
    }
  }
  return { ok: true, publishedAt: new Date().toISOString(), cleanup };
}
