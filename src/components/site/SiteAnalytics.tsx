"use client";

import { Analytics } from "@vercel/analytics/next";
import { dropPrivatePages } from "./analytics";

// Vercel Web Analytics for the public pages. A function prop cannot cross from
// a server component to a client component, so the root layout renders this
// wrapper instead of <Analytics> with beforeSend. The script sends nothing in
// development; it starts to count only on a Vercel deployment.

export function SiteAnalytics() {
  return <Analytics beforeSend={dropPrivatePages} />;
}
