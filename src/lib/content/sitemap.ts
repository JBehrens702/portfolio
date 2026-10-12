import type { MetadataRoute } from "next";
import type { Site } from "./schema";

/**
 * The public pages for sitemap.xml: the home page, then each published
 * experience page in the order the site shows them. The admin and preview pages
 * are never listed (KTD12). There is no lastModified: the document stores no
 * publish date, and a wrong date is worse than none.
 */
export function sitemapEntries(published: Site | null, siteUrl: string): MetadataRoute.Sitemap {
  const experiences = published?.experiences ?? [];
  return [
    { url: siteUrl },
    ...experiences.map((experience) => ({ url: `${siteUrl}/experiences/${experience.slug}` })),
  ];
}
