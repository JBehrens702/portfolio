import { BlobPreconditionFailedError, get, list, put, type ListBlobResultBlob } from "@vercel/blob";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSite, type Site } from "./schema";

// The content store (KTD2). One JSON document holds the draft, one holds the
// published site, and each Publish keeps a copy of the old published document
// in a history folder (KTD4). All paths sit under CONTENT_ROOT. The draft and
// the history sit under the CONTENT_PATH_SECRET segment, so a visitor cannot
// guess their address.

/** The Next.js cache tag of the public read of the published document. */
export const CONTENT_TAG = "content";

export interface ContentConfig {
  root: string;
  secret: string;
}

export interface ContentPaths {
  published: string;
  draft: string;
  historyPrefix: string;
  mediaPrefix: string;
}

const ROOT_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

/** Reads the content root and the secret path segment from the environment. */
export function contentConfigFromEnv(env: Record<string, string | undefined> = process.env): ContentConfig {
  const root = env.CONTENT_ROOT?.trim() ?? "";
  const secret = env.CONTENT_PATH_SECRET?.trim() ?? "";
  if (!ROOT_PATTERN.test(root)) {
    throw new Error("CONTENT_ROOT must be set to a folder name such as \"site\" (letters, digits, _, -, and /).");
  }
  if (!SECRET_PATTERN.test(secret)) {
    throw new Error("CONTENT_PATH_SECRET must be set to a random value of at least 16 letters, digits, _, or -.");
  }
  return { root, secret };
}

export function contentPaths(config: ContentConfig): ContentPaths {
  const { root, secret } = config;
  return {
    published: `${root}/published.json`,
    draft: `${root}/${secret}/draft.json`,
    historyPrefix: `${root}/${secret}/history/`,
    mediaPrefix: `${root}/media/`,
  };
}

/**
 * A conditional write found a different version than the one it expected:
 * another save landed after the read (KTD3). Every backend throws this one
 * class, so a caller catches one type. Nothing was written.
 */
export class ContentConflictError extends Error {
  readonly pathname: string;
  constructor(pathname: string) {
    super(`The document at ${pathname} changed after it was read. Read it again, then write.`);
    this.name = "ContentConflictError";
    this.pathname = pathname;
  }
}

/** A document as stored, with the version that a conditional write checks. */
export interface VersionedValue {
  value: unknown;
  /** Opaque: compare it only for equality, and only pass it back to the same backend. */
  version: string;
}

export interface WriteOptions {
  /**
   * Leave it out to overwrite. A string: write only when the stored version is
   * still this one. Null: write only when no document exists. On a mismatch
   * the write throws ContentConflictError.
   */
  ifVersion?: string | null;
}

/** The raw storage under the content store: JSON values by pathname. */
export interface JsonBackend {
  /** An uncached read. Null when no document exists at the pathname. */
  read(pathname: string): Promise<unknown | null>;
  /** An uncached read with the document's version. Null when no document exists. */
  readVersioned(pathname: string): Promise<VersionedValue | null>;
  /** Writes the document at the pathname, and returns its new version. See WriteOptions for the condition. */
  write(pathname: string, value: unknown, options?: WriteOptions): Promise<string>;
  /** The pathnames that start with the prefix. */
  list(prefix: string): Promise<string[]>;
}

/** A validated site with the version of the stored document it came from or went to. */
export interface VersionedSite {
  site: Site;
  version: string;
}

export interface ContentStore {
  readonly paths: ContentPaths;
  /** The draft, validated. Null when none exists. Throws ContentValidationError when it is invalid. */
  readDraft(): Promise<Site | null>;
  /**
   * The draft, validated, with its version for writeDraftIfCurrent (KTD3).
   * Null when none exists. Throws ContentValidationError when it is invalid.
   */
  readDraftVersioned(): Promise<VersionedSite | null>;
  /**
   * Validates the draft, then writes it only when the stored draft still has
   * the version given (null: only when no draft exists). Returns the written
   * site and its new version. Throws ContentValidationError, or
   * ContentConflictError when another save landed first; both write nothing.
   */
  writeDraftIfCurrent(site: unknown, version: string | null): Promise<VersionedSite>;
  /** The published document, validated, read uncached. Null when none exists. */
  readPublished(): Promise<Site | null>;
  /** Validates and writes the draft. Throws ContentValidationError and writes nothing when invalid. */
  writeDraft(site: unknown): Promise<Site>;
  /** Validates and writes the published document. Throws ContentValidationError when invalid. */
  writePublished(site: unknown): Promise<Site>;
  /** Copies the current published document to a new history file. Returns its pathname, or null when nothing is published. */
  copyPublishedToHistory(): Promise<string | null>;
  /** The history pathnames, oldest first. */
  listHistory(): Promise<string[]>;
  /** One history copy, as stored (not validated: an old copy can follow an older schema). */
  readHistory(pathname: string): Promise<unknown | null>;
}

