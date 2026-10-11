// The undo history of one editing visit (2.4.14, KTD10). It stores whole values:
// a page is small, and a stored value is always a state the owner saw. A burst of
// typing in one field (changes with the same key less than PAUSE_MS apart) is one
// step. Save does not touch the history; Reset clears it.

export const PAUSE_MS = 1000;
const LIMIT = 100;

export interface History<T> {
  /** Earlier values, oldest first. */
  past: T[];
  /** Undone values, the next redo last. */
  future: T[];
  /** The key and time of the last recorded change, to join a burst of typing. */
  last?: { key: string; at: number };
}

export const EMPTY_HISTORY: History<never> = { past: [], future: [] };

/** Records that the value `previous` is about to change. */
export function record<T>(history: History<T>, previous: T, key: string | undefined, at: number): History<T> {
  const burst = key !== undefined && history.last?.key === key && at - history.last.at < PAUSE_MS;
  return {
    past: burst ? history.past : [...history.past, previous].slice(-LIMIT),
    future: [],
    last: key === undefined ? undefined : { key, at },
  };
}

export function undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  if (history.past.length === 0) return null;
  const value = history.past[history.past.length - 1];
  return { value, history: { past: history.past.slice(0, -1), future: [...history.future, current] } };
}

export function redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  if (history.future.length === 0) return null;
  const value = history.future[history.future.length - 1];
  return { value, history: { past: [...history.past, current], future: history.future.slice(0, -1) } };
}
