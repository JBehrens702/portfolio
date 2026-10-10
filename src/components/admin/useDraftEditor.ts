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

/** A save result. With `value`, the server stored a value that differs from the one sent. */
export type SaveResult<T> = ActionResult | { ok: true; savedAt: string; value: T };

/**
 * Takes the stored value into the editor. `sent` is the value of the save and
 * `latest` the editor's value now: they differ when the owner edited while the
 * save ran. The default keeps those edits and takes the stored value only when
 * nothing changed.
 */
export type Adopt<T> = (stored: T, sent: T, latest: T) => T;

function adoptUnchanged<T>(stored: T, sent: T, latest: T): T {
  return latest === sent ? stored : latest;
}

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

export function useDraftEditor<T>(
  initial: T,
  persist: (value: T) => Promise<SaveResult<T>>,
  adopt: Adopt<T> = adoptUnchanged,
): DraftEditor<T> {
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
          const unchanged = latest.current === target;
          if ("value" in result) {
            latest.current = adopt(result.value, target, latest.current);
            setValue(latest.current);
          }
          if (unchanged) setDirty(false);
          return true;
        }
        setStatus({ kind: "refused", message: result.message, issues: result.issues });
      } catch {
        setStatus({ kind: "failed", message: NETWORK_FAILURE });
      }
      return false;
    },
    [persist, adopt],
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
