import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// KTD12: the admin and preview pages are not indexed. They also send noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/preview"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
