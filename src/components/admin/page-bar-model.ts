import type { Site } from "@/lib/content/schema";

// The page bar on every editor and preview page (KTD10, 2.4.31): the map, the
// home page, and each experience page. Each page has a link in the bar's mode
// and a second, small link in the other mode, so the editor or the preview of
// any page is one click away. Pure, so the server pages and the client
// component share it.

/** The id of the home page in the bar. A slug is never empty. */
export const HOME_ID = "";

export type BarMode = "edit" | "preview";

export interface BarPage {
  id: string;
  title: string;
}

export interface BarLink {
  href: string;
  title: string;
  current: boolean;
  /** The same page in the other mode: its address, its visible word, and its accessible name. */
  other: { href: string; label: string; name: string };
}

export function editHref(id: string): string {
  return id === HOME_ID ? "/admin/home" : `/admin/experiences/${encodeURIComponent(id)}`;
}

export function previewHref(id: string): string {
  return id === HOME_ID ? "/preview" : `/preview/experiences/${encodeURIComponent(id)}`;
}

/** The home page, then each experience in site order, named as the map names it. */
export function barPages(site: Pick<Site, "experiences">): BarPage[] {
  return [
    { id: HOME_ID, title: "Home" },
    ...site.experiences.map((e) => ({ id: e.slug, title: e.homeTitle || e.pageTitle || e.slug })),
  ];
}

/** One entry per page in the bar's mode. `current` is null on a page that is not in the list. */
export function barLinks(pages: BarPage[], current: string | null, mode: BarMode): BarLink[] {
  return pages.map((page) => ({
    href: mode === "edit" ? editHref(page.id) : previewHref(page.id),
    title: page.title,
    current: page.id === current,
    other:
      mode === "edit"
        ? { href: previewHref(page.id), label: "preview", name: `Preview ${page.title}` }
        : { href: editHref(page.id), label: "edit", name: `Edit ${page.title}` },
  }));
}
