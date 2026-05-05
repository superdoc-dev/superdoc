/**
 * `ui.selection.restore(capture)` helper. Resolves a captured target
 * back into PM positions on the routed editor and dispatches the
 * `setTextSelection` command so the visible selection rejoins where
 * the user originally was. Closes the round-trip a sidebar composer
 * needs (capture on open → restore on close).
 */

import type { Editor } from '../editors/v1/core/Editor.js';
import { resolveTextTarget } from '../editors/v1/document-api-adapters/helpers/adapter-utils.js';
import type { SelectionCapture, SelectionRestoreResult } from './types.js';

const SUCCESS: SelectionRestoreResult = { success: true };

export function restoreSelection(editor: Editor | null, capture: SelectionCapture): SelectionRestoreResult {
  if (!editor) return { success: false, reason: 'not-ready' };

  // Read-only mode (viewing) refuses selection mutation. Same posture
  // as a doc-api mutation against an editor in `viewing` mode — the
  // editor is observable but not addressable.
  if (editor.isEditable === false) return { success: false, reason: 'read-only' };

  const setTextSelection = editor.commands?.setTextSelection;
  if (typeof setTextSelection !== 'function') return { success: false, reason: 'not-ready' };

  const segments = capture.target?.segments;
  if (!segments || segments.length === 0) return { success: false, reason: 'missing-target' };

  // Multi-segment captures collapse to a single PM range bounded by
  // the first segment's start and the last segment's end — same
  // shape `selection-rects.ts` uses, and matches how the doc-api
  // represents a selection in the unified PM document.
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;

  let fromResolved: { from: number; to: number } | null = null;
  let toResolved: { from: number; to: number } | null = null;
  try {
    fromResolved = resolveTextTarget(editor, {
      kind: 'text',
      blockId: first.blockId,
      range: first.range,
    });
    toResolved = resolveTextTarget(editor, {
      kind: 'text',
      blockId: last.blockId,
      range: last.range,
    });
  } catch {
    // Ambiguous block ids (resolveTextTarget throws when two blocks
    // share an id) collapse to 'stale'. The sibling
    // `ui.selection.getRects(capture)` path surfaces a console.warn
    // for the same condition because rect lookups can run on every
    // scroll/resize and a per-frame warn would still be one-shot per
    // capture; restore runs once on composer close, so the typed
    // `'stale'` reason is enough — consumers branching on the result
    // can log themselves if they care.
    return { success: false, reason: 'stale' };
  }
  if (!fromResolved || !toResolved) return { success: false, reason: 'stale' };

  const ok = setTextSelection({ from: fromResolved.from, to: toResolved.to });
  if (!ok) return { success: false, reason: 'stale' };
  return SUCCESS;
}
