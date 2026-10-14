import type { Site } from "./schema";

// The UI labels that a feature of the experience pages needs (KTD9): the carousel
// buttons and the image enlarge view. The texts are Claude's proposals; the
// owner approves or rewrites them on the Labels page (1.2.7), and Publish refuses
// until then. They are added to the draft, unapproved, when some page uses the
// feature. When no page uses it, each label that is still unapproved and still
// holds its proposal is removed again, so a draft without the feature never
// waits on them. A label that the owner approved or rewrote stays.

export const CAROUSEL_LABEL_PROPOSALS: Readonly<Record<string, string>> = {
  carouselPrevious: "Previous",
  carouselNext: "Next",
  carouselSkip: "Skip the slides",
};

export const IMAGE_LABEL_PROPOSALS: Readonly<Record<string, string>> = {
  imageEnlarge: "Enlarge image",
  imageClose: "Close",
};

function hasCarousel(site: Site): boolean {
  return site.experiences.some((e) => e.layout.some((item) => item.type === "carousel"));
}

/** True when a row of some page holds an images block that opens larger and has an image (not the carousel). */
function hasRowImage(site: Site): boolean {
  return site.experiences.some((e) =>
    e.layout.some(
      (item) =>
        item.type === "row" &&
        item.cells.some((cell) =>
          cell.some((block) => block.type === "images" && block.enlarge !== false && block.items.some((i) => i.image)),
        ),
    ),
  );
}

/**
 * The site with any missing label of the group added as unapproved, when the
 * feature is used; otherwise without the group's unapproved, unedited labels.
 * Returns the same object when nothing changes.
 */
function withLabelGroup(site: Site, proposals: Readonly<Record<string, string>>, used: boolean): Site {
  const keys = Object.keys(proposals);
  if (!used) {
    const unused = keys.filter((key) => {
      const label = Object.hasOwn(site.labels, key) ? site.labels[key] : undefined;
      return label !== undefined && !label.approved && label.text === proposals[key];
    });
    if (unused.length === 0) return site;
    const labels = { ...site.labels };
    for (const key of unused) delete labels[key];
    return { ...site, labels };
  }
  const missing = keys.filter((key) => !(key in site.labels));
  if (missing.length === 0) return site;
  const labels = { ...site.labels };
  for (const key of missing) labels[key] = { text: proposals[key], approved: false };
  return { ...site, labels };
}

/** The carousel labels only (see the top of this file). */
export function withCarouselLabels(site: Site): Site {
  return withLabelGroup(site, CAROUSEL_LABEL_PROPOSALS, hasCarousel(site));
}

/** The image enlarge labels only (see the top of this file). */
export function withImageLabels(site: Site): Site {
  return withLabelGroup(site, IMAGE_LABEL_PROPOSALS, hasRowImage(site));
}

/** Every feature label group. Returns the same object when nothing changes. */
export function withFeatureLabels(site: Site): Site {
  return withImageLabels(withCarouselLabels(site));
}
