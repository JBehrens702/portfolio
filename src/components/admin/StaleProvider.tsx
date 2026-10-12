"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { checkParts } from "@/app/admin/actions";
import type { PartKey, Stamps } from "@/lib/content/parts";
import { useConfirm } from "./ConfirmDialog";
import { changedAfterCheck, combineStamps, staleMessage } from "./stamps";
import adminStyles from "./admin.module.css";
import styles from "./StaleProvider.module.css";

// The return check of an editor page (U4, KTD5, 2.4.35). Each editor on the
// page registers the stamps that it holds. When the tab becomes visible again,
// the provider sends all of them in one check; a part that another tab changed
// shows one banner at the top of the page, with Reload. A failed check shows
// nothing. Reload asks first when an editor on the page has unsaved edits; the
// save bar's Reload after a refusal uses the same question.

/** What one editor registers: the stamps it holds now, and whether it has unsaved edits or uploads. */
export interface StaleEntry {
  stamps: Stamps;
  unsaved: boolean;
}

interface StaleContextValue {
  register: (id: string, entry: StaleEntry) => void;
  unregister: (id: string) => void;
  /** Reloads the page; asks first when an editor has unsaved edits. */
  reload: () => Promise<void>;
  /** True after the owner confirmed a Reload, so the editors skip the browser's own leave warning. */
  leaving: () => boolean;
}

const noop = () => undefined;

// Outside a provider (the Labels editor) nothing registers, and Reload asks nothing.
const StaleContext = createContext<StaleContextValue>({
  register: noop,
  unregister: noop,
  reload: async () => window.location.reload(),
  leaving: () => false,
});

export function useStale(): StaleContextValue {
  return useContext(StaleContext);
}

const RELOAD_QUESTION = "Reload and lose your unsaved edits?";

/**
 * Wraps an editor page. `titles` maps an experience slug to the title that the
 * banner uses for its card and page.
 */
export function StaleProvider({ titles = {}, children }: { titles?: Record<string, string>; children: ReactNode }) {
  const entries = useRef(new Map<string, StaleEntry>());
  const checking = useRef(false);
  const confirmedLeave = useRef(false);
  const [changed, setChanged] = useState<PartKey[]>([]);
  const { confirm, dialog } = useConfirm();

  const register = useCallback((id: string, entry: StaleEntry) => {
    entries.current.set(id, entry);
  }, []);
  const unregister = useCallback((id: string) => {
    entries.current.delete(id);
  }, []);
  const leaving = useCallback(() => confirmedLeave.current, []);

  const reload = useCallback(async () => {
    const unsaved = [...entries.current.values()].some((entry) => entry.unsaved);
    if (unsaved && !(await confirm(RELOAD_QUESTION, "Reload"))) return;
    confirmedLeave.current = true;
    window.location.reload();
  }, [confirm]);

  useEffect(() => {
    const held = () => combineStamps([...entries.current.values()].map((entry) => entry.stamps));
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || checking.current) return;
      const sent = held();
      if (Object.keys(sent).length === 0) return;
      checking.current = true;
      try {
        const next = changedAfterCheck(await checkParts(sent), sent, held());
        if (next) setChanged(next);
      } catch {
        // A failed check shows nothing; the save itself still refuses an out-of-date part.
      } finally {
        checking.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const value = useMemo(() => ({ register, unregister, reload, leaving }), [register, unregister, reload, leaving]);

  return (
    <StaleContext.Provider value={value}>
      {changed.length > 0 && (
        <div className={styles.banner} role="alert" data-testid="stale-banner">
          <span>{staleMessage(changed, titles)}</span>
          <button type="button" className={`${adminStyles.button} ${adminStyles.primary} ${adminStyles.small}`} onClick={() => void reload()}>
            Reload
          </button>
        </div>
      )}
      {children}
      {dialog}
    </StaleContext.Provider>
  );
}
