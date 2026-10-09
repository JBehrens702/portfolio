"use client";

import { useCallback } from "react";
import { saveLabels, type LabelsInput } from "@/app/admin/actions";
import { SaveBar } from "./SaveBar";
import { useDraftEditor } from "./useDraftEditor";
import styles from "./admin.module.css";

// The UI labels (1.2.7, KTD9): each short text of the layout, with its
// approval. Publish is refused while any label is not approved. A label that
// the owner rewrites counts as approved when it is saved.

export function LabelsEditor({ initial }: { initial: LabelsInput }) {
  const persist = useCallback((labels: LabelsInput) => saveLabels(labels), []);
  const editor = useDraftEditor(initial, persist);
  const { value, update } = editor;
  // Unapproved labels first, in the order of the page load, so a label does not jump when it is approved.
  const keys = Object.keys(initial).sort(
    (a, b) => Number(initial[a].approved) - Number(initial[b].approved) || a.localeCompare(b),
  );

  return (
    <div className={styles.stack}>
      <ol className={styles.list} aria-label="Labels">
        {keys.map((key) => {
          const label = value[key];
          return (
            <li key={key} id={`label-${key}`} className={styles.card} data-testid="label" data-label-key={key}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{key}</h2>
                <span className={label.approved ? styles.muted : styles.marker}>
                  {label.approved ? "Approved" : "Not approved"}
                </span>
              </div>
              <div className={styles.row}>
                <label className={styles.field} style={{ flex: "1 1 16rem" }}>
                  <span>Text</span>
                  <input
                    className={styles.input}
                    value={label.text}
                    onChange={(e) => {
                      const text = e.target.value;
                      update((all) => ({ ...all, [key]: { ...all[key], text } }));
                    }}
                  />
                </label>
                {label.approved ? (
                  <button
                    type="button"
                    className={`${styles.button} ${styles.small}`}
                    onClick={() => update((all) => ({ ...all, [key]: { ...all[key], approved: false } }))}
                  >
                    Take back approval
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.button} ${styles.small}`}
                    aria-label={`Approve ${key}`}
                    onClick={() => update((all) => ({ ...all, [key]: { ...all[key], approved: true } }))}
                  >
                    Approve
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <SaveBar editor={editor} />
    </div>
  );
}
