import { cacheLife, cacheTag } from "next/cache";
import type { Site } from "./schema";
import { CONTENT_TAG, createBlobContentStore } from "./store";

/**
 * The published document for the public pages. Next.js caches the result under
 * the tag CONTENT_TAG; the Publish action refreshes that tag. The Blob read
 * inside is uncached (KTD2). Pass the result through visibleSite() before render.
 */
export async function getPublishedSite(): Promise<Site | null> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("max");
  return createBlobContentStore().readPublished();
}
