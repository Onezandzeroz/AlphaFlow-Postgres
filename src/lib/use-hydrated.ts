'use client';

import { useSyncExternalStore } from 'react';

/**
 * Returns true only after the component has hydrated on the client.
 * Uses useSyncExternalStore to avoid hydration mismatches.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
