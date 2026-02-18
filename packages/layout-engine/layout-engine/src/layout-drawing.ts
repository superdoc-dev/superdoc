import type { DrawingBlock, DrawingMeasure, DrawingFragment } from '@superdoc/contracts';
import type { NormalizedColumns } from './layout-image.js';
import type { PageState } from './paginator.js';
import { extractBlockPmRange } from './layout-utils.js';
import { getFragmentZIndex } from '@superdoc/pm-adapter/utilities.js';

/**
 * Context for laying out a drawing block (vector shape) within the page layout.
 *
 * Drawings are vector-based graphical objects (shapes, diagrams, etc.) that can be
 * positioned inline or anchored. This context provides all necessary information and
 * callbacks for positioning the drawing fragment on the current page/column.
 */
export type DrawingLayoutContext = {
  /** The drawing block to layout */
  block: DrawingBlock;
  /** Measured dimensions and geometry data for the drawing */
  measure: DrawingMeasure;
  /** Normalized column configuration (width, gap, count) for the current layout */
  columns: NormalizedColumns;
  /** Ensures a page exists and returns the current page state */
  ensurePage: () => PageState;
  /** Advances to the next column or page, returning the new page state */
  advanceColumn: (state: PageState) => PageState;
  /** Computes the X coordinate for a given column index */
  columnX: (columnIndex: number) => number;
};

/**
 * Layout a drawing block (vector shape) within the document flow.
 *
 * This function handles inline/block-level vector shapes (rectangles, circles, etc.),
 * positioning them on the page with proper scaling and margin handling. Anchored
 * drawings (positioned objects) are skipped and handled separately via the anchoring
 * system.
 *
 * Algorithm:
 * 1. Skip anchored drawings (handled by anchor system)
 * 2. Apply margins and scale drawing to fit within column width
 * 3. Scale down if drawing exceeds page content height
 * 4. Advance column/page if drawing doesn't fit at current cursor position
 * 5. Create DrawingFragment with final position and dimensions
 * 6. Push fragment to page and advance cursor
 *
 * @param context - Layout context containing block, measure, and layout callbacks
 *
 * @remarks
 * **Side Effects:**
 * - Mutates page state via `ensurePage()` and `advanceColumn()`
 * - Pushes DrawingFragment to `state.page.fragments`
 * - Advances `state.cursorY` by the drawing's total height (including margins)
 *
 * **Scaling Behavior:**
 * - Width is constrained to fit within column width (minus margins)
 * - Height is constrained to fit within page content height
 * - Aspect ratio is preserved during scaling
 *
 * **Anchored Drawings:**
 * - Anchored drawings (`block.anchor?.isAnchored === true`) are skipped
 * - They are positioned via the paragraph anchoring pre-pass
 */
export function layoutDrawingBlock({
  block,
  measure,
  columns,
  ensurePage,
  advanceColumn,
  columnX,
}: DrawingLayoutContext): void {
  if (block.anchor?.isAnchored) {
    return;
  }

  const marginTop = Math.max(0, block.margin?.top ?? 0);
  const marginBottom = Math.max(0, block.margin?.bottom ?? 0);
  const marginLeft = Math.max(0, block.margin?.left ?? 0);
  const marginRight = Math.max(0, block.margin?.right ?? 0);

  const maxWidth = Math.max(0, columns.width - (marginLeft + marginRight));
  let width = measure.width;
  let height = measure.height;

  const attrs = block.attrs as Record<string, unknown> | undefined;
  const indentLeft = typeof attrs?.hrIndentLeft === 'number' ? attrs.hrIndentLeft : 0;
  const indentRight = typeof attrs?.hrIndentRight === 'number' ? attrs.hrIndentRight : 0;
  const maxWidthForBlock =
    attrs?.isFullWidth === true && maxWidth > 0 ? Math.max(1, maxWidth - indentLeft - indentRight) : maxWidth;

  if (width > maxWidthForBlock && maxWidthForBlock > 0) {
    const scale = maxWidthForBlock / width;
    width = maxWidthForBlock;
    height *= scale;
  }

  let state = ensurePage();
  const pageContentHeight = Math.max(0, state.contentBottom - state.topMargin);
  if (height > pageContentHeight && pageContentHeight > 0) {
    const scale = pageContentHeight / height;
    height = pageContentHeight;
    width *= scale;
  }

  const requiredHeight = marginTop + height + marginBottom;

  if (state.cursorY + requiredHeight > state.contentBottom && state.cursorY > state.topMargin) {
    state = advanceColumn(state);
  }

  const pmRange = extractBlockPmRange(block);

  const fragment: DrawingFragment = {
    kind: 'drawing',
    blockId: block.id,
    drawingKind: block.drawingKind,
    x: columnX(state.columnIndex) + marginLeft + indentLeft,
    y: state.cursorY + marginTop,
    width,
    height,
    geometry: measure.geometry,
    scale: measure.scale,
    drawingContentId: block.drawingContentId,
    zIndex: getFragmentZIndex(block),
    pmStart: pmRange.pmStart,
    pmEnd: pmRange.pmEnd,
  };

  state.page.fragments.push(fragment);
  state.cursorY += requiredHeight;
}
