import type { Block, ContentBlock, HeadingBlock, LayoutItem, Row } from "./schema";
import { visibleContentBlock } from "./visibility";

// Page layouts (KTD1): an ordered list of section headings, rows, and carousels.
// This module holds the upgrade from the version-1 flat block list (KTD2, KTD3)
// and small helpers that read a layout. It imports schema types only, because
// schema.ts calls the upgrade.

type Group = { kind: "block"; index: number } | { kind: "spread"; media: number | null; aside: number[] };

/**
 * The rows of one run of blocks between two headings. The pairing is the one that
 * segments.ts made at render time in version 1: a run of fact lists (with the
 * images between two of them) sits beside the images block just before it. It is
 * computed on the visible blocks only, so an empty images block is never paired.
 * A hidden block keeps its place as a one-column row of its own.
 */
function upgradeRun(run: ContentBlock[], rowId: (first: Block) => string): Row[] {
  const visible = run.map((block) => visibleContentBlock(block) !== null);
  const shown = run.map((_, i) => i).filter((i) => visible[i]);

  const groups: Group[] = [];
  let k = 0;
  while (k < shown.length) {
    const index = shown[k];
    if (run[index].type !== "facts") {
      groups.push({ kind: "block", index });
      k++;
      continue;
    }
    const aside = [index];
    k++;
    while (k < shown.length) {
      const next = run[shown[k]];
      if (next.type === "facts") {
        aside.push(shown[k]);
        k++;
      } else if (next.type === "images" && k + 1 < shown.length && run[shown[k + 1]].type === "facts") {
        aside.push(shown[k], shown[k + 1]);
        k += 2;
      } else {
        break;
      }
    }
    const previous = groups[groups.length - 1];
    let media: number | null = null;
    if (previous?.kind === "block" && run[previous.index].type === "images") {
      media = previous.index;
      groups.pop();
    }
    groups.push({ kind: "spread", media, aside });
  }

  const start = (group: Group) => (group.kind === "block" ? group.index : (group.media ?? group.aside[0]));
  const byStart = new Map(groups.map((group) => [start(group), group]));
  const one = (blocks: ContentBlock[]): Row => ({ id: rowId(blocks[0]), type: "row", layout: "one", cells: [blocks] });

  const rows: Row[] = [];
  run.forEach((block, i) => {
    if (!visible[i]) {
      rows.push(one([block]));
      return;
    }
    const group = byStart.get(i);
    if (!group) return;
    if (group.kind === "block") {
      rows.push(one([block]));
    } else {
      const aside = group.aside.map((a) => run[a]);
      rows.push(
        group.media === null
          ? one(aside)
          : { id: rowId(run[group.media]), type: "row", layout: "halves", cells: [[run[group.media]], aside] },
      );
    }
  });
  return rows;
}

/** The version-2 layout of a version-1 block list (KTD3). No block is lost or reordered. */
export function upgradeBlocks(blocks: Block[]): LayoutItem[] {
  const taken = new Set(blocks.map((block) => block.id));
  const rowId = (first: Block) => {
    let id = `row-${first.id}`.slice(0, 64);
    for (let n = 2; taken.has(id); n++) id = `row-${n}-${first.id}`.slice(0, 64);
    taken.add(id);
    return id;
  };

  const items: LayoutItem[] = [];
  let run: ContentBlock[] = [];
  const flush = () => {
    items.push(...upgradeRun(run, rowId));
    run = [];
  };
  for (const block of blocks) {
    if (block.type === "heading") {
      flush();
      items.push(block);
    } else {
      run.push(block);
    }
  }
  flush();
  return items;
}

/** Every id in a layout: items, blocks in cells, and slides. New ids must avoid all of them. */
export function layoutIds(items: LayoutItem[]): string[] {
  return items.flatMap((item) => [
    item.id,
    ...(item.type === "row" ? item.cells.flat().map((block) => block.id) : []),
    ...(item.type === "carousel" ? item.slides.map((slide) => slide.id) : []),
  ]);
}

/** Every heading and cell block of a layout, in reading order (left cell before right cell). */
export function layoutBlocks(items: LayoutItem[]): (HeadingBlock | ContentBlock)[] {
  return items.flatMap((item): (HeadingBlock | ContentBlock)[] =>
    item.type === "heading" ? [item] : item.type === "row" ? item.cells.flat() : [],
  );
}
