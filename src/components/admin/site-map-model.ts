import { experienceHref } from "@/components/site/links";
import type { PageChanges, PageMark } from "@/lib/content/page-changes";
import type { LinkReason, PageId, PageLink, SiteLinks } from "@/lib/content/site-links";
import { editHref, HOME_ID, HOME_TITLE, previewHref } from "./page-bar-model";

// The pure parts of the admin map (U6, KTD9): the page rows with their marks
// and addresses, the selected page in the address, the list or wall choice,
// and the link lists in words. The content modules come in as types only: the
// browser code of the map imports this file, and must not pull in the
// server-only content modules. The page addresses follow the page bar's rules.

/** "home": the home page. "experience": an experience page of the draft. "removed": a published page that the draft removed. */
export type RowKind = "home" | "experience" | "removed";

/** The text mark of a row (2.4.29, 2.4.30). The map shows it as a word, never as a colour alone. */
export type RowMark = Exclude<PageMark, null> | "removed" | null;

/** One row of the page list, and one picture of the wall. */
export interface MapRow {
  page: PageId;
  kind: RowKind;
  title: string;
  mark: RowMark;
  /** The page's editor; null for a removed page. */
  editHref: string | null;
  /** The page's draft preview; null for a removed page. */
  previewHref: string | null;
  /** The live public page; set only for a removed page, which has no draft preview (KTD6). */
  liveHref: string | null;
  /** The address that the picture loads. */
  frameHref: string;
}

export { HOME_TITLE };

/**
 * True for an ordinary left click. A click with a modifier key, or with
 * another button, opens the link in a new tab or window as usual, so the map
 * must not take it over.
 */
export function isPlainClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * The rows of the map, in site order: the home page, each experience of the
 * draft, then each page that the draft removed. Pass `changes` as null when the
 * published site cannot be read: the rows then carry no mark.
 */
export function mapRows({
  homePage,
  experiences,
  changes,
}: {
  homePage: PageId;
  experiences: { slug: string; title: string }[];
  changes: PageChanges | null;
}): MapRow[] {
  const marks = new Map((changes?.pages ?? []).map((change) => [change.page, change.mark]));
  const home: MapRow = {
    page: homePage,
    kind: "home",
    title: HOME_TITLE,
    mark: marks.get(homePage) ?? null,
    editHref: editHref(HOME_ID),
    previewHref: previewHref(HOME_ID),
    liveHref: null,
    frameHref: previewHref(HOME_ID),
  };
  const pages: MapRow[] = experiences.map(({ slug, title }) => ({
    page: slug,
    kind: "experience",
    title,
    mark: marks.get(slug) ?? null,
    editHref: editHref(slug),
    previewHref: previewHref(slug),
    liveHref: null,
    frameHref: previewHref(slug),
  }));
  const removed: MapRow[] = (changes?.removed ?? []).map(({ slug, homeTitle }) => ({
    page: slug,
    kind: "removed",
    title: homeTitle,
    mark: "removed",
    editHref: null,
    previewHref: null,
    liveHref: experienceHref("/", slug),
    frameHref: experienceHref("/", slug),
  }));
  return [home, ...pages, ...removed];
}

/** The address parameter that holds the selected page. */
export const PAGE_PARAM = "page";

/**
 * The address of the map with this row selected. The home page has no
 * parameter; every other page has `?page=<slug>`. A slug can never be "/" but
 * can be "home", so the home page is never written as a word.
 */
export function selectHref(row: MapRow): string {
  return row.kind === "home" ? "/admin" : `/admin?${PAGE_PARAM}=${encodeURIComponent(row.page)}`;
}

/** The row that the address parameter names; the home page for no parameter or an unknown one. */
export function rowFromParam(param: string | null, rows: MapRow[]): MapRow {
  const home = rows.find((row) => row.kind === "home") ?? rows[0];
  if (!param) return home;
  return rows.find((row) => row.kind !== "home" && row.page === param) ?? home;
}

/** Where a tap on a phone, or a wall picture's button, goes: the preview, or the live page of a removed page. */
export function openHref(row: MapRow): string {
  return row.previewHref ?? row.liveHref ?? row.frameHref;
}

/** The title attribute of the row's picture. */
export function frameTitle(row: MapRow): string {
  return row.kind === "removed" ? `Live page of ${row.title}` : `Preview of ${row.title}`;
}

/**
 * Phone width (2.4.27): the map shows the list alone, and a tap on a row's
 * title opens its preview. Keep it equal to the media queries of the map in
 * admin.module.css.
 */
export const NARROW_QUERY = "(max-width: 720px)";

// ---- The list or wall choice: a per-viewer convenience in localStorage (KTD9) ----

export type MapView = "list" | "wall";

export const VIEW_KEY = "portfolio-admin-map-view";

/** The part of Storage that the choice uses. */
export interface ViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The stored choice. `getStorage` is a function, because reading
 * `window.localStorage` itself can throw (blocked site data). Any failure, and
 * any unknown value, gives the list view.
 */
export function readView(getStorage: () => ViewStorage): MapView {
  try {
    return getStorage().getItem(VIEW_KEY) === "wall" ? "wall" : "list";
  } catch {
    return "list";
  }
}

/** Stores the choice; false when the storage fails (the choice then lasts only until a reload). */
export function writeView(getStorage: () => ViewStorage, view: MapView): boolean {
  try {
    getStorage().setItem(VIEW_KEY, view);
    return true;
  } catch {
    return false;
  }
}

// ---- The link lists (2.4.22) ----

export const REASON_WORDS: Record<LinkReason, string> = {
  card: "card",
  next: "next link",
  header: "header",
  text: "link in the text",
};

/** One linked page, named by its title, with the reasons in words. */
export interface LinkLine {
  page: PageId;
  title: string;
  reasons: string;
}

export interface PageLinkLines {
  /** The pages that this page links to. */
  to: LinkLine[];
  /** The pages that link to this page. */
  from: LinkLine[];
}

/**
 * The link lists of every row, keyed by page id. A page that the link list
 * does not hold (a removed page) gets two empty lists.
 */
export function linkLines(links: SiteLinks, rows: MapRow[]): Record<PageId, PageLinkLines> {
  const titles = new Map(rows.map((row) => [row.page, row.title]));
  const line = ({ page, reasons }: PageLink): LinkLine => ({
    page,
    title: titles.get(page) ?? page,
    reasons: reasons.map((reason) => REASON_WORDS[reason]).join(", "),
  });
  const result: Record<PageId, PageLinkLines> = {};
  for (const row of rows) result[row.page] = { to: [], from: [] };
  for (const entry of links.pages) result[entry.page] = { to: entry.linksTo.map(line), from: entry.linksFrom.map(line) };
  return result;
}

// ---- The arrow keys (2.4.26) ----

/** The row that ArrowUp or ArrowDown moves to; null for another key or at the end of the list. */
export function nextRowIndex(current: number, key: string, count: number): number | null {
  const next = key === "ArrowDown" ? current + 1 : key === "ArrowUp" ? current - 1 : null;
  return next === null || next < 0 || next >= count ? null : next;
}
