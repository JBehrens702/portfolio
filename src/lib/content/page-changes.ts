import { cardKey, pageKey, stampOf, stampParts } from "./parts";
import type { Site } from "./schema";
import { HOME_PAGE, type PageId } from "./site-links";

// The change marks of the admin map (KTD8): which pages of the saved draft
// differ from the published site, and which published pages the draft removed.
// It compares the raw documents with the part stamps of KTD1 (parts.ts uses
// Node crypto, so this module runs on the server only). No Next.js or admin code.

/** "new": the page is not published yet. "changed": it differs from the published page. null: no change. */
export type PageMark = "new" | "changed" | null;

export interface PageChange {
  page: PageId;
  mark: PageMark;
}

/** A page that the published site shows and the draft removed (2.4.30). */
export interface RemovedPage {
  slug: string;
  homeTitle: string;
  pageTitle: string;
}

export interface PageChanges {
  /** One entry per page of the draft: the home page first, then each experience in draft order. */
  pages: PageChange[];
  /** The removed pages, in published order. */
  removed: RemovedPage[];
}

/**
 * The change marks of each page of the draft (KTD8, 2.4.29, 2.4.30). Pass
 * `published` as null when nothing is published yet: every page is then "new".
 *
 * An experience is "new" when its slug is not published, and "changed" when
 * its card part or page part differs. The home page is "changed" when the
 * profile part (the profile and the contact links), the software cards, the
 * labels, the experience order or set, or any card part differs; the shared
 * parts show on the home page, so the owner checks them there.
 *
 * The comparison uses the raw documents, not visibleSite(), because a change
 * to hidden content is still an unpublished change.
 */
export function pageChanges(draft: Site, published: Site | null): PageChanges {
  const draftSlugs = draft.experiences.map((e) => e.slug);
  if (published === null) {
    return { pages: [HOME_PAGE, ...draftSlugs].map((page) => ({ page, mark: "new" })), removed: [] };
  }

  const draftStamps = stampParts(draft);
  const liveStamps = stampParts(published);
  const differs = (key: string) => draftStamps[key] !== liveStamps[key];
  const liveSlugs = new Set(published.experiences.map((e) => e.slug));

  const experienceMarks: PageChange[] = draftSlugs.map((slug) => ({
    page: slug,
    mark: !liveSlugs.has(slug) ? "new" : differs(cardKey(slug)) || differs(pageKey(slug)) ? "changed" : null,
  }));

  const homeChanged =
    differs("profile") ||
    differs("software") ||
    stampOf(draft.labels) !== stampOf(published.labels) ||
    stampOf(draftSlugs) !== stampOf(published.experiences.map((e) => e.slug)) ||
    draftSlugs.some((slug) => differs(cardKey(slug)));

  const draftSet = new Set(draftSlugs);
  const removed = published.experiences
    .filter((e) => !draftSet.has(e.slug))
    .map(({ slug, homeTitle, pageTitle }) => ({ slug, homeTitle, pageTitle }));

  return { pages: [{ page: HOME_PAGE, mark: homeChanged ? "changed" : null }, ...experienceMarks], removed };
}
