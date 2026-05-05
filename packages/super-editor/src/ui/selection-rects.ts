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

/**
 * Resolve the painted rects of the current selection, or of a captured
 * one when `capture` is provided. Empty array when the editor has no
 * presentation layer (SSR / non-paginated mounts), no current selection,
 * or a stale capture whose target no longer resolves.
 *
 * Two editors are accepted because the capture path needs both:
 * - `hostEditor` owns the presentation layer (`getRangeRects`).
 * - `routedEditor` owns the PM document that captured block ids belong
 *   to. For body-only captures these are the same instance; for
 *   captures taken while editing a header / footer / footnote /
 *   endnote, the routed editor is the story editor.
 *
 * The live path uses only `hostEditor.presentationEditor.getSelectionRects()`,
 * which routes through its internal `getActiveEditor()` and works on
 * every surface.
 */
export function getSelectionRects(
  hostEditor: Editor | null,
  routedEditor: Editor | null,
  capture?: SelectionCapture | null,
): ViewportRect[] {
  const presentation = hostEditor?.presentationEditor;
  if (!presentation) return [];

  if (capture) {
    return getCapturedSelectionRects(hostEditor!, routedEditor ?? hostEditor!, capture);
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
  hostEditor: Editor | null,
  routedEditor: Editor | null,
  options?: SelectionAnchorRectOptions,
  capture?: SelectionCapture | null,
): ViewportRect | null {
  const rects = getSelectionRects(hostEditor, routedEditor, capture);
  if (rects.length === 0) return null;

  const placement = options?.placement ?? 'start';
  if (placement === 'end') return rects[rects.length - 1]!;
  if (placement === 'union') return computeUnionRect(rects);
  return rects[0]!;
}

function getCapturedSelectionRects(
  hostEditor: Editor,
  routedEditor: Editor,
  capture: SelectionCapture,
): ViewportRect[] {
  const presentation = hostEditor.presentationEditor;
  if (!presentation || typeof presentation.getRangeRects !== 'function') return [];

  const segments = capture.target?.segments;
  if (!segments || segments.length === 0) return [];

  // Multi-segment captures collapse to one PM range bounded by the
  // first segment's start and the last segment's end — matching how
  // the doc-api represents a selection in the unified PM document.
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;

  // Resolve block ids against the routed editor so captures taken in
  // header / footer / footnote / endnote stories still resolve while
  // the user remains in that story (the routed editor is the one whose
  // PM document those block ids belong to). When focus has moved
  // elsewhere by call time, the routed editor falls back to the body,
  // and a non-body capture's block ids won't resolve there — the
  // function returns [] gracefully.
  let fromResolved: { from: number; to: number } | null = null;
  let toResolved: { from: number; to: number } | null = null;
  try {
    fromResolved = resolveTextTarget(routedEditor, {
      kind: 'text',
      blockId: first.blockId,
      range: first.range,
    });
    toResolved = resolveTextTarget(routedEditor, {
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
