"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EMPTY_HISTORY, record, redo, undo, type History } from "./history";
import type { Refusal, RefusalReason } from "@/app/admin/actions";
import type { Stamps } from "@/lib/content/parts";
import { settleSave } from "./stamps";
import { useStale } from "./StaleProvider";

// The state of one admin editor (U6 step 6): the value being edited, the
// unsaved-edits marker, the save status, and the uploads in progress. The
// browser warns before the owner leaves the page with unsaved edits or a
// running upload.
//
// The editor also holds the stamps of the draft parts that it edits (U4, KTD1):
// the page loads them, each save sends them, and each successful save replaces
// them with the stamps of its result. A refusal keeps the owner's edits on
// screen (2.4.34). The editor registers its stamps with the page's
// StaleProvider for the return check (KTD5).

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "refused"; message: string; issues?: string[]; reason?: RefusalReason }
  | { kind: "failed"; message: string };

export const NETWORK_FAILURE = "Not saved: the connection failed. Your draft is unchanged.";

/**
 * A save result. With `value`, the server stored a value that differs from the
 * one sent. With `stamps`, the server returned the new stamps of the saved parts.
 */
export type SaveResult<T> = { ok: true; savedAt: string; value?: T; stamps?: Stamps } | Refusal;

/** Saves a value. `base` holds the stamps of the parts that the editor loaded or last saved. */
export type Persist<T> = (value: T, base: Stamps) => Promise<SaveResult<T>>;

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

export interface DraftEditorOptions<T> {
  adopt?: Adopt<T>;
  /**
   * The stamps of the parts that this editor edits, computed by the server page.
   * Without them (the Labels editor), the editor sends empty stamps and takes
   * no part in the return check.
   */
  stamps?: Stamps;
}

const NO_STAMPS: Stamps = {};

export interface DraftEditor<T> {
  value: T;
  /**
   * Changes the value and marks it unsaved. Each change is one undo step; changes
   * with the same `key` in a quick burst (typing in one field) are one step.
   */
  update: (change: (value: T) => T, key?: string) => void;
  /** Steps back or forward through the changes of this visit (2.4.14). */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Takes a stored value as the saved state and clears the history (Reset,
   * 2.4.15). `stamps` are the stamps of the stored value.
   */
  replace: (value: T, stamps?: Stamps) => void;
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

export function useDraftEditor<T>(initial: T, persist: Persist<T>, options: DraftEditorOptions<T> = {}): DraftEditor<T> {
  const adopt = options.adopt ?? adoptUnchanged;
  const tracked = options.stamps !== undefined;
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [uploads, setUploads] = useState(0);
  const [initialStamps] = useState(() => options.stamps ?? NO_STAMPS);
  const [stamps, setStamps] = useState(initialStamps);
  const latest = useRef(initial);
  const lastAttempt = useRef(initial);
  // The stamps that the next save sends; `stamps` is their copy for rendering and registration.
  const heldStamps = useRef(initialStamps);
  const history = useRef<History<T>>(EMPTY_HISTORY);
  const [steps, setSteps] = useState({ canUndo: false, canRedo: false });
  const { register, unregister, leaving } = useStale();
  const id = useId();

  const show = useCallback((next: T) => {
    latest.current = next;
    setValue(next);
    setSteps({ canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0 });
  }, []);

  const hold = useCallback((next: Stamps) => {
    heldStamps.current = next;
    setStamps(next);
  }, []);

  const update = useCallback(
    (change: (value: T) => T, key?: string) => {
      const next = change(latest.current);
      if (next === latest.current) return;
      history.current = record(history.current, latest.current, key, Date.now());
      show(next);
      setDirty(true);
    },
    [show],
  );

  const step = useCallback(
    (move: typeof undo) => {
      const result = move(history.current, latest.current);
      if (!result) return;
      history.current = result.history;
      show(result.value);
      setDirty(true);
    },
    [show],
  );
  const undoStep = useCallback(() => step(undo), [step]);
  const redoStep = useCallback(() => step(redo), [step]);

  const replace = useCallback(
    (stored: T, storedStamps?: Stamps) => {
      history.current = EMPTY_HISTORY;
      show(stored);
      setDirty(false);
      if (storedStamps) hold(storedStamps);
    },
    [show, hold],
  );

  const send = useCallback(
    async (target: T) => {
      lastAttempt.current = target;
      setStatus({ kind: "saving" });
      try {
        const result = await persist(target, heldStamps.current);
        const outcome = settleSave(result, target, latest.current, heldStamps.current, adopt);
        setStatus(outcome.status);
        if (outcome.value !== latest.current) {
          latest.current = outcome.value;
          setValue(outcome.value);
        }
        if (outcome.stamps !== heldStamps.current) hold(outcome.stamps);
        if (outcome.markSaved) setDirty(false);
        return result.ok;
      } catch {
        setStatus({ kind: "failed", message: NETWORK_FAILURE });
      }
      return false;
    },
    [persist, adopt, hold],
  );

  const save = useCallback(() => send(latest.current), [send]);
  const retry = useCallback(() => send(lastAttempt.current), [send]);
  const beginUpload = useCallback(() => setUploads((n) => n + 1), []);
  const endUpload = useCallback(() => setUploads((n) => Math.max(0, n - 1)), []);

  // The page's return check sends the stamps that this editor holds now (KTD5).
  const unsaved = dirty || uploads > 0;
  useEffect(() => {
    if (tracked) register(id, { stamps, unsaved });
  }, [tracked, register, id, stamps, unsaved]);
  useEffect(() => () => unregister(id), [unregister, id]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      // The owner already confirmed a Reload in the page's own dialog.
      if (leaving()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved, leaving]);

  return {
    value,
    update,
    undo: undoStep,
    redo: redoStep,
    canUndo: steps.canUndo,
    canRedo: steps.canRedo,
    replace,
    save,
    retry,
    dirty,
    status,
    uploading: uploads > 0,
    beginUpload,
    endUpload,
  };
}
