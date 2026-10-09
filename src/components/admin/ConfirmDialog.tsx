"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./admin.module.css";

// The confirmation before a removal (U6 step 5). The question names the item.
// "Cancel", the Escape key, and closing the dialog all answer no, and the
// caller then changes nothing.

interface Request {
  question: string;
  resolve: (yes: boolean) => void;
}

export function useConfirm(): { confirm: (question: string) => Promise<boolean>; dialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback(
    (question: string) => new Promise<boolean>((resolve) => setRequest({ question, resolve })),
    [],
  );
  const answer = useCallback(
    (yes: boolean) => {
      request?.resolve(yes);
      setRequest(null);
    },
    [request],
  );
  const dialog = request ? <ConfirmDialog question={request.question} onAnswer={answer} /> : null;
  return { confirm, dialog };
}

function ConfirmDialog({ question, onAnswer }: { question: string; onAnswer: (yes: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-question"
      onCancel={(event) => {
        event.preventDefault();
        onAnswer(false);
      }}
      data-testid="confirm-dialog"
    >
      <p id="confirm-question">{question}</p>
      <div className={styles.row}>
        <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => onAnswer(true)}>
          Remove
        </button>
        <button type="button" className={styles.button} onClick={() => onAnswer(false)} autoFocus>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
