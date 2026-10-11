import { describe, expect, it } from "vitest";
import { parseSite, unapprovedLabels } from "./schema";
import { experience, headingBlock, makeSite, media, textBlock } from "./test-fixtures";

describe("parseSite", () => {
  it("accepts a valid document", () => {
    const result = parseSite(makeSite());
    expect(result.ok).toBe(true);
  });

  it("accepts every block type", () => {
    const site = makeSite({
      experiences: [
        experience("all-blocks", {
          blocks: [
            { id: "h", type: "heading", text: "Overview", level: 2 },
            { id: "t", type: "text", text: "A paragraph with a [link](https://example.com)." },
            { id: "f", type: "facts", items: [{ label: "Skills Demonstrated", value: "CAD, FEA" }] },
            { id: "i", type: "images", items: [{ image: media("a.jpg", { alt: "A part" }) }, {}], caption: "Two parts" },
            { id: "d", type: "file", label: "Project report", file: media("report.pdf") },
            { id: "q", type: "quote", text: "The problem statement." },
          ],
        }),
      ],
    });
    const result = parseSite(site);
    expect(result.ok).toBe(true);
  });

  it("refuses an experience without a title and names the field", () => {
    const site = makeSite({ experiences: [experience("x", { pageTitle: "  " })] });
    const result = parseSite(site);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join("\n")).toContain("experiences.0.pageTitle");
  });

  it("refuses two experiences with the same slug", () => {
    const site = makeSite({ experiences: [experience("same"), experience("same")] });
    const result = parseSite(site);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join("\n")).toMatch(/slug/i);
  });

  it("refuses a slug that is not URL-safe", () => {
    const result = parseSite(makeSite({ experiences: [experience("Bad Slug!")] }));
    expect(result.ok).toBe(false);
  });

  it("refuses two blocks with the same id in one experience", () => {
    const site = makeSite({
      experiences: [experience("x", { blocks: [textBlock("b1", "a"), textBlock("b1", "b")] })],
    });
    expect(parseSite(site).ok).toBe(false);
  });

  it("refuses two software cards with the same id", () => {
    const site = makeSite();
    site.software = [site.software[0], { ...site.software[1], id: site.software[0].id }];
    expect(parseSite(site).ok).toBe(false);
  });

  it("refuses an unknown block type", () => {
    const site = makeSite() as unknown as { experiences: { layout: unknown[] }[] };
    site.experiences[0].layout = [
      { id: "r", type: "row", layout: "one", cells: [[{ id: "v", type: "video", url: "https://example.com" }]] },
    ];
    expect(parseSite(site).ok).toBe(false);
  });

  it("refuses a heading inside a cell", () => {
    const site = makeSite() as unknown as { experiences: { layout: unknown[] }[] };
    site.experiences[0].layout = [{ id: "r", type: "row", layout: "one", cells: [[headingBlock("h", "Title")]] }];
    expect(parseSite(site).ok).toBe(false);
  });

  it("refuses a row whose number of cells does not match its layout", () => {
    const site = makeSite() as unknown as { experiences: { layout: unknown[] }[] };
    site.experiences[0].layout = [{ id: "r", type: "row", layout: "halves", cells: [[textBlock("t", "x")]] }];
    const result = parseSite(site);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join("\n")).toContain("layout.0.cells");
  });

  it("refuses two slides with the same id in one carousel", () => {
    const site = makeSite({
      experiences: [
        experience("x", {
          layout: [{ id: "c", type: "carousel", slides: [{ id: "s", text: "a" }, { id: "s", text: "b" }] }],
        }),
      ],
    });
    expect(parseSite(site).ok).toBe(false);
  });

  it("accepts a carousel and every row layout", () => {
    const site = makeSite({
      experiences: [
        experience("x", {
          layout: [
            { id: "c", type: "carousel", slides: [{ id: "s1", image: media("v1.jpg", { alt: "Version 1" }), text: "First." }] },
            { id: "r1", type: "row", layout: "one", cells: [[textBlock("t1", "a")]] },
            { id: "r2", type: "row", layout: "halves", cells: [[textBlock("t2", "b")], []] },
            { id: "r3", type: "row", layout: "third-two", cells: [[], [textBlock("t3", "c")]] },
            { id: "r4", type: "row", layout: "two-third", cells: [[], []] },
          ],
        }),
      ],
    });
    expect(parseSite(site).ok).toBe(true);
  });

  it("upgrades a version-1 document to version 2 (KTD2)", () => {
    const v1 = {
      ...makeSite(),
      schemaVersion: 1,
      experiences: [
        { ...experience("x"), layout: undefined, blocks: [headingBlock("h", "Design"), textBlock("t", "A paragraph.")] },
      ],
    };
    const result = parseSite(v1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.site.schemaVersion).toBe(2);
    expect(result.site.experiences[0].layout.map((item) => item.type)).toEqual(["heading", "row"]);
    expect("blocks" in result.site.experiences[0]).toBe(false);
  });

  it("refuses an invalid version-1 document instead of upgrading it", () => {
    const v1 = { ...makeSite(), schemaVersion: 1, experiences: [{ ...experience("x"), blocks: [textBlock("b", "a"), textBlock("b", "b")] }] };
    expect(parseSite(v1).ok).toBe(false);
  });

  it("refuses a media file that is not an https URL", () => {
    const site = makeSite({
      experiences: [experience("x", { cardImage: media("a.jpg", { url: "javascript:alert(1)" }) })],
    });
    expect(parseSite(site).ok).toBe(false);
    const plainHttp = makeSite({
      experiences: [experience("x", { cardImage: media("a.jpg", { url: "http://example.com/a.jpg" }) })],
    });
    expect(parseSite(plainHttp).ok).toBe(false);
  });

  it("refuses a wrong schema version and a non-object", () => {
    expect(parseSite({ ...makeSite(), schemaVersion: 3 }).ok).toBe(false);
    expect(parseSite(null).ok).toBe(false);
    expect(parseSite("text").ok).toBe(false);
  });

  it("accepts empty optional text, so missing content can stay hidden", () => {
    const site = makeSite({
      contact: { linkedin: "", email: "", rise: "" },
      experiences: [experience("x", { homeText: "", skills: [], cardImage: undefined })],
    });
    expect(parseSite(site).ok).toBe(true);
  });
});

describe("unapprovedLabels", () => {
  it("returns the keys of the labels that are not approved, sorted", () => {
    const site = makeSite({
      labels: {
        selectedWork: { text: "Selected Work", approved: true },
        readMore: { text: "Read more", approved: false },
        downloadResume: { text: "Resume", approved: false },
      },
    });
    expect(unapprovedLabels(site)).toEqual(["downloadResume", "readMore"]);
  });

  it("returns an empty list when every label is approved", () => {
    expect(unapprovedLabels(makeSite())).toEqual([]);
  });
});
