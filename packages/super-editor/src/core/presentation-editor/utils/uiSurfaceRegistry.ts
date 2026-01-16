/**
 * Registry for UI surfaces that should be excluded from keyboard forwarding
 * (e.g., toolbars, dropdowns, modals). Uses WeakSet so entries are GC'd when
 * the underlying elements are removed.
 */
const uiSurfaces = new WeakSet<EventTarget>();

/**
 * Registers a UI surface root that should be excluded from keyboard event forwarding.
 * UI surfaces include toolbars, dropdowns, modals, and other interactive controls
 * that should handle their own keyboard events without forwarding to the editor.
 *
 * Uses WeakSet internally so registrations are automatically garbage collected
 * when the element is removed from the DOM.
 *
 * @param root - The EventTarget (typically HTMLElement) to register as a UI surface
 * @returns A cleanup function that unregisters the surface when called
 *
 * @example
 * const toolbar = document.getElementById('toolbar');
 * const unregister = registerUiSurface(toolbar);
 * // Later, when toolbar is removed:
 * unregister();
 */
export function registerUiSurface(root: EventTarget): () => void {
  uiSurfaces.add(root);
  return () => uiSurfaces.delete(root);
}

/**
 * Determines whether an event originated from a registered UI surface.
 * Checks both the event's composed path (for shadow DOM support) and
 * declarative data-editor-ui-surface attributes (for portaled content).
 *
 * If composedPath() is unavailable or returns empty, falls back to walking
 * up the DOM tree from event.target.
 *
 * @param event - The event to check for UI surface origin
 * @returns true if event originated from a registered UI surface or an element
 *          with data-editor-ui-surface attribute, false otherwise
 */
export function isInRegisteredSurface(event: Event): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

  if (path.length > 0) {
    for (const node of path) {
      if (uiSurfaces.has(node)) return true;
      if ((node as Element)?.hasAttribute?.('data-editor-ui-surface')) return true;
    }
    return false;
  }

  // Fallback: walk up DOM tree from event.target
  // Note: target could be a Text node, which doesn't have hasAttribute,
  // but optional chaining handles this safely
  let node = event.target as Element | null;
  while (node) {
    if (uiSurfaces.has(node)) return true;
    if (node.hasAttribute?.('data-editor-ui-surface')) return true;
    node = node.parentElement;
  }
  return false;
}
