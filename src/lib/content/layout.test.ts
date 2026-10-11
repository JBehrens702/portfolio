import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { segmentBlocks } from "./segments-v1";
import { layoutBlocks, upgradeBlocks } from "./layout";
import type { Block, ImagesBlock, LayoutItem, Row } from "./schema";
import { visibleBlocks } from "./visibility";
import { headingBlock, media, textBlock } from "./test-fixtures";

const facts = (id: string, value = "CAD"): Block => ({ id, type: "facts", items: [{ label: "Skills", value }] });
const images = (id: string, filled = true): ImagesBlock => ({
  id,
  type: "images",
  items: filled ? [{ image: media(`${id}.jpg`) }] : [],
});

function rows(items: LayoutItem[]): Row[] {
  return items.filter((item): item is Row => item.type === "row");
}

/** A short picture of a layout: heading text, or row layout with the block ids of each cell. */
function shape(items: LayoutItem[]): string[] {
  return items.map((item) =>
    item.type === "heading"
      ? `h:${item.text}`
      : item.type === "row"
        ? `${item.layout}:${item.cells.map((cell) => cell.map((b) => b.id).join(",")).join("|")}`
        : `carousel:${item.id}`,
  );
}

describe("upgradeBlocks", () => {
  it("turns an image before fact lists and a logo into a halves row (AE5)", () => {
    const items = upgradeBlocks([
      headingBlock("h", "Design"),
      images("photo"),
      facts("skills"),
      images("logo"),
      facts("client", "Messiah"),
      textBlock("t", "A paragraph."),
    ]);
    expect(shape(items)).toEqual(["h:Design", "halves:photo|skills,logo,client", "one:t"]);
  });

  it("turns a fact panel without an image before it into a one-column row", () => {
    expect(shape(upgradeBlocks([textBlock("t", "Intro."), facts("f")]))).toEqual(["one:t", "one:f"]);
  });

  it("never pairs an empty images block with a fact list", () => {
    const items = upgradeBlocks([images("empty", false), facts("f")]);
    expect(shape(items)).toEqual(["one:empty", "one:f"]);
  });

  it("keeps a level-2 heading and its level-3 heading as two heading items", () => {
    const items = upgradeBlocks([headingBlock("a", "Design"), headingBlock("b", "Testing", 3), textBlock("t", "x")]);
    expect(shape(items)).toEqual(["h:Design", "h:Testing", "one:t"]);
  });

  it("keeps a hidden block at its place as its own row", () => {
    const items = upgradeBlocks([headingBlock("h", "Summary"), textBlock("empty", ""), textBlock("t", "x")]);
    expect(shape(items)).toEqual(["h:Summary", "one:empty", "one:t"]);
  });

  it("gives each row an id that no block uses", () => {
    const items = upgradeBlocks([textBlock("a", "x"), textBlock("b", "y")]);
    const ids = rows(items).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("a");
  });

  it("loses no block and keeps their order", () => {
    const blocks = [images("photo"), facts("f1"), images("logo"), facts("f2"), textBlock("t", "x"), images("empty", false)];
    expect(layoutBlocks(upgradeBlocks(blocks)).map((b) => b.id)).toEqual(blocks.map((b) => b.id));
  });
});

// The sections and side-by-side pairs of each seed page must not change (0.2.8).
describe("upgrade of the seed content", () => {
  const seed = JSON.parse(readFileSync(path.join(process.cwd(), "content/seed/site.json"), "utf8")) as {
    experiences: { slug: string; blocks: Block[] }[];
  };

  /** The visible arrangement after the upgrade, in the words of segmentBlocks. */
  function upgradedArrangement(blocks: Block[]): string[] {
    const items = upgradeBlocks(blocks);
    const visible = new Set(visibleBlocks(blocks).map((b) => b.id));
    const out: string[] = [];
    for (const item of items) {
      if (item.type === "heading") {
        if (visible.has(item.id)) out.push(`h:${item.id}`);
      } else if (item.type === "row") {
        const cells = item.cells.map((cell) => cell.filter((b) => visible.has(b.id)).map((b) => b.id));
        if (cells.every((c) => c.length === 0)) continue;
        out.push(item.layout === "halves" ? `spread:${cells[0].join(",")}|${cells[1].join(",")}` : cells[0].join(","));
      }
    }
    return out;
  }

  /** The visible arrangement today. */
  function currentArrangement(blocks: Block[]): string[] {
    const out: string[] = [];
    for (const segment of segmentBlocks(visibleBlocks(blocks))) {
      for (const heading of segment.headings) out.push(`h:${heading.id}`);
      for (const item of segment.items) {
        if (item.kind === "block") out.push(item.block.id);
        else if (item.media) out.push(`spread:${item.media.id}|${item.aside.map((b) => b.id).join(",")}`);
        else out.push(item.aside.map((b) => b.id).join(","));
      }
    }
    return out;
  }

  for (const experience of seed.experiences) {
    it(`keeps the arrangement of ${experience.slug}`, () => {
      expect(upgradedArrangement(experience.blocks)).toEqual(currentArrangement(experience.blocks));
    });
  }
});
