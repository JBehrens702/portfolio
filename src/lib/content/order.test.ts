import { describe, expect, it } from "vitest";
import {
  addBlock,
  addExperience,
  addSoftware,
  moveBlock,
  moveDown,
  moveExperience,
  moveSoftware,
  moveUp,
  nextExperience,
  removeBlock,
  removeExperience,
  removeSoftware,
  slugify,
} from "./order";
import { parseSite } from "./schema";
import { experience, makeSite, textBlock } from "./test-fixtures";

const slugs = (site: { experiences: { slug: string }[] }) => site.experiences.map((e) => e.slug);

describe("moveUp and moveDown", () => {
  it("move an item one place", () => {
    expect(moveUp(["a", "b", "c"], 1)).toEqual(["b", "a", "c"]);
    expect(moveDown(["a", "b", "c"], 1)).toEqual(["a", "c", "b"]);
  });

  it("change nothing for move up on the first item and move down on the last item", () => {
    expect(moveUp(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
    expect(moveDown(["a", "b", "c"], 2)).toEqual(["a", "b", "c"]);
  });

  it("do not change the input list", () => {
    const list = ["a", "b"];
    moveDown(list, 0);
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

describe("software cards", () => {
  it("move, add, and remove", () => {
    const site = makeSite();
    expect(moveSoftware(site, "dashboard", "up").software.map((c) => c.id)).toEqual(["dashboard", "unquotable"]);
    expect(moveSoftware(site, "unquotable", "down").software.map((c) => c.id)).toEqual(["dashboard", "unquotable"]);
    expect(moveSoftware(site, "unquotable", "up").software.map((c) => c.id)).toEqual(["unquotable", "dashboard"]);

    const added = addSoftware(site, "Dashboard");
    expect(added.id).not.toBe("dashboard");
    expect(parseSite(added.site).ok).toBe(true);
    expect(removeSoftware(added.site, "dashboard").software.map((c) => c.id)).toEqual(["unquotable", added.id]);
  });
});

describe("blocks", () => {
  const withBlocks = () =>
    makeSite({ experiences: [experience("x", { blocks: [textBlock("a", "A"), textBlock("b", "B"), textBlock("c", "C")] })] });
  const blockIds = (site: ReturnType<typeof makeSite>) => site.experiences[0].blocks.map((b) => b.id);

  it("move up on the first and move down on the last change nothing", () => {
    expect(blockIds(moveBlock(withBlocks(), "x", "a", "up"))).toEqual(["a", "b", "c"]);
    expect(blockIds(moveBlock(withBlocks(), "x", "c", "down"))).toEqual(["a", "b", "c"]);
    expect(blockIds(moveBlock(withBlocks(), "x", "a", "down"))).toEqual(["b", "a", "c"]);
  });

  it("adds an empty block with a new id, at the end or at a position", () => {
    const atEnd = addBlock(withBlocks(), "x", "file");
    expect(atEnd.site.experiences[0].blocks.at(-1)).toEqual({ id: atEnd.blockId, type: "file", label: "" });
    const atStart = addBlock(withBlocks(), "x", "heading", 0);
    expect(atStart.site.experiences[0].blocks[0]).toEqual({ id: atStart.blockId, type: "heading", text: "", level: 2 });
    expect(["a", "b", "c"]).not.toContain(atStart.blockId);
    expect(parseSite(atEnd.site).ok).toBe(true);
  });

  it("removes a block", () => {
    expect(blockIds(removeBlock(withBlocks(), "x", "b"))).toEqual(["a", "c"]);
  });

  it("does not change the input document", () => {
    const site = withBlocks();
    const before = structuredClone(site);
    moveBlock(site, "x", "a", "down");
    removeBlock(site, "x", "a");
    addBlock(site, "x", "text");
    expect(site).toEqual(before);
  });
});
