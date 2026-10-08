import type { Block, Experience, HeadingBlock, Site, SoftwareCard } from "./schema";

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
function visibleContentBlock(block: Exclude<Block, HeadingBlock>): Block | null {
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
 * Removes hidden blocks. A heading shows when the blocks after it, up to the next
 * heading, have something visible. A heading followed directly by a subheading
 * (a higher level number) shows when its subsections have something visible.
 */
export function visibleBlocks(blocks: Block[]): Block[] {
  const content = blocks.map((block) => (block.type === "heading" ? null : visibleContentBlock(block)));

  const headingShows = (index: number, heading: HeadingBlock): boolean => {
    if (isBlank(heading.text)) return false;
    let own = 0;
    for (let i = index + 1; i < blocks.length && blocks[i].type !== "heading"; i++) {
      own++;
      if (content[i]) return true;
    }
    if (own > 0) return false;
    for (let i = index + 1; i < blocks.length; i++) {
      const next = blocks[i];
      if (next.type === "heading") {
        if (next.level <= heading.level) return false;
      } else if (content[i]) {
        return true;
      }
    }
    return false;
  };

  const result: Block[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "heading") {
      if (headingShows(index, block)) result.push(block);
    } else {
      const shown = content[index];
      if (shown) result.push(shown);
    }
  });
  return result;
}

function visibleExperience(experience: Experience): Experience {
  const { subtitle, ...rest } = experience;
  const shownSubtitle = present(subtitle);
  return {
    ...rest,
    ...(shownSubtitle === undefined ? {} : { subtitle: shownSubtitle }),
    skills: experience.skills.filter((skill) => !isBlank(skill)),
    blocks: visibleBlocks(experience.blocks),
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
