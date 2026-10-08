import type { Block, BlockType, Experience, Site } from "./schema";

// Pure helpers that add, remove, and reorder experiences, software cards, and
// blocks. Each one returns a new document and leaves its input unchanged.

export type Direction = "up" | "down";

function swap<T>(list: T[], a: number, b: number): T[] {
  const copy = [...list];
  if (a < 0 || b < 0 || a >= copy.length || b >= copy.length) return copy;
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}

/** Moves the item one place up. The first item stays where it is. */
export function moveUp<T>(list: T[], index: number): T[] {
  return swap(list, index, index - 1);
}

/** Moves the item one place down. The last item stays where it is. */
export function moveDown<T>(list: T[], index: number): T[] {
  return swap(list, index, index + 1);
}

function move<T>(list: T[], index: number, direction: Direction): T[] {
  return direction === "up" ? moveUp(list, index) : moveDown(list, index);
}

/** A URL-safe slug from a title: lower case, a-z and 0-9, single hyphens. */
export function slugify(title: string, fallback = "experience"): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || fallback;
}

function unique(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

function experienceIndex(site: Site, slug: string): number {
  const index = site.experiences.findIndex((e) => e.slug === slug);
  if (index < 0) throw new Error(`Unknown experience "${slug}"`);
  return index;
}

function softwareIndex(site: Site, id: string): number {
  const index = site.software.findIndex((c) => c.id === id);
  if (index < 0) throw new Error(`Unknown software card "${id}"`);
  return index;
}

/** Adds an experience at the end, with a unique slug made from its title. */
export function addExperience(site: Site, title: string): { site: Site; slug: string } {
  const slug = unique(slugify(title), site.experiences.map((e) => e.slug));
  const experience: Experience = {
    slug,
    homeTitle: title,
    pageTitle: title,
    skills: [],
    homeText: "",
    blocks: [],
  };
  return { site: { ...site, experiences: [...site.experiences, experience] }, slug };
}

export function removeExperience(site: Site, slug: string): Site {
  const index = experienceIndex(site, slug);
  return { ...site, experiences: site.experiences.filter((_, i) => i !== index) };
}

export function moveExperience(site: Site, slug: string, direction: Direction): Site {
  return { ...site, experiences: move(site.experiences, experienceIndex(site, slug), direction) };
}

/**
 * The experience that the "Next Experience" link of a page points to. The last
 * one links to the first. Null for an unknown slug or a single experience.
 */
export function nextExperience(site: Site, slug: string): Experience | null {
  const index = site.experiences.findIndex((e) => e.slug === slug);
  if (index < 0 || site.experiences.length < 2) return null;
  return site.experiences[(index + 1) % site.experiences.length];
}

/** Adds a software card at the end, with a unique id made from its name. */
export function addSoftware(site: Site, name: string): { site: Site; id: string } {
  const id = unique(slugify(name, "software"), site.software.map((c) => c.id));
  return { site: { ...site, software: [...site.software, { id, name }] }, id };
}

export function removeSoftware(site: Site, id: string): Site {
  const index = softwareIndex(site, id);
  return { ...site, software: site.software.filter((_, i) => i !== index) };
}

export function moveSoftware(site: Site, id: string, direction: Direction): Site {
  return { ...site, software: move(site.software, softwareIndex(site, id), direction) };
}

function emptyBlock(id: string, type: BlockType): Block {
  switch (type) {
    case "heading":
      return { id, type, text: "", level: 2 };
    case "text":
    case "quote":
      return { id, type, text: "" };
    case "facts":
      return { id, type, items: [] };
    case "images":
      return { id, type, items: [] };
    case "file":
      return { id, type, label: "" };
  }
}

function newBlockId(taken: Block[]): string {
  const used = new Set(taken.map((b) => b.id));
  for (;;) {
    const id = `b-${crypto.randomUUID().slice(0, 8)}`;
    if (!used.has(id)) return id;
  }
}

function withBlocks(site: Site, slug: string, change: (blocks: Block[]) => Block[]): Site {
  const index = experienceIndex(site, slug);
  const experiences = site.experiences.map((e, i) => (i === index ? { ...e, blocks: change(e.blocks) } : e));
  return { ...site, experiences };
}

function blockIndex(blocks: Block[], id: string): number {
  const index = blocks.findIndex((b) => b.id === id);
  if (index < 0) throw new Error(`Unknown block "${id}"`);
  return index;
}

/** Adds an empty block of the given type, at the end or before the given position. */
export function addBlock(
  site: Site,
  slug: string,
  type: BlockType,
  index?: number,
): { site: Site; blockId: string } {
  const blocks = site.experiences[experienceIndex(site, slug)].blocks;
  const blockId = newBlockId(blocks);
  const block = emptyBlock(blockId, type);
  const updated = withBlocks(site, slug, (list) => {
    const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
    return [...list.slice(0, at), block, ...list.slice(at)];
  });
  return { site: updated, blockId };
}

export function removeBlock(site: Site, slug: string, blockId: string): Site {
  return withBlocks(site, slug, (list) => {
    const index = blockIndex(list, blockId);
    return list.filter((_, i) => i !== index);
  });
}

export function moveBlock(site: Site, slug: string, blockId: string, direction: Direction): Site {
  return withBlocks(site, slug, (list) => move(list, blockIndex(list, blockId), direction));
}
