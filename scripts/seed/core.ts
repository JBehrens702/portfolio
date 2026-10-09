import { ContentValidationError, parseSite, type Media, type Site } from "../../src/lib/content/schema";
import type { ContentStore } from "../../src/lib/content/store";

// The seed input (content/seed/site.json) is a Site document in which each
// Media value is a reference { "seed": "<file in content/seed/media>" }. The
// final Blob URLs exist only after the upload, so the seed script uploads the
// files first and then puts the real Media values in place of the references.
// content/seed/media/manifest.json gives each file's content type and size.

export interface ManifestEntry {
  page: string;
  position: number;
  file: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
}

export interface SeedMediaRef {
  seed: string;
}

/** True for an object whose only key is "seed", with a string value. */
export function isSeedRef(value: unknown): value is SeedMediaRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { seed?: unknown }).seed === "string"
  );
}

/** The files that the input references, in document order. */
export function seedRefs(input: unknown): string[] {
  const files: string[] = [];
  const walk = (value: unknown): void => {
    if (isSeedRef(value)) files.push(value.seed);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(walk);
  };
  walk(input);
  return files;
}

/** A copy of the input with each seed reference replaced by its Media value. */
export function resolveSeedMedia(input: unknown, media: (file: string) => Media): unknown {
  if (isSeedRef(input)) return media(input.seed);
  if (Array.isArray(input)) return input.map((item) => resolveSeedMedia(item, media));
  if (typeof input === "object" && input !== null) {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, resolveSeedMedia(value, media)]));
  }
  return input;
}

function mediaFor(entry: ManifestEntry, url: string, pathname: string): Media {
  // No alt text: the owner writes it in the admin page (0.2.5, 1.2.4).
  return { url, pathname, contentType: entry.contentType, width: entry.width, height: entry.height };
}

/** A stand-in Media value, so the seed can be validated before any upload. */
export function placeholderMedia(entry: ManifestEntry): Media {
  return mediaFor(entry, `https://seed.example/${encodeURIComponent(entry.file)}`, `seed/${entry.file}`);
}

/** Thrown when the seed input references a file that the manifest does not list. */
export class SeedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedInputError";
  }
}

/** Thrown when a draft exists and the caller did not ask to overwrite it. */
export class DraftExistsError extends Error {
  constructor() {
    super("A draft exists already. Run the seed again with --force to overwrite it (this discards the draft edits).");
    this.name = "DraftExistsError";
  }
}

function manifestIndex(manifest: ManifestEntry[]): Map<string, ManifestEntry> {
  return new Map(manifest.map((entry) => [entry.file, entry]));
}

/**
 * Checks the seed input without any upload: each reference is in the manifest,
 * and the document is valid with stand-in media. Returns that document.
 */
export function checkSeed(input: unknown, manifest: ManifestEntry[]): Site {
  const index = manifestIndex(manifest);
  const unknownFiles = seedRefs(input).filter((file) => !index.has(file));
  if (unknownFiles.length > 0) {
    throw new SeedInputError(`The seed references files that media/manifest.json does not list: ${unknownFiles.join(", ")}`);
  }
  const result = parseSite(resolveSeedMedia(input, (file) => placeholderMedia(index.get(file)!)));
  if (!result.ok) throw new ContentValidationError(result.issues, "seed document");
  return result.site;
}

export interface UploadRequest {
  /** The file name in content/seed/media. */
  file: string;
  /** The pathname to upload to. The uploader adds a random suffix (KTD2). */
  pathname: string;
  contentType: string;
  data: Uint8Array;
}

export interface UploadResult {
  url: string;
  pathname: string;
}

export type Uploader = (request: UploadRequest) => Promise<UploadResult>;

export interface SeedOptions {
  input: unknown;
  manifest: ManifestEntry[];
  readMedia: (file: string) => Promise<Uint8Array>;
  upload: Uploader;
  store: ContentStore;
  /** Overwrite an existing draft. */
  force?: boolean;
  /** Progress lines. They never contain the draft path, which holds the secret segment. */
  log?: (line: string) => void;
}

async function draftExists(store: ContentStore): Promise<boolean> {
  try {
    return (await store.readDraft()) !== null;
  } catch (error) {
    // An invalid draft is still a draft that the owner may want to keep.
    if (error instanceof ContentValidationError) return true;
    throw error;
  }
}

/**
 * Uploads the seed media and writes the seed as the draft. It never writes the
 * published document. It refuses to overwrite a draft unless force is set, and
 * it checks everything before the first upload.
 */
export async function seedDraft(options: SeedOptions): Promise<{ site: Site; uploaded: number }> {
  const { input, manifest, readMedia, upload, store, force = false, log = () => {} } = options;
  checkSeed(input, manifest);
  if (!force && (await draftExists(store))) throw new DraftExistsError();

  const index = manifestIndex(manifest);
  const files = [...new Set(seedRefs(input))];
  const uploaded = new Map<string, Media>();
  for (const file of files) {
    const entry = index.get(file)!;
    const data = await readMedia(file);
    const result = await upload({ file, pathname: `${store.paths.mediaPrefix}seed/${file}`, contentType: entry.contentType, data });
    uploaded.set(file, mediaFor(entry, result.url, result.pathname));
    log(`uploaded ${file}`);
  }

  const site = await store.writeDraft(resolveSeedMedia(input, (file) => uploaded.get(file)!));
  log(`wrote the draft: ${site.experiences.length} experiences, ${site.software.length} software cards`);
  return { site, uploaded: uploaded.size };
}
