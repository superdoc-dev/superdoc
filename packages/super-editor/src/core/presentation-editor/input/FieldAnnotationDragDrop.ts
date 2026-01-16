import { TextSelection } from 'prosemirror-state';
import { createDragHandler } from '@superdoc/layout-bridge';
import type { DropEvent, DragOverEvent, PositionHit } from '@superdoc/layout-bridge';
import type { Editor } from '../../Editor.js';

/**
 * Attributes for a field annotation node
 */
export interface FieldAnnotationAttributes {
  fieldId: string;
  fieldType: string;
  displayLabel: string;
  type: string;
  fieldColor?: string;
}

/**
 * Information about the source field being dragged
 */
export interface SourceFieldInfo {
  fieldId: string;
  fieldType: string;
  annotationType: string;
}

/**
 * Payload structure for field annotation drag-and-drop data
 */
export interface FieldAnnotationDragPayload {
  /** Attributes to apply to the inserted field annotation */
  attributes?: FieldAnnotationAttributes;
  /** Source field information for tracking drop origin */
  sourceField?: SourceFieldInfo;
}

/**
 * Type guard to validate field annotation attributes
 * @param attrs - Unknown value to validate
 * @returns True if attrs is a valid FieldAnnotationAttributes object
 */
export function isValidFieldAnnotationAttributes(attrs: unknown): attrs is FieldAnnotationAttributes {
  if (!attrs || typeof attrs !== 'object') return false;
  const a = attrs as Record<string, unknown>;
  return (
    typeof a.fieldId === 'string' &&
    typeof a.fieldType === 'string' &&
    typeof a.displayLabel === 'string' &&
    typeof a.type === 'string'
  );
}

/**
 * MIME type identifier for field annotation drag-and-drop operations.
 */
export const FIELD_ANNOTATION_DATA_TYPE = 'fieldAnnotation' as const;

/**
 * Dependencies required for internal field annotation drag handling.
 */
type InternalDragDeps = {
  /** The DOM container hosting the rendered pages */
  painterHost: HTMLElement;
  /** Function to get the current active editor instance */
  getActiveEditor: () => Editor;
  /** Function to convert client coordinates to ProseMirror position */
  hitTest: (clientX: number, clientY: number) => PositionHit | null;
  /** Function to schedule a selection overlay update */
  scheduleSelectionUpdate: () => void;
};

/**
 * Sets up drag-and-drop handlers for field annotations within the editor.
 *
 * Creates internal drag handlers using the layout engine's createDragHandler utility,
 * handling both drag-over (cursor positioning) and drop (move/insert) events for
 * field annotation nodes. Supports moving existing field annotations and inserting
 * new ones from external sources.
 *
 * @param deps - Dependencies including painter host, editor access, hit testing, and selection updates
 * @returns Cleanup function to remove the drag handlers
 *
 * @remarks
 * - Uses layout engine's hit testing to map client coordinates to PM positions
 * - Updates cursor position during drag-over to show drop location
 * - For existing field annotations (with fieldId), performs a move operation
 * - For new annotations (without fieldId), inserts at drop position
 * - Handles position mapping after delete to ensure correct insertion point
 * - Emits 'fieldAnnotationDropped' event for external handling if attributes are invalid
 */
