/**
 * Painted-selection rect helper for `superdoc/ui`. Drives
 * `ui.selection.getRects` and `ui.selection.getAnchorRect` so consumers
 * positioning floating UI (bubble menus, link popovers, mention lists)
 * read painted-DOM coordinates instead of the offscreen ProseMirror
 * DOM that `window.getSelection()` reports against.
 */

import type { Editor } from '../editors/v1/core/Editor.js';
import { DocumentApiAdapterError } from '../editors/v1/document-api-adapters/errors.js';
import { resolveTextTarget } from '../editors/v1/document-api-adapters/helpers/adapter-utils.js';
import type { SelectionCapture, SelectionAnchorRectOptions, ViewportRect } from './types.js';

interface RawRangeRect {
  pageIndex: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

// Captures whose target lives in a non-body story (header, footer,
// footnote, endnote) need a story-aware rect resolver on
// `PresentationEditor` that doesn't yet exist publicly. The live path
// works for non-body selections because `presentationEditor
// .getSelectionRects()` calls `getActiveEditor()` internally and
// dispatches to the right surface; the captured path can't, because by
// the time the consumer is asking for rects, focus has often moved away
// (composer textarea, sidebar, modal) and the active surface is back on
// body. Until a follow-up surfaces a `getRangeRectsForStory(from, to,
// story)` primitive, captures referencing non-body stories return [].
// Same posture as `scroll-into-view`'s text-anchored path.
function captureIsBodyOnly(capture: SelectionCapture): boolean {
  const story = (capture.target as { story?: unknown } | null)?.story;
  if (story === undefined || story === null) return true;
  if (typeof story === 'string') return story === 'body';
  if (typeof story === 'object') {
    const kind = (story as { kind?: unknown }).kind;
    return kind === undefined || kind === 'body';
  }
  return true;
}

/**
 * Resolve the painted rects of the current selection, or of a captured
 * one when `capture` is provided. Empty array when the editor has no
 * presentation layer (SSR / non-paginated mounts), no current selection,
 * or a stale capture whose target no longer resolves.
 *
 * Captures referencing non-body stories return [] — the underlying
 * story-aware rect resolver is a follow-up (body-only matches the same
 * posture as `scroll-into-view`'s text-anchored path).
 */
export function getSelectionRects(editor: Editor | null, capture?: SelectionCapture | null): ViewportRect[] {
  const presentation = editor?.presentationEditor;
  if (!presentation) return [];

  if (capture) {
    if (!captureIsBodyOnly(capture)) return [];
    return getCapturedSelectionRects(editor!, capture);
  }

  if (typeof presentation.getSelectionRects !== 'function') return [];
  try {
    const rects = presentation.getSelectionRects();
    return rects.map(toViewportRect);
  } catch {
    return [];
  }
}

/**
 * Single anchor rect derived from {@link getSelectionRects}. Returns
 * `null` when the selection produces no painted rects.
 */
export function getSelectionAnchorRect(
  editor: Editor | null,
  options?: SelectionAnchorRectOptions,
  capture?: SelectionCapture | null,
): ViewportRect | null {
  const rects = getSelectionRects(editor, capture);
  if (rects.length === 0) return null;

  const placement = options?.placement ?? 'start';
  if (placement === 'end') return rects[rects.length - 1]!;
  if (placement === 'union') return computeUnionRect(rects);
  return rects[0]!;
}

function getCapturedSelectionRects(editor: Editor, capture: SelectionCapture): ViewportRect[] {
  const presentation = editor.presentationEditor;
  if (!presentation || typeof presentation.getRangeRects !== 'function') return [];

  const segments = capture.target?.segments;
  if (!segments || segments.length === 0) return [];

  // Multi-segment captures collapse to one PM range bounded by the
  // first segment's start and the last segment's end — matching how
  // the doc-api represents a selection in the unified PM document.
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
  } catch (err) {
    // resolveTextTarget re-throws AMBIGUOUS_TARGET so callers can log
    // the precise diagnostic. Surface it to the console rather than
    // swallowing silently — bare `return []` would hide a real document
    // problem (two blocks sharing an id) behind "no rects".
    if (err instanceof DocumentApiAdapterError) {
      console.warn(`[superdoc/ui] ui.selection.getRects: ${err.code}: ${err.message}`);
    }
    return [];
  }
  if (!fromResolved || !toResolved) return [];

  try {
    const rects = presentation.getRangeRects(fromResolved.from, toResolved.to);
    return rects.map(toViewportRect);
  } catch {
    return [];
  }
}

function toViewportRect(rect: RawRangeRect): ViewportRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    pageIndex: rect.pageIndex,
  };
}

function computeUnionRect(rects: ViewportRect[]): ViewportRect {
  let top = Infinity;
  let left = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;
  // Page index of the union is the first rect's page; multi-page
  // selections lose page granularity here, but the union shape is what
  // a single-rect overlay needs.
  const pageIndex = rects[0]!.pageIndex;
  for (const rect of rects) {
    if (rect.top < top) top = rect.top;
    if (rect.left < left) left = rect.left;
    if (rect.top + rect.height > bottom) bottom = rect.top + rect.height;
    if (rect.left + rect.width > right) right = rect.left + rect.width;
  }
  return { top, left, width: right - left, height: bottom - top, pageIndex };
}
