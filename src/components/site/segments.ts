import type { Block, HeadingBlock, ImagesBlock } from "@/lib/content/schema";

// The layout groups of an experience page. The owner's block order never
// changes: these groups only decide which blocks sit side by side.
//
//   Segment  one heading (or a level-2 heading directly followed by a level-3
//            one) and the blocks after it, up to the next heading. Blocks
//            before the first heading form a segment without one. On wide
//            screens the headings sit in a sticky column beside the blocks.
//   Spread   a run of fact lists, with the images that sit between two of them
//            (in the owner's pages: the client logo between "Skills
//            Demonstrated" and "Client"), plus the images block just before the
//            run. The images then sit beside the facts on wide screens.

export type BodyItem =
  | { kind: "block"; block: Block }
  | { kind: "spread"; media: ImagesBlock | null; aside: Block[] };

export interface Segment {
  /** Empty for the blocks before the first heading. */
  headings: HeadingBlock[];
  items: BodyItem[];
}

function groupItems(blocks: Block[]): BodyItem[] {
  const items: BodyItem[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type !== "facts") {
      items.push({ kind: "block", block });
      i++;
      continue;
    }
    const aside: Block[] = [block];
    i++;
    while (i < blocks.length) {
      const next = blocks[i];
      if (next.type === "facts") {
        aside.push(next);
        i++;
      } else if (next.type === "images" && blocks[i + 1]?.type === "facts") {
        aside.push(next, blocks[i + 1]);
        i += 2;
      } else {
        break;
      }
    }
    const previous = items[items.length - 1];
    let media: ImagesBlock | null = null;
    if (previous?.kind === "block" && previous.block.type === "images") {
      media = previous.block;
      items.pop();
    }
    items.push({ kind: "spread", media, aside });
  }
  return items;
}

/** Splits visible blocks (from visibleSite) into segments at each heading. */
export function segmentBlocks(blocks: Block[]): Segment[] {
  const segments: Segment[] = [];
  let headings: HeadingBlock[] = [];
  let run: Block[] = [];
  const flush = () => {
    if (headings.length > 0 || run.length > 0) segments.push({ headings, items: groupItems(run) });
  };
  for (const block of blocks) {
    if (block.type !== "heading") {
      run.push(block);
      continue;
    }
    const last = headings[headings.length - 1];
    if (last && run.length === 0 && block.level > last.level) {
      // A section heading directly followed by its subheading: one segment.
      headings.push(block);
      continue;
    }
    flush();
    headings = [block];
    run = [];
  }
  flush();
  return segments;
}