export interface ContentStoreOptions {
  now?: () => Date;
}

function historyName(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const random = crypto.randomUUID().slice(0, 8);
  return `${stamp}-${random}.json`;
}

/** The content logic over any backend. The Blob store and the in-memory fake share it. */
export function createContentStore(
  backend: JsonBackend,
  config: ContentConfig,
  options: ContentStoreOptions = {},
): ContentStore {
  const paths = contentPaths(config);
  const now = options.now ?? (() => new Date());

  async function readSite(pathname: string, what: string): Promise<Site | null> {
    const value = await backend.read(pathname);
    return value === null ? null : assertSite(value, what);
  }

  async function writeSite(pathname: string, input: unknown, what: string): Promise<Site> {
    const site = assertSite(input, what);
    await backend.write(pathname, site);
    return site;
  }

  return {
    paths,
    readDraft: () => readSite(paths.draft, "draft"),
    async readDraftVersioned() {
      const found = await backend.readVersioned(paths.draft);
      return found === null ? null : { site: assertSite(found.value, "draft"), version: found.version };
    },
    async writeDraftIfCurrent(input, version) {
      // An undefined version from an untyped caller would turn the check off; refuse it.
      if (version === undefined) throw new Error("writeDraftIfCurrent needs a version, or null for a new draft.");
      const site = assertSite(input, "draft");
      return { site, version: await backend.write(paths.draft, site, { ifVersion: version }) };
    },
    readPublished: () => readSite(paths.published, "published document"),
    writeDraft: (site) => writeSite(paths.draft, site, "draft"),
    writePublished: (site) => writeSite(paths.published, site, "published document"),
    async copyPublishedToHistory() {
      const current = await backend.read(paths.published);
      if (current === null) return null;
      const pathname = paths.historyPrefix + historyName(now());
      await backend.write(pathname, current);
      return pathname;
    },
    async listHistory() {
      return (await backend.list(paths.historyPrefix)).sort();
    },
    readHistory(pathname) {
      if (!pathname.startsWith(paths.historyPrefix)) {
        throw new Error(`Not a history path: ${pathname}`);
      }
      return backend.read(pathname);
    },
  };
}

// ---- In-memory fake, for tests ----

export interface MemoryBackend extends JsonBackend {
  /** The stored documents as JSON text, by pathname. */
  readonly files: Map<string, string>;
  /** Every write, in order. */
  readonly writes: string[];
}

export function createMemoryBackend(): MemoryBackend {
  const files = new Map<string, string>();
  const writes: string[] = [];
  // The version is a write counter per pathname (KTD3).
  const counters = new Map<string, number>();
  const versionOf = (pathname: string) => (files.has(pathname) ? String(counters.get(pathname) ?? 0) : null);
  return {
    files,
    writes,
    async read(pathname) {
      const text = files.get(pathname);
      return text === undefined ? null : JSON.parse(text);
    },
    async readVersioned(pathname) {
      const text = files.get(pathname);
      return text === undefined ? null : { value: JSON.parse(text), version: versionOf(pathname)! };
    },
    async write(pathname, value, options = {}) {
      // No await between the check and the write, so the pair cannot interleave with another write.
      if (options.ifVersion !== undefined && options.ifVersion !== versionOf(pathname)) {
        throw new ContentConflictError(pathname);
      }
      const next = (counters.get(pathname) ?? 0) + 1;
      counters.set(pathname, next);
      files.set(pathname, JSON.stringify(value));
      writes.push(pathname);
      return String(next);
    },
    async list(prefix) {
      return [...files.keys()].filter((key) => key.startsWith(prefix));
    },
  };
}

export function createMemoryContentStore(
  config: ContentConfig = { root: "memory", secret: "memory-secret-segment" },
  options: ContentStoreOptions = {},
): { store: ContentStore; backend: MemoryBackend } {
  const backend = createMemoryBackend();
  return { store: createContentStore(backend, config, options), backend };
}

// ---- Vercel Blob ----

/**
 * How to reach this environment's Blob store. A Production deployment uses the
 * Production store (prefix BLOB); every other place - Preview deployments,
 * local work, tests - uses the development store (prefix DEV), so nothing
 * outside Production can change the live site. A fixed read-write token wins
 * when one exists; otherwise the store ID is used, and the Blob SDK signs in
 * with Vercel's short-lived OIDC token (VERCEL_OIDC_TOKEN).
 */
export type BlobCredentials = { token: string } | { storeId: string };

