import { describe, expect, it } from "vitest";
import { pageChanges, type PageMark } from "./page-changes";
import type { Site } from "./schema";
import { HOME_PAGE, type PageId } from "./site-links";
import { experience, makeSite, software, textBlock } from "./test-fixtures";

// The change marks of the admin map (KTD8, U5): 2.4.29, 2.4.30, AE5.

const SLUGS = ["windaid", "victaulic", "thermocouple", "turbine", "solidworks", "volunteer"];

function published(): Site {
  return makeSite({ experiences: SLUGS.map((slug) => experience(slug, { blocks: [textBlock(`${slug}-t`, `About ${slug}.`)] })) });
}

/** The marks as [page, mark] pairs, in the order that the map shows them. */
function marks(draft: Site, live: Site | null): [PageId, PageMark][] {
  return pageChanges(draft, live).pages.map((p) => [p.page, p.mark]);
}

function markOf(draft: Site, live: Site | null, page: PageId): PageMark {
  const found = pageChanges(draft, live).pages.find((p) => p.page === page);
  if (!found) throw new Error(`no mark entry for ${page}`);
  return found.mark;
}

function withExperience(site: Site, slug: string, change: (e: Site["experiences"][number]) => Site["experiences"][number]): Site {
  return { ...site, experiences: site.experiences.map((e) => (e.slug === slug ? change(e) : e)) };
}

describe("pageChanges (AE5)", () => {
  it("gives no marks and no removed pages when the draft equals the published site", () => {
    const live = published();
    const result = pageChanges(structuredClone(live), live);
    expect(result.pages.map((p) => p.mark)).toEqual([null, null, null, null, null, null, null]);
    expect(result.removed).toEqual([]);
  });

  it("marks an edited page changed, a new page new, and lists a removed page", () => {
    const live = published();
    let draft = withExperience(live, "victaulic", (e) => ({ ...e, pageTitle: "Victaulic, edited" }));
    draft = {
      ...draft,
      experiences: [...draft.experiences.filter((e) => e.slug !== "volunteer"), experience("new-page")],
    };
    const result = pageChanges(draft, live);
    expect(result.pages.map((p) => [p.page, p.mark])).toEqual([
      [HOME_PAGE, "changed"],
      ["windaid", null],
      ["victaulic", "changed"],
      ["thermocouple", null],
      ["turbine", null],
      ["solidworks", null],
      ["new-page", "new"],
    ]);
    expect(result.removed).toEqual([{ slug: "volunteer", homeTitle: "Home volunteer", pageTitle: "Page volunteer" }]);
  });

  it("lists removed pages in the published order", () => {
    const live = published();
    const draft = { ...live, experiences: live.experiences.filter((e) => e.slug !== "turbine" && e.slug !== "windaid") };
    expect(pageChanges(draft, live).removed.map((r) => r.slug)).toEqual(["windaid", "turbine"]);
  });

  it("marks every page new when nothing is published yet", () => {
    const draft = published();
    expect(marks(draft, null)).toEqual([[HOME_PAGE, "new"], ...SLUGS.map((slug): [PageId, PageMark] => [slug, "new"])]);
    expect(pageChanges(draft, null).removed).toEqual([]);
  });

  it("gives an empty draft one home page entry", () => {
    const empty = makeSite({ experiences: [] });
    expect(marks(empty, empty)).toEqual([[HOME_PAGE, null]]);
  });

  it("does not change the documents that it reads", () => {
    const live = published();
    const draft = withExperience(live, "victaulic", (e) => ({ ...e, pageTitle: "Edited" }));
    const copies = [structuredClone(draft), structuredClone(live)];
    pageChanges(draft, live);
    expect([draft, live]).toEqual(copies);
  });
});

describe("pageChanges: the home page (Key Decision: shared parts mark the home page)", () => {
  it("marks only the home page for a profile change", () => {
    const live = published();
    const draft = { ...live, profile: { ...live.profile, tagline: "New tagline" } };
    expect(marks(draft, live)).toEqual([[HOME_PAGE, "changed"], ...SLUGS.map((slug): [PageId, PageMark] => [slug, null])]);
  });

  it("marks the home page for a contact link change", () => {
    const live = published();
    expect(markOf({ ...live, contact: { ...live.contact, email: "new@example.com" } }, live, HOME_PAGE)).toBe("changed");
  });

  it("marks the home page for a label change", () => {
    const live = published();
    const draft = { ...live, labels: { ...live.labels, selectedWork: { text: "Work", approved: true } } };
    expect(markOf(draft, live, HOME_PAGE)).toBe("changed");
    expect(markOf(draft, live, "windaid")).toBeNull();
  });

  it("marks the home page for a software card change", () => {
    const live = published();
    const draft = { ...live, software: [...live.software, software("extra")] };
    expect(markOf(draft, live, HOME_PAGE)).toBe("changed");
  });

  it("marks the home page and the experience for a card change", () => {
    const live = published();
    const draft = withExperience(live, "turbine", (e) => ({ ...e, homeText: "New card text." }));
    expect(marks(draft, live)).toEqual([
      [HOME_PAGE, "changed"],
      ...SLUGS.map((slug): [PageId, PageMark] => [slug, slug === "turbine" ? "changed" : null]),
    ]);
  });

  it("marks the experience but not the home page for a page change", () => {
    const live = published();
    const draft = withExperience(live, "turbine", (e) => ({ ...e, subtitle: "A new subtitle" }));
    expect(markOf(draft, live, HOME_PAGE)).toBeNull();
    expect(markOf(draft, live, "turbine")).toBe("changed");
  });

  it("marks the home page, and no experience, for a new experience order", () => {
    const live = published();
    const draft = { ...live, experiences: [...live.experiences].reverse() };
    const result = marks(draft, live);
    expect(result[0]).toEqual([HOME_PAGE, "changed"]);
    expect(result.slice(1).map(([, mark]) => mark)).toEqual(SLUGS.map(() => null));
    expect(result.slice(1).map(([page]) => page)).toEqual([...SLUGS].reverse());
  });

  it("marks the home page when an experience is removed", () => {
    const live = published();
    const draft = { ...live, experiences: live.experiences.slice(0, -1) };
    expect(markOf(draft, live, HOME_PAGE)).toBe("changed");
  });

  it("compares the raw documents: a change to hidden content still marks the page", () => {
    const live = published();
    // A blank text block is hidden on the site, but it is still an unpublished change.
    const draft = withExperience(live, "windaid", (e) => ({
      ...e,
      layout: [...e.layout, { id: "r9", type: "row", layout: "one", cells: [[textBlock("t9", "   ")]] }],
    }));
    expect(markOf(draft, live, "windaid")).toBe("changed");
    const hiddenIntro = { ...live, profile: { ...live.profile, introParagraphs: [...live.profile.introParagraphs, ""] } };
    expect(markOf(hiddenIntro, live, HOME_PAGE)).toBe("changed");
  });

  it("ignores the key order of the documents", () => {
    const live = published();
    const reordered = Object.fromEntries(Object.entries(live).reverse()) as Site;
    const draft: Site = { ...reordered, labels: Object.fromEntries(Object.entries(live.labels).reverse()), experiences: live.experiences.map((e) => Object.fromEntries(Object.entries(e).reverse()) as typeof e) };
    expect(marks(draft, live).every(([, mark]) => mark === null)).toBe(true);
  });
});
