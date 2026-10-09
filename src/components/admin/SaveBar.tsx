"use client";

import { IssueList } from "./IssueList";
import type { DraftEditor } from "./useDraftEditor";
import { useHydrated } from "./useHydrated";
import styles from "./admin.module.css";

/** The save controls and states of one editor (U6 step 6). */
export function SaveBar<T>({ editor }: { editor: DraftEditor<T> }) {
  const { status, dirty, uploading } = editor;
  const hydrated = useHydrated();
  return (
    <div className={styles.toolbar} data-testid="save-bar">
      <button
        type="button"
        className={`${styles.button} ${styles.primary}`}
        onClick={() => void editor.save()}
        disabled={!hydrated || uploading || status.kind === "saving"}
      >
        Save draft
      </button>
      {dirty ? (
        <span className={styles.marker} data-testid="unsaved">
          Unsaved changes
        </span>
      ) : null}
      {uploading ? <span className={styles.muted}>Wait for the upload to finish.</span> : null}
      <SaveStatusText editor={editor} />
    </div>
  );
}

export function SaveStatusText<T>({ editor }: { editor: DraftEditor<T> }) {
  const { status } = editor;
  switch (status.kind) {
    case "idle":
      return null;
    case "saving":
      return (
        <span role="status" className={styles.muted}>
          Saving...
        </span>
      );
    case "saved":
      return (
        <span role="status" data-testid="saved">
          Saved at {new Date(status.at).toLocaleTimeString()}.
        </span>
      );
    case "refused":
      return (
        <div role="alert" className={styles.error} data-testid="save-error">
          {status.message}
          <IssueList issues={status.issues} />
        </div>
      );
    case "failed":
      return (
        <span role="alert" className={styles.error} data-testid="save-error">
          {status.message}{" "}
          <button type="button" className={`${styles.button} ${styles.small}`} onClick={() => void editor.retry()}>
            Retry
          </button>
        </span>
      );
  }
}
