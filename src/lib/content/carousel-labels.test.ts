import { describe, expect, it } from "vitest";
import { CAROUSEL_LABEL_PROPOSALS, withCarouselLabels } from "./carousel-labels";
import { unapprovedLabels, type Experience, type Site } from "./schema";
import { experience, makeSite } from "./test-fixtures";

const carouselLayout: Experience["layout"] = [{ id: "c", type: "carousel", slides: [{ id: "s", text: "Version 1." }] }];

/** The site with a carousel on the first page, or without any carousel. */
function withLayout(site: Site, layout: Experience["layout"]): Site {
  return { ...site, experiences: site.experiences.map((e, i) => (i === 0 ? { ...e, layout } : e)) };
}

const carouselKeys = (site: Site) => Object.keys(site.labels).filter((key) => key in CAROUSEL_LABEL_PROPOSALS);

describe("withCarouselLabels", () => {
  it("adds the carousel labels, unapproved, when a page has a carousel (KTD9)", () => {
    const site = withCarouselLabels(withLayout(makeSite(), carouselLayout));
    expect(carouselKeys(site).sort()).toEqual(["carouselNext", "carouselPrevious", "carouselSkip"]);
    expect(unapprovedLabels(site)).toEqual(["carouselNext", "carouselPrevious", "carouselSkip"]);
  });

  it("removes the unapproved proposals when the carousel is removed, so Publish does not wait on them", () => {
    const added = withCarouselLabels(withLayout(makeSite(), carouselLayout));
    const removed = withCarouselLabels(withLayout(added, []));
    expect(carouselKeys(removed)).toEqual([]);
    expect(unapprovedLabels(removed)).toEqual([]);
    expect(removed.labels).toEqual(makeSite().labels);
  });

  it("keeps a carousel label that the owner approved when the carousel is removed", () => {
    const added = withCarouselLabels(withLayout(makeSite(), carouselLayout));
    const approved = { ...added, labels: { ...added.labels, carouselNext: { text: "Next", approved: true } } };
    const removed = withCarouselLabels(withLayout(approved, []));
    expect(carouselKeys(removed)).toEqual(["carouselNext"]);
    expect(removed.labels.carouselNext).toEqual({ text: "Next", approved: true });
  });

  it("keeps a carousel label that the owner rewrote, even unapproved, when the carousel is removed", () => {
    const added = withCarouselLabels(withLayout(makeSite(), carouselLayout));
    const rewritten = { ...added, labels: { ...added.labels, carouselSkip: { text: "Weiter", approved: false } } };
    const removed = withCarouselLabels(withLayout(rewritten, []));
    expect(carouselKeys(removed)).toEqual(["carouselSkip"]);
    expect(removed.labels.carouselSkip).toEqual({ text: "Weiter", approved: false });
  });

  it("returns the same site when no page has or had a carousel", () => {
    const site = makeSite({ experiences: [experience("first"), experience("second")] });
    expect(withCarouselLabels(site)).toBe(site);
  });

  it("returns the same site when a page with a carousel already has all its labels", () => {
    const site = withCarouselLabels(withLayout(makeSite(), carouselLayout));
    expect(withCarouselLabels(site)).toBe(site);
  });
});
