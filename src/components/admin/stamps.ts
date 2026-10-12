import type { CheckPartsResult, RefusalReason } from "@/app/admin/actions";
import type { PartKey, Stamps } from "@/lib/content/parts";
import type { Adopt, SaveResult, SaveStatus } from "./useDraftEditor";

// The browser side of the part stamps (U4, KTD1, KTD2, KTD5). The browser never
// makes a stamp: it holds the stamps that the page loaded or a save returned,
// and sends them back. These pure functions keep that bookkeeping, decide what
// a refused save offers, and make the return banner's text. Only type imports
// come from the server modules, so this file adds no server code to the browser.

/** The held stamps with the stamps of a successful save on top (KTD2: store exactly what came back). */
export function mergeStamps(held: Stamps, returned: Stamps): Stamps {
  return { ...held, ...returned };
}

/** What the save bar offers after a refusal: Reload for an out-of-date tab, Retry when the store was busy. */
export function refusalAction(reason: RefusalReason | undefined): "reload" | "retry" | "none" {
  if (reason === "other-tab" || reason === "out-of-date") return "reload";
  if (reason === "busy") return "retry";
  return "none";
}

export interface SaveOutcome<T> {
  status: SaveStatus;
  /** The value that the editor shows after the save. */
  value: T;
  /** True when the unsaved marker goes off; false leaves it as it is. */
  markSaved: boolean;
  /** The stamps that the next save sends. */
  stamps: Stamps;
}

/**
 * The editor state after a save. `sent` is the value of the save and `latest`
 * the editor's value now. A refusal changes nothing but the status: the owner's
 * edits, the unsaved marker, and the stamps stay (2.4.34).
 */
export function settleSave<T>(result: SaveResult<T>, sent: T, latest: T, stamps: Stamps, adopt: Adopt<T>): SaveOutcome<T> {
  if (!result.ok) {
    const status: Extract<SaveStatus, { kind: "refused" }> = { kind: "refused", message: result.message };
    if (result.issues) status.issues = result.issues;
    if (result.reason) status.reason = result.reason;
    return { status, value: latest, markSaved: false, stamps };
  }
  return {
    status: { kind: "saved", at: result.savedAt },
    value: "value" in result && result.value !== undefined ? adopt(result.value, sent, latest) : latest,
    // Edits made while the save ran stay unsaved.
    markSaved: latest === sent,
    stamps: result.stamps ? mergeStamps(stamps, result.stamps) : stamps,
  };
}

/** One set of stamps for the return check, from the stamps of each editor on the page. */
export function combineStamps(sets: Iterable<Stamps>): Stamps {
  let combined: Stamps = {};
  for (const stamps of sets) combined = { ...combined, ...stamps };
  return combined;
}

/**
 * The changed parts that the banner names, or null to leave the banner as it
 * is (a failed check is ignored). `sent` holds the stamps of the check and
 * `now` the stamps that the editors hold when it returns: a part that this tab
 * saved meanwhile is not out of date.
 */
export function changedAfterCheck(result: CheckPartsResult, sent: Stamps, now: Stamps): PartKey[] | null {
  if (!result.ok) return null;
  return result.changed.filter((key) => now[key] === sent[key]);
}

/** The plain name of each part, for example "the WindAid page". `titles` maps a slug to its title. */
export function describeParts(keys: PartKey[], titles: Record<string, string>): string[] {
  return keys.map((key) => {
    if (key === "profile") return "the profile";
    if (key === "software") return "the software cards";
    const [kind, slug] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const name = Object.hasOwn(titles, slug) && titles[slug] ? titles[slug] : `"${slug}"`;
    return `the ${name} ${kind === "card" ? "card" : "page"}`;
  });
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** The return banner's text. */
export function staleMessage(keys: PartKey[], titles: Record<string, string>): string {
  return `Another tab saved a newer version of ${listNames(describeParts(keys, titles))}. Reload this page before you edit it.`;
}
