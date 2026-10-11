import { describe, expect, it } from "vitest";
import type { Carousel, HeadingBlock, LayoutItem, Row } from "@/lib/content/schema";
import { sectionItems } from "./segments";

const h2 = (id: string): HeadingBlock => ({ id, type: "heading", level: 2, text: id });
const h3 = (id: string): HeadingBlock => ({ id, type: "heading", level: 3, text: id });
const row = (id: string): Row => ({ id, type: "row", layout: "one", cells: [[{ id: `${id}-t`, type: "text", text: id }]] });
const carousel = (id: string): Carousel => ({ id, type: "carousel", slides: [] });

function shape(items: LayoutItem[]): string[][] {
  return sectionItems(items).map((section) => [...section.headings.map((h) => `h:${h.id}`), ...section.items.map((i) => i.id)]);
}

describe("sectionItems", () => {
  it("starts a section at each heading, with the rows and carousels after it", () => {
    expect(shape([h2("a"), row("r1"), carousel("c"), h2("b"), row("r2")])).toEqual([
      ["h:a", "r1", "c"],
      ["h:b", "r2"],
    ]);
  });

  it("keeps rows before the first heading in a section without a heading", () => {
    expect(shape([row("lead"), h2("a"), row("r")])).toEqual([["lead"], ["h:a", "r"]]);
  });

  it("keeps a heading and the subheading right after it in one section", () => {
    expect(shape([h2("a"), h3("a-sub"), row("t"), h3("b-sub"), h3("c-sub"), row("u")])).toEqual([
      ["h:a", "h:a-sub", "t"],
      ["h:b-sub"],
      ["h:c-sub", "u"],
    ]);
  });

  it("returns no section for an empty layout", () => {
    expect(sectionItems([])).toEqual([]);
  });
});
