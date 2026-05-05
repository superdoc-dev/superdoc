/**
 * `ui.viewport.contextAt({ x, y })` helper. Composes the existing
 * primitives (entityAt, positionAt, the live selection slice, plus an
 * AABB hit-test against the current selection rects) into a single
 * bundle so right-click consumers don't have to stitch them by hand.
 *
 * The bundle is computed once when the menu opens, fed to predicates
 * via `ContextMenuContribution.when`, and threaded into the registered
 * `execute` when the user picks an item via `ContextMenuItem.invoke()`.
 */

import type { ViewportContext, ViewportEntityHit, ViewportPositionHit, ViewportRect, SelectionSlice } from './types.js';

/**
 * Returns true when `(x, y)` lies inside any of the provided
 * viewport-relative rects. Uses inclusive bounds so a click on a
 * rect's edge still counts as "inside" — consumers rendering selection
 * highlights expect right-clicks on the highlight border to be treated
 * as inside the selection.
 *
 * Empty rects array (no live selection / collapsed caret) returns
 * false, which is what `insideSelection` semantically means.
 */
export function pointInsideRects(x: number, y: number, rects: ReadonlyArray<ViewportRect>): boolean {
  for (const rect of rects) {
    if (x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height) {
      return true;
    }
  }
  return false;
}

/**
 * Build the {@link ViewportContext} bundle from already-resolved
 * primitives. The controller calls each primitive itself (entityAt,
 * positionAt, ui.selection.getRects, current selection slice) and
 * passes the results in here so this helper stays pure.
 */
export function buildViewportContext(args: {
  x: number;
  y: number;
  entities: ViewportEntityHit[];
  position: ViewportPositionHit | null;
  selection: SelectionSlice;
  selectionRects: ReadonlyArray<ViewportRect>;
}): ViewportContext {
  return {
    point: { x: args.x, y: args.y },
    entities: args.entities,
    position: args.position,
    selection: args.selection,
    insideSelection: pointInsideRects(args.x, args.y, args.selectionRects),
  };
}