/** True on a Vercel Production deployment. Every other place uses the development stores. */
export function isProduction(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

function credentialsForPrefix(env: Record<string, string | undefined>, prefix: string): BlobCredentials | undefined {
  const token = env[`${prefix}_READ_WRITE_TOKEN`]?.trim();
  if (token) return { token };
  const storeId = env[`${prefix}_STORE_ID`]?.trim();
  if (storeId) return { storeId };
  return undefined;
}

/** The PUBLIC media store (images and files that visitors load): prefix BLOB on Production, DEV elsewhere. */
export function blobCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobCredentials | undefined {
  return credentialsForPrefix(env, isProduction(env) ? "BLOB" : "DEV");
}

/**
 * The PRIVATE documents store (draft, published, and history JSON): prefix
 * DOCS on Production, DEVDOCS elsewhere. A public store serves reads through
 * its CDN, which returned old versions for up to 73 s (U6); a private store
 * with `useCache: false` reads the current version at once.
 */
export function docsCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobCredentials | undefined {
  return credentialsForPrefix(env, isProduction(env) ? "DOCS" : "DEVDOCS");
}

/**
 * Every blob under the prefix, from all pages of the Blob listing. The
 * credentials name the store, so the media store and the documents store stay apart.
 */
export async function listAllBlobs(prefix: string, credentials: BlobCredentials): Promise<ListBlobResultBlob[]> {
  const found: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, ...credentials });
    found.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found;
}

export interface BlobBackendOptions {
  /**
   * The PRIVATE documents store. Defaults to docsCredentialsFromEnv(). Always
   * passed to the SDK, which would otherwise pick BLOB_READ_WRITE_TOKEN or
   * BLOB_STORE_ID by itself.
   */
  credentials?: BlobCredentials;
}

/**
 * The JSON documents in a PRIVATE Blob store (KTD2, changed in U6). A private
 * store honours `useCache: false`, so a read returns the current version at
 * once. The SDK refuses private access on a public store, so the documents
 * never go to the public media store by mistake.
 */
