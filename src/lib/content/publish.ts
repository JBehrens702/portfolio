import { ContentValidationError, unapprovedLabels, type Site } from "./schema";
import type { ContentStore } from "./store";

export type PublishResult =
  | { ok: true; site: Site; historyPath: string | null }
  | { ok: false; reason: "no-draft"; message: string }
  | { ok: false; reason: "invalid"; issues: string[]; message: string }
  | {
      ok: false;
      reason: "unapproved-labels";
      labels: string[];
      /** The same labels with their texts from the draft, so the admin can show them without a second read. */
      labelTexts: { key: string; text: string }[];
      message: string;
    };

export interface PublishOptions {
  /**
   * Runs after the new published document is written. The admin action passes a
   * function that refreshes the Next.js cache tag CONTENT_TAG. It is injected so
   * this module does not import next/cache and stays testable.
   */
  afterPublish?: () => void | Promise<void>;
}

/**
 * Publishes the draft: validate, refuse while any label is unapproved (KTD9),
 * copy the current published document to history (KTD4), write the draft as the
 * published document, then call afterPublish. A refusal changes nothing.
 */
export async function publish(store: ContentStore, options: PublishOptions = {}): Promise<PublishResult> {
  let draft: Site | null;
  try {
    draft = await store.readDraft();
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return {
        ok: false,
        reason: "invalid",
        issues: error.issues,
        message: `Publish refused: the draft is not valid.\n${error.issues.join("\n")}`,
      };
    }
    throw error;
  }
  if (draft === null) {
    return { ok: false, reason: "no-draft", message: "Publish refused: there is no draft." };
  }

  const labels = unapprovedLabels(draft);
  if (labels.length > 0) {
    const labelTexts = labels.map((key) => ({ key, text: draft.labels[key].text }));
    const named = labelTexts.map(({ key, text }) => `${key} ("${text}")`).join(", ");
    return {
      ok: false,
      reason: "unapproved-labels",
      labels,
      labelTexts,
      message: `Publish refused: approve these labels first: ${named}.`,
    };
  }

  const historyPath = await store.copyPublishedToHistory();
  const site = await store.writePublished(draft);
  await options.afterPublish?.();
  return { ok: true, site, historyPath };
}
