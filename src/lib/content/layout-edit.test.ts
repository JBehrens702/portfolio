import { describe, expect, it } from "vitest";
import {
  addBlockToCell,
  addSlide,
  findBox,
  mapBlock,
  mapSlide,
  removeBoxAt,
  removeItem,
  dropBeside,
  dropBetween,
  moveBox,
  moveBoxStep,
  moveItem,
  moveSlide,
  removeSlide,
  setRowLayout,
} from "./layout-edit";
import type { ContentBlock, LayoutItem, Row } from "./schema";
import { headingBlock, media } from "./test-fixtures";

const t = (id: string): ContentBlock => ({ id, type: "text", text: id });
const one = (id: string, ...blocks: ContentBlock[]): Row => ({ id, type: "row", layout: "one", cells: [blocks] });
const halves = (id: string, left: ContentBlock[], right: ContentBlock[]): Row => ({ id, type: "row", layout: "halves", cells: [left, right] });

function shape(items: LayoutItem[]): string[] {
  return items.map((item) =>
    item.type === "heading"
      ? `h:${item.id}`
      : item.type === "row"
        ? `${item.layout}:${item.cells.map((cell) => cell.map((b) => b.id).join(",")).join("|")}`
        : `car:${item.slides.map((s) => s.id).join(",")}`,
  );
}

describe("moveItem", () => {
  it("moves a row above a heading into the previous section", () => {
    const items = [one("r1", t("a")), headingBlock("h", "Next"), one("r2", t("b"))];
    expect(shape(moveItem(items, 2, 1))).toEqual(["one:a", "one:b", "h:h"]);
  });

  it("returns the list itself for an index out of range", () => {
    const items = [one("r1", t("a"))];
    expect(moveItem(items, 0, 3)).toBe(items);
  });
});

describe("moveBox", () => {
  it("moves a box to another cell of another row", () => {
    const items = [one("r1", t("a"), t("b")), halves("r2", [t("c")], [])];
    expect(shape(moveBox(items, { row: "r1", cell: 0, index: 1 }, { row: "r2", cell: 1, index: 0 }))).toEqual([
      "one:a",
      "halves:c|b",
    ]);
  });

  it("moves a box down inside its own cell; the target place counts the boxes before the move", () => {
    const items = [one("r1", t("a"), t("b"), t("c"))];
    expect(shape(moveBox(items, { row: "r1", cell: 0, index: 0 }, { row: "r1", cell: 0, index: 2 }))).toEqual(["one:b,a,c"]);
    expect(shape(moveBox(items, { row: "r1", cell: 0, index: 0 }, { row: "r1", cell: 0, index: 3 }))).toEqual(["one:b,c,a"]);
  });

  it("removes a one-column row whose only box moved away", () => {
    const items = [one("r1", t("a")), one("r2", t("b"))];
    expect(shape(moveBox(items, { row: "r1", cell: 0, index: 0 }, { row: "r2", cell: 0, index: 1 }))).toEqual(["one:b,a"]);
  });

  it("removes a two-column row whose cells all became empty, and keeps one with a box left", () => {
    const items = [halves("r1", [t("a")], []), halves("r2", [t("b")], [t("c")]), one("r3", t("d"))];
    const moved = moveBox(items, { row: "r1", cell: 0, index: 0 }, { row: "r3", cell: 0, index: 0 });
    expect(shape(moved)).toEqual(["halves:b|c", "one:a,d"]);
    const kept = moveBox(items, { row: "r2", cell: 1, index: 0 }, { row: "r3", cell: 0, index: 1 });
    expect(shape(kept)).toEqual(["halves:a|", "halves:b|", "one:d,c"]);
  });
});

describe("dropBeside and dropBetween", () => {
  it("turns a one-column row into halves with the dropped box on the right (F1)", () => {
    const items = [one("r1", t("image")), one("r2", t("text"))];
    expect(shape(dropBeside(items, { row: "r2", cell: 0, index: 0 }, "r1"))).toEqual(["halves:image|text"]);
  });

  it("puts a box between two items as a new one-column row", () => {
    const items = [one("r1", t("a"), t("b")), headingBlock("h", "H")];
    const result = dropBetween(items, { row: "r1", cell: 0, index: 1 }, 2);
    expect(shape(result)).toEqual(["one:a", "h:h", "one:b"]);
    expect(result[2].id).not.toBe("r1");
  });
});

