import type { Carousel, HeadingBlock, LayoutItem, Row } from "@/lib/content/schema";

// The sections of an experience page (KTD1, KTD4). A section is one heading (or
// a level-2 heading directly followed by a level-3 one) and the rows and
// carousels after it, up to the next heading. Rows before the first heading form
// a section without one. On wide screens the headings sit in a sticky column
// beside the rows. The owner's order never changes.

export interface Section {
  /** Empty for the rows before the first heading. */
  headings: HeadingBlock[];
  items: (Row | Carousel)[];
}

/** Splits a visible layout (from visibleSite) into sections at each heading. */
export function sectionItems(layout: LayoutItem[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const item of layout) {
    if (item.type !== "heading") {
      if (!current) {
        current = { headings: [], items: [] };
        sections.push(current);
      }
      current.items.push(item);
      continue;
    }
    const last = current?.headings[current.headings.length - 1];
    if (current && last && current.items.length === 0 && item.level > last.level) {
      // A section heading directly followed by its subheading: one section.
      current.headings.push(item);
      continue;
    }
    current = { headings: [item], items: [] };
    sections.push(current);
  }
  return sections;
}
