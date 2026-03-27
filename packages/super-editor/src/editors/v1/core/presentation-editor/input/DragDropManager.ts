/**
 * DragDropManager - Consolidated drag and drop handling for PresentationEditor.
 *
 * This manager handles all drag/drop events for:
 * - Field annotations (internal moves and external inserts)
 * - Image files (drag from OS/other apps into the editor)
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

/** Classifies what kind of data a drag event carries. */
export type DropPayloadKind = 'fieldAnnotation' | 'imageFiles' | 'none';

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
 * Callback to process and insert a single image file into the editor.
 */
export type ImageInsertHandler = (params: {
  file: File;
  editor: Editor;
  view: Editor['view'];
  editorOptions: Editor['options'];
  getMaxContentSize: () => { width?: number; height?: number };
}) => Promise<'success' | 'skipped'>;

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
  /** Handler for inserting a single dropped image file */
  insertImageFile: ImageInsertHandler;
};

// =============================================================================
// Helpers — Field Annotations
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
// Helpers — Payload Classification
// =============================================================================

/**
 * Checks if a drag event may contain files.
 *
 * During dragover, `dataTransfer.files` is empty due to browser security
 * restrictions — only `dataTransfer.types` is available. This function checks
 * the types array, which works for both dragover and drop events.
 *
 * Note: This cannot distinguish image files from other file types during
 * dragover. Actual image filtering happens at drop time via `getDroppedImageFiles`.
 */
export function hasPossibleFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types?.includes('Files') ?? false;
}

/** Image extensions used as fallback when File.type is empty. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif']);

/**
 * Checks whether a File looks like an image by MIME type or, when the type
 * is empty (some OS/browser drag sources omit it), by file extension.
 */
function looksLikeImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  if (file.type === '') {
    const dotIndex = file.name.lastIndexOf('.');
    if (dotIndex !== -1) {
      return IMAGE_EXTENSIONS.has(file.name.slice(dotIndex).toLowerCase());
    }
  }
  return false;
}

/**
 * Extracts image File objects from a drop event's dataTransfer.
 * Only usable on drop events — files are not accessible during dragover.
 */
export function getDroppedImageFiles(event: DragEvent): File[] {
  const files = event.dataTransfer?.files;
  if (!files) return [];
  const images: File[] = [];
  for (let i = 0; i < files.length; i++) {
    if (looksLikeImage(files[i])) {
      images.push(files[i]);
    }
  }
  return images;
}

/**
 * Classifies the drag payload kind. Evaluated in order — first match wins.
 *
 * Field annotations take precedence over files in mixed payloads,
 * since they are an internal editor concept with stricter semantics.
 *
 * During dragover, this returns 'imageFiles' for any file drag (since we
 * can't inspect file types yet). On drop, callers use `getDroppedImageFiles`
 * to filter to actual images.
 */
