import { createHash } from "node:crypto";
import { SLUG_PATTERN, type Experience, type Site, type SoftwareCard } from "./schema";

// Parts of the draft, their version stamps, and the per-part merge of a save
// (KTD1, KTD2). A part is a named slice of the draft; a stamp is a SHA-256 hash
// of the part's JSON with sorted keys. Only the server makes stamps (this module
// uses Node `crypto`); the browser stores them and sends them back. Each
// function returns a new value and leaves its input unchanged.

/** `profile`, `card:<slug>`, `page:<slug>`, or `software` (KTD1). The labels are in no part. */
export type PartKey = "profile" | "software" | `card:${string}` | `page:${string}`;

/** The stamp of each part, by part key. */
export type Stamps = Record<string, string>;

/** The profile part: the profile fields and the contact links. */
export interface ProfilePart {
  profile: Site["profile"];
  contact: Site["contact"];
}

const CARD_FIELDS = ["homeTitle", "homeText", "skills", "cardImage"] as const;

/** The card part: the fields of an experience that its home-page card shows. */
export type CardPart = Pick<Experience, (typeof CARD_FIELDS)[number]>;

/** The page part: every other field of an experience, except its slug (the slug is in the key). */
export type PagePart = Omit<Experience, "slug" | (typeof CARD_FIELDS)[number]>;

export type PartValue = ProfilePart | CardPart | PagePart | SoftwareCard[];

export const cardKey = (slug: string): PartKey => `card:${slug}`;
export const pageKey = (slug: string): PartKey => `page:${slug}`;

/** The two parts of one experience, card first. The experience editor sends both. */
export function experienceKeys(slug: string): PartKey[] {
  return [cardKey(slug), pageKey(slug)];
}

/** Every part of a site: the profile, the card and page of each experience in order, the software cards. */
export function partKeys(site: Site): PartKey[] {
  return ["profile", ...site.experiences.flatMap((e) => experienceKeys(e.slug)), "software"];
}

type ParsedKey = { kind: "profile" | "software" } | { kind: "card" | "page"; slug: string };

function parseKey(key: unknown): ParsedKey | null {
  if (key === "profile" || key === "software") return { kind: key };
  if (typeof key !== "string") return null;
  const match = /^(card|page):(.+)$/.exec(key);
  if (!match || !SLUG_PATTERN.test(match[2])) return null;
  return { kind: match[1] as "card" | "page", slug: match[2] };
}

/** True for a well-formed part key. The save actions check the keys that a browser sends with it. */
export function isPartKey(key: unknown): key is PartKey {
  return parseKey(key) !== null;
}

/** A malformed key is a fault in the server code, which alone names the parts. */
function mustParse(key: PartKey): ParsedKey {
  const parsed = parseKey(key);
  if (!parsed) throw new Error(`Unknown part "${key}"`);
  return parsed;
}

function cardOf(source: CardPart): CardPart {
  const { homeTitle, homeText, skills, cardImage } = source;
  return { homeTitle, homeText, skills, cardImage };
}

const NOT_PAGE_FIELDS = new Set<string>(["slug", ...CARD_FIELDS]);

function pageOf(source: PagePart): PagePart {
  return Object.fromEntries(Object.entries(source).filter(([field]) => !NOT_PAGE_FIELDS.has(field))) as PagePart;
}

/** An object without its undefined fields, so that an optional field that is not set is not stored. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The value of a part of a site. Undefined for a part of an experience that the site does not have. */
export function partValue(site: Site, key: PartKey): PartValue | undefined {
  const parsed = mustParse(key);
  switch (parsed.kind) {
    case "profile":
      return { profile: site.profile, contact: site.contact };
    case "software":
      return site.software;
    case "card":
    case "page": {
      const experience = site.experiences.find((e) => e.slug === parsed.slug);
      if (!experience) return undefined;
      return parsed.kind === "card" ? cardOf(experience) : pageOf(experience);
    }
  }
}

/**
 * The value as JSON with the keys of every object sorted. A field set to
 * undefined is left out, as JSON.stringify leaves it out.
 */
function canonicalJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, v: unknown) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
        : v,
    ) ?? "null"
  );
}

