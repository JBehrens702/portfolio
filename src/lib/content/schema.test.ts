import { describe, expect, it } from "vitest";
import { parseSite, unapprovedLabels } from "./schema";
import { experience, makeSite, media, textBlock } from "./test-fixtures";

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
    const site = makeSite() as unknown as { experiences: { blocks: unknown[] }[] };
    site.experiences[0].blocks = [{ id: "v", type: "video", url: "https://example.com" }];
    expect(parseSite(site).ok).toBe(false);
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
    expect(parseSite({ ...makeSite(), schemaVersion: 2 }).ok).toBe(false);
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
