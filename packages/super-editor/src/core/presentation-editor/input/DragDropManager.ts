/**
 * DragDropManager - Consolidated drag and drop handling for PresentationEditor.
 *
 * This manager handles all drag/drop events for field annotations:
 * - Internal drags (moving annotations within the document)
 * - External drags (inserting annotations from external sources like palettes)
 * - Window-level fallback for drops on overlay elements
 */

import { TextSelection } from 'prosemirror-state';
import type { Editor } from '../../Editor.js';
import type { PositionHit } from '@superdoc/layout-bridge';

// =============================================================================
// Constants
// =============================================================================

/** MIME type for internal field annotation drag operations */
const INTERNAL_MIME_TYPE = 'application/x-field-annotation';

/** MIME type for external field annotation drag operations (legacy compatibility) */
export const FIELD_ANNOTATION_DATA_TYPE = 'fieldAnnotation' as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Attributes for a field annotation node.
 */
export interface FieldAnnotationAttributes {
  fieldId: string;
  fieldType: string;
  displayLabel: string;
  type: string;
  fieldColor?: string;
}

/**
 * Information about the source field being dragged.
 */
export interface SourceFieldInfo {
  fieldId: string;
  fieldType: string;
  annotationType: string;
}

/**
 * Payload structure for field annotation drag-and-drop data.
 */
export interface FieldAnnotationDragPayload {
  attributes?: FieldAnnotationAttributes;
  sourceField?: SourceFieldInfo;
}

/**
 * Data extracted from a draggable field annotation element.
 */
export interface FieldAnnotationDragData {
  fieldId?: string;
  fieldType?: string;
  variant?: string;
  displayLabel?: string;
  pmStart?: number;
  pmEnd?: number;
  attributes?: Record<string, string>;
}

/**
 * Dependencies injected from PresentationEditor.
 */
