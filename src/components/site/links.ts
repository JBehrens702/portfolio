import type { Media, Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import type { NavLink } from "./Header";

// Pure helpers for the addresses of the site pages. The page components take a
// link base: "/" for the public site and "/preview" for the owner's preview (U5).

/** The section ids of the home page. Header links point to work, about, and contact. */
export const SECTION_IDS = { work: "work", software: "software", about: "about", contact: "contact" } as const;

/** The id of a section's heading, for aria-labelledby: "work" gives "work-heading". */
export function headingId(sectionId: string): string {
  return `${sectionId}-heading`;
}

export function homeHref(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function experienceHref(base: string, slug: string): string {
  const home = homeHref(base);
  return `${home === "/" ? "" : home}/experiences/${encodeURIComponent(slug)}`;
}

/** A link to a home page section: "#id" on the home page, otherwise "<home>#id". */
export function sectionHref(base: string, id: string, onHome: boolean): string {
  return onHome ? `#${id}` : `${homeHref(base)}#${id}`;
}

/** The file address with download=1, so Vercel Blob sends it as a download. */
export function downloadHref(file: Media): string {
  const url = new URL(file.url);
  url.searchParams.set("download", "1");
  return url.toString();
}

/** The address when it is http, https, mailto, or local; otherwise null. */
export function safeHref(href: string): string | null {
  const value = href.trim();
  if (value.startsWith("#")) return value;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  return /^(https?:\/\/|mailto:)/i.test(value) ? value : null;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * A site path in the owner's text ("/experiences/x") under the link base, so a
 * link in the preview stays in the preview. Other addresses are unchanged.
 */
export function withLinkBase(href: string, base: string): string {
  const home = homeHref(base);
  if (home === "/" || !href.startsWith("/") || href.startsWith("//")) return href;
  return href === "/" ? home : `${home}${href.startsWith("/#") ? href.slice(1) : href}`;
}

/** An address as short readable text: no protocol, no "www.", no trailing slash. */
function readableAddress(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

/**
 * LinkedIn, email, and Rise, in that order (0.1.7). Each shows only with its
 * address (0.1.8). The link text is its label when the owner approved one, else
 * the owner's own address, so no invented text shows (1.2.4).
 */
export function contactLinks(site: Site): NavLink[] {
  const { linkedin, email, rise } = site.contact;
  const entries: [string, string | undefined, string | undefined][] = [
    ["contactLinkedin", linkedin, linkedin && readableAddress(linkedin)],
    ["contactEmail", email ? `mailto:${email}` : undefined, email],
    ["contactRise", rise, rise && readableAddress(rise)],
  ];
  const links: NavLink[] = [];
  for (const [key, href, fallback] of entries) {
    const label = labelText(site, key) ?? fallback;
    if (href && label) links.push({ label, href });
  }
  return links;
}

/** The header links, for the sections that show. Pass a site from visibleSite(). */
export function navLinks(site: Site, base: string, onHome: boolean): NavLink[] {
  const candidates: [string, string, boolean][] = [
    ["navWork", SECTION_IDS.work, site.experiences.length > 0],
    ["navAbout", SECTION_IDS.about, site.profile.introParagraphs.length > 0],
    ["navContact", SECTION_IDS.contact, contactLinks(site).length > 0],
  ];
  const links: NavLink[] = [];
  for (const [key, id, shows] of candidates) {
    const label = labelText(site, key);
    if (shows && label) links.push({ label, href: sectionHref(base, id, onHome) });
  }
  return links;
}

/** The resume download link, or undefined without a resume file or its label (AE1). */
export function resumeLink(site: Site): NavLink | undefined {
  const file = site.profile.resumeFile;
  const label = labelText(site, "resume");
  return file && label ? { label, href: downloadHref(file) } : undefined;
}
