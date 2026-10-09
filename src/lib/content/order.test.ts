import { describe, expect, it } from "vitest";
import { addExperience, move, moveExperience, newBlock, nextExperience, removeExperience, slugify, unique } from "./order";
import type { BlockType } from "./schema";
import { parseSite } from "./schema";
import { experience, makeSite, textBlock } from "./test-fixtures";

const slugs = (site: { experiences: { slug: string }[] }) => site.experiences.map((e) => e.slug);

describe("move", () => {
  it("moves an item one place up or down", () => {
    expect(move(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("changes nothing for move up on the first item and move down on the last item", () => {
    expect(move(["a", "b", "c"], 0, "up")).toEqual(["a", "b", "c"]);
    expect(move(["a", "b", "c"], 2, "down")).toEqual(["a", "b", "c"]);
  });

  it("returns the list itself for a no-op or an unknown index (the item was removed meanwhile)", () => {
    const list = ["a", "b", "c"];
    expect(move(list, 0, "up")).toBe(list);
    expect(move(list, 2, "down")).toBe(list);
    expect(move(list, -1, "down")).toBe(list);
    expect(move(list, 3, "up")).toBe(list);
  });

  it("does not change the input list", () => {
    const list = ["a", "b"];
    expect(move(list, 0, "down")).toEqual(["b", "a"]);
    expect(list).toEqual(["a", "b"]);
  });
});

describe("experiences", () => {
  it("move up on the first and move down on the last change nothing", () => {
    const site = makeSite();
    expect(slugs(moveExperience(site, "first", "up"))).toEqual(["first", "second", "third"]);
    expect(slugs(moveExperience(site, "third", "down"))).toEqual(["first", "second", "third"]);
    expect(slugs(moveExperience(site, "second", "up"))).toEqual(["second", "first", "third"]);
  });

  it("gives two new experiences with the same title different slugs", () => {
    const first = addExperience(makeSite(), "Wind Tunnel Project");
    const second = addExperience(first.site, "Wind Tunnel Project");
    expect(first.slug).toBe("wind-tunnel-project");
    expect(second.slug).not.toBe(first.slug);
    expect(slugs(second.site)).toEqual(["first", "second", "third", "wind-tunnel-project", second.slug]);
    expect(parseSite(second.site).ok).toBe(true);
  });

  it("adds a new experience with its title, empty text, and no blocks", () => {
    const { site, slug } = addExperience(makeSite(), "Summer '26 Internship");
    const added = site.experiences.find((e) => e.slug === slug);
    expect(slug).toBe("summer-26-internship");
    expect(added).toMatchObject({ homeTitle: "Summer '26 Internship", pageTitle: "Summer '26 Internship", skills: [], homeText: "", blocks: [] });
  });

  it("removes an experience from the order and from the next-experience chain", () => {
    const site = makeSite();
    expect(nextExperience(site, "first")?.slug).toBe("second");
    const removed = removeExperience(site, "second");
    expect(slugs(removed)).toEqual(["first", "third"]);
    expect(nextExperience(removed, "first")?.slug).toBe("third");
    expect(nextExperience(removed, "third")?.slug).toBe("first");
    expect(nextExperience(removed, "second")).toBeNull();
  });

  it("links the last experience to the first, and gives no link for a single experience", () => {
    const site = makeSite();
    expect(nextExperience(site, "third")?.slug).toBe("first");
    expect(nextExperience(makeSite({ experiences: [experience("only")] }), "only")).toBeNull();
  });

  it("refuses to change an experience that does not exist", () => {
    expect(() => removeExperience(makeSite(), "missing")).toThrow(/missing/);
    expect(() => moveExperience(makeSite(), "missing", "up")).toThrow(/missing/);
  });
});

describe("slugify", () => {
  it("makes a URL-safe slug, with a fallback for a title without letters", () => {
    expect(slugify("  Türkiye & Peru: 2025!  ")).toBe("turkiye-peru-2025");
    expect(slugify("!!!")).toBe("experience");
  });
});

describe("unique", () => {
  it("keeps a free base, and otherwise adds the first free number", () => {
    expect(unique("rig", ["dashboard"])).toBe("rig");
    expect(unique("rig", ["rig"])).toBe("rig-2");
    expect(unique("rig", ["rig", "rig-2", "rig-4"])).toBe("rig-3");
  });

  it("gives a new software card a unique, valid id (the software editor's use)", () => {
    const site = makeSite();
    const id = unique(slugify("Dashboard", "software"), site.software.map((c) => c.id));
    expect(id).toBe("dashboard-2");
    expect(unique(slugify("!!!", "software"), site.software.map((c) => c.id))).toBe("software");
    expect(parseSite({ ...site, software: [...site.software, { id, name: "Dashboard" }] }).ok).toBe(true);
  });
});

describe("newBlock", () => {
  const taken = () => [textBlock("a", "A"), textBlock("b", "B"), textBlock("c", "C")];

  it("makes an empty block of each type, with the defaults of that type", () => {
    const expected: Record<BlockType, Record<string, unknown>> = {
      heading: { type: "heading", text: "", level: 2 },
      text: { type: "text", text: "" },
      quote: { type: "quote", text: "" },
      facts: { type: "facts", items: [] },
      images: { type: "images", items: [] },
      file: { type: "file", label: "" },
    };
    for (const [type, fields] of Object.entries(expected) as [BlockType, Record<string, unknown>][]) {
      const block = newBlock(type, taken());
      expect(block).toEqual({ id: block.id, ...fields });
    }
  });

  it("gives a new id that the list does not use, and the block is valid in a page", () => {
    const blocks = taken();
    const block = newBlock("file", blocks);
    expect(block.id).toMatch(/^b-[0-9a-f]{8}$/);
    expect(blocks.map((b) => b.id)).not.toContain(block.id);
    const site = makeSite({ experiences: [experience("x", { blocks: [...blocks, block] })] });
    expect(parseSite(site).ok).toBe(true);
  });

  it("does not change the input list", () => {
    const blocks = taken();
    const before = structuredClone(blocks);
    newBlock("text", blocks);
    expect(blocks).toEqual(before);
  });
});
