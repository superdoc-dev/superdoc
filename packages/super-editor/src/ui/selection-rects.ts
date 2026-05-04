/**
 * Painted-selection rect helper for `superdoc/ui`. Drives
 * `ui.selection.getRects` and `ui.selection.getAnchorRect` so consumers
 * positioning floating UI (bubble menus, link popovers, mention lists)
 * read painted-DOM coordinates instead of the offscreen ProseMirror
 * DOM that `window.getSelection()` reports against.
 */

import type { Editor } from '../editors/v1/core/Editor.js';
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

/**
 * Resolve the painted rects of the current selection, or of a captured
 * one when `capture` is provided. Empty array when the editor has no
 * presentation layer (SSR / non-paginated mounts), no current selection,
 * or a stale capture whose target no longer resolves.
 */
export function getSelectionRects(editor: Editor | null, capture?: SelectionCapture | null): ViewportRect[] {
  const presentation = editor?.presentationEditor;
  if (!presentation) return [];

  if (capture) {
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

  // Multi-segment selections span multiple blocks but produce a single
  // continuous PM range — `from` is the first segment's start, `to` is
  // the last segment's end. Resolving each end independently keeps the
  // logic simple and matches how the doc-api represents the selection
  // internally.
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
