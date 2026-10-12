import { describe, expect, it } from "vitest";
import {
  applyPart,
  cardKey,
  experienceKeys,
  isPartKey,
  mergeParts,
  pageKey,
  partKeys,
  partValue,
  stampOf,
  stampParts,
  stampsAfterSave,
  type PartKey,
  type Stamps,
} from "./parts";
import type { Experience, LayoutItem, Site } from "./schema";
import { parseSite } from "./schema";
import { experience, headingBlock, makeSite, media, textBlock } from "./test-fixtures";

const twoPages = () => makeSite({ experiences: [experience("windaid", { blocks: [textBlock("t1", "Old paragraph.")] }), experience("victaulic")] });

const find = (site: Site, slug: string): Experience => {
  const found = site.experiences.find((e) => e.slug === slug);
  if (!found) throw new Error(`no experience ${slug}`);
  return found;
};

/** The site with one experience changed. */
const withExperience = (site: Site, slug: string, change: (e: Experience) => Experience): Site => ({
  ...site,
  experiences: site.experiences.map((e) => (e.slug === slug ? change(e) : e)),
});

const paragraph = (text: string): LayoutItem[] => [{ id: "row-t1", type: "row", layout: "one", cells: [[textBlock("t1", text)]] }];

/** A deep copy of a value with every object's keys in reverse order. */
function reversed<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reversed) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reversed(v)]),
    ) as T;
  }
  return value;
}

/** Runs mergeParts and fails the test on a conflict. */
function merged(current: Site, sent: Site, keys: PartKey[], bases: Stamps) {
  const result = mergeParts(current, sent, keys, bases);
  if (!result.ok) throw new Error(`unexpected conflict: ${result.conflicts.join(", ")}`);
  return result;
}

describe("part keys", () => {
  it("lists the profile, each card and page, and the software cards", () => {
    expect(partKeys(twoPages())).toEqual(["profile", "card:windaid", "page:windaid", "card:victaulic", "page:victaulic", "software"]);
    expect(experienceKeys("windaid")).toEqual(["card:windaid", "page:windaid"]);
    expect(cardKey("windaid")).toBe("card:windaid");
    expect(pageKey("windaid")).toBe("page:windaid");
  });

  it("accepts only the four kinds of part key, with a valid slug", () => {
    for (const key of ["profile", "software", "card:windaid", "page:wind-aid-2"]) expect(isPartKey(key)).toBe(true);
    for (const key of ["labels", "card:", "page:Wind Aid", "card:windaid:x", "profile:x", "", 3, null]) expect(isPartKey(key)).toBe(false);
  });

  it("refuses a malformed key, because only the server code names parts", () => {
    expect(() => partValue(twoPages(), "labels" as PartKey)).toThrow(/labels/);
  });

  it("splits an experience into its card fields and its page fields", () => {
    const site = twoPages();
    const windaid = find(site, "windaid");
    expect(partValue(site, "card:windaid")).toEqual({
      homeTitle: windaid.homeTitle,
      homeText: windaid.homeText,
      skills: windaid.skills,
      cardImage: windaid.cardImage,
    });
    expect(partValue(site, "page:windaid")).toEqual({ pageTitle: windaid.pageTitle, layout: windaid.layout });
    expect(partValue(site, "profile")).toEqual({ profile: site.profile, contact: site.contact });
    expect(partValue(site, "software")).toEqual(site.software);
  });

  it("gives no value for a part of an experience that the site does not have", () => {
    expect(partValue(twoPages(), "page:removed")).toBeUndefined();
    expect(stampParts(twoPages(), ["profile", "page:removed"])).toEqual({ profile: stampOf(partValue(twoPages(), "profile")) });
  });
});

