/**
 * Concrete invalidation handlers for the parts system.
 *
 * Each handler defines what happens when a specific part changes.
 * Registered in `initPartsRuntime` for static parts (numbering, rels)
 * and dynamically at creation time for header/footer parts.
 */

import type { Editor } from '../../Editor.js';
import type { PartChangedEvent, PartId } from '../types.js';
import { registerInvalidationHandler } from './part-invalidation-registry.js';

// ---------------------------------------------------------------------------
// word/numbering.xml
// ---------------------------------------------------------------------------

/**
 * Dispatch an empty PM transaction to trigger list marker recomputation.
 *
 * ProseMirror decorations for list numbering recompute on each transaction.
 * After a numbering part mutation, we dispatch a no-op transaction so the
 * view re-renders with the updated numbering state.
 */
function handleNumberingInvalidation(editor: Editor, _event: PartChangedEvent): void {
  try {
    editor.view?.dispatch?.(editor.state.tr);
  } catch {
    // View may not be ready during initialization
  }
}

// ---------------------------------------------------------------------------
// word/_rels/document.xml.rels
// ---------------------------------------------------------------------------

/**
 * No-op for now. The relationships part has no runtime cache to clear.
 *
 * `findOrCreateRelationship` reads from the canonical XML tree each time,
 * so there is no stale-cache risk. If a lookup cache is added later, this
 * handler should clear it.
 */
function handleRelationshipsInvalidation(_editor: Editor, _event: PartChangedEvent): void {
  // Intentionally empty — no caches to invalidate.
}

// ---------------------------------------------------------------------------
// Header/footer parts (dynamic)
// ---------------------------------------------------------------------------

/**
 * Dispatch a `forceUpdatePagination` transaction to refresh layout.
 *
 * Registered dynamically when a header/footer part is created.
 * All header/footer parts share the same handler logic.
 */
function handleHeaderFooterInvalidation(editor: Editor, _event: PartChangedEvent): void {
  try {
    const tr = editor.state.tr;
    tr.setMeta('forceUpdatePagination', true);
    editor.view?.dispatch?.(tr);
  } catch {
    // View may not be ready
  }
}

// ---------------------------------------------------------------------------
// word/footnotes.xml and word/endnotes.xml
// ---------------------------------------------------------------------------

/**
 * Dispatch a `forceUpdatePagination` transaction after a notes part mutation.
 *
 * Footnote/endnote body changes affect page flow (the note area expands or
 * shrinks), so the layout engine must re-paginate.
 */
function handleNotesInvalidation(editor: Editor, _event: PartChangedEvent): void {
  try {
    const tr = editor.state.tr;
    tr.setMeta('forceUpdatePagination', true);
    editor.view?.dispatch?.(tr);
  } catch {
    // View may not be ready
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register static invalidation handlers. Called from `initPartsRuntime`. */
export function registerStaticInvalidationHandlers(): void {
  registerInvalidationHandler('word/numbering.xml', handleNumberingInvalidation);
  registerInvalidationHandler('word/_rels/document.xml.rels', handleRelationshipsInvalidation);
  registerInvalidationHandler('word/footnotes.xml', handleNotesInvalidation);
  registerInvalidationHandler('word/endnotes.xml', handleNotesInvalidation);
}

/**
 * Register an invalidation handler for a dynamically created header/footer part.
 *
 * Call this after creating a new header/footer part (e.g., `word/header3.xml`).
 * Uses the shared `handleHeaderFooterInvalidation` handler.
 */
export function registerHeaderFooterInvalidation(partId: string): void {
  registerInvalidationHandler(partId as PartId, handleHeaderFooterInvalidation);
}
