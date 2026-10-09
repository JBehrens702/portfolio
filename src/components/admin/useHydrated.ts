"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False in the server HTML and during hydration, true once React runs in the
 * browser. The admin's action buttons stay disabled until then, because a
 * click on the server HTML has no handler yet and would do nothing.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
