"use server";

import { updateTag } from "next/cache";
import { requireOwner } from "@/lib/auth/owner";
import { withFeatureLabels } from "@/lib/content/feature-labels";
import { collectMediaGarbage, createMediaStorageFromEnv, siteMedia } from "@/lib/content/media-gc";
import {
  addExperience as addExperienceTo,
  moveExperience as moveExperienceIn,
  removeExperience as removeExperienceFrom,
  type Direction,
} from "@/lib/content/order";
import {
  cardKey,
  experienceKeys,
  isPartKey,
  mergeParts,
  stampOf,
  stampParts,
  stampsAfterSave,
  type PartKey,
  type Stamps,
} from "@/lib/content/parts";
import { publish } from "@/lib/content/publish";
import { ContentValidationError, parseSite, type Experience, type Media, type Site, type SoftwareCard } from "@/lib/content/schema";
import { CONTENT_TAG, ContentConflictError, createContentStoreFromEnv, type ContentStore } from "@/lib/content/store";
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
//
// Every action that writes the draft goes through commitSite (KTD3): it reads
// the draft with its version, builds the new draft from it, checks new files
// (KTD4), and writes only if the draft is still that version. The four save
// actions of draft parts also take the stamps that the tab loaded (`base`) and
// merge per part (KTD1, KTD2), so a tab that is out of date cannot overwrite a
// newer part, and two tabs on different parts never block each other.

/** Why an action was refused, where the editor must tell the kinds apart. */
export type RefusalReason =
  /** Another tab changed a part (KTD2) or a label that this save changes. The editor offers Reload. */
  | "other-tab"
  /** A file new to the draft is no longer in the media store (KTD4). */
  | "missing-file"
  /** Two other saves landed during this save (KTD3). Saving again can work. */
  | "busy"
  /**
   * The page no longer fits the draft: the save came without valid stamps, its
   * experience was removed, or its label keys are not the draft's. The editor offers Reload.
   */
  | "out-of-date";

/** A refused action: nothing was written. */
export type Refusal = { ok: false; message: string; issues?: string[]; reason?: RefusalReason };

export type ActionResult = { ok: true; savedAt: string } | Refusal;

/**
 * The result of a save of draft parts. `stamps` holds the tab's new stamp for
 * each part that the save covers: the stored stamp for a part written from the
 * tab, the tab's own base stamp for a part kept from the draft (KTD2).
 */
export type SaveActionResult = { ok: true; savedAt: string; stamps: Stamps } | Refusal;

export type AddExperienceResult = { ok: true; slug: string; savedAt: string } | Refusal;

/** The parts whose stamp in the draft differs from the given one. */
export type CheckPartsResult = { ok: true; changed: PartKey[] } | Refusal;

export type PublishActionResult =
  | { ok: true; publishedAt: string; cleanup: { deleted: number } | { error: string } | null }
  | { ok: false; reason: "no-draft" | "invalid" | "unapproved-labels"; message: string; labels?: { key: string; text: string }[]; issues?: string[] };

const OTHER_TAB_MESSAGE =
  "Not saved: another tab changed this part after you opened it. Reload the page to see the newer version. Your edits stay on this page until you reload.";
const BUSY_MESSAGE = "Not saved: another save ran at the same moment. Save again.";
const OUT_OF_DATE_MESSAGE = "Not saved: this page is out of date. Reload the page.";

function refused(message: string, issues?: string[], reason?: RefusalReason): Refusal {
  const refusal: Refusal = { ok: false, message };
  if (issues) refusal.issues = issues;
  if (reason) refusal.reason = reason;
  return refusal;
}

function getStore(): ContentStore {
  const store = createContentStoreFromEnv();
  if (!store) throw new Error("No content store is configured (CONTENT_SOURCE, CONTENT_ROOT, Blob store).");
  return store;
}

type Loaded = { ok: true; store: ContentStore; draft: Site } | Refusal;