export function setupInternalFieldAnnotationDragHandlers({
  painterHost,
  getActiveEditor,
  hitTest,
  scheduleSelectionUpdate,
}: InternalDragDeps): () => void {
  return createDragHandler(painterHost, {
    onDragOver: (event: DragOverEvent) => {
      if (!event.hasFieldAnnotation || event.event.clientX === 0) {
        return;
      }

      const activeEditor = getActiveEditor();
      if (!activeEditor?.isEditable) {
        return;
      }

      // Use the layout engine's hit testing to get the PM position
      const hit = hitTest(event.clientX, event.clientY);
      const doc = activeEditor.state?.doc;
      if (!hit || !doc) {
        return;
      }

      // Clamp position to valid range
      const pos = Math.min(Math.max(hit.pos, 1), doc.content.size);

      // Skip if cursor hasn't moved
      const currentSelection = activeEditor.state.selection;
      if (currentSelection instanceof TextSelection && currentSelection.from === pos && currentSelection.to === pos) {
        return;
      }

      // Update the selection to show caret at drop position
      try {
        const tr = activeEditor.state.tr.setSelection(TextSelection.create(doc, pos)).setMeta('addToHistory', false);
        activeEditor.view?.dispatch(tr);
        scheduleSelectionUpdate();
      } catch {
        // Position may be invalid during layout updates - ignore
      }
    },
    onDrop: (event: DropEvent) => {
      // Prevent other drop handlers from double-processing
      event.event.preventDefault();
      event.event.stopPropagation();

      if (event.pmPosition === null) {
        return;
      }

      const activeEditor = getActiveEditor();
      const { state, view } = activeEditor;
      if (!state || !view) {
        return;
      }

      // If the source has fieldId (meaning it was dragged from an existing position),
      // we MOVE the field annotation (delete from old, insert at new)
      const fieldId = event.data.fieldId;
      if (fieldId) {
        const targetPos = event.pmPosition;

        // Prefer the original PM start position when available to avoid ambiguity
        const pmStart = event.data.pmStart;
        let sourceStart: number | null = null;
        let sourceEnd: number | null = null;
        let sourceNode: typeof state.doc extends { nodeAt: (p: number) => infer N } ? N : never = null;

        if (pmStart != null) {
          const nodeAt = state.doc.nodeAt(pmStart);
          if (nodeAt?.type?.name === 'fieldAnnotation') {
            sourceStart = pmStart;
            sourceEnd = pmStart + nodeAt.nodeSize;
            sourceNode = nodeAt;
          }
        }

        // Fallback to fieldId search if PM position is missing or stale
        if (sourceStart == null || sourceEnd == null || !sourceNode) {
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'fieldAnnotation' && (node.attrs as { fieldId?: string }).fieldId === fieldId) {
              sourceStart = pos;
              sourceEnd = pos + node.nodeSize;
              sourceNode = node;
              return false; // Stop traversal
            }
            return true;
          });
        }

        if (sourceStart === null || sourceEnd === null || !sourceNode) {
          return;
        }

        // Skip if dropping at the same position (or immediately adjacent)
        if (targetPos >= sourceStart && targetPos <= sourceEnd) {
          return;
        }

        // Create a transaction to move the field annotation
        const tr = state.tr;

        // First delete the source annotation
        tr.delete(sourceStart, sourceEnd);

        // Use ProseMirror's mapping to get the correct target position after the delete
        // This properly handles document structure changes and edge cases
        const mappedTarget = tr.mapping.map(targetPos);

        // Validate the mapped position is within document bounds
        if (mappedTarget < 0 || mappedTarget > tr.doc.content.size) {
          return;
        }

        // Then insert the same node at the mapped target position
        tr.insert(mappedTarget, sourceNode);
        tr.setMeta('uiEvent', 'drop');

        view.dispatch(tr);
        return;
      }

      // No source position - this is a new drop from outside, insert directly if attributes look valid
      const attrs = event.data.attributes;
      if (attrs && isValidFieldAnnotationAttributes(attrs)) {
        const inserted = activeEditor.commands?.addFieldAnnotation?.(event.pmPosition, attrs, true);
        if (inserted) {
          scheduleSelectionUpdate();
        }
        return;
      }

      // Fallback: emit event for any external handlers
      activeEditor.emit('fieldAnnotationDropped', {
        sourceField: event.data,
        editor: activeEditor,
        coordinates: { pos: event.pmPosition },
      });
    },
  });
}

/**
 * Dependencies required for external field annotation drag handling.
 */
type ExternalDragDeps = {
  /** Function to get the current active editor instance */
  getActiveEditor: () => Editor;
  /** Function to convert client coordinates to ProseMirror position */
  hitTest: (clientX: number, clientY: number) => PositionHit | null;
  /** Function to schedule a selection overlay update */
  scheduleSelectionUpdate: () => void;
};

/**
 * Creates a drag-over handler for field annotations from external sources.
 *
 * Handles dragover events when field annotations are dragged from outside the editor
 * (e.g., from a field palette UI). Updates the editor cursor position to show where
 * the field will be inserted if dropped.
 *
 * @param deps - Dependencies including editor access, hit testing, and selection updates
 * @returns Drag-over event handler function
 *
 * @remarks
 * - Only processes events when editor is editable
 * - Checks for FIELD_ANNOTATION_DATA_TYPE in dataTransfer types
 * - Sets dropEffect to 'copy' to indicate insertion
 * - Uses hit testing to map coordinates to PM position
 * - Updates selection to show cursor at drop position
 * - Skips update if cursor is already at the target position
 */
