import { get, list, put, type BlobAccessType } from "@vercel/blob";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSite, parseSite, type ParseResult, type Site } from "./schema";

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

/** The raw storage under the content store: JSON values by pathname. */
export interface JsonBackend {
  /** An uncached read. Null when no document exists at the pathname. */
  read(pathname: string): Promise<unknown | null>;
  /** Writes or overwrites the document at the pathname. */
  write(pathname: string, value: unknown): Promise<void>;
  /** The pathnames that start with the prefix. */
  list(prefix: string): Promise<string[]>;
}

export interface ContentStore {
  readonly paths: ContentPaths;
  /** The draft, validated. Null when none exists. Throws ContentValidationError when it is invalid. */
  readDraft(): Promise<Site | null>;
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

/** Validates and saves the draft. Returns the problems instead of throwing, for the admin forms. */
export async function saveDraft(store: ContentStore, input: unknown): Promise<ParseResult> {
  const result = parseSite(input);
  if (!result.ok) return result;
  await store.writeDraft(result.site);
  return result;
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
  return {
    files,
    writes,
    async read(pathname) {
      const text = files.get(pathname);
      return text === undefined ? null : JSON.parse(text);
    },
    async write(pathname, value) {
      files.set(pathname, JSON.stringify(value));
      writes.push(pathname);
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

export function blobCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobCredentials | undefined {
  const prefix = env.VERCEL_ENV === "production" ? "BLOB" : "DEV";
  const token = env[`${prefix}_READ_WRITE_TOKEN`]?.trim();
  if (token) return { token };
  const storeId = env[`${prefix}_STORE_ID`]?.trim();
  if (storeId) return { storeId };
  return undefined;
}

export interface BlobBackendOptions {
  /**
   * Defaults to blobCredentialsFromEnv(). Always passed to the SDK, which
   * would otherwise pick BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID by itself.
   */
  credentials?: BlobCredentials;
  /** Must match the access of the Blob store. Defaults to "public", so media files can be shown to visitors. */
  access?: BlobAccessType;
}

export function createBlobBackend(options: BlobBackendOptions = {}): JsonBackend {
  const access = options.access ?? "public";
  const auth = options.credentials ?? blobCredentialsFromEnv();
  if (!auth) {
    throw new Error(
      "No Blob store for this environment: set DEV_STORE_ID or DEV_READ_WRITE_TOKEN (BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN on Production).",
    );
  }
  return {
    async read(pathname) {
      // Uncached: the Blob CDN can return the version from before an overwrite (KTD2).
      const result = await get(pathname, { access, useCache: false, ...auth });
      if (result === null || result.statusCode !== 200) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    },
    async write(pathname, value) {
      await put(pathname, JSON.stringify(value), {
        access,
        ...auth,
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        // The shortest CDN cache that Blob allows; the server never reads through it.
        cacheControlMaxAge: 60,
      });
    },
    async list(prefix) {
      const pathnames: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, ...auth });
        pathnames.push(...page.blobs.map((blob) => blob.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return pathnames;
    },
  };
}

/** The store over Vercel Blob, configured from the environment unless a config is given. */
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

/**
 * JSON documents as files under one folder: the pathname "site/published.json"
 * is the file "<folder>/site/published.json". Reads are never cached.
 */
export function createFileBackend(folder: string): JsonBackend {
  const root = path.resolve(folder);
  return {
    async read(pathname) {
      try {
        return JSON.parse(await readFile(path.join(root, ...safeSegments(pathname)), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async write(pathname, value) {
      const file = path.join(root, ...safeSegments(pathname));
      await mkdir(path.dirname(file), { recursive: true });
      // Write a temporary file, then rename it, so a reader never sees half a document.
      const temporary = `${file}.${crypto.randomUUID().slice(0, 8)}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await rename(temporary, file);
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
 * store is configured (blobCredentialsFromEnv), selects Vercel Blob. With neither, no content is configured: the site
 * then renders no content, and `next build` still passes.
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
  return blobCredentialsFromEnv(env) ? { kind: "blob" } : { kind: "none" };
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
  return createBlobContentStore(config, { ...options, credentials: blobCredentialsFromEnv(env) });
}