/** The draft for a read-only action. */
async function loadDraft(): Promise<Loaded> {
  const store = getStore();
  const draft = await readStoredDraft(store);
  if (draft.kind === "no-draft") return refused("There is no draft yet.");
  if (draft.kind === "invalid") return refused("The stored draft is not valid.", draft.issues);
  return { ok: true, store, draft: draft.site };
}

type LoadedVersion = { ok: true; site: Site; version: string } | Refusal;

/** The draft with its version, for the conditional write (KTD3). */
async function loadVersioned(store: ContentStore): Promise<LoadedVersion> {
  try {
    const found = await store.readDraftVersioned();
    return found ? { ok: true, ...found } : refused("There is no draft yet.");
  } catch (error) {
    if (error instanceof ContentValidationError) return refused("The stored draft is not valid.", error.issues);
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The stamps as the browser sent them, when every key is a part key and every stamp a string; otherwise null. */
function validStamps(value: unknown): Stamps | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([key, stamp]) => isPartKey(key) && typeof stamp === "string")) return null;
  return Object.fromEntries(entries) as Stamps;
}

/**
 * The tab's base stamps of the listed parts, or null when the base is missing,
 * malformed, or lacks one of the parts. The page is then out of date.
 */
function baseFor(base: unknown, keys: PartKey[]): Stamps | null {
  const stamps = validStamps(base);
  if (!stamps) return null;
  const bases: Stamps = {};
  for (const key of keys) {
    if (!Object.hasOwn(stamps, key)) return null;
    bases[key] = stamps[key];
  }
  return bases;
}

function outOfDate(): Refusal {
  return refused(OUT_OF_DATE_MESSAGE, undefined, "out-of-date");
}

const mediaKey = (media: Media) => `${media.url} ${media.pathname}`;

/** The files of `next` that `before` does not hold, once each. */
function addedMedia(next: Site, before: Site): Media[] {
  const known = new Set(siteMedia(before).map(mediaKey));
  const added = new Map<string, Media>();
  for (const media of siteMedia(next)) {
    if (!known.has(mediaKey(media))) added.set(mediaKey(media), media);
  }
  return [...added.values()];
}

/**
 * A file that is new in this save must be one that this site uploaded: under
 * the content root's media prefix, on a Vercel Blob host, of an allowed type.
 * Files that the draft already holds (for example the seed files) pass as they are.
 */
