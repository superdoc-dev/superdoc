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

/**
 * Returns a reference-stable version of `value` that only changes identity
 * when the structural content changes (compared via `JSON.stringify`).
 *
 * Use for object/array props that feed into `useEffect` / `useMemo`
 * dependency arrays when the consumer is likely to pass inline literals.
 * Without this, every parent re-render produces a fresh reference and
 * causes the effect to re-run even when the content is identical.
 *
 * **Intended only for plain-data values.** `JSON.stringify` has well-known
 * limitations that make this hook unsuitable for values containing:
 *
 * - **Functions** — silently dropped during serialization, so a change
 *   to a callback-valued property is treated as "equal" and ignored.
 * - **Class instances / live objects** (e.g. Yjs Doc, DOM nodes, Maps,
 *   Sets, Dates) — serialize to `{}` or to identical strings across
 *   distinct instances, so swaps are missed.
 * - **`undefined` property values** — dropped (`{a: undefined}` → `"{}"`),
 *   so `{a: undefined, b: 1}` and `{b: 1}` compare equal.
 * - **`NaN` / `Infinity` / `-Infinity`** — serialize to `null`, collapsing
 *   distinct numeric values.
 * - **Circular references** — throw; the hook falls back to adopting the
 *   new reference (treated as "different").
 * - **Key insertion order** — `JSON.stringify({a:1, b:2}) !==
 *   JSON.stringify({b:2, a:1})`. Content-equal objects assembled via
 *   spreads or conditional keys can still be classified as different
 *   (false negative — triggers a rebuild that wasn't needed, no
 *   correctness impact).
 *
 * The structural compare only runs when the incoming reference differs
 * from the previous one, so the steady-state cost is a single pointer
 * check.
 */
export function useStructuralMemo<T>(value: T): T {
  const lastRawRef = React.useRef<T>(value);
  const stableRef = React.useRef<T>(value);

  if (lastRawRef.current !== value) {
    if (!structurallyEqual(stableRef.current, value)) {
      stableRef.current = value;
    }
    lastRawRef.current = value;
  }

  return stableRef.current;
}

function structurallyEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
