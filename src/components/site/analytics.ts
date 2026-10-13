import type { BeforeSendEvent } from "@vercel/analytics/next";

// Vercel Web Analytics counts the public pages only. The owner's own visits to
// the admin, the preview, and the sign-in page would inflate the counts, so
// their events are dropped in the browser and never sent.

/** The first path segments of the pages that only the owner opens. */
export const PRIVATE_SECTIONS = ["admin", "preview", "sign-in"] as const;

export function isPrivatePath(pathname: string): boolean {
  const first = pathname.split("/").find((part) => part !== "") ?? "";
  return (PRIVATE_SECTIONS as readonly string[]).includes(first);
}

/** The beforeSend hook: keeps an event for a public page, drops all others. */
export function dropPrivatePages(event: BeforeSendEvent): BeforeSendEvent | null {
  let pathname: string;
  try {
    pathname = new URL(event.url).pathname;
  } catch {
    return null;
  }
  return isPrivatePath(pathname) ? null : event;
}
