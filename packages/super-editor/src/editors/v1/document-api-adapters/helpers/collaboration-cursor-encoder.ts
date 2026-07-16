/**
 * Collaboration-cursor encoder: converts a Document API SelectionTarget into
 * the Yjs awareness `cursor` payload (relative anchor/head positions).
 *
 * This is the engine's single source of truth for "selection target to awareness
 * cursor", so hosts and apps never import y-prosemirror or reach into editor
 * internals to publish presence. It mirrors the encode-and-guard logic in
 * `RemoteCursorManager.updateLocalCursor` (the read/render side lives in
 * `RemoteCursorAwareness.normalizeAwarenessStates`), but resolves an arbitrary
 * SelectionTarget rather than the local editor selection.
 */

import { ySyncPluginKey, absolutePositionToRelativePosition } from 'y-prosemirror';
import type { SelectionTarget } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { resolveSelectionTarget } from './selection-target-resolver.js';

/** The Yjs awareness `cursor` field shape consumed by the cursor render side. */
export interface CollaborationCursorPayload {
  anchor: unknown;
  head: unknown;
}

/**
 * Encode a SelectionTarget into a collaboration-cursor awareness payload.
 *
 * Returns `null` when the editor has no collaborative Yjs binding (no ySync
 * plugin / binding mapping), or when position conversion fails. Callers should
 * treat `null` as "not a collaborative session". Target-shape and
 * target-not-found errors propagate from {@link resolveSelectionTarget} so the
 * caller surfaces them; this function does not invent a looser shape.
 *
 * @param editor - The engine editor (collaboratively bound).
 * @param target - A Document API SelectionTarget (a collapsed start==end target is a caret).
 */
export function encodeCollaborationCursorFromSelectionTarget(
  editor: Editor,
  target: SelectionTarget,
): CollaborationCursorPayload | null {
  const { absFrom, absTo } = resolveSelectionTarget(editor, target);

  const ystate = ySyncPluginKey.getState(editor.state);
  if (!ystate?.binding?.mapping) return null;

  // Position conversion can throw during document restructuring; mirror
  // RemoteCursorManager.updateLocalCursor and treat any failure as "no cursor"
  // (returns null), honoring this function's documented contract.
  try {
    const anchor = absolutePositionToRelativePosition(absFrom, ystate.type, ystate.binding.mapping);
    const head = absolutePositionToRelativePosition(absTo, ystate.type, ystate.binding.mapping);
    if (!anchor || !head) return null;

    return { anchor, head };
  } catch {
    return null;
  }
}