function mediaProblems(next: Site, before: Site, mediaPrefix: string): string[] {
  return addedMedia(next, before)
    .filter((media) => !isUploadedMedia(media, mediaPrefix))
    .map((media) => `file "${media.pathname}": not a file uploaded for this site`);
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

/**
 * The name of a file new to the draft that the media store no longer holds, or
 * null (KTD4). A tab can hold a file that a Publish from another tab deleted;
 * saving it would put a broken file on the next published site. A file that the
 * draft already holds is never deleted by Publish, so it is not checked. With
 * no media store (local file content), there is nothing to ask.
 */
async function missingFile(next: Site, before: Site): Promise<string | null> {
  const added = addedMedia(next, before);
  if (added.length === 0) return null;
  const storage = createMediaStorageFromEnv();
  if (!storage) return null;
  const stored = await Promise.all(added.map((media) => storage.exists(media.url)));
  const missing = added.find((_media, i) => !stored[i]);
  if (!missing) return null;
  return missing.fileName ?? missing.pathname.slice(missing.pathname.lastIndexOf("/") + 1);
}

/**
 * What an action builds from the current draft: the next draft, and a function
 * that makes the action's own result fields from the stored draft. Or a refusal.
 */
type Candidate<T> = { ok: true; next: unknown; result: (saved: Site) => T } | Refusal;

type Committed<T> = ({ ok: true; savedAt: string } & T) | Refusal;

/** A candidate with no result fields of its own. */
function plain(next: unknown): Candidate<object> {
  return { ok: true, next, result: () => ({}) };
}

/**
 * The one write path for the draft (KTD3, KTD4). Reads the draft with its
 * version, lets `build` make the next draft from it, validates that draft and
 * its new files, and writes it only if the stored draft is still the version
 * read. When another save landed in between, it runs once more from a fresh
 * read; a second conflict refuses with "save again". A refusal writes nothing.
 */
async function commitSite<T extends object>(
  build: (current: Site, store: ContentStore) => Candidate<T> | Promise<Candidate<T>>,
): Promise<Committed<T>> {
  const store = getStore();
  for (let attempt = 1; ; attempt++) {
    const loaded = await loadVersioned(store);
    if (!loaded.ok) return loaded;
    const candidate = await build(loaded.site, store);
    if (!candidate.ok) return candidate;
    const parsed = parseSite(candidate.next);
    if (!parsed.ok) return refused("Not saved: the change is not valid.", parsed.issues);
    const problems = mediaProblems(parsed.site, loaded.site, store.paths.mediaPrefix);
    if (problems.length > 0) return refused("Not saved: a file is not valid.", problems);
    const missing = await missingFile(parsed.site, loaded.site);
    if (missing !== null) return refused(`Not saved: the file "${missing}" is no longer stored. Upload it again.`, undefined, "missing-file");

    // Nothing changed, for example a retry after a lost response: the draft already holds it.
    if (stampOf(parsed.site) === stampOf(loaded.site)) {
      return { ok: true as const, savedAt: new Date().toISOString(), ...candidate.result(loaded.site) };
    }
    try {
      // The store validates again at its boundary; the document already passed parseSite.
      const written = await store.writeDraftIfCurrent(parsed.site, loaded.version);
      return { ok: true as const, savedAt: new Date().toISOString(), ...candidate.result(written.site) };
    } catch (error) {
      if (!(error instanceof ContentConflictError)) throw error;
      if (attempt >= 2) return refused(BUSY_MESSAGE, undefined, "busy");
    }
  }
}

/**
 * Merges the parts that a tab sent into the current draft (KTD2). `sent` is the
 * current draft with the tab's values in those parts; parseSite validates the
 * result in commitSite. `finish` adjusts the merged draft outside the parts
 * (the labels). A part that another tab changed refuses the whole save.
 */
function merged(
  current: Site,
  sent: Site,
  keys: PartKey[],
  bases: Stamps,
  finish: (site: Site) => Site = (site) => site,
): Candidate<{ stamps: Stamps }> {
  const merge = mergeParts(current, sent, keys, bases);
  if (!merge.ok) return refused(OTHER_TAB_MESSAGE, undefined, "other-tab");
  return { ok: true, next: finish(merge.site), result: (saved) => ({ stamps: stampsAfterSave(saved, merge) }) };
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

/**
 * Saves the profile and the contact links (the part `profile`). A missing file
 * field removes that file. `base` holds the stamps that the editor loaded.
 */
export async function saveProfile(input: ProfileInput, base?: Stamps): Promise<SaveActionResult> {
  await requireOwner();
  const bases = baseFor(base, ["profile"]);
  if (!bases) return outOfDate();
  if (!isRecord(input)) return refused("Not saved: no profile was sent.");
  return commitSite((current) => {
    const profile: Record<string, unknown> = {
      ...current.profile,
      name: input.name,
      tagline: input.tagline,
      introParagraphs: input.introParagraphs,
    };
    delete profile.heroPhoto;
    delete profile.resumeFile;
    if (input.heroPhoto !== undefined) profile.heroPhoto = input.heroPhoto;
    if (input.resumeFile !== undefined) profile.resumeFile = input.resumeFile;
    // Untrusted values: commitSite validates the merged document.
    const sent = { ...current, profile, contact: input.contact } as Site;
    return merged(current, sent, ["profile"], bases);
  });
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
 * The labels are in no part: their own baseText check refuses a stale tab.
 */
export async function saveLabels(input: LabelsInput): Promise<LabelsActionResult> {
  await requireOwner();
  if (!isRecord(input)) return refused("Not saved: no labels were sent.");
  return commitSite((stored) => {
    // The Labels page also lists the feature labels that the draft does not hold
    // yet (a draft saved before the feature existed), so the owner can approve them.
    const current = withFeatureLabels(stored);
    const keys = Object.keys(current.labels).sort();
    const sent = Object.keys(input).sort();
    if (keys.join("\n") !== sent.join("\n")) return refused("Not saved: the labels do not match the draft. Reload the page.", undefined, "out-of-date");
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
    if (keys.some((key) => current.labels[key].text !== input[key].baseText)) return refused(STALE_LABELS_MESSAGE, undefined, "other-tab");
    const labels: Record<string, unknown> = {};
    for (const key of keys) {
      const label = input[key];
      const rewritten = label.text !== label.baseText;
      labels[key] = { text: label.text, approved: label.approved || rewritten };
    }
    return { ok: true, next: { ...current, labels }, result: (saved) => ({ labels: saved.labels }) };
  });
}

/** Approves one label as it is (AE6). */
export async function approveLabel(key: string): Promise<ActionResult> {
  await requireOwner();
  return commitSite((stored) => {
    const current = withFeatureLabels(stored);
    if (typeof key !== "string" || !Object.hasOwn(current.labels, key)) return refused("Not saved: unknown label.");
    return plain({ ...current, labels: { ...current.labels, [key]: { ...current.labels[key], approved: true } } });
  });
}

// ---- Experiences ----

/** Adds an experience with a title at the end of the list (2.4.4). */
export async function addExperience(title: string): Promise<AddExperienceResult> {
  await requireOwner();
  if (typeof title !== "string" || title.trim() === "") return refused("Not saved: the new experience needs a title.");
  return commitSite((current) => {
    const { site, slug } = addExperienceTo(current, title.trim());
    return { ok: true, next: site, result: () => ({ slug }) };
  });
}

/** Removes an experience with its home block and full page. The admin page asks for confirmation first. */
export async function removeExperience(slug: string): Promise<ActionResult> {
  await requireOwner();
  return commitSite((current) => {
    if (!current.experiences.some((e) => e.slug === slug)) return refused("Not saved: unknown experience.");
    // The last carousel or image can go with the experience: its unapproved proposals go too (KTD9).
    return plain(withFeatureLabels(removeExperienceFrom(current, slug)));
  });
}

/** Moves an experience one place up or down (2.4.5). */
export async function moveExperience(slug: string, direction: Direction): Promise<ActionResult> {
  await requireOwner();
  return commitSite((current) => {
    if (!current.experiences.some((e) => e.slug === slug)) return refused("Not saved: unknown experience.");
    if (direction !== "up" && direction !== "down") return refused("Not saved: unknown direction.");
    return plain(moveExperienceIn(current, slug, direction));
  });
}

/**
 * Saves one experience: its fields and its ordered blocks (KTD6), that is its
 * card part and its page part. The slug stays the one in the address; the page
 * edits everything else. A part that the tab did not change keeps the draft's
 * value, so a layout save never undoes a newer card save from the home editor.
 */
export async function saveExperience(slug: string, input: Experience, base?: Stamps): Promise<SaveActionResult> {
  await requireOwner();
  const keys = experienceKeys(slug);
  const bases = baseFor(base, keys);
  if (!bases) return outOfDate();
  if (!isRecord(input)) return refused("Not saved: no experience was sent.");
  return commitSite((current) => {
    const index = current.experiences.findIndex((e) => e.slug === slug);
    if (index < 0) return refused("Not saved: unknown experience. It may have been removed.", undefined, "out-of-date");
    const experiences = current.experiences.map((e, i) => (i === index ? { ...input, slug } : e));
    // The first carousel or image brings its button labels, unapproved, for the
    // owner; the last one removed takes back the proposals that nobody approved
    // (KTD9). The labels are in no part, so they follow from the merged draft.
    return merged(current, { ...current, experiences }, keys, bases, withFeatureLabels);
  });
}

/** The fields of an experience that its home-page card shows. */
export type ExperienceCardInput = Pick<Experience, "homeTitle" | "homeText" | "skills" | "cardImage">;

/**
 * Saves the home-card fields of one experience (the part `card:<slug>`) and
 * leaves its page layout as it is in the draft (the home editor, KTD12), so a
 * card edit never overwrites the layout with an older copy.
 */
export async function saveExperienceCard(slug: string, input: ExperienceCardInput, base?: Stamps): Promise<SaveActionResult> {
  await requireOwner();
  const keys = [cardKey(slug)];
  const bases = baseFor(base, keys);
  if (!bases) return outOfDate();
  if (!isRecord(input)) return refused("Not saved: no card was sent.");
  return commitSite((current) => {
    const index = current.experiences.findIndex((e) => e.slug === slug);
    if (index < 0) return refused("Not saved: unknown experience. It may have been removed.", undefined, "out-of-date");
    const { cardImage, homeTitle, homeText, skills } = input;
    const experiences = current.experiences.map((e, i) => {
      if (i !== index) return e;
      const next: Experience = { ...e, homeTitle, homeText, skills };
      if (cardImage) next.cardImage = cardImage;
      else delete next.cardImage;
      return next;
    });
    return merged(current, { ...current, experiences }, keys, bases);
  });
}

export type ResetResult = { ok: true; savedAt: string; experience: Experience; stamps: Stamps } | Refusal;

/**
 * Replaces the draft of one experience with its published version (2.4.15,
 * KTD11). Refused for a page that is not published yet; the draft is then
 * unchanged. The result holds the new stamps of the experience's two parts.
 */
export async function resetExperience(slug: string): Promise<ResetResult> {
  await requireOwner();
  return commitSite(async (current, store) => {
    const index = current.experiences.findIndex((e) => e.slug === slug);
    if (index < 0) return refused("Not reset: unknown experience. It may have been removed.");
    const published = (await store.readPublished())?.experiences.find((e) => e.slug === slug);
    if (!published) return refused("Not reset: this page is not published yet, so there is no published version to go back to.");
    const experiences = current.experiences.map((e, i) => (i === index ? published : e));
    return {
      ok: true,
      next: withFeatureLabels({ ...current, experiences }),
      result: (saved) => ({ experience: published, stamps: stampParts(saved, experienceKeys(slug)) }),
    };
  });
}

// ---- Software cards ----

/** Saves the software cards (the part `software`): their fields, which cards exist, and their order (2.4.5). */
export async function saveSoftware(cards: SoftwareCard[], base?: Stamps): Promise<SaveActionResult> {
  await requireOwner();
  const bases = baseFor(base, ["software"]);
  if (!bases) return outOfDate();
  if (!Array.isArray(cards)) return refused("Not saved: no software cards were sent.");
  return commitSite((current) => merged(current, { ...current, software: cards }, ["software"], bases));
}

// ---- The return check ----

/**
 * Read-only: which of the given parts changed in the draft since the tab got
 * their stamps (KTD5). A part whose experience the draft no longer has counts
 * as changed. The editors call it when the tab becomes visible again.
 */
export async function checkParts(base: Stamps): Promise<CheckPartsResult> {
  await requireOwner();
  const stamps = validStamps(base);
  if (!stamps) return outOfDate();
  const loaded = await loadDraft();
  if (!loaded.ok) return loaded;
  const keys = Object.keys(stamps) as PartKey[];
  const current = stampParts(loaded.draft, keys);
  return { ok: true, changed: keys.filter((key) => current[key] !== stamps[key]) };
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
