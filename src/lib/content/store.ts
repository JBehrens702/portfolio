import { get, list, put, type BlobAccessType } from "@vercel/blob";
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

export interface BlobBackendOptions {
  /** Defaults to BLOB_READ_WRITE_TOKEN. */
  token?: string;
  /** Must match the access of the Blob store. Defaults to "public", so media files can be shown to visitors. */
  access?: BlobAccessType;
}

export function createBlobBackend(options: BlobBackendOptions = {}): JsonBackend {
  const access = options.access ?? "public";
  const token = options.token;
  return {
    async read(pathname) {
      // Uncached: the Blob CDN can return the version from before an overwrite (KTD2).
      const result = await get(pathname, { access, useCache: false, token });
      if (result === null || result.statusCode !== 200) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    },
    async write(pathname, value) {
      await put(pathname, JSON.stringify(value), {
        access,
        token,
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
        const page = await list({ prefix, cursor, token });
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