export function createBlobBackend(options: BlobBackendOptions = {}): JsonBackend {
  const auth = options.credentials ?? docsCredentialsFromEnv();
  if (!auth) {
    throw new Error(
      "No Blob documents store given and none for this environment: pass credentials, or set DEVDOCS_STORE_ID / DEVDOCS_READ_WRITE_TOKEN (DOCS_* on Production).",
    );
  }
  async function readVersioned(pathname: string): Promise<VersionedValue | null> {
    const result = await get(pathname, { access: "private", useCache: false, ...auth });
    if (result === null || result.statusCode !== 200) return null;
    // A compressed response (seen with Brotli on documents of about 1.5 KB) carries
    // a weak ETag, W/"<hash>", with the same hash as the strong ETag that `put`
    // returns. `ifMatch` accepts only the strong form, so drop the prefix.
    const version = result.blob.etag.replace(/^W\//, "");
    return { value: JSON.parse(await new Response(result.stream).text()), version };
  }

  return {
    async read(pathname) {
      const result = await get(pathname, { access: "private", useCache: false, ...auth });
      if (result === null || result.statusCode !== 200) return null;
      return JSON.parse(await new Response(result.stream).text());
    },
    readVersioned,
    async write(pathname, value, options = {}) {
      // The version is the blob's ETag (KTD3). `ifMatch` makes the store refuse
      // the write when another write changed the ETag; `allowOverwrite: false`
      // refuses it when a blob already exists.
      const { ifVersion } = options;
      const condition =
        ifVersion === undefined
          ? { allowOverwrite: true }
          : ifVersion === null
            ? { allowOverwrite: false }
            : { allowOverwrite: true, ifMatch: ifVersion };
      try {
        const result = await put(pathname, JSON.stringify(value), {
          access: "private",
          ...auth,
          contentType: "application/json",
          addRandomSuffix: false,
          ...condition,
        });
        return result.etag;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw new ContentConflictError(pathname);
        // The SDK has no error class for "the blob already exists", so look.
        if (ifVersion === null && (await readVersioned(pathname)) !== null) throw new ContentConflictError(pathname);
        throw error;
      }
    },
    async list(prefix) {
      return (await listAllBlobs(prefix, auth)).map((blob) => blob.pathname);
    },
  };
}

/** The store over the private Blob documents store, configured from the environment unless a config is given. */
export function createBlobContentStore(
  config: ContentConfig = contentConfigFromEnv(),
  options: BlobBackendOptions & ContentStoreOptions = {},
): ContentStore {
  return createContentStore(createBlobBackend(options), config, options);
}

// ---- Local JSON files, for local development and the Playwright tests ----

const PATHNAME_SEGMENT = /^[A-Za-z0-9_.-]+$/;

/** Rejects a pathname that could leave the folder: empty, absolute, or with "." or ".." segments. */
function safeSegments(pathname: string): string[] {
  const segments = pathname.split("/");
  const ok =
    segments.length > 0 &&
    segments.every((segment) => PATHNAME_SEGMENT.test(segment) && segment !== "." && segment !== "..");
  if (!ok) throw new Error(`Unsafe content pathname: ${pathname}`);
  return segments;
}

async function walk(folder: string, relative: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(folder, ...relative), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const found: string[] = [];
  for (const entry of entries) {
    const next = [...relative, entry.name];
    if (entry.isDirectory()) found.push(...(await walk(folder, next)));
    else if (entry.isFile() && !entry.name.endsWith(".tmp")) found.push(next.join("/"));
  }
  return found;
}

/** The version of a file document: a SHA-256 hash of its bytes (KTD3). */
function bytesVersion(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readBytes(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// One queue of writes per file, shared by every file backend in this process,
// so a version check and its write cannot interleave with another write to
// the same file. Two processes on one folder are not covered; the file
// backend serves local work and tests, which run one server.
const fileQueues = new Map<string, Promise<void>>();

async function inFileQueue<T>(file: string, task: () => Promise<T>): Promise<T> {
  const run = (fileQueues.get(file) ?? Promise.resolve()).then(task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  fileQueues.set(file, settled);
  try {
    return await run;
  } finally {
    if (fileQueues.get(file) === settled) fileQueues.delete(file);
  }
}

/**
 * JSON documents as files under one folder: the pathname "site/published.json"
 * is the file "<folder>/site/published.json". Reads are never cached.
 */
export function createFileBackend(folder: string): JsonBackend {
  const root = path.resolve(folder);
  return {
    async read(pathname) {
      const bytes = await readBytes(path.join(root, ...safeSegments(pathname)));
      return bytes === null ? null : JSON.parse(bytes.toString("utf8"));
    },
    async readVersioned(pathname) {
      const bytes = await readBytes(path.join(root, ...safeSegments(pathname)));
      return bytes === null ? null : { value: JSON.parse(bytes.toString("utf8")), version: bytesVersion(bytes) };
    },
    async write(pathname, value, options = {}) {
      const file = path.join(root, ...safeSegments(pathname));
      const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      return inFileQueue(file, async () => {
        if (options.ifVersion !== undefined) {
          const current = await readBytes(file);
          if (options.ifVersion !== (current === null ? null : bytesVersion(current))) {
            throw new ContentConflictError(pathname);
          }
        }
        await mkdir(path.dirname(file), { recursive: true });
        // Write a temporary file, then rename it, so a reader never sees half a document.
        const temporary = `${file}.${crypto.randomUUID().slice(0, 8)}.tmp`;
        await writeFile(temporary, bytes);
        await rename(temporary, file);
        return bytesVersion(bytes);
      });
    },
    async list(prefix) {
      return (await walk(root)).filter((pathname) => pathname.startsWith(prefix));
    },
  };
}

/** Where the content comes from, from the environment. */
export type ContentSource = { kind: "file"; folder: string } | { kind: "blob" } | { kind: "none" };

/**
 * Reads CONTENT_SOURCE. "file:<folder>" selects local JSON files (local
 * development and tests). "blob", or no value while this environment's Blob
 * documents store is configured (docsCredentialsFromEnv), selects Vercel Blob.
 * With neither, no content is configured: the site then renders no content,
 * and `next build` still passes.
 */
export function contentSourceFromEnv(env: Record<string, string | undefined> = process.env): ContentSource {
  const source = env.CONTENT_SOURCE?.trim() ?? "";
  if (source.startsWith("file:")) {
    const folder = source.slice("file:".length).trim();
    if (!folder) throw new Error('CONTENT_SOURCE "file:" needs a folder, for example "file:e2e/fixtures/content".');
    return { kind: "file", folder };
  }
  if (source === "blob") return { kind: "blob" };
  if (source !== "") throw new Error(`CONTENT_SOURCE must be "blob" or "file:<folder>", not "${source}".`);
  return docsCredentialsFromEnv(env) ? { kind: "blob" } : { kind: "none" };
}

/** The content store that the environment selects, or null when no content source is configured. */
export function createContentStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: ContentStoreOptions = {},
): ContentStore | null {
  const source = contentSourceFromEnv(env);
  if (source.kind === "none") return null;
  const config = contentConfigFromEnv(env);
  if (source.kind === "file") return createContentStore(createFileBackend(source.folder), config, options);
  return createBlobContentStore(config, { ...options, credentials: docsCredentialsFromEnv(env) });
}
