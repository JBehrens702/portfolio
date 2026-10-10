import type { LabelsInput } from "@/app/admin/actions";
import type { Site } from "@/lib/content/schema";

// The label editor's value (KTD9): each label with the text that the editor
// loaded or last saved (baseText). saveLabels compares the draft with baseText,
// so the editor must take the stored labels after each save.

/** The labels as stored, each with its text as the loaded text. */
export function withBaseText(labels: Site["labels"]): LabelsInput {
  return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, { ...label, baseText: label.text }]));
}

/**
 * Takes the stored labels into the editor after a save. A label that the owner
 * did not touch while the save ran shows the stored text and approval. A label
 * that the owner edited meanwhile keeps the edit, with the stored text as its
 * new loaded text, so the next save still counts it as rewritten.
 */
export function adoptStoredLabels(stored: LabelsInput, sent: LabelsInput, latest: LabelsInput): LabelsInput {
  const next: LabelsInput = {};
  for (const [key, label] of Object.entries(latest)) {
    const saved = stored[key];
    if (!saved) next[key] = label;
    else next[key] = label === sent[key] ? saved : { ...label, baseText: saved.baseText };
  }
  return next;
}
