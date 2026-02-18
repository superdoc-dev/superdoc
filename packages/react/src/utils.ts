/** @module utils */

import * as React from 'react';

/**
 * Polyfill for React.useId() for React versions < 18.
 * Uses useRef to generate a stable random ID once per component instance.
 */
function useIdPolyfill(): string {
  const ref = React.useRef<string | null>(null);
  if (ref.current === null) {
    ref.current = `-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return ref.current;
}

/**
 * Hook that returns a stable unique ID for the component instance.
 * Uses React.useId() when available (React 18+), falls back to
 * useRef-based polyfill for React 16.8+/17.
 *
 * The returned value is used as: `superdoc${useStableId()}`
 * - React 18+: useId() returns ":r0:" → "superdoc:r0:"
 * - Polyfill: returns "-1707345123456-abc1d2e" → "superdoc-1707345123456-abc1d2e"
 */
export const useStableId: () => string =
  typeof (React as any).useId === 'function' ? (React as any).useId : useIdPolyfill;
