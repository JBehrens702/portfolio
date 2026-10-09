import { del, list } from "@vercel/blob";
import type { Media, Site } from "./schema";
import { blobCredentialsFromEnv, type BlobCredentials, type ContentStore } from "./store";

// The media files of a content root (U6 step 4, KTD2, KTD4). After a Publish,
// a Blob file under the root's media prefix is deleted only when no document
// uses it: not the draft, not the published document, and not any history copy.
// A history copy keeps its files, so an earlier version never has broken links.

/** Every media value of a document, in document order. */
export function siteMedia(site: Site): Media[] {
  const found: Media[] = [];
  const add = (media: Media | undefined) => {
    if (media) found.push(media);
  };
  add(site.profile.heroPhoto);
  add(site.profile.resumeFile);
  for (const experience of site.experiences) {
    add(experience.cardImage);
    for (const block of experience.blocks) {
      if (block.type === "images") block.items.forEach((item) => add(item.image));
      if (block.type === "file") add(block.file);
    }
  }
  site.software.forEach((card) => add(card.screenshot));
  return found;
}

/** One stored media file. */
export interface StoredMedia {
  pathname: string;
  url: string;
  uploadedAt: Date;
}

/** The media files of a store: list by prefix, delete by URL. */
export interface MediaStorage {
  list(prefix: string): Promise<StoredMedia[]>;
  delete(urls: string[]): Promise<void>;
}

export interface CollectOptions {
  now?: () => Date;
  /**
   * Files younger than this stay, so an upload that the browser has not yet
   * saved into the draft is never deleted by a Publish in another tab.
   */
  minAgeMs?: number;
}

export interface CollectResult {
  deleted: string[];
  kept: number;
}

/** One hour. */
export const DEFAULT_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Deletes the media files under the store's media prefix that no document
 * uses. Each document is searched as JSON text, so a file also counts as used
 * when a text links to it. If any document cannot be read, nothing is deleted.
 */
export async function collectMediaGarbage(
  store: ContentStore,
  storage: MediaStorage,
  options: CollectOptions = {},
): Promise<CollectResult> {
  const prefix = store.paths.mediaPrefix;
  if (!prefix.endsWith("/media/")) throw new Error(`Unexpected media prefix: ${prefix}`);

  // Read every document first. A failure throws here, before any delete.
  const documents: unknown[] = [await store.readDraft(), await store.readPublished()];
  for (const pathname of await store.listHistory()) {
    documents.push(await store.readHistory(pathname));
  }
  const texts = documents.filter((doc) => doc !== null).map((doc) => JSON.stringify(doc));
  const used = (pathname: string) =>
    texts.some((text) => text.includes(pathname) || text.includes(encodeURI(pathname)));

  const now = (options.now ?? (() => new Date()))().getTime();
  const minAge = options.minAgeMs ?? DEFAULT_MIN_AGE_MS;
  const files = await storage.list(prefix);
  const unused = files.filter(
    (file) =>
      // Never outside the root's media prefix, whatever the listing returns.
      file.pathname.startsWith(prefix) &&
      !used(file.pathname) &&
      now - file.uploadedAt.getTime() >= minAge,
  );
  if (unused.length > 0) await storage.delete(unused.map((file) => file.url));
  return { deleted: unused.map((file) => file.pathname).sort(), kept: files.length - unused.length };
}

/** The media files of a Vercel Blob store. */
export function createBlobMediaStorage(credentials: BlobCredentials): MediaStorage {
  return {
    async list(prefix) {
      const found: StoredMedia[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, ...credentials });
        found.push(
          ...page.blobs.map((blob) => ({ pathname: blob.pathname, url: blob.url, uploadedAt: new Date(blob.uploadedAt) })),
        );
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return found;
    },
    async delete(urls) {
      for (let i = 0; i < urls.length; i += 100) {
        await del(urls.slice(i, i + 100), credentials);
      }
    },
  };
}

/**
 * The media storage of this environment, or null. It exists only when the
 * documents themselves come from Blob (CONTENT_SOURCE "blob" or unset with a
 * Blob store): with local JSON files, the files in Blob do not belong to the
 * documents on disk, so a cleanup there could delete files that are in use.
 */
export function createMediaStorageFromEnv(env: Record<string, string | undefined> = process.env): MediaStorage | null {
  const source = env.CONTENT_SOURCE?.trim() ?? "";
  if (source.startsWith("file:")) return null;
  const credentials = blobCredentialsFromEnv(env);
  return credentials ? createBlobMediaStorage(credentials) : null;
}
