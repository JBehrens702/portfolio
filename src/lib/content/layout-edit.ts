import { move, newId, newSlide, type Direction } from "./order";
import { ROW_COLUMNS, type Block, type ContentBlock, type Carousel, type LayoutItem, type Row, type RowLayout, type Slide } from "./schema";

// Pure edits of a page layout for the editor (U4, KTD7). Each returns a new
// layout and leaves its input unchanged. A box is one block in a cell, found by
// its row id, cell index, and place in the cell.

export interface BoxRef {
  row: string;
  cell: number;
  index: number;
}

function rowIndex(items: LayoutItem[], id: string): number {
  return items.findIndex((item) => item.type === "row" && item.id === id);
}

function rowAt(items: LayoutItem[], id: string): Row | undefined {
  const index = rowIndex(items, id);
  return index < 0 ? undefined : (items[index] as Row);
}

function withRow(items: LayoutItem[], id: string, change: (row: Row) => Row): LayoutItem[] {
  return items.map((item) => (item.type === "row" && item.id === id ? change(item) : item));
}

function boxAt(items: LayoutItem[], ref: BoxRef): ContentBlock | undefined {
  return rowAt(items, ref.row)?.cells[ref.cell]?.[ref.index];
}

/** True when the row should go after a box left it: a one-column row with no box, or a row whose cells are all empty. */
function emptied(row: Row): boolean {
  return row.cells.every((cell) => cell.length === 0);
}

/** Removes the row `id` when it has become empty. Only the source row of a move is checked. */
function dropIfEmpty(items: LayoutItem[], id: string): LayoutItem[] {
  const row = rowAt(items, id);
  return row && emptied(row) ? items.filter((item) => item !== row) : items;
}

function removeBox(items: LayoutItem[], ref: BoxRef): LayoutItem[] {
  return withRow(items, ref.row, (row) => ({
    ...row,
    cells: row.cells.map((cell, c) => (c === ref.cell ? cell.filter((_, i) => i !== ref.index) : cell)),
  }));
}

function insertBox(items: LayoutItem[], ref: BoxRef, block: ContentBlock): LayoutItem[] {
  return withRow(items, ref.row, (row) => ({
    ...row,
    cells: row.cells.map((cell, c) => (c === ref.cell ? [...cell.slice(0, ref.index), block, ...cell.slice(ref.index)] : cell)),
  }));
}

