import type { Site } from "./schema";

// The UI labels of the carousel (KTD9). The texts are Claude's proposals; the
// owner approves or rewrites them on the Labels page (1.2.7), and Publish refuses
// until then. They are added to the draft, unapproved, when a page has a carousel.
// When no page has one, each label that is still unapproved and still holds its
// proposal is removed again, so a draft without a carousel never waits on them.
// A label that the owner approved or rewrote stays.

export const CAROUSEL_LABEL_PROPOSALS: Readonly<Record<string, string>> = {
  carouselPrevious: "Previous",
  carouselNext: "Next",
  carouselSkip: "Skip the slides",
};

/**
 * The site with any missing carousel label added as unapproved, when some page
 * has a carousel; otherwise without the unapproved, unedited carousel labels.
 * Returns the same object when nothing changes.
 */
export function withCarouselLabels(site: Site): Site {
  const hasCarousel = site.experiences.some((e) => e.layout.some((item) => item.type === "carousel"));
  const keys = Object.keys(CAROUSEL_LABEL_PROPOSALS);
  if (!hasCarousel) {
    const unused = keys.filter((key) => {
      const label = Object.hasOwn(site.labels, key) ? site.labels[key] : undefined;
      return label !== undefined && !label.approved && label.text === CAROUSEL_LABEL_PROPOSALS[key];
    });
    if (unused.length === 0) return site;
    const labels = { ...site.labels };
    for (const key of unused) delete labels[key];
    return { ...site, labels };
  }
  const missing = keys.filter((key) => !(key in site.labels));
  if (missing.length === 0) return site;
  const labels = { ...site.labels };
  for (const key of missing) labels[key] = { text: CAROUSEL_LABEL_PROPOSALS[key], approved: false };
  return { ...site, labels };
}
