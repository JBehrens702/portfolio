"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/app/admin/actions";

// The state of one admin editor (U6 step 6): the value being edited, the
// unsaved-edits marker, the save status, and the uploads in progress. The
// browser warns before the owner leaves the page with unsaved edits or a
// running upload.

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "refused"; message: string; issues?: string[] }
  | { kind: "failed"; message: string };

export const NETWORK_FAILURE = "Not saved: the connection failed. Your draft is unchanged.";

export interface DraftEditor<T> {
  value: T;
  /** Changes the value and marks it unsaved. */
  update: (change: (value: T) => T) => void;
  /** Saves the current value. */
  save: () => Promise<boolean>;
  /** Saves the value of the last attempt again. */
  retry: () => Promise<boolean>;
  dirty: boolean;
  status: SaveStatus;
  uploading: boolean;
  beginUpload: () => void;
  endUpload: () => void;
}

export function useDraftEditor<T>(initial: T, persist: (value: T) => Promise<ActionResult>): DraftEditor<T> {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [uploads, setUploads] = useState(0);
  const latest = useRef(initial);
  const lastAttempt = useRef(initial);

  const update = useCallback((change: (value: T) => T) => {
    const next = change(latest.current);
    latest.current = next;
    setValue(next);
    setDirty(true);
  }, []);

  const send = useCallback(
    async (target: T) => {
      lastAttempt.current = target;
      setStatus({ kind: "saving" });
      try {
        const result = await persist(target);
        if (result.ok) {
          setStatus({ kind: "saved", at: result.savedAt });
          // Edits made while the save ran stay unsaved.
          if (latest.current === target) setDirty(false);
          return true;
        }
        setStatus({ kind: "refused", message: result.message, issues: result.issues });
      } catch {
        setStatus({ kind: "failed", message: NETWORK_FAILURE });
      }
      return false;
    },
    [persist],
  );

  const save = useCallback(() => send(latest.current), [send]);
  const retry = useCallback(() => send(lastAttempt.current), [send]);
  const beginUpload = useCallback(() => setUploads((n) => n + 1), []);
  const endUpload = useCallback(() => setUploads((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!dirty && uploads === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploads]);

  return { value, update, save, retry, dirty, status, uploading: uploads > 0, beginUpload, endUpload };
}