export function getDropPayloadKind(event: DragEvent): DropPayloadKind {
  if (hasFieldAnnotationData(event)) return 'fieldAnnotation';
  if (hasPossibleFiles(event)) return 'imageFiles';
  return 'none';
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

    // Attach listeners to viewport host (for all drags including external image files)
    viewportHost.addEventListener('dragover', this.#boundHandleDragOver);
    viewportHost.addEventListener('drop', this.#boundHandleDrop);
    viewportHost.addEventListener('dragleave', this.#boundHandleDragLeave);

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
    if (this.#boundHandleDragOver) {
      viewportHost.removeEventListener('dragover', this.#boundHandleDragOver);
    }
    if (this.#boundHandleDrop) {
      viewportHost.removeEventListener('drop', this.#boundHandleDrop);
    }
    if (this.#boundHandleDragLeave) {
      viewportHost.removeEventListener('dragleave', this.#boundHandleDragLeave);
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
  // Event Handlers — Top-level entry points
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
   * Handle dragover - branch by payload kind and update cursor position.
   */
  #handleDragOver(event: DragEvent): void {
    if (!this.#deps) return;

    const kind = getDropPayloadKind(event);
    if (kind === 'none') return;

    const activeEditor = this.#deps.getActiveEditor();
    if (!activeEditor?.isEditable) return;

    event.preventDefault();

    if (event.dataTransfer) {
      if (kind === 'fieldAnnotation') {
        event.dataTransfer.dropEffect = isInternalDrag(event) ? 'move' : 'copy';
      } else {
        event.dataTransfer.dropEffect = 'copy';
      }
    }

    // Coalesce dragover selection updates to one per animation frame.
    this.#scheduleDragOverSelection(event.clientX, event.clientY);
  }

  /**
   * Handle drop - branch by payload kind and dispatch to the appropriate handler.
   */
  #handleDrop(event: DragEvent): void {
    if (!this.#deps) return;

    const kind = getDropPayloadKind(event);
    if (kind === 'none') return;

    event.preventDefault();
    event.stopPropagation();
    this.#cancelPendingDragOverSelection();

    const activeEditor = this.#deps.getActiveEditor();
    if (!activeEditor?.isEditable) return;

    if (kind === 'imageFiles') {
      this.#handleImageDrop(event);
      return;
    }

    // Field annotation drop
    const { state, view } = activeEditor;
    if (!state || !view) return;

    const hit = this.#deps.hitTest(event.clientX, event.clientY);
    const fallbackPos = state.selection?.from ?? state.doc?.content.size ?? null;
    const dropPos = hit?.pos ?? fallbackPos;
    if (dropPos == null) return;

    if (isInternalDrag(event)) {
      this.#handleInternalDrop(event, dropPos);
      return;
    }

    this.#handleExternalDrop(event, dropPos);
  }

  #handleDragEnd(_event: DragEvent): void {
    this.#cancelPendingDragOverSelection();
    this.#deps?.getPainterHost()?.classList.remove('drag-over');
  }

  #handleDragLeave(event: DragEvent): void {
    const viewportHost = this.#deps?.getViewportHost();
    if (!viewportHost) return;

    // Only clean up when the drag truly leaves the viewport, not when
    // crossing internal child element boundaries.
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && viewportHost.contains(relatedTarget)) return;

    this.#cancelPendingDragOverSelection();
    this.#deps?.getPainterHost()?.classList.remove('drag-over');
  }

  // ==========================================================================
  // RAF Coalescing — Shared by all payload kinds during dragover
  // ==========================================================================

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

  // ==========================================================================
  // Image Drop
  // ==========================================================================

  /**
   * Handle drop of image files from the OS or another application.
   */
  async #handleImageDrop(event: DragEvent): Promise<void> {
    if (!this.#deps) return;

    const activeEditor = this.#deps.getActiveEditor();
    const { state, view } = activeEditor;
    if (!state || !view) return;

    const imageFiles = getDroppedImageFiles(event);
    if (imageFiles.length === 0) return;

    // Resolve insertion position: hitTest → current selection → document end
    const dropPos = this.#resolveDropPosition(event.clientX, event.clientY);
    if (dropPos == null) return;

    // Set selection at drop position before inserting
    this.#setSelectionAt(dropPos);

    // Process files sequentially for deterministic ordering.
    // Errors on individual files are caught so remaining files still insert.
    for (const file of imageFiles) {
      try {
        await this.#deps.insertImageFile({
          file,
          editor: activeEditor,
          view: activeEditor.view,
          editorOptions: activeEditor.options,
          getMaxContentSize: () => activeEditor.getMaxContentSize(),
        });
      } catch {
        // Skip failed file, continue with remaining
      }
    }

    // Focus editor and update selection overlay
    this.#focusEditor();
    this.#deps.scheduleSelectionUpdate();
  }

  /**
   * Resolves a drop position using the hitTest → selection → document-end fallback chain.
   */
  #resolveDropPosition(clientX: number, clientY: number): number | null {
    if (!this.#deps) return null;

    const activeEditor = this.#deps.getActiveEditor();
    const { state } = activeEditor;
    if (!state) return null;

    const hit = this.#deps.hitTest(clientX, clientY);
    if (hit?.pos != null) return hit.pos;

    // Fallback: current PM selection position
    if (state.selection?.from != null) return state.selection.from;

    // Last resort: document end
    return state.doc?.content.size ?? null;
  }

  /**
   * Sets a text selection at the given position (clamped to document bounds).
   */
  #setSelectionAt(pos: number): void {
    if (!this.#deps) return;

    const activeEditor = this.#deps.getActiveEditor();
    const doc = activeEditor.state?.doc;
    if (!doc) return;

    const clampedPos = Math.min(Math.max(pos, 1), doc.content.size);
    try {
      const tr = activeEditor.state.tr
        .setSelection(TextSelection.create(doc, clampedPos))
        .setMeta('addToHistory', false);
      activeEditor.view?.dispatch(tr);
    } catch {
      // Position may be invalid during layout updates
    }
  }

  /**
   * Focuses the hidden ProseMirror editor after a drop.
   */
  #focusEditor(): void {
    if (!this.#deps) return;
    const activeEditor = this.#deps.getActiveEditor();
    const editorDom = activeEditor.view?.dom as HTMLElement | undefined;
    if (editorDom) {
      editorDom.focus();
      activeEditor.view?.focus();
    }
  }

  // ==========================================================================
  // Field Annotation Drop
  // ==========================================================================

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

    this.#focusEditor();
  }

  // ==========================================================================
  // Window-level Fallback
  // ==========================================================================

  /**
   * Window-level dragover to allow drops on overlay elements.
   * Prevents browser default navigation for both field annotations and files.
   */
  #handleWindowDragOver(event: DragEvent): void {
    const kind = getDropPayloadKind(event);
    if (kind === 'none') return;

    const viewportHost = this.#deps?.getViewportHost();
    const target = event.target as HTMLElement;

    // Only handle if outside viewport (overlay elements)
    if (viewportHost?.contains(target)) return;

    event.preventDefault();

    if (event.dataTransfer) {
      if (kind === 'fieldAnnotation') {
        event.dataTransfer.dropEffect = isInternalDrag(event) ? 'move' : 'copy';
      } else {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  /**
   * Window-level drop to catch drops on overlay elements.
   * Routes all recognized payloads through `#handleDrop` so images and
   * field annotations both work when dropped on overlays.
   */
  #handleWindowDrop(event: DragEvent): void {
    const kind = getDropPayloadKind(event);
    if (kind === 'none') return;

    const viewportHost = this.#deps?.getViewportHost();
    const target = event.target as HTMLElement;

    // Only handle if outside viewport (overlay elements)
    if (viewportHost?.contains(target)) return;

    this.#handleDrop(event);
  }
}
