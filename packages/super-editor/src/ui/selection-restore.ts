/**
 * `ui.selection.restore(capture)` helper. Resolves a captured target
 * back into PM positions on the routed editor and dispatches the
 * `setTextSelection` command so the visible selection rejoins where
 * the user originally was. Closes the round-trip a sidebar composer
 * needs (capture on open → restore on close).
 */

import type { StoryLocator } from '@superdoc/document-api';
import type { Editor } from '../editors/v1/core/Editor.js';
import { resolveTextTarget } from '../editors/v1/document-api-adapters/helpers/adapter-utils.js';
import type { SelectionCapture, SelectionRestoreResult } from './types.js';

const SUCCESS: SelectionRestoreResult = { success: true };

export function restoreSelection(
  editor: Editor | null,
  capture: SelectionCapture,
  options: { activeStory?: StoryLocator | null } = {},
): SelectionRestoreResult {
  if (!editor) return { success: false, reason: 'not-ready' };

  // Read-only mode (viewing) refuses selection mutation. Same posture
  // as a doc-api mutation against an editor in `viewing` mode — the
  // editor is observable but not addressable.
  if (editor.isEditable === false) return { success: false, reason: 'read-only' };

  const setTextSelection = editor.commands?.setTextSelection;
  if (typeof setTextSelection !== 'function') return { success: false, reason: 'not-ready' };

  // SD-2954: when the capture carries a `story` locator, the
  // captured block ids only make sense in that story's PM doc. If
  // the user has switched surfaces between capture and restore (e.g.
  // capture in a header, restore after focus moved back to body),
  // the routed editor is body, the captured ids won't resolve, and
  // we'd otherwise reach `resolveTextTarget` only to fail there with
  // a less-specific reason. Compare the captured story against the
  // currently routed story up-front so the typed `'stale'` reflects
  // the real reason. Runs after `isEditable` and the
  // `setTextSelection` guard so read-only / unmounted editors
  // continue to surface their existing typed reasons regardless of
  // whether the capture carries a story. Captures with no story keep
  // current behavior (resolve against the routed editor, which is
  // body in the common case).
  const capturedStory = (capture.target as { story?: StoryLocator } | null | undefined)?.story ?? null;
  if (capturedStory) {
    if (!storyMatches(options.activeStory ?? null, capturedStory)) {
      return { success: false, reason: 'stale' };
    }
  }

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

  // Block id + range can both still resolve while the text inside the
  // range has shifted — a collaborator inserts text earlier in the
  // same paragraph, the offsets stay in-bounds, the resolved position
  // is now over different content than the user originally selected.
  // Compare the live text at the resolved range against the snapshot
  // the capture froze (`quotedText` mirrors
  // `state.doc.textBetween(from, to, ' ')` at capture time per the
  // selection-info resolver). Skip the check when the capture was
  // collapsed (`quotedText === ''`) — there's no range to misplace.
  if (capture.quotedText !== '') {
    const liveText = editor.state?.doc?.textBetween?.(fromResolved.from, toResolved.to, ' ');
    if (typeof liveText === 'string' && liveText !== capture.quotedText) {
      return { success: false, reason: 'stale' };
    }
  }

  const ok = setTextSelection({ from: fromResolved.from, to: toResolved.to });
  if (!ok) return { success: false, reason: 'stale' };
  return SUCCESS;
}

/**
 * Compare a captured story locator against the currently routed
 * story. Returns `true` only when both locators target the same
 * story surface. The match is keyed on the discriminating fields of
 * the StoryLocator union (storyType + per-variant id) so two
 * different headers in the same document resolve as different
 * stories. Same shape `buildSelectionKey` already uses to memoize
 * the slice.
 */
function storyMatches(a: StoryLocator | null, b: StoryLocator | null): boolean {
  if (!a || !b) return false;
  if (a.storyType !== b.storyType) return false;
  const ax = a as unknown as Record<string, unknown>;
  const bx = b as unknown as Record<string, unknown>;
  if (ax.refId !== bx.refId) return false;
  if (ax.noteId !== bx.noteId) return false;
  if (ax.headerFooterKind !== bx.headerFooterKind) return false;
  if (ax.variant !== bx.variant) return false;
  const aSection = JSON.stringify(ax.section ?? null);
  const bSection = JSON.stringify(bx.section ?? null);
  return aSection === bSection;
}