describe("stamps (KTD1)", () => {
  it("is a SHA-256 hex digest", () => {
    expect(stampOf({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same stamps for the same site stamped twice", () => {
    expect(stampParts(twoPages())).toEqual(stampParts(twoPages()));
    expect(Object.keys(stampParts(twoPages()))).toEqual(partKeys(twoPages()));
  });

  it("gives the same stamps for a site whose object keys are in another order", () => {
    const site = twoPages();
    expect(stampParts(reversed(site))).toEqual(stampParts(site));
  });

  it("treats a field set to undefined as a field that is not there, as JSON does", () => {
    const site = twoPages();
    const withUndefined = withExperience(site, "victaulic", (e) => ({ ...e, subtitle: undefined }));
    expect(stampParts(withUndefined)).toEqual(stampParts(site));
  });

  it("gives the same stamps for a version-1 document upgraded on two reads", () => {
    const v1 = {
      ...makeSite(),
      schemaVersion: 1,
      experiences: [{ ...experience("windaid"), layout: undefined, blocks: [headingBlock("h", "Design"), textBlock("t", "A paragraph.")] }],
    };
    const first = parseSite(structuredClone(v1));
    const second = parseSite(structuredClone(v1));
    if (!first.ok || !second.ok) throw new Error("fixture is not valid");
    expect(stampParts(first.site)).toEqual(stampParts(second.site));
  });

  it("changes only the stamp of the part that changed", () => {
    const site = twoPages();
    const before = stampParts(site);
    const after = stampParts(withExperience(site, "windaid", (e) => ({ ...e, homeText: "New card text." })));
    expect(Object.keys(after).filter((key) => after[key] !== before[key])).toEqual(["card:windaid"]);
  });

  it("puts the contact links in the profile part and the labels in no part", () => {
    const site = twoPages();
    const before = stampParts(site);
    const contact = stampParts({ ...site, contact: { ...site.contact, email: "new@example.com" } });
    expect(Object.keys(contact).filter((key) => contact[key] !== before[key])).toEqual(["profile"]);
    const labels = stampParts({ ...site, labels: { ...site.labels, extra: { text: "Extra", approved: false } } });
    expect(labels).toEqual(before);
  });
});

describe("applyPart", () => {
  it("writes the card fields and leaves the page fields of the experience as they are", () => {
    const site = twoPages();
    const next = applyPart(site, "card:windaid", { homeTitle: "WindAid", homeText: "Card.", skills: ["FEA"] });
    const windaid = find(next, "windaid");
    expect(windaid).toMatchObject({ slug: "windaid", homeTitle: "WindAid", homeText: "Card.", skills: ["FEA"] });
    expect("cardImage" in windaid).toBe(false);
    expect(windaid.layout).toBe(find(site, "windaid").layout);
    expect(windaid.pageTitle).toBe(find(site, "windaid").pageTitle);
  });

  it("writes the page fields and leaves the card fields of the experience as they are", () => {
    const site = twoPages();
    const next = applyPart(site, "page:windaid", { pageTitle: "WindAid page", layout: paragraph("New paragraph.") });
    const windaid = find(next, "windaid");
    expect(windaid).toMatchObject({ slug: "windaid", pageTitle: "WindAid page", layout: paragraph("New paragraph.") });
    expect(partValue(next, "card:windaid")).toEqual(partValue(site, "card:windaid"));
    expect(next.experiences.map((e) => e.slug)).toEqual(["windaid", "victaulic"]);
    expect(parseSite(next).ok).toBe(true);
  });

  it("removes a page field that the sent value does not have", () => {
    const site = withExperience(twoPages(), "windaid", (e) => ({ ...e, subtitle: "Old subtitle" }));
    const next = applyPart(site, "page:windaid", { pageTitle: "Page windaid", layout: [] });
    expect("subtitle" in find(next, "windaid")).toBe(false);
  });

  it("writes the profile with the contact links, and the software cards", () => {
    const site = twoPages();
    const profile = { profile: { ...site.profile, name: "J. Behrens" }, contact: { email: "new@example.com" } };
    expect(partValue(applyPart(site, "profile", profile), "profile")).toEqual(profile);
    expect(applyPart(site, "software", []).software).toEqual([]);
  });

  it("does not change its input", () => {
    const site = twoPages();
    const copy = structuredClone(site);
    applyPart(site, "card:windaid", { homeTitle: "X", homeText: "", skills: [] });
    applyPart(site, "page:windaid", { pageTitle: "X", layout: [] });
    expect(site).toEqual(copy);
  });

  it("refuses a part of an experience that the site does not have", () => {
    expect(() => applyPart(twoPages(), "page:removed", { pageTitle: "X", layout: [] })).toThrow(/removed/);
  });
});

describe("mergeParts (KTD2)", () => {
  it("Covers AE2: saves one page while another page changed in the draft, and keeps both changes", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    // Tab A saved WindAid first.
    const current = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("Tab A paragraph.") }));
    // Tab B, loaded before that save, changed only Victaulic.
    const sent = withExperience(loaded, "victaulic", (e) => ({ ...e, pageTitle: "Victaulic, new" }));
    const result = merged(current, sent, ["page:victaulic"], bases);
    expect(find(result.site, "windaid").layout).toEqual(paragraph("Tab A paragraph."));
    expect(find(result.site, "victaulic").pageTitle).toBe("Victaulic, new");
    expect(result.written).toEqual(["page:victaulic"]);
    expect(result.stamps).toEqual({ "page:victaulic": stampOf(partValue(result.site, "page:victaulic")) });
  });

  it("Covers AE1: refuses a page whose base is older than the draft and whose value differs from both", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const current = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("Tab A paragraph.") }));
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("Tab B paragraph.") }));
    const result = mergeParts(current, sent, ["page:windaid"], bases);
    expect(result).toEqual({ ok: false, conflicts: ["page:windaid"] });
  });

  it("names every part in conflict and writes nothing", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const current = withExperience(loaded, "windaid", (e) => ({ ...e, homeText: "A card.", layout: paragraph("A page.") }));
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, homeText: "B card.", layout: paragraph("B page.") }));
    const copy = structuredClone(current);
    const result = mergeParts(current, sent, experienceKeys("windaid"), bases);
    expect(result).toEqual({ ok: false, conflicts: ["card:windaid", "page:windaid"] });
    expect(current).toEqual(copy);
  });

  it("keeps the current draft's value for a sent part equal to its base, even when the draft changed", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const current = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("Newer paragraph.") }));
    const result = merged(current, loaded, ["page:windaid"], bases);
    expect(find(result.site, "windaid").layout).toEqual(paragraph("Newer paragraph."));
    expect(result.written).toEqual([]);
    expect(result.kept).toEqual(["page:windaid"]);
    expect(result.stamps).toEqual({ "page:windaid": bases["page:windaid"] });
  });

  it("accepts a retry: a sent part equal to the current draft succeeds without a conflict", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("Saved once already.") }));
    // The first save was written, but its response was lost; the tab sends it again with the old base.
    const current = sent;
    const result = merged(current, sent, ["page:windaid"], bases);
    expect(find(result.site, "windaid").layout).toEqual(paragraph("Saved once already."));
    expect(result.stamps["page:windaid"]).toBe(stampParts(current)["page:windaid"]);
    expect(result.stamps["page:windaid"]).not.toBe(bases["page:windaid"]);
  });

  it("keeps the home editor's card fields and the experience editor's layout, and returns the card's base stamp", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    // The home editor saved new card fields for WindAid.
    const current = withExperience(loaded, "windaid", (e) => ({ ...e, homeTitle: "WindAid (home editor)", skills: ["CFD"] }));
    // The experience editor, loaded before that save, sends both parts but changed only the layout.
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("Experience editor paragraph.") }));
    const result = merged(current, sent, experienceKeys("windaid"), bases);
    const windaid = find(result.site, "windaid");
    expect(windaid).toMatchObject({ homeTitle: "WindAid (home editor)", skills: ["CFD"], layout: paragraph("Experience editor paragraph.") });
    expect(result.kept).toEqual(["card:windaid"]);
    expect(result.written).toEqual(["page:windaid"]);
    expect(result.stamps["card:windaid"]).toBe(bases["card:windaid"]);
    expect(result.stamps["card:windaid"]).not.toBe(stampParts(current)["card:windaid"]);
    expect(result.stamps["page:windaid"]).toBe(stampParts(result.site)["page:windaid"]);

    // A second layout-only save from the same tab, with the stamps that the first save returned,
    // still keeps the home editor's card fields: the tab's card value still equals its base.
    const tab = withExperience(sent, "windaid", (e) => ({ ...e, layout: paragraph("Second edit.") }));
    const again = merged(result.site, tab, experienceKeys("windaid"), { ...bases, ...result.stamps });
    expect(find(again.site, "windaid")).toMatchObject({ homeTitle: "WindAid (home editor)", skills: ["CFD"], layout: paragraph("Second edit.") });
    expect(again.kept).toEqual(["card:windaid"]);
  });

  it("refuses a later card edit from a tab that kept an older card, instead of overwriting the newer one", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const current = withExperience(loaded, "windaid", (e) => ({ ...e, homeTitle: "WindAid (home editor)" }));
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("Layout only.") }));
    const first = merged(current, sent, experienceKeys("windaid"), bases);
    // The tab now edits the card fields it still holds from its first load.
    const tab = withExperience(sent, "windaid", (e) => ({ ...e, homeText: "Tab card text." }));
    const second = mergeParts(first.site, tab, experienceKeys("windaid"), { ...bases, ...first.stamps });
    expect(second).toEqual({ ok: false, conflicts: ["card:windaid"] });
  });

  it("refuses a sent part whose base stamp is missing", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    delete bases["page:windaid"];
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("New.") }));
    expect(mergeParts(loaded, sent, ["page:windaid"], bases)).toEqual({ ok: false, conflicts: ["page:windaid"] });
    // Even when the tab changed nothing: without a base, the server cannot tell.
    expect(mergeParts(loaded, loaded, ["page:windaid"], bases)).toEqual({ ok: false, conflicts: ["page:windaid"] });
  });

  it("refuses a base stamp that is not a string", () => {
    const loaded = twoPages();
    const bases = { ...stampParts(loaded), profile: 42 } as unknown as Stamps;
    expect(mergeParts(loaded, loaded, ["profile"], bases)).toEqual({ ok: false, conflicts: ["profile"] });
  });

  it("refuses a part of an experience that the current draft no longer has", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const current = { ...loaded, experiences: loaded.experiences.filter((e) => e.slug !== "windaid") };
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("New.") }));
    expect(mergeParts(current, sent, experienceKeys("windaid"), bases)).toEqual({ ok: false, conflicts: ["card:windaid", "page:windaid"] });
    // Unchanged parts too: a save must not bring a removed page back, nor report it saved.
    expect(mergeParts(current, loaded, experienceKeys("windaid"), bases)).toEqual({ ok: false, conflicts: ["card:windaid", "page:windaid"] });
  });

  it("throws when the sent site has no value for a part that the caller names", () => {
    const loaded = twoPages();
    expect(() => mergeParts(loaded, loaded, ["page:other"], stampParts(loaded))).toThrow(/page:other/);
  });

  it("refuses a malformed part key", () => {
    const loaded = twoPages();
    expect(() => mergeParts(loaded, loaded, ["labels" as PartKey], stampParts(loaded))).toThrow(/labels/);
  });

  it("writes the profile and the software cards as parts", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const sent = { ...loaded, contact: { email: "new@example.com" }, software: [] };
    const result = merged(loaded, sent, ["profile", "software"], bases);
    expect(result.site.contact).toEqual({ email: "new@example.com" });
    expect(result.site.software).toEqual([]);
    expect(result.written).toEqual(["profile", "software"]);
  });

  it("leaves every part that the save does not send as it is in the current draft", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const current = { ...loaded, labels: { ...loaded.labels, extra: { text: "Extra", approved: false } } };
    // The tab's site has an older profile, but the save sends only the software cards.
    const sent = { ...loaded, profile: { ...loaded.profile, name: "Old" }, software: [] };
    const result = merged(current, sent, ["software"], bases);
    expect(result.site.profile).toEqual(current.profile);
    expect(result.site.labels).toEqual(current.labels);
    expect(result.site.software).toEqual([]);
  });

  it("removes the card image when the sent card has none", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, cardImage: undefined }));
    const result = merged(loaded, sent, ["card:windaid"], bases);
    expect("cardImage" in find(result.site, "windaid")).toBe(false);
    const withImage = withExperience(loaded, "windaid", (e) => ({ ...e, cardImage: media("new.jpg") }));
    expect(find(merged(loaded, withImage, ["card:windaid"], bases).site, "windaid").cardImage).toEqual(media("new.jpg"));
  });
});

describe("stampsAfterSave", () => {
  it("returns the base stamp for a kept part and the saved draft's stamp for every other part", () => {
    const loaded = twoPages();
    const bases = stampParts(loaded);
    const current = withExperience(loaded, "windaid", (e) => ({ ...e, homeTitle: "Newer" }));
    const sent = withExperience(loaded, "windaid", (e) => ({ ...e, layout: paragraph("New.") }));
    const result = merged(current, sent, experienceKeys("windaid"), bases);
    // Validation can change what is stored (for example, it drops unknown fields), so the
    // returned stamps come from the document that was written.
    const saved = withExperience(result.site, "windaid", (e) => ({ ...e, subtitle: "Normalized" }));
    expect(stampsAfterSave(saved, result)).toEqual({
      "card:windaid": bases["card:windaid"],
      "page:windaid": stampParts(saved)["page:windaid"],
    });
  });
});
