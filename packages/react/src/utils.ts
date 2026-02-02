import { useRef } from 'react';

/**
 * Counter for generating unique IDs
 */
let idCounter = 0;

/**
 * Generate a stable unique ID for the component instance.
 * This hook is compatible with React 16.8+ (doesn't use useId).
 * The ID is generated once per component instance and remains stable
 * across re-renders and Strict Mode double-invocations.
 *
 * @returns A stable unique identifier string
 */
export function useStableId(): string {
  const idRef = useRef<string | null>(null);

  if (idRef.current === null) {
    idRef.current = `superdoc-${++idCounter}`;
  }

  return idRef.current;
}
