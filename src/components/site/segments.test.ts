import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/content/schema";
import { segmentBlocks } from "./segments";

const image = { url: "https://media.example.com/a.png", pathname: "a.png", contentType: "image/png" };
const h2 = (id: string): Block => ({ id, type: "heading", level: 2, text: id });
const h3 = (id: string): Block => ({ id, type: "heading", level: 3, text: id });
const text = (id: string): Block => ({ id, type: "text", text: id });
const facts = (id: string): Block => ({ id, type: "facts", items: [{ label: id, value: id }] });
const images = (id: string): Block => ({ id, type: "images", items: [{ image }] });

/** The block ids in the order the page renders them. */
function order(blocks: Block[]): string[] {
  return segmentBlocks(blocks).flatMap((segment) => [
    ...segment.headings.map((h) => h.id),
    ...segment.items.flatMap((item) =>
      item.kind === "block" ? [item.block.id] : [...(item.media ? [item.media.id] : []), ...item.aside.map((b) => b.id)],
    ),
  ]);
}

describe("segmentBlocks", () => {
  it("splits at each heading and keeps blocks before the first one", () => {
    const segments = segmentBlocks([images("lead"), h2("a"), text("a1"), h3("a-sub"), text("a2"), h2("b"), text("b1")]);
    expect(segments.map((s) => s.headings.map((h) => h.id))).toEqual([[], ["a"], ["a-sub"], ["b"]]);
    expect(segments[1].items.map((i) => (i.kind === "block" ? i.block.id : "spread"))).toEqual(["a1"]);
  });

  it("keeps a heading and the subheading right after it in one segment", () => {
    const segments = segmentBlocks([h2("a"), h3("a-sub"), text("t"), h3("b-sub"), h3("c-sub"), text("u")]);
    expect(segments.map((s) => s.headings.map((h) => h.id))).toEqual([["a", "a-sub"], ["b-sub"], ["c-sub"]]);
    expect(segments[1].items).toEqual([]);
  });

  it("puts the images before a fact run beside it, with the logo between two fact lists", () => {
    const blocks = [h2("overview"), images("photo"), facts("skills"), images("logo"), facts("client"), h3("next"), text("t")];
    const [overview] = segmentBlocks(blocks);
    expect(overview.items).toHaveLength(1);
    const spread = overview.items[0];
    expect(spread.kind).toBe("spread");
    if (spread.kind !== "spread") return;
    expect(spread.media?.id).toBe("photo");
    expect(spread.aside.map((b) => b.id)).toEqual(["skills", "logo", "client"]);
  });

  it("leaves images after the last fact list in the flow, and a fact list without images alone", () => {
    const [segment] = segmentBlocks([text("intro"), facts("f"), images("after"), text("t")]);
    expect(segment.items.map((i) => i.kind)).toEqual(["block", "spread", "block", "block"]);
    const spread = segment.items[1];
    if (spread.kind !== "spread") throw new Error("expected a spread");
    expect(spread.media).toBeNull();
  });

  it("never changes the order of the owner's blocks", () => {
    const blocks = [
      images("i0"),
      h2("a"),
      images("i1"),
      facts("f1"),
      images("i2"),
      facts("f2"),
      facts("f3"),
      images("i3"),
      text("t1"),
      h3("b"),
      h2("c"),
      facts("f4"),
      images("i4"),
    ];
    expect(order(blocks)).toEqual(blocks.map((b) => b.id));
  });

  it("gives no segment for no blocks", () => {
    expect(segmentBlocks([])).toEqual([]);
  });
});