export type DragDropDependencies = {
  /** Get the active editor (body or header/footer) */
  getActiveEditor: () => Editor;
  /** Hit test to convert client coordinates to ProseMirror position */
  hitTest: (clientX: number, clientY: number) => PositionHit | null;
  /** Schedule selection overlay update */
  scheduleSelectionUpdate: () => void;
  /** The viewport host element (for event listeners) */
  getViewportHost: () => HTMLElement;
  /** The painter host element (for internal drag detection) */
  getPainterHost: () => HTMLElement;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Type guard to validate field annotation attributes.
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
 * Safely parses an integer from a string.
 */
function parseIntSafe(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Extracts field annotation data from a draggable element's dataset.
 */
function extractFieldAnnotationData(element: HTMLElement): FieldAnnotationDragData {
  const dataset = element.dataset;
  const attributes: Record<string, string> = {};
  for (const key in dataset) {
    const value = dataset[key];
    if (value !== undefined) {
      attributes[key] = value;
    }
  }

  return {
    fieldId: dataset.fieldId,
    fieldType: dataset.fieldType,
    variant: dataset.variant ?? dataset.type,
    displayLabel: dataset.displayLabel,
    pmStart: parseIntSafe(dataset.pmStart),
    pmEnd: parseIntSafe(dataset.pmEnd),
    attributes,
  };
}

/**
 * Checks if a drag event contains field annotation data.
 */
function hasFieldAnnotationData(event: DragEvent): boolean {
  if (!event.dataTransfer) return false;
  const types = Array.from(event.dataTransfer.types ?? []);
  const lowerTypes = types.map((type) => type.toLowerCase());
  const hasFieldAnnotationType =
    lowerTypes.includes(INTERNAL_MIME_TYPE.toLowerCase()) ||
    lowerTypes.includes(FIELD_ANNOTATION_DATA_TYPE.toLowerCase());
  if (hasFieldAnnotationType) return true;
  return Boolean(
    event.dataTransfer.getData(INTERNAL_MIME_TYPE) || event.dataTransfer.getData(FIELD_ANNOTATION_DATA_TYPE),
  );
}

/**
 * Checks if a drag event is an internal drag (from within the editor).
 */
function isInternalDrag(event: DragEvent): boolean {
  return event.dataTransfer?.types?.includes(INTERNAL_MIME_TYPE) ?? false;
}

/**
 * Extracts field annotation data from a drag event's dataTransfer.
 */
function extractDragData(event: DragEvent): FieldAnnotationDragData | null {
  if (!event.dataTransfer) return null;

  let jsonData = event.dataTransfer.getData(INTERNAL_MIME_TYPE);
  if (!jsonData) {
    jsonData = event.dataTransfer.getData(FIELD_ANNOTATION_DATA_TYPE);
  }
  if (!jsonData) return null;

  try {
    const parsed = JSON.parse(jsonData);
    return parsed.sourceField ?? parsed.attributes ?? parsed;
  } catch {
    return null;
  }
}

// =============================================================================
// DragDropManager Class
// =============================================================================

export class DragDropManager {
  #deps: DragDropDependencies | null = null;
  #dragOverRaf: number | null = null;
  #pendingDragOver: { x: number; y: number } | null = null;

  // Bound handlers for cleanup
  #boundHandleDragStart: ((e: DragEvent) => void) | null = null;
  #boundHandleDragOver: ((e: DragEvent) => void) | null = null;
  #boundHandleDrop: ((e: DragEvent) => void) | null = null;
  #boundHandleDragEnd: ((e: DragEvent) => void) | null = null;
  #boundHandleDragLeave: ((e: DragEvent) => void) | null = null;
  #boundHandleWindowDragOver: ((e: DragEvent) => void) | null = null;
  #boundHandleWindowDrop: ((e: DragEvent) => void) | null = null;

  // ==========================================================================
  // Setup
  // ==========================================================================

  setDependencies(deps: DragDropDependencies): void {
    this.#deps = deps;
  }

  bind(): void {
    if (!this.#deps) return;

    const viewportHost = this.#deps.getViewportHost();
    const painterHost = this.#deps.getPainterHost();

    // Create bound handlers
    this.#boundHandleDragStart = this.#handleDragStart.bind(this);
    this.#boundHandleDragOver = this.#handleDragOver.bind(this);
    this.#boundHandleDrop = this.#handleDrop.bind(this);
    this.#boundHandleDragEnd = this.#handleDragEnd.bind(this);
    this.#boundHandleDragLeave = this.#handleDragLeave.bind(this);
    this.#boundHandleWindowDragOver = this.#handleWindowDragOver.bind(this);
    this.#boundHandleWindowDrop = this.#handleWindowDrop.bind(this);

    // Attach listeners to painter host (for internal drags)
    painterHost.addEventListener('dragstart', this.#boundHandleDragStart);
    painterHost.addEventListener('dragend', this.#boundHandleDragEnd);
    painterHost.addEventListener('dragleave', this.#boundHandleDragLeave);

    // Attach listeners to viewport host (for all drags)
    viewportHost.addEventListener('dragover', this.#boundHandleDragOver);
    viewportHost.addEventListener('drop', this.#boundHandleDrop);

    // Window-level listeners for overlay fallback
    window.addEventListener('dragover', this.#boundHandleWindowDragOver, false);
    window.addEventListener('drop', this.#boundHandleWindowDrop, false);
  }

  unbind(): void {
    if (!this.#deps) return;

    const viewportHost = this.#deps.getViewportHost();
    const painterHost = this.#deps.getPainterHost();

    if (this.#boundHandleDragStart) {
      painterHost.removeEventListener('dragstart', this.#boundHandleDragStart);
    }
    if (this.#boundHandleDragEnd) {
      painterHost.removeEventListener('dragend', this.#boundHandleDragEnd);
    }
    if (this.#boundHandleDragLeave) {
      painterHost.removeEventListener('dragleave', this.#boundHandleDragLeave);
    }
    if (this.#boundHandleDragOver) {
      viewportHost.removeEventListener('dragover', this.#boundHandleDragOver);
    }
    if (this.#boundHandleDrop) {
      viewportHost.removeEventListener('drop', this.#boundHandleDrop);
    }
    if (this.#boundHandleWindowDragOver) {
      window.removeEventListener('dragover', this.#boundHandleWindowDragOver, false);
    }
    if (this.#boundHandleWindowDrop) {
      window.removeEventListener('drop', this.#boundHandleWindowDrop, false);
    }

    // Clear references
    this.#boundHandleDragStart = null;
    this.#boundHandleDragOver = null;
    this.#boundHandleDrop = null;
    this.#boundHandleDragEnd = null;
    this.#boundHandleDragLeave = null;
    this.#boundHandleWindowDragOver = null;
    this.#boundHandleWindowDrop = null;
  }

  destroy(): void {
    this.#cancelPendingDragOverSelection();
    this.unbind();
    this.#deps = null;
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle dragstart for internal field annotations.
   */
  #handleDragStart(event: DragEvent): void {
    const target = event.target as HTMLElement;

    // Only handle draggable field annotations
    if (!target?.dataset?.draggable || target.dataset.draggable !== 'true') {
      return;
    }

    const data = extractFieldAnnotationData(target);

    if (event.dataTransfer) {
      const jsonData = JSON.stringify({
        attributes: data.attributes,
        sourceField: data,
      });

      // Set in both MIME types for compatibility
      event.dataTransfer.setData(INTERNAL_MIME_TYPE, jsonData);
      event.dataTransfer.setData(FIELD_ANNOTATION_DATA_TYPE, jsonData);
      event.dataTransfer.setData('text/plain', data.displayLabel ?? 'Field Annotation');
      event.dataTransfer.setDragImage(target, 0, 0);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /**
   * Handle dragover - update cursor position to show drop location.
   */
  #handleDragOver(event: DragEvent): void {
    if (!this.#deps) return;
    if (!hasFieldAnnotationData(event)) return;

    const activeEditor = this.#deps.getActiveEditor();
    if (!activeEditor?.isEditable) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = isInternalDrag(event) ? 'move' : 'copy';
    }

    // Coalesce dragover selection updates to one per animation frame.
    this.#scheduleDragOverSelection(event.clientX, event.clientY);
  }

  #scheduleDragOverSelection(clientX: number, clientY: number): void {
    if (!this.#deps) return;
    this.#pendingDragOver = { x: clientX, y: clientY };
    if (this.#dragOverRaf !== null) return;
    const win = this.#deps.getViewportHost()?.ownerDocument?.defaultView ?? window;
    this.#dragOverRaf = win.requestAnimationFrame(() => {
      this.#dragOverRaf = null;
      const pending = this.#pendingDragOver;
      this.#pendingDragOver = null;
      if (!pending || !this.#deps) return;
      this.#applyDragOverSelection(pending.x, pending.y);
    });
  }

  #cancelPendingDragOverSelection(): void {
    if (this.#dragOverRaf !== null) {
      const win = this.#deps?.getViewportHost()?.ownerDocument?.defaultView ?? window;
      win.cancelAnimationFrame(this.#dragOverRaf);
      this.#dragOverRaf = null;
    }
    this.#pendingDragOver = null;
  }

  #applyDragOverSelection(clientX: number, clientY: number): void {
    if (!this.#deps) return;
    const activeEditor = this.#deps.getActiveEditor();
    if (!activeEditor?.isEditable) return;

    const hit = this.#deps.hitTest(clientX, clientY);
    const doc = activeEditor.state?.doc;
    if (!hit || !doc) return;

    const pos = Math.min(Math.max(hit.pos, 1), doc.content.size);
    const currentSelection = activeEditor.state.selection;
    if (currentSelection instanceof TextSelection && currentSelection.from === pos && currentSelection.to === pos) {
      return;
    }

    try {
      const tr = activeEditor.state.tr.setSelection(TextSelection.create(doc, pos)).setMeta('addToHistory', false);
      activeEditor.view?.dispatch(tr);
      this.#deps.scheduleSelectionUpdate();
    } catch {
      // Position may be invalid during layout updates
    }
  }

  /**
   * Handle drop - either move internal annotation or insert external one.
   */
  #handleDrop(event: DragEvent): void {
    if (!this.#deps) return;
    if (!hasFieldAnnotationData(event)) return;

    event.preventDefault();
    event.stopPropagation();

    this.#cancelPendingDragOverSelection();

    const activeEditor = this.#deps.getActiveEditor();
    if (!activeEditor?.isEditable) return;

    const { state, view } = activeEditor;
    if (!state || !view) return;

    // Get drop position
    const hit = this.#deps.hitTest(event.clientX, event.clientY);
    const fallbackPos = state.selection?.from ?? state.doc?.content.size ?? null;
    const dropPos = hit?.pos ?? fallbackPos;
    if (dropPos == null) return;

    // Handle internal drag (move existing annotation)
    if (isInternalDrag(event)) {
      this.#handleInternalDrop(event, dropPos);
      return;
    }

    // Handle external drag (insert new annotation)
    this.#handleExternalDrop(event, dropPos);
  }

  /**
   * Handle internal drop - move field annotation within document.
   */
  #handleInternalDrop(event: DragEvent, targetPos: number): void {
    if (!this.#deps) return;

    const activeEditor = this.#deps.getActiveEditor();
    const { state, view } = activeEditor;
    if (!state || !view) return;

    const data = extractDragData(event);
    if (!data?.fieldId) return;

    // Find source annotation position
    const pmStart = data.pmStart;
    let sourceStart: number | null = null;
    let sourceEnd: number | null = null;
    let sourceNode: ReturnType<typeof state.doc.nodeAt> = null;

    if (pmStart != null) {
      const nodeAt = state.doc.nodeAt(pmStart);
      if (nodeAt?.type?.name === 'fieldAnnotation') {
        sourceStart = pmStart;
        sourceEnd = pmStart + nodeAt.nodeSize;
        sourceNode = nodeAt;
      }
    }

    // Fallback to fieldId search
    if (sourceStart == null || sourceEnd == null || !sourceNode) {
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'fieldAnnotation' && (node.attrs as { fieldId?: string }).fieldId === data.fieldId) {
          sourceStart = pos;
          sourceEnd = pos + node.nodeSize;
          sourceNode = node;
          return false;
        }
        return true;
      });
    }

    if (sourceStart === null || sourceEnd === null || !sourceNode) return;

    // Skip if dropping at same position
    if (targetPos >= sourceStart && targetPos <= sourceEnd) return;

    // Move: delete from source, insert at target
    const tr = state.tr;
    tr.delete(sourceStart, sourceEnd);
    const mappedTarget = tr.mapping.map(targetPos);
    if (mappedTarget < 0 || mappedTarget > tr.doc.content.size) return;

    tr.insert(mappedTarget, sourceNode);
    tr.setMeta('uiEvent', 'drop');
    view.dispatch(tr);
  }

  /**
   * Handle external drop - insert new field annotation.
   */
  #handleExternalDrop(event: DragEvent, pos: number): void {
    if (!this.#deps) return;

    const activeEditor = this.#deps.getActiveEditor();
    const fieldAnnotationData = event.dataTransfer?.getData(FIELD_ANNOTATION_DATA_TYPE);
    if (!fieldAnnotationData) return;

    let parsedData: FieldAnnotationDragPayload | null = null;
    try {
      parsedData = JSON.parse(fieldAnnotationData) as FieldAnnotationDragPayload;
    } catch {
      return;
    }

    const { attributes, sourceField } = parsedData ?? {};

    // Emit event for external handlers
    activeEditor.emit?.('fieldAnnotationDropped', {
      sourceField,
      editor: activeEditor,
      coordinates: this.#deps.hitTest(event.clientX, event.clientY),
      pos,
    });

    // Insert if attributes are valid
    if (attributes && isValidFieldAnnotationAttributes(attributes)) {
      activeEditor.commands?.addFieldAnnotation?.(pos, attributes, true);

      // Move caret after inserted node
      const posAfter = Math.min(pos + 1, activeEditor.state?.doc?.content.size ?? pos + 1);
      const tr = activeEditor.state?.tr.setSelection(TextSelection.create(activeEditor.state.doc, posAfter));
      if (tr) {
        activeEditor.view?.dispatch(tr);
      }
      this.#deps.scheduleSelectionUpdate();
    }

    // Focus editor
    const editorDom = activeEditor.view?.dom as HTMLElement | undefined;
    if (editorDom) {
      editorDom.focus();
      activeEditor.view?.focus();
    }
  }

  #handleDragEnd(_event: DragEvent): void {
    this.#cancelPendingDragOverSelection();
    // Remove visual feedback
    this.#deps?.getPainterHost()?.classList.remove('drag-over');
  }

  #handleDragLeave(event: DragEvent): void {
    const painterHost = this.#deps?.getPainterHost();
    if (!painterHost) return;

    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !painterHost.contains(relatedTarget)) {
      painterHost.classList.remove('drag-over');
    }
  }

  /**
   * Window-level dragover to allow drops on overlay elements.
   */
  #handleWindowDragOver(event: DragEvent): void {
    if (!hasFieldAnnotationData(event)) return;

    const viewportHost = this.#deps?.getViewportHost();
    const target = event.target as HTMLElement;

    // Only handle if outside viewport (overlay elements)
    if (viewportHost?.contains(target)) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = isInternalDrag(event) ? 'move' : 'copy';
    }

    // Still update cursor position for overlay drops
    this.#handleDragOver(event);
  }

  /**
   * Window-level drop to catch drops on overlay elements.
   */
  #handleWindowDrop(event: DragEvent): void {
    if (!hasFieldAnnotationData(event)) return;

    const viewportHost = this.#deps?.getViewportHost();
    const target = event.target as HTMLElement;

    // Only handle if outside viewport (overlay elements)
    if (viewportHost?.contains(target)) return;

    this.#handleDrop(event);
  }
}
