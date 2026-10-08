import { describe, expect, it } from "vitest";
import type { Block, Site } from "./schema";
import { labelText, visibleBlocks, visibleSite } from "./visibility";
import { experience, headingBlock, makeSite, media, software, textBlock } from "./test-fixtures";

function blocksOf(site: Site, slug: string): Block[] {
  const found = site.experiences.find((e) => e.slug === slug);
  if (!found) throw new Error(`no experience ${slug}`);
  return found.blocks;
}

function ids(blocks: Block[]): string[] {
  return blocks.map((b) => b.id);
}

describe("visibleBlocks", () => {
  it("hides an empty text block, an image without a file, and a file block without a file", () => {
    const blocks: Block[] = [
      textBlock("empty", "   "),
      textBlock("full", "Some text."),
      { id: "imgs", type: "images", items: [{}, { image: media("a.jpg") }] },
      { id: "noimgs", type: "images", items: [{}, {}], caption: "Caption without images" },
      { id: "nofile", type: "file", label: "Project record" },
      { id: "file", type: "file", label: "Report", file: media("r.pdf") },
      { id: "quote", type: "quote", text: "" },
    ];
    const visible = visibleBlocks(blocks);
    expect(ids(visible)).toEqual(["full", "imgs", "file"]);
    const images = visible.find((b) => b.id === "imgs");
    expect(images?.type === "images" && images.items).toHaveLength(1);
  });

  it("hides an empty caption, and keeps a caption with text", () => {
    const visible = visibleBlocks([
      { id: "a", type: "images", items: [{ image: media("a.jpg") }], caption: "  " },
      { id: "b", type: "images", items: [{ image: media("b.jpg") }], caption: "Shown." },
    ]);
    expect(visible[0].type === "images" && visible[0].caption).toBeUndefined();
    expect(visible[1].type === "images" && visible[1].caption).toBe("Shown.");
  });

  it("hides a facts row without a value, and a facts block with no row", () => {
    const visible = visibleBlocks([
      { id: "f1", type: "facts", items: [{ label: "Skills", value: "CAD" }, { label: "Client", value: " " }] },
      { id: "f2", type: "facts", items: [{ label: "Client", value: "" }] },
    ]);
    expect(ids(visible)).toEqual(["f1"]);
    expect(visible[0].type === "facts" && visible[0].items).toEqual([{ label: "Skills", value: "CAD" }]);
  });

  it("hides a heading followed only by hidden blocks (AE2: the empty Victaulic summary)", () => {
    const visible = visibleBlocks([
      headingBlock("summary", "Summary", 2),
      textBlock("summary-text", ""),
      headingBlock("skills", "Skills Demonstrated", 3),
      textBlock("skills-text", "Mechanical Design"),
    ]);
    expect(ids(visible)).toEqual(["skills", "skills-text"]);
  });

  it("hides a heading at the end of the page and an empty heading", () => {
    const visible = visibleBlocks([
      textBlock("t", "Text."),
      headingBlock("blank", "  "),
      textBlock("t2", "More text."),
      headingBlock("last", "Last heading"),
    ]);
    expect(ids(visible)).toEqual(["t", "t2"]);
  });

  it("keeps a parent heading whose subsection has visible content", () => {
    const visible = visibleBlocks([
      headingBlock("overview", "Project Overview:", 2),
      headingBlock("skills", "Skills Demonstrated", 3),
      textBlock("skills-text", "Project Management"),
      headingBlock("next", "Other section", 2),
      headingBlock("empty-sub", "Empty sub", 3),
      textBlock("empty-text", ""),
    ]);
    expect(ids(visible)).toEqual(["overview", "skills", "skills-text"]);
  });

  it("does not change the input blocks", () => {
    const blocks: Block[] = [textBlock("a", ""), textBlock("b", "x")];
    visibleBlocks(blocks);
    expect(blocks).toHaveLength(2);
  });
});

describe("visibleSite", () => {
  it("hides a software card without an overview; a card with an overview but no screenshot shows without an image", () => {
    const site = makeSite({
      software: [software("no-overview", { overview: " ", screenshot: media("s.png") }), software("no-shot")],
    });
    const visible = visibleSite(site);
    expect(visible.software.map((c) => c.id)).toEqual(["no-shot"]);
    expect(visible.software[0].screenshot).toBeUndefined();
  });

  it("hides the software section when no card is visible", () => {
    const site = makeSite({ software: [software("a", { overview: "" }), software("b", { overview: undefined })] });
    expect(visibleSite(site).software).toEqual([]);
  });

  it("hides an empty software link", () => {
    const site = makeSite({ software: [software("a", { link: "" })] });
    expect(visibleSite(site).software[0].link).toBeUndefined();
  });

  it("hides the resume button without a resume file, and shows it with one (AE1)", () => {
    const without = makeSite();
    expect(visibleSite(without).profile.resumeFile).toBeUndefined();
    const withResume = makeSite();
    withResume.profile.resumeFile = media("resume.pdf");
    expect(visibleSite(withResume).profile.resumeFile).toEqual(media("resume.pdf"));
  });

  it("hides empty intro paragraphs, empty skills, empty contact links, and an empty subtitle", () => {
    const site = makeSite({ contact: { linkedin: "https://www.linkedin.com/in/x/", email: "", rise: "" } });
    site.profile.introParagraphs = ["One.", " ", ""];
    site.experiences[0].skills = ["CAD", " "];
    site.experiences[0].subtitle = " ";
    const visible = visibleSite(site);
    expect(visible.profile.introParagraphs).toEqual(["One."]);
    expect(visible.experiences[0].skills).toEqual(["CAD"]);
    expect(visible.experiences[0].subtitle).toBeUndefined();
    expect(visible.contact).toEqual({ linkedin: "https://www.linkedin.com/in/x/" });
  });

  it("applies the block rules inside every experience", () => {
    const site = makeSite({
      experiences: [experience("x", { blocks: [headingBlock("h", "Summary"), textBlock("t", "")] })],
    });
    expect(blocksOf(visibleSite(site), "x")).toEqual([]);
  });

  it("does not change the input document", () => {
    const site = makeSite({ software: [software("a", { overview: "" })] });
    const before = structuredClone(site);
    visibleSite(site);
    expect(site).toEqual(before);
  });
});

describe("labelText", () => {
  it("returns the label text, or null when the label is missing or empty", () => {
    const site = makeSite({ labels: { a: { text: "Read more", approved: true }, b: { text: " ", approved: true } } });
    expect(labelText(site, "a")).toBe("Read more");
    expect(labelText(site, "b")).toBeNull();
    expect(labelText(site, "missing")).toBeNull();
  });
});
