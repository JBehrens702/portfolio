import { ContentValidationError, type Site } from "@/lib/content/schema";
import { createContentStoreFromEnv, type ContentStore } from "@/lib/content/store";

// The draft for the admin pages: an uncached read on every request. Call it
// only after requireOwnerPage(), and never inside "use cache".

export type DraftState =
  | { kind: "ok"; site: Site; mediaPrefix: string }
  | { kind: "no-store" }
  | { kind: "no-draft" }
  | { kind: "invalid"; issues: string[] };

export type StoredDraft = Exclude<DraftState, { kind: "ok" } | { kind: "no-store" }> | { kind: "ok"; site: Site };

/**
 * The draft of one store. The one place where an invalid stored draft becomes
 * a result instead of an error; the admin pages and the admin actions share it.
 */
export async function readStoredDraft(store: ContentStore): Promise<StoredDraft> {
  try {
    const site = await store.readDraft();
    return site ? { kind: "ok", site } : { kind: "no-draft" };
  } catch (error) {
    if (error instanceof ContentValidationError) return { kind: "invalid", issues: error.issues };
    throw error;
  }
}

export async function readDraftState(): Promise<DraftState> {
  const store = createContentStoreFromEnv();
  if (!store) return { kind: "no-store" };
  const draft = await readStoredDraft(store);
  return draft.kind === "ok" ? { kind: "ok", site: draft.site, mediaPrefix: store.paths.mediaPrefix } : draft;
}

/**
 * The draft for the preview pages, or null when there is no store or no draft.
 * Unlike readDraftState(), an invalid draft throws, so the preview shows the
 * error page instead of the page of an empty site.
 */
export async function readDraftOrNull(): Promise<Site | null> {
  return (await createContentStoreFromEnv()?.readDraft()) ?? null;
}
