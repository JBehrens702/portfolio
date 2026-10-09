import type { Block, BlockType, Experience, Site } from "./schema";

// Pure helpers for ordered lists and new content: move an item one place, make
// a unique slug or id, make an empty block, and add, remove, and reorder
// experiences. Each one returns a new value and leaves its input unchanged.
// The admin actions and the admin editors share them.

export type Direction = "up" | "down";

/**
 * The list with the item at `index` moved one place. Move up on the first
 * item, move down on the last item, and an unknown index return the list itself.
 */
export function move<T>(list: T[], index: number, direction: Direction): T[] {
  const other = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || other < 0 || index >= list.length || other >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[other]] = [copy[other], copy[index]];
  return copy;
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

/** The base when it is free, otherwise the base with the first free number: "base-2", "base-3", ... */
export function unique(base: string, taken: Iterable<string>): string {
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

/** An empty block of the type, with an id that the list does not use yet. */
export function newBlock(type: BlockType, taken: Block[]): Block {
  return emptyBlock(newBlockId(taken), type);
}
