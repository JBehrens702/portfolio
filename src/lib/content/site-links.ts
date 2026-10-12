import { fromMarkdown } from "mdast-util-from-markdown";
import { isExternalHref, safeHref } from "@/components/site/links";
import { SITE_URL } from "@/lib/site-url";
import { nextExperience } from "./order";
import type { LayoutItem, Site } from "./schema";
import { isBlank, labelText, visibleSite } from "./visibility";

// The link list of the admin map (KTD7): which pages link to which, and the
// links that leave the site. A pure function of the visible draft, so it lists
// only the links that the preview shows. No Next.js, admin, or browser code.

/**
 * A page of the site: HOME_PAGE for the home page, or the slug of an
 * experience. A slug has no "/", so it can never equal HOME_PAGE.
 */
export type PageId = string;

/** The id of the home page. */
export const HOME_PAGE: PageId = "/";

/**
 * Why one page links to another: the home page's experience card, the
 * experience page's "next" link, the header's link to the home page, or a link
 * that the owner wrote in a text.
 */
export type LinkReason = "card" | "next" | "header" | "text";

const REASON_ORDER: readonly LinkReason[] = ["card", "next", "header", "text"];

/** One linked page, listed once, with every reason for the link, in REASON_ORDER. */
export interface PageLink {
  page: PageId;
  reasons: LinkReason[];
}

/** The links of one page. Both lists keep the site order: the home page first, then the experiences. */
export interface PageLinks {
  page: PageId;
  /** The pages that this page links to. */
  linksTo: PageLink[];
  /** The pages that link to this page. */
  linksFrom: PageLink[];
}

/** Where a link that leaves the site comes from. */
export type OutsideKind = "contact" | "resume" | "software" | "file" | "text";

/** A link that leaves the site (2.4.24). `page` is the page that shows it first. */
export interface OutsideLink {
  href: string;
  kind: OutsideKind;
  page: PageId;
}

export interface SiteLinks {
  /** One entry per page: the home page first, then each experience in site order. */
  pages: PageLinks[];
  /** Each address that leaves the site, once, in the order that the pages show them. */
  outside: OutsideLink[];
}

/** A small view of an mdast node: only the fields that the link walk reads. */
interface MdNode {
  type: string;
  url?: string;
  identifier?: string;
  children?: MdNode[];
}

