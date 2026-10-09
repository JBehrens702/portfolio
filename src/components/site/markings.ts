// Decorative technical markings (owner decision, 2026-10-09): reference
// numbers, grid coordinates, zone indices, and ruler numbers, like the border
// and title block of a technical drawing. They are the one exception to the
// rule that the site shows only the owner's words, within these limits:
//
//   - Every value is derived: from an order, a count, a grid position, or the
//     live pointer position. Never a hand-written fact about the owner.
//   - Only digits, single letters (grid and zone indices), the drafting
//     abbreviations in MARKING_ABBREVIATIONS, and the signs in MARKING_CHARS.
//   - Each marking element is aria-hidden, carries data-marking, and is not
//     selectable (the global .readout class).
//
// isAllowedMarking() is the guard: e2e/public.spec.ts runs it on every marking
// of the public pages, so prose cannot slip in later.

/** The drafting abbreviations that a marking may contain. Keep this list short. */
export const MARKING_ABBREVIATIONS = ["REF", "REV", "SCALE", "SHT"] as const;

/** The characters that a marking may contain. */
export const MARKING_CHARS = /^[0-9A-Z°Ø±·:/.\s-]*$/;

/** The 24 px grid of the graph paper (--grid-fine). */
export const GRID_STEP = 24;

/** The coarse grid (--grid-coarse, 7.5rem): one zone of the sheet border. */
export const ZONE_STEP = 120;

/** Zone letters across a drawing sheet: A to Z without I and O, which read as 1 and 0. */
export const ZONE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

/** A whole number, zero-padded: pad(3) is "03", pad(240, 4) is "0240". */
export function pad(value: number, width = 2): string {
  const n = Math.max(0, Math.round(value));
  return String(n).padStart(width, "0");
}

/** A position in a list: "01/05" for the first of five. */
export function ofCount(index: number, count: number): string {
  return `${pad(index + 1)}/${pad(count)}`;
}

/** A reference number from an order and a count: "REF 01/05". */
export function refMark(index: number, count: number): string {
  return `REF ${ofCount(index, count)}`;
}

/** A section number from an order: "N°01". */
export function sectionMark(index: number): string {
  return `N°${pad(index + 1)}`;
}

/** A length snapped to the 24 px grid. */
export function snap(px: number, step = GRID_STEP): number {
  return Math.max(0, Math.round(px / step) * step);
}

/** A point on the grid: "X 0240 · Y 0128". */
export function coordMark(x: number, y: number): string {
  return `X ${pad(snap(x), 4)} · Y ${pad(snap(y), 4)}`;
}

/** The place of a page in the site: the home page is sheet 0, each experience the next one. */
export interface Sheet {
  index: number;
  count: number;
}

/** The sheet number of a page: "SHT 02/04". */
export function sheetMark(index: number, count: number): string {
  return `SHT ${ofCount(index, count)}`;
}

/**
 * True when a marking holds only the allowed signs, digits, single letters,
 * and abbreviations, and no two single letters stand side by side as words.
 */
export function isAllowedMarking(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!MARKING_CHARS.test(value)) return false;
  const allowed = new Set<string>(MARKING_ABBREVIATIONS);
  for (const word of value.match(/[A-Z]+/g) ?? []) {
    if (word.length > 1 && !allowed.has(word)) return false;
  }
  // "A B" or "I A M": letters used as words, not as indices.
  if (/(^|[^A-Z0-9])[A-Z] +[A-Z](?![A-Z0-9])/.test(value)) return false;
  return true;
}
