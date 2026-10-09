import { ContentValidationError, type Site } from "@/lib/content/schema";
import { createContentStoreFromEnv } from "@/lib/content/store";

// The draft for the admin pages: an uncached read on every request. Call it
// only after requireOwnerPage(), and never inside "use cache".

export type DraftState =
  | { kind: "ok"; site: Site; mediaPrefix: string }
  | { kind: "no-store" }
  | { kind: "no-draft" }
  | { kind: "invalid"; issues: string[] };

export async function readDraftState(): Promise<DraftState> {
  const store = createContentStoreFromEnv();
  if (!store) return { kind: "no-store" };
  try {
    const site = await store.readDraft();
    return site ? { kind: "ok", site, mediaPrefix: store.paths.mediaPrefix } : { kind: "no-draft" };
  } catch (error) {
    if (error instanceof ContentValidationError) return { kind: "invalid", issues: error.issues };
    throw error;
  }
}