describe("setRowLayout", () => {
  it("puts every box in the left cell when one column becomes two", () => {
    expect(shape(setRowLayout([one("r", t("a"), t("b"))], "r", "halves"))).toEqual(["halves:a,b|"]);
  });

  it("joins the cells left then right when two columns become one", () => {
    expect(shape(setRowLayout([halves("r", [t("a")], [t("b")])], "r", "one"))).toEqual(["one:a,b"]);
  });

  it("keeps the cells when one two-column layout becomes another", () => {
    const result = setRowLayout([halves("r", [t("a")], [t("b")])], "r", "third-two");
    expect(result[0]).toMatchObject({ layout: "third-two", cells: [[{ id: "a" }], [{ id: "b" }]] });
  });
});

describe("moveBoxStep (move buttons on a phone)", () => {
  it("moves a box past the end of its cell into the next cell", () => {
    const items = [halves("r", [t("a")], [t("b")])];
    expect(shape(moveBoxStep(items, { row: "r", cell: 0, index: 0 }, "down"))).toEqual(["halves:|a,b"]);
  });

  it("moves a box past the end of the last cell into the first cell of the next row", () => {
    const items = [one("r1", t("a"), t("b")), headingBlock("h", "H"), one("r2", t("c"))];
    expect(shape(moveBoxStep(items, { row: "r1", cell: 0, index: 1 }, "down"))).toEqual(["one:a", "h:h", "one:b,c"]);
  });

  it("moves a box before the start of its cell into the end of the previous cell", () => {
    const items = [one("r1", t("a")), halves("r2", [t("b")], [t("c")])];
    expect(shape(moveBoxStep(items, { row: "r2", cell: 1, index: 0 }, "up"))).toEqual(["one:a", "halves:b,c|"]);
  });

  it("leaves the layout unchanged at the very start or end", () => {
    const items = [one("r1", t("a"))];
    expect(moveBoxStep(items, { row: "r1", cell: 0, index: 0 }, "up")).toBe(items);
    expect(moveBoxStep(items, { row: "r1", cell: 0, index: 0 }, "down")).toBe(items);
  });
});

describe("slides", () => {
  const carousel: LayoutItem = {
    id: "c",
    type: "carousel",
    slides: [
      { id: "s1", text: "", image: media("1.jpg") },
      { id: "s2", text: "" },
    ],
  };

  it("adds, moves, and removes slides", () => {
    const added = addSlide([carousel], "c");
    expect(shape(added)[0]).toMatch(/^car:s1,s2,s-/);
    expect(shape(moveSlide([carousel], "c", 1, "up"))).toEqual(["car:s2,s1"]);
    expect(shape(removeSlide([carousel], "c", "s1"))).toEqual(["car:s2"]);
    const described = mapSlide([carousel], "c", "s2", (s) => ({ ...s, text: "Version 2." }));
    expect(described[0]).toMatchObject({ slides: [{ id: "s1", text: "" }, { id: "s2", text: "Version 2." }] });
  });
});

describe("block edits", () => {
  const items = [headingBlock("h", "Old"), halves("r", [t("a")], [t("b")]), one("r2", t("c"))];

  it("changes a block in a cell or a heading item by id", () => {
    const renamed = mapBlock(items, "b", (b) => (b.type === "text" ? { ...b, text: "new" } : b));
    expect(renamed[1]).toMatchObject({ cells: [[{ text: "a" }], [{ text: "new" }]] });
    const heading = mapBlock(items, "h", (b) => (b.type === "heading" ? { ...b, text: "New" } : b));
    expect(heading[0]).toMatchObject({ text: "New" });
    expect(heading[1]).toBe(items[1]);
  });

  it("finds a box, removes it, and removes a one-column row it leaves empty", () => {
    expect(findBox(items, "b")).toEqual({ row: "r", cell: 1, index: 0 });
    expect(findBox(items, "h")).toBeNull();
    expect(shape(removeBoxAt(items, { row: "r", cell: 1, index: 0 }))).toEqual(["h:h", "halves:a|", "one:c"]);
    expect(shape(removeBoxAt(items, { row: "r2", cell: 0, index: 0 }))).toEqual(["h:h", "halves:a|b"]);
  });

  it("adds a block at the end of a cell, and removes an item", () => {
    expect(shape(addBlockToCell(items, "r", 1, t("d")))).toEqual(["h:h", "halves:a|b,d", "one:c"]);
    expect(shape(removeItem(items, "h"))).toEqual(["halves:a|b", "one:c"]);
  });
});
