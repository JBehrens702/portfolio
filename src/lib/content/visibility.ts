import type { Block, Carousel, ContentBlock, Experience, HeadingBlock, LayoutItem, Row, Site, SoftwareCard } from "./schema";

// One function decides what a visitor sees (KTD7). The public pages and the
// preview both render the result of visibleSite(), so they cannot differ.
// It returns a pruned copy: hidden parts are removed, the input is not changed.

export function isBlank(text: string | undefined | null): boolean {
  return text == null || text.trim().length === 0;
}

function present(text: string | undefined): string | undefined {
  return isBlank(text) ? undefined : text;
}

/** A non-heading block with its hidden parts removed, or null when nothing of it shows. */
export function visibleContentBlock<T extends ContentBlock>(block: T): T | null;
export function visibleContentBlock(block: ContentBlock): ContentBlock | null {
  switch (block.type) {
    case "text":
    case "quote":
      return isBlank(block.text) ? null : block;
    case "facts": {
      const items = block.items.filter((item) => !isBlank(item.value));
      return items.length > 0 ? { ...block, items } : null;
    }
    case "images": {
      const items = block.items.filter((item) => item.image !== undefined);
      if (items.length === 0) return null;
      const { caption, ...rest } = block;
      const shown = present(caption);
      return shown === undefined ? { ...rest, items } : { ...rest, items, caption: shown };
    }
    case "file":
      return block.file ? block : null;
  }
}

/**
 * Removes hidden entries from a list of headings and content. A heading shows when
 * the entries after it, up to the next heading, have something visible. A heading
 * followed directly by a subheading (a higher level number) shows when its
 * subsections have something visible.
 */
function visibleSequence<T extends { type: string }>(list: T[], visibleOther: (entry: T) => T | null): T[] {
  const isHeading = (entry: T): entry is T & HeadingBlock => entry.type === "heading";
  const content = list.map((entry) => (isHeading(entry) ? null : visibleOther(entry)));

  const headingShows = (index: number, heading: HeadingBlock): boolean => {
    if (isBlank(heading.text)) return false;
    let own = 0;
    for (let i = index + 1; i < list.length && !isHeading(list[i]); i++) {
      own++;
      if (content[i]) return true;
    }
    if (own > 0) return false;
    for (let i = index + 1; i < list.length; i++) {
      const next = list[i];
      if (isHeading(next)) {
        if (next.level <= heading.level) return false;
      } else if (content[i]) {
        return true;
      }
    }
    return false;
  };

  const result: T[] = [];
  list.forEach((entry, index) => {
    if (isHeading(entry)) {
      if (headingShows(index, entry)) result.push(entry);
    } else {
      const shown = content[index];
      if (shown) result.push(shown);
    }
  });
  return result;
}

/** Removes hidden blocks from a version-1 block list (kept for the upgrade test). */
export function visibleBlocks(blocks: Block[]): Block[] {
  return visibleSequence(blocks, (block) => visibleContentBlock(block as ContentBlock));
}

/** A slide shows when it has an image (0.1.13). */
function visibleCarousel(carousel: Carousel): Carousel | null {
  const slides = carousel.slides.filter((slide) => slide.image !== undefined);
  return slides.length > 0 ? { ...carousel, slides } : null;
}

/**
 * A row shows when at least one cell has a visible block. Its empty cells stay, so
 * the row keeps its columns and the site matches the editor (KTD5).
 */
function visibleRow(row: Row): Row | null {
  const cells = row.cells.map((cell) => cell.map((block) => visibleContentBlock(block)).filter((b) => b !== null));
  return cells.some((cell) => cell.length > 0) ? { ...row, cells } : null;
}

/** Removes hidden rows, carousels, slides, blocks, and headings from a page layout. */
export function visibleLayout(items: LayoutItem[]): LayoutItem[] {
  return visibleSequence(items, (item) =>
    item.type === "row" ? visibleRow(item) : item.type === "carousel" ? visibleCarousel(item) : item,
  );
}

function visibleExperience(experience: Experience): Experience {
  const { subtitle, ...rest } = experience;
  const shownSubtitle = present(subtitle);
  return {
    ...rest,
    ...(shownSubtitle === undefined ? {} : { subtitle: shownSubtitle }),
    skills: experience.skills.filter((skill) => !isBlank(skill)),
    layout: visibleLayout(experience.layout),
  };
}

function visibleCard(card: SoftwareCard): SoftwareCard | null {
  if (isBlank(card.overview)) return null;
  const { link, ...rest } = card;
  const shownLink = present(link);
  return shownLink === undefined ? rest : { ...rest, link: shownLink };
}

/** The document as a visitor sees it. An empty software list means the software section is hidden. */
export function visibleSite(site: Site): Site {
  const contact: Site["contact"] = {};
  for (const key of ["linkedin", "email", "rise"] as const) {
    const value = present(site.contact[key]);
    if (value !== undefined) contact[key] = value;
  }
  return {
    ...site,
    profile: {
      ...site.profile,
      introParagraphs: site.profile.introParagraphs.filter((p) => !isBlank(p)),
    },
    contact,
    experiences: site.experiences.map(visibleExperience),
    software: site.software.map(visibleCard).filter((card): card is SoftwareCard => card !== null),
  };
}

/** The text of a UI label, or null when the label is missing or empty (the element is then hidden). */
export function labelText(site: Site, key: string): string | null {
  const label = site.labels[key];
  return label && !isBlank(label.text) ? label.text : null;
}