export function createExternalFieldAnnotationDragOverHandler({
  getActiveEditor,
  hitTest,
  scheduleSelectionUpdate,
}: ExternalDragDeps): (event: DragEvent) => void {
  return (event: DragEvent) => {
    const activeEditor = getActiveEditor();
    if (!activeEditor?.isEditable) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    const dt = event.dataTransfer;
    const hasFieldAnnotation =
      dt?.types?.includes(FIELD_ANNOTATION_DATA_TYPE) || Boolean(dt?.getData?.(FIELD_ANNOTATION_DATA_TYPE));
    if (!hasFieldAnnotation) {
      return;
    }

    const hit = hitTest(event.clientX, event.clientY);
    const doc = activeEditor.state?.doc;
    if (!hit || !doc) {
      return;
    }

    const pos = Math.min(Math.max(hit.pos, 1), doc.content.size);
    const currentSelection = activeEditor.state.selection;
    const isSameCursor =
      currentSelection instanceof TextSelection && currentSelection.from === pos && currentSelection.to === pos;

    if (isSameCursor) {
      return;
    }

    try {
      const tr = activeEditor.state.tr.setSelection(TextSelection.create(doc, pos)).setMeta('addToHistory', false);
      activeEditor.view?.dispatch(tr);
      scheduleSelectionUpdate();
    } catch (error) {
      // Position may be invalid during layout updates - expected during re-layout
      if (process.env.NODE_ENV === 'development') {
        console.debug('[PresentationEditor] Drag position update skipped:', error);
      }
    }
  };
}

/**
 * Creates a drop handler for field annotations from external sources.
 *
 * Handles drop events when field annotations are dragged from outside the editor.
 * Parses the dataTransfer payload, validates attributes, inserts the field annotation
 * at the drop position, and emits events for external handling.
 *
 * @param deps - Dependencies including editor access, hit testing, and selection updates
 * @returns Drop event handler function
 *
 * @remarks
 * - Only processes events when editor is editable
 * - Skips internal layout-engine drags (application/x-field-annotation MIME type)
 * - Parses JSON payload from FIELD_ANNOTATION_DATA_TYPE dataTransfer
 * - Uses hit testing to determine drop position (falls back to current selection)
 * - Validates attributes before insertion
 * - Emits 'fieldAnnotationDropped' event with source field info and position
 * - Moves caret after inserted node to enable sequential drops
 * - Focuses editor and updates selection after insertion
 */
export function createExternalFieldAnnotationDropHandler({
  getActiveEditor,
  hitTest,
  scheduleSelectionUpdate,
}: ExternalDragDeps): (event: DragEvent) => void {
  return (event: DragEvent) => {
    const activeEditor = getActiveEditor();
    if (!activeEditor?.isEditable) {
      return;
    }

    // Internal layout-engine drags use a custom MIME type and are handled by DragHandler.
    if (event.dataTransfer?.types?.includes('application/x-field-annotation')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const fieldAnnotationData = event.dataTransfer?.getData(FIELD_ANNOTATION_DATA_TYPE);
    if (!fieldAnnotationData) {
      return;
    }

    const hit = hitTest(event.clientX, event.clientY);
    // If layout hit testing fails (e.g., during a reflow), fall back to the current selection.
    const selection = activeEditor.state?.selection;
    const fallbackPos = selection?.from ?? activeEditor.state?.doc?.content.size ?? null;
    const pos = hit?.pos ?? fallbackPos;
    if (pos == null) {
      return;
    }

    let parsedData: FieldAnnotationDragPayload | null = null;
    try {
      parsedData = JSON.parse(fieldAnnotationData) as FieldAnnotationDragPayload;
    } catch {
      return;
    }

    const { attributes, sourceField } = parsedData ?? {};

    activeEditor.emit?.('fieldAnnotationDropped', {
      sourceField,
      editor: activeEditor,
      coordinates: hit,
      pos,
    });

    // Validate attributes before attempting insertion
    if (attributes && isValidFieldAnnotationAttributes(attributes)) {
      activeEditor.commands?.addFieldAnnotation?.(pos, attributes, true);

      // Move the caret to just after the inserted node so subsequent drops append instead of replacing.
      const posAfter = Math.min(pos + 1, activeEditor.state?.doc?.content.size ?? pos + 1);
      const tr = activeEditor.state?.tr.setSelection(TextSelection.create(activeEditor.state.doc, posAfter));
      if (tr) {
        activeEditor.view?.dispatch(tr);
      }

      scheduleSelectionUpdate();
    }

    const editorDom = activeEditor.view?.dom as HTMLElement | undefined;
    if (editorDom) {
      editorDom.focus();
      activeEditor.view?.focus();
    }
  };
}
