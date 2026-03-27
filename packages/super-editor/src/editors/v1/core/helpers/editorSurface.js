/**
 * Resolve the DOM element representing the visible editing surface for either flow or presentation editors.
 *
 * This function handles three scenarios:
 * 1. Editor IS a PresentationEditor - returns the visible layout surface (element property)
 * 2. Flow Editor with attached PresentationEditor - returns the presentation's visible surface
 * 3. Plain flow Editor - returns the ProseMirror view's DOM element
 *
 * @param {import('../Editor.js').Editor | import('../PresentationEditor.js').PresentationEditor} editor
 * @returns {HTMLElement|null}
 */
export function getEditorSurfaceElement(editor) {
  if (!editor) return null;

  // Check if editor IS a PresentationEditor by looking for PresentationEditor-specific method (hitTest)
  // and the element property. This distinguishes from flow Editor which delegates hitTest to presentationEditor.
  if (typeof editor.hitTest === 'function' && editor.element instanceof HTMLElement) {
    return editor.element;
  }

  // For flow Editor: check for attached PresentationEditor, then fall back to view.dom or options.element
  return editor.presentationEditor?.element ?? editor.view?.dom ?? editor.options?.element ?? null;
}

/**
 * Convert viewport coordinates into a position relative to the active editor surface.
 * Falls back to the current selection when explicit coordinates are unavailable.
 * @param {import('../Editor.js').Editor} editor
 * @param {{ clientX?: number, clientY?: number }} eventLocation
 * @returns {{ left: number, top: number } | null}
 */
export function getSurfaceRelativePoint(editor, eventLocation = {}) {
  const surface = getEditorSurfaceElement(editor);
  if (!surface) return null;

  const rect = surface.getBoundingClientRect();
  let left;
  let top;

  if (typeof eventLocation.clientX === 'number' && typeof eventLocation.clientY === 'number') {
    left = eventLocation.clientX - rect.left;
    top = eventLocation.clientY - rect.top;
  } else if (editor?.state?.selection) {
    const selectionFrom = editor.state.selection.from;
    const coords = editor.coordsAtPos?.(selectionFrom);
    if (coords) {
      left = coords.left - rect.left;
      top = coords.top - rect.top;
    }
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }

  return { left, top };
}
