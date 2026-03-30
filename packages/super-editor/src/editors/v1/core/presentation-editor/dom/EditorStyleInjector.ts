/**
 * EditorStyleInjector — Idempotent style injection for editor-owned CSS.
 *
 * These styles are behavioural concerns that belong to the editor, not the
 * painter. Each function injects its CSS once per document lifetime using a
 * module-level boolean guard — the same pattern used by the painter's own
 * style helpers in `@superdoc/painter-dom`.
 */

// ---------------------------------------------------------------------------
// Native Selection Suppression
// ---------------------------------------------------------------------------

/**
 * Hides the browser's native text selection highlight on layout engine content.
 *
 * PresentationEditor renders its own selection overlay for precise control over
 * selection appearance across pages, zoom levels, and virtualization. Without
 * these styles, users would see BOTH the custom selection overlay AND the native
 * browser selection, causing a "double selection" visual artifact.
 */
const NATIVE_SELECTION_STYLES = `
/* Hide native browser selection on layout engine content.
 * We render our own selection overlay via PresentationEditor's #localSelectionLayer
 * for precise control over selection geometry across pages and zoom levels. */
.superdoc-layout *::selection {
  background: transparent;
}

.superdoc-layout *::-moz-selection {
  background: transparent;
}
`;

let nativeSelectionStylesInjected = false;

export function ensureEditorNativeSelectionStyles(doc: Document | null | undefined): void {
  if (nativeSelectionStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-editor-native-selection-styles', 'true');
  styleEl.textContent = NATIVE_SELECTION_STYLES;
  doc.head?.appendChild(styleEl);
  nativeSelectionStylesInjected = true;
}

// ---------------------------------------------------------------------------
// Field Annotation Interaction Styles
// ---------------------------------------------------------------------------

/**
 * Editing affordances for field annotations: hover feedback, drag cursors,
 * and drop zone indicators. These are editor interaction concerns, not
 * rendering — the painter emits inert annotation wrappers and the editor
 * upgrades them with interactive behaviour post-paint.
 */
const FIELD_ANNOTATION_INTERACTION_STYLES = `
/* Editing affordance: allow text selection on draggable annotations */
.superdoc-layout .annotation[data-draggable="true"] {
  user-select: text;
}

/* Editing affordance: hover feedback */
.superdoc-layout .annotation[data-draggable="true"]:hover {
  opacity: 0.9;
}

/* Editing affordance: active/grab cursor */
.superdoc-layout .annotation[data-draggable="true"]:active {
  cursor: grabbing;
}

/* Editing affordance: drag over indicator for drop targets */
.superdoc-layout.drag-over {
  outline: 2px dashed #b015b3;
  outline-offset: -2px;
}

/* Editing affordance: drop zone indicator */
.superdoc-layout .superdoc-drop-indicator {
  position: absolute;
  width: 2px;
  background-color: #b015b3;
  pointer-events: none;
  z-index: 1000;
}
`;

let fieldAnnotationInteractionStylesInjected = false;

export function ensureEditorFieldAnnotationInteractionStyles(doc: Document | null | undefined): void {
  if (fieldAnnotationInteractionStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-editor-field-annotation-interaction-styles', 'true');
  styleEl.textContent = FIELD_ANNOTATION_INTERACTION_STYLES;
  doc.head?.appendChild(styleEl);
  fieldAnnotationInteractionStylesInjected = true;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** @internal Reset injection flags for testing. */
export function _resetEditorStyleFlags(): void {
  nativeSelectionStylesInjected = false;
  fieldAnnotationInteractionStylesInjected = false;
}
