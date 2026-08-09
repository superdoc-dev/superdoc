// Shell-owned runtime root marker.
//
// The marker is how the shell maps a DOM event target back to the runtime that
// owns the editor host element. It is a SHELL concern: the attribute belongs on
// the shell-owned document wrapper around each runtime, NOT on painter DOM or
// runtime-rendered internals (see the runtime contract,
// `packages/layout-engine/tests/src/architecture-boundaries.test.ts`).
//
// Resolution is data-attribute based so it never reads painter internals, never
// maps click coordinates to document positions, and never dispatches edit
// commands. It only answers "which mounted runtime owns this element?".

import type { EditorRuntimeId } from './types.js';

/**
 * The data attribute the shell stamps on each runtime's host wrapper element.
 * `EditorRuntimeRegistry.resolveFromEventTarget` walks up from an event target
 * to the nearest element carrying this attribute.
 */
export const RUNTIME_ROOT_ATTRIBUTE = 'data-superdoc-runtime-id';

/**
 * Mark a shell-owned host element as the root for a mounted runtime.
 *
 * Call this on the wrapper the shell owns around a runtime, not on painter DOM.
 *
 * @param root The shell-owned host wrapper element.
 * @param id The runtime id to associate with this root.
 */
export function markRuntimeRoot(root: HTMLElement, id: EditorRuntimeId): void {
  root.setAttribute(RUNTIME_ROOT_ATTRIBUTE, id);
}

/**
 * Remove the runtime-root marker from a host element.
 *
 * @param root The shell-owned host wrapper element.
 */
export function unmarkRuntimeRoot(root: HTMLElement): void {
  root.removeAttribute(RUNTIME_ROOT_ATTRIBUTE);
}

/**
 * Read the runtime id marked directly on an element, or `null` when absent.
 *
 * This reads the attribute off the given element only; it does not walk
 * ancestors. Use `EditorRuntimeRegistry.resolveFromEventTarget` for the
 * ancestor walk from an arbitrary event target.
 *
 * @param root The element to inspect.
 * @returns The marked runtime id, or `null`.
 */
export function readRuntimeRootId(root: Element | null): EditorRuntimeId | null {
  if (!root) return null;
  return root.getAttribute(RUNTIME_ROOT_ATTRIBUTE);
}