/** Moves a heading, row, or carousel to a new place in the layout. */
export function moveItem(items: LayoutItem[], from: number, to: number): LayoutItem[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Moves a box into a cell at a place. `to.index` is the place in the target cell
 * as it is before the move. The source row goes when it becomes empty.
 */
export function moveBox(items: LayoutItem[], from: BoxRef, to: BoxRef): LayoutItem[] {
  const block = boxAt(items, from);
  const target = rowAt(items, to.row);
  if (!block || !target || !target.cells[to.cell]) return items;
  const sameCell = from.row === to.row && from.cell === to.cell;
  const index = sameCell && from.index < to.index ? to.index - 1 : to.index;
  if (sameCell && index === from.index) return items;
  return dropIfEmpty(insertBox(removeBox(items, from), { ...to, index }, block), from.row);
}

/** Drops a box beside a one-column row: that row becomes halves with the box on the right (F1). */
export function dropBeside(items: LayoutItem[], from: BoxRef, rowId: string): LayoutItem[] {
  const block = boxAt(items, from);
  if (!block) return items;
  const removed = removeBox(items, from);
  const target = rowAt(removed, rowId);
  if (!target || target.layout !== "one" || target.cells[0].length === 0) return items;
  const beside = withRow(removed, rowId, (row) => ({ ...row, layout: "halves", cells: [row.cells[0], [block]] }));
  return dropIfEmpty(beside, from.row);
}

/** Drops a box between two items: a new one-column row at `at` (an index in the layout before the drop). */
export function dropBetween(items: LayoutItem[], from: BoxRef, at: number, takenIds: Iterable<string>): LayoutItem[] {
  const block = boxAt(items, from);
  if (!block || at < 0 || at > items.length) return items;
  const row: Row = { id: newId("row", [...takenIds, ...items.map((item) => item.id)]), type: "row", layout: "one", cells: [[block]] };
  const inserted = [...items.slice(0, at), row, ...items.slice(at)];
  return dropIfEmpty(removeBox(inserted, from), from.row);
}

/**
 * Changes a row's preset (2.4.11). One column to two puts every box in the left
 * cell; two columns to one joins the cells left then right; between two-column
 * presets the cells stay.
 */
export function setRowLayout(items: LayoutItem[], rowId: string, layout: RowLayout): LayoutItem[] {
  return withRow(items, rowId, (row) => {
    if (row.layout === layout) return row;
    const columns = ROW_COLUMNS[layout];
    const boxes = row.cells.flat();
    if (columns === row.cells.length) return { ...row, layout };
    if (columns === 1) return { ...row, layout, cells: [boxes] };
    return { ...row, layout, cells: [boxes, ...Array.from({ length: columns - 1 }, () => [])] };
  });
}

/** The cells of the layout in reading order: each row's cells, left to right. */
function readingCells(items: LayoutItem[]): { row: string; cell: number; size: number }[] {
  return items.flatMap((item) => (item.type === "row" ? item.cells.map((cell, c) => ({ row: item.id, cell: c, size: cell.length })) : []));
}

/**
 * Moves a box one place up or down (the move buttons on a phone, 2.4.16). Past
 * the end of its cell it goes to the start of the next cell in reading order;
 * before the start, to the end of the previous cell.
 */
export function moveBoxStep(items: LayoutItem[], ref: BoxRef, direction: Direction): LayoutItem[] {
  const row = rowAt(items, ref.row);
  const cell = row?.cells[ref.cell];
  if (!cell || !cell[ref.index]) return items;
  const inside = direction === "up" ? ref.index > 0 : ref.index < cell.length - 1;
  if (inside) return moveBox(items, ref, { ...ref, index: direction === "up" ? ref.index - 1 : ref.index + 2 });
  const cells = readingCells(items);
  const here = cells.findIndex((c) => c.row === ref.row && c.cell === ref.cell);
  const other = cells[direction === "up" ? here - 1 : here + 1];
  if (!other) return items;
  return moveBox(items, ref, { row: other.row, cell: other.cell, index: direction === "up" ? other.size : 0 });
}

function withCarousel(items: LayoutItem[], id: string, change: (carousel: Carousel) => Carousel): LayoutItem[] {
  return items.map((item) => (item.type === "carousel" && item.id === id ? change(item) : item));
}

export function addSlide(items: LayoutItem[], carouselId: string, takenIds: Iterable<string>): LayoutItem[] {
  return withCarousel(items, carouselId, (c) => ({ ...c, slides: [...c.slides, newSlide([...takenIds, ...c.slides.map((s) => s.id)])] }));
}

export function removeSlide(items: LayoutItem[], carouselId: string, slideId: string): LayoutItem[] {
  return withCarousel(items, carouselId, (c) => ({ ...c, slides: c.slides.filter((s) => s.id !== slideId) }));
}

/** The layout with one slide changed. */
export function mapSlide(items: LayoutItem[], carouselId: string, slideId: string, change: (slide: Slide) => Slide): LayoutItem[] {
  return withCarousel(items, carouselId, (c) => ({ ...c, slides: c.slides.map((s) => (s.id === slideId ? change(s) : s)) }));
}

export function moveSlide(items: LayoutItem[], carouselId: string, index: number, direction: Direction): LayoutItem[] {
  return withCarousel(items, carouselId, (c) => ({ ...c, slides: move(c.slides, index, direction) }));
}

/** The layout with the block `id` (a heading item or a block in a cell) changed by `change`. */
export function mapBlock(items: LayoutItem[], id: string, change: (block: Block) => Block): LayoutItem[] {
  return items.map((item) => {
    if (item.type === "heading") return item.id === id ? (change(item) as typeof item) : item;
    if (item.type !== "row" || !item.cells.some((cell) => cell.some((b) => b.id === id))) return item;
    return {
      ...item,
      cells: item.cells.map((cell) => cell.map((b) => (b.id === id ? (change(b) as ContentBlock) : b))),
    };
  });
}

/** Removes a box; its row goes when it becomes empty, as after a move. */
export function removeBoxAt(items: LayoutItem[], ref: BoxRef): LayoutItem[] {
  if (!boxAt(items, ref)) return items;
  return dropIfEmpty(removeBox(items, ref), ref.row);
}

/** Adds a block at the end of a cell. */
export function addBlockToCell(items: LayoutItem[], rowId: string, cell: number, block: ContentBlock): LayoutItem[] {
  const row = rowAt(items, rowId);
  if (!row?.cells[cell]) return items;
  return insertBox(items, { row: rowId, cell, index: row.cells[cell].length }, block);
}

/** Removes a heading, row, or carousel. */
export function removeItem(items: LayoutItem[], id: string): LayoutItem[] {
  return items.filter((item) => item.id !== id);
}

/** Where a block sits: its box in a cell, or null for a heading item or an unknown id. */
export function findBox(items: LayoutItem[], blockId: string): BoxRef | null {
  for (const item of items) {
    if (item.type !== "row") continue;
    for (let c = 0; c < item.cells.length; c++) {
      const index = item.cells[c].findIndex((b) => b.id === blockId);
      if (index >= 0) return { row: item.id, cell: c, index };
    }
  }
  return null;
}