function walk(node: MdNode, visit: (node: MdNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/**
 * The address of each link in a Markdown text, in text order, as safeHref keeps
 * it; an unsafe address (for example `javascript:`) is left out. It reads
 * inline links, autolinks such as `<https://…>`, and reference links, as the
 * site's Markdown renderer does. A bare address and an image are not links.
 */
export function textLinks(text: string): string[] {
  const root = fromMarkdown(text) as MdNode;
  const definitions = new Map<string, string>();
  walk(root, (node) => {
    // CommonMark: the first definition of a label wins.
    if (node.type === "definition" && node.identifier !== undefined && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url ?? "");
    }
  });
  const hrefs: string[] = [];
  walk(root, (node) => {
    const url =
      node.type === "link" ? node.url : node.type === "linkReference" ? definitions.get(node.identifier ?? "") : undefined;
    const safe = url === undefined ? null : safeHref(url);
    if (safe) hrefs.push(safe);
  });
  return hrefs;
}

const SITE_ORIGIN = new URL(SITE_URL).origin;

/**
 * What a safe address points to: a page of the site, "none" for an address in
 * the site that is not a listed page (an unknown slug, another path, or an
 * anchor on the same page), or "outside" for an address that leaves the site.
 */
function targetOf(href: string, slugs: ReadonlySet<string>): PageId | "none" | "outside" {
  if (href.startsWith("#")) return "none";
  let path: string;
  if (href.startsWith("/")) {
    path = href;
  } else if (isExternalHref(href)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return "outside";
    }
    if (url.origin !== SITE_ORIGIN) return "outside";
    path = url.pathname;
  } else {
    return "outside"; // mailto:
  }
  path = path.split(/[?#]/)[0];
  if (path === "" || path === "/") return HOME_PAGE;
  const match = /^\/experiences\/([^/]+)\/?$/.exec(path);
  if (!match) return "none";
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return "none";
  }
  return slugs.has(slug) ? slug : "none";
}

/** The Markdown texts and the file addresses of an experience page, in layout order. */
function pageContent(layout: LayoutItem[]): { text?: string; file?: string }[] {
  const content: { text?: string; file?: string }[] = [];
  for (const item of layout) {
    if (item.type === "row") {
      for (const block of item.cells.flat()) {
        if (block.type === "text" || block.type === "quote") content.push({ text: block.text });
        // The page shows a file block only with a label or a file name (Block.tsx).
        if (block.type === "file" && block.file && !(isBlank(block.label) && isBlank(block.file.fileName))) {
          content.push({ file: block.file.url });
        }
      }
    } else if (item.type === "carousel") {
      for (const slide of item.slides) content.push({ text: slide.text });
    }
  }
  return content;
}

/**
 * The links of every page of the site and the links that leave it (KTD7).
 * Pass the raw draft: the function applies visibleSite() itself, so a link in
 * hidden content is not listed. Passing a site that is already visible gives
 * the same result.
 *
 * Built-in links: the home page links to each experience (card), each
 * experience links to the next one, the last to the first (next), and each
 * experience links to the home page (header). The map lists the links that
 * the site really renders (2.4.22), so the labels count as the site uses them
 * (labelText: a missing or blank label hides its element). The card links need
 * the "readMore" label (SiteView, ExperienceSummary), the next links need the
 * "nextExperience" label (ExperiencePage), and the resume link needs the
 * "resume" label (resumeLink). The header logo link to the home page always shows.
 * A file block shows only with a label or a file name (Block).
 *
 * Text links: the links in text and quote blocks and slide texts belong to
 * their experience; the links in the intro paragraphs, the card texts, and the
 * software overviews belong to the home page. A text link is internal when it
 * is `/`, `/#…`, or `/experiences/<slug>` (a trailing slash, query, or anchor
 * is allowed), or the same path under SITE_URL. A link to an unknown slug or
 * another site path, and a link from a page to itself, are not listed.
 */
export function siteLinks(draft: Site): SiteLinks {
  const site = visibleSite(draft);
  const order: PageId[] = [HOME_PAGE, ...site.experiences.map((e) => e.slug)];
  const slugs = new Set(order.slice(1));
  // from → to → reasons
  const edges = new Map<PageId, Map<PageId, Set<LinkReason>>>(order.map((page) => [page, new Map()]));
  const outside: OutsideLink[] = [];
  const seenOutside = new Set<string>();

  const addEdge = (from: PageId, to: PageId, reason: LinkReason) => {
    if (from === to) return;
    const targets = edges.get(from)!;
    const reasons = targets.get(to) ?? new Set<LinkReason>();
    reasons.add(reason);
    targets.set(to, reasons);
  };
  const addOutside = (href: string | undefined, kind: OutsideKind, page: PageId) => {
    if (!href || seenOutside.has(href)) return;
    seenOutside.add(href);
    outside.push({ href, kind, page });
  };
  const addText = (from: PageId, text: string) => {
    for (const href of textLinks(text)) {
      const target = targetOf(href, slugs);
      if (target === "outside") addOutside(href, "text", from);
      else if (target !== "none") addEdge(from, target, "text");
    }
  };

  // The home page.
  if (labelText(site, "readMore")) {
    for (const experience of site.experiences) addEdge(HOME_PAGE, experience.slug, "card");
  }
  const { linkedin, email, rise } = site.contact;
  addOutside(linkedin, "contact", HOME_PAGE);
  addOutside(email ? `mailto:${email}` : undefined, "contact", HOME_PAGE);
  addOutside(rise, "contact", HOME_PAGE);
  if (labelText(site, "resume")) addOutside(site.profile.resumeFile?.url, "resume", HOME_PAGE);
  for (const card of site.software) addOutside(card.link, "software", HOME_PAGE);
  const homeTexts = [
    ...site.profile.introParagraphs,
    ...site.experiences.map((e) => e.homeText),
    ...site.software.map((card) => card.overview ?? ""),
  ];
  for (const text of homeTexts) addText(HOME_PAGE, text);

  // Each experience page.
  const showsNext = labelText(site, "nextExperience") !== null;
  site.experiences.forEach((experience) => {
    addEdge(experience.slug, HOME_PAGE, "header");
    const next = nextExperience(site, experience.slug);
    if (next && showsNext) addEdge(experience.slug, next.slug, "next");
    for (const { text, file } of pageContent(experience.layout)) {
      if (text !== undefined) addText(experience.slug, text);
      addOutside(file, "file", experience.slug);
    }
  });

  const linkOf = (page: PageId, reasons: Set<LinkReason> | undefined): PageLink[] =>
    reasons ? [{ page, reasons: REASON_ORDER.filter((r) => reasons.has(r)) }] : [];
  const pages = order.map((page) => ({
    page,
    linksTo: order.flatMap((to) => linkOf(to, edges.get(page)!.get(to))),
    linksFrom: order.flatMap((from) => linkOf(from, edges.get(from)!.get(page))),
  }));
  return { pages, outside };
}

/** The links of one page. Throws for a page that the result does not have. */
export function linksOfPage(links: SiteLinks, page: PageId): PageLinks {
  const found = links.pages.find((p) => p.page === page);
  if (!found) throw new Error(`Unknown page "${page}"`);
  return found;
}