/** The stamp of a part value: a SHA-256 hex digest of its JSON with sorted keys (KTD1). */
export function stampOf(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/**
 * The stamps of the listed parts of a site, or of all its parts. A part of an
 * experience that the site does not have gets no stamp.
 */
export function stampParts(site: Site, keys: PartKey[] = partKeys(site)): Stamps {
  const stamps: Stamps = {};
  for (const key of keys) {
    const value = partValue(site, key);
    if (value !== undefined) stamps[key] = stampOf(value);
  }
  return stamps;
}

/**
 * The site with one part replaced by a value. The card fields and the page
 * fields of an experience are written separately, so one never overwrites the
 * other. Throws for a part of an experience that the site does not have.
 */
export function applyPart(site: Site, key: PartKey, value: PartValue): Site {
  const parsed = mustParse(key);
  switch (parsed.kind) {
    case "profile": {
      const { profile, contact } = value as ProfilePart;
      return { ...site, profile, contact };
    }
    case "software":
      return { ...site, software: value as SoftwareCard[] };
    case "card":
    case "page": {
      const index = site.experiences.findIndex((e) => e.slug === parsed.slug);
      if (index < 0) throw new Error(`Unknown experience "${parsed.slug}"`);
      const old = site.experiences[index];
      const card = cardOf(parsed.kind === "card" ? (value as CardPart) : old);
      const page = pageOf(parsed.kind === "page" ? (value as PagePart) : old);
      // Only the fields of the two parts are kept, so a page field that the sent value lacks is removed.
      const next = defined({ slug: old.slug, ...page, ...card }) as Experience;
      return { ...site, experiences: site.experiences.map((e, i) => (i === index ? next : e)) };
    }
  }
}

export type MergeResult =
  | {
      ok: true;
      /** The current draft with the sent parts merged in. */
      site: Site;
      /** The parts written from the sent value, or already equal to it (a retry). */
      written: PartKey[];
      /** The parts that the tab did not change; the current draft's value stays. */
      kept: PartKey[];
      /** The stamps for the tab: the base stamp for a kept part, the new stamp for every other part. */
      stamps: Stamps;
    }
  | { ok: false; conflicts: PartKey[] };

/**
 * Merges the listed parts of the tab's site `sent` into the current draft
 * (KTD2). `bases` holds the stamp of each part as the tab loaded it. For each
 * part, three stamps are compared:
 *
 * - sent equals base: the tab did not change the part; the current value stays,
 *   and the tab gets its base stamp back. A new stamp beside its old value would
 *   let the tab's next save overwrite the other tab's change with no refusal.
 * - current equals base: nobody else changed the part; the sent value is written.
 * - sent equals current: the part is already saved (a retry after a lost response).
 * - otherwise the part is in conflict.
 *
 * A part with no base stamp, and a part of an experience that the current draft
 * no longer has, are in conflict too. On any conflict nothing is merged, and the
 * result names every part in conflict. Throws when `sent` has no value for a
 * listed part, because the caller then listed a part that it did not send.
 */
export function mergeParts(current: Site, sent: Site, keys: PartKey[], bases: Stamps): MergeResult {
  const conflicts: PartKey[] = [];
  const written: PartKey[] = [];
  const kept: PartKey[] = [];
  const stamps: Stamps = {};
  let site = current;

  for (const key of keys) {
    const sentValue = partValue(sent, key);
    if (sentValue === undefined) throw new Error(`The sent site has no part "${key}"`);
    const base = Object.hasOwn(bases, key) ? bases[key] : undefined;
    const currentValue = partValue(current, key);
    if (typeof base !== "string" || currentValue === undefined) {
      conflicts.push(key);
      continue;
    }
    const sentStamp = stampOf(sentValue);
    const currentStamp = stampOf(currentValue);
    if (sentStamp === base) {
      kept.push(key);
      stamps[key] = base;
    } else if (currentStamp === base || sentStamp === currentStamp) {
      written.push(key);
      site = applyPart(site, key, sentValue);
      stamps[key] = sentStamp;
    } else {
      conflicts.push(key);
    }
  }

  if (conflicts.length > 0) return { ok: false, conflicts };
  return { ok: true, site, written, kept, stamps };
}

/**
 * The stamps to return to the tab after the merged site was saved as `saved`:
 * the base stamp for each kept part, and the stamp of `saved` for each written
 * part. Use it when validation can change the merged site before the write.
 */
export function stampsAfterSave(saved: Site, merge: Extract<MergeResult, { ok: true }>): Stamps {
  const kept = Object.fromEntries(merge.kept.map((key) => [key, merge.stamps[key]]));
  return { ...kept, ...stampParts(saved, merge.written) };
}
