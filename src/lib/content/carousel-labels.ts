import type { Site } from "./schema";

// The UI labels of the carousel (KTD9). The texts are Claude's proposals; the
// owner approves or rewrites them on the Labels page (1.2.7), and Publish refuses
// until then. They are added to the draft only when a page has a carousel, so a
// draft without one never waits on them.

export const CAROUSEL_LABEL_PROPOSALS: Readonly<Record<string, string>> = {
  carouselPrevious: "Previous",
  carouselNext: "Next",
  carouselSkip: "Skip the slides",
};

/** The site with any missing carousel label added as unapproved, when some page has a carousel. */
export function withCarouselLabels(site: Site): Site {
  const hasCarousel = site.experiences.some((e) => e.layout.some((item) => item.type === "carousel"));
  const missing = Object.keys(CAROUSEL_LABEL_PROPOSALS).filter((key) => !(key in site.labels));
  if (!hasCarousel || missing.length === 0) return site;
  const labels = { ...site.labels };
  for (const key of missing) labels[key] = { text: CAROUSEL_LABEL_PROPOSALS[key], approved: false };
  return { ...site, labels };
}
