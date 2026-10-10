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
import { parseSite, type Experience, type Media, type Site, type SoftwareCard } from "@/lib/content/schema";
import { CONTENT_TAG, createContentStoreFromEnv, type ContentStore } from "@/lib/content/store";
import { ALLOWED_CONTENT_TYPES } from "@/lib/content/upload-rules";
import { readStoredDraft } from "./draft";

// The admin's server actions (U6). Each one checks the owner first (3.4.1),
// works on the DRAFT only (2.4.6), and validates the whole document before it
// writes: an invalid change is refused and the draft stays unchanged. Every
// argument comes from the browser, so it is treated as untrusted input.
//
// A file reaches the draft in two steps: the browser uploads it to Blob with a
// presigned URL from /api/admin/upload, then saves the returned file information with
// one of the save actions below.

/** A refused action: nothing was written. */
type Refusal = { ok: false; message: string; issues?: string[] };

export type ActionResult = { ok: true; savedAt: string } | Refusal;

export type AddExperienceResult = { ok: true; slug: string; savedAt: string } | Refusal;

export type PublishActionResult =
  | { ok: true; publishedAt: string; cleanup: { deleted: number } | { error: string } | null }
  | { ok: false; reason: "no-draft" | "invalid" | "unapproved-labels"; message: string; labels?: { key: string; text: string }[]; issues?: string[] };

function refused(message: string, issues?: string[]): Refusal {
  return issues ? { ok: false, message, issues } : { ok: false, message };
}

function getStore(): ContentStore {
  const store = createContentStoreFromEnv();
  if (!store) throw new Error("No content store is configured (CONTENT_SOURCE, CONTENT_ROOT, Blob store).");
  return store;
}

type Loaded = { ok: true; store: ContentStore; draft: Site } | Refusal;

async function loadDraft(): Promise<Loaded> {
  const store = getStore();
  const draft = await readStoredDraft(store);
  if (draft.kind === "no-draft") return refused("There is no draft yet.");
  if (draft.kind === "invalid") return refused("The stored draft is not valid.", draft.issues);
  return { ok: true, store, draft: draft.site };
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

type Committed = { ok: true; savedAt: string; site: Site } | Refusal;

/** Validates the changed document and writes it as the draft, or refuses and writes nothing. */
async function commitSite(store: ContentStore, before: Site, next: unknown): Promise<Committed> {
  const parsed = parseSite(next);
  if (!parsed.ok) return refused("Not saved: the change is not valid.", parsed.issues);
  const problems = mediaProblems(parsed.site, before, store.paths.mediaPrefix);
  if (problems.length > 0) return refused("Not saved: a file is not valid.", problems);
  // The store validates again at its boundary; the document already passed parseSite.
  await store.writeDraft(parsed.site);
  return { ok: true, savedAt: new Date().toISOString(), site: parsed.site };
}

/** As commitSite, without the saved document in the result. */
async function commit(store: ContentStore, before: Site, next: unknown): Promise<ActionResult> {
  const result = await commitSite(store, before, next);
  return result.ok ? { ok: true, savedAt: result.savedAt } : result;
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

/**
 * The labels as the editor sends them. `baseText` is the text that the editor
 * loaded or last saved: the save compares the draft with it, so a rewrite is
 * known even after an earlier save, and a stale tab cannot overwrite a newer text.
 */
export type LabelsInput = Record<string, { text: string; approved: boolean; baseText: string }>;

export type LabelsActionResult = { ok: true; savedAt: string; labels: Site["labels"] } | Refusal;

const STALE_LABELS_MESSAGE = "The labels changed in another tab. Reload the page.";

/**
 * Saves the label texts and approvals (KTD9). The set of label keys is fixed by
 * the layout: a save must send exactly the draft's keys. A label whose text the
 * owner rewrote counts as approved, because the owner wrote it (1.2.7). The
 * result holds the stored labels, so the editor shows the server's approval state.
 */
export async function saveLabels(input: LabelsInput): Promise<LabelsActionResult> {
  await requireOwner();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  if (!isRecord(input)) return refused("Not saved: no labels were sent.");
  const { draft, store } = loaded;
  const keys = Object.keys(draft.labels).sort();
  const sent = Object.keys(input).sort();
  if (keys.join("\n") !== sent.join("\n")) return refused("Not saved: the labels do not match the draft. Reload the page.");
  for (const key of keys) {
    const label = input[key];
    if (
      !isRecord(label) ||
      typeof label.text !== "string" ||
      typeof label.approved !== "boolean" ||
      typeof label.baseText !== "string"
    ) {
      return refused(`Not saved: label "${key}" is not valid.`);
    }
  }
  // Another tab saved a different text since this editor loaded it: refuse all, change nothing.
  if (keys.some((key) => draft.labels[key].text !== input[key].baseText)) return refused(STALE_LABELS_MESSAGE);
  const labels: Record<string, unknown> = {};
  for (const key of keys) {
    const label = input[key];
    const rewritten = label.text !== label.baseText;
    labels[key] = { text: label.text, approved: label.approved || rewritten };
  }
  const result = await commitSite(store, draft, { ...draft, labels });
  return result.ok ? { ok: true, savedAt: result.savedAt, labels: result.site.labels } : result;
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
      return { ok: false, reason: result.reason, message: "Not published: approve these labels first.", labels: result.labelTexts };
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
      // The published document is the site that was just written. The draft is
      // read again: another tab can save a file into it while Publish runs.
      const knownDocuments = { published: result.site };
      cleanup = { deleted: (await collectMediaGarbage(store, storage, { knownDocuments })).deleted.length };
    } catch (error) {
      // The site is published; only the cleanup failed. The next Publish tries again.
      console.error("Media cleanup after Publish failed:", error);
      cleanup = { error: "The cleanup of unused files failed. The next Publish tries again." };
    }
  }
  return { ok: true, publishedAt: new Date().toISOString(), cleanup };
}
