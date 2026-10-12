import type { MetadataRoute } from "next";
import { getPublishedSite } from "@/lib/content/public";
import { sitemapEntries } from "@/lib/content/sitemap";
import { SITE_URL } from "@/lib/site-url";

// Reads the same cached published document as the public pages, so a Publish
// (which refreshes CONTENT_TAG) refreshes the sitemap too.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(await getPublishedSite(), SITE_URL);
}
