import { cacheLife, cacheTag } from "next/cache";
import type { Site } from "./schema";
import { CONTENT_TAG, createContentStoreFromEnv } from "./store";

/**
 * The published document for the public pages. Next.js caches the result under
 * the tag CONTENT_TAG; the Publish action refreshes that tag. The Blob read
 * inside is uncached (KTD2). Pass the result through visibleSite() before render.
 * Null when nothing is published yet, or when no content source is configured
 * (for example `next build` without a Blob token).
 */
export async function getPublishedSite(): Promise<Site | null> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("max");
  const store = createContentStoreFromEnv();
  return store ? store.readPublished() : null;
}
