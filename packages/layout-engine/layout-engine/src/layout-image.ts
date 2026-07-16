import type { ImageBlock, ImageMeasure, ImageFragment, ImageFragmentMetadata } from '@superdoc/contracts';
import { extractBlockPmRange } from './layout-utils.js';
import type { PageState } from './paginator.js';

export type NormalizedColumns = { width: number; gap: number; count: number };

export type ImageLayoutContext = {
  block: ImageBlock;
  measure: ImageMeasure;
  columns: NormalizedColumns;
  ensurePage: () => PageState;
  advanceColumn: (state: PageState) => PageState;
  columnX: (state: PageState, columnIndex?: number) => number;
};

export function layoutImageBlock({
  block,
  measure,
  columns,
  ensurePage,
  advanceColumn,
  columnX,
}: ImageLayoutContext): void {
  // Anchored images are handled via paragraph anchoring pre-pass and paragraph processing.
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

  if (width > maxWidth && maxWidth > 0) {
    const scale = maxWidth / width;
    width = maxWidth;
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

  // Inline/block images advance cursor normally
  if (state.cursorY + requiredHeight > state.contentBottom && state.cursorY > state.topMargin) {
    state = advanceColumn(state);
  }

  const pmRange = extractBlockPmRange(block);

  const aspectRatio = measure.width > 0 && measure.height > 0 ? measure.width / measure.height : 1.0;
  const minWidth = 20;
  const minHeight = minWidth / aspectRatio;

  const metadata: ImageFragmentMetadata = {
    originalWidth: measure.width,
    originalHeight: measure.height,
    maxWidth,
    maxHeight: pageContentHeight,
    aspectRatio,
    minWidth,
    minHeight,
  };

  const fragment: ImageFragment = {
    kind: 'image',
    blockId: block.id,
    x: columnX(state) + marginLeft,
    y: state.cursorY + marginTop,
    width,
    height,
    pmStart: pmRange.pmStart,
    pmEnd: pmRange.pmEnd,
    metadata,
    sourceAnchor: block.sourceAnchor,
  };

  state.page.fragments.push(fragment);
  state.cursorY += requiredHeight;
  state.maxCursorY = Math.max(state.maxCursorY, state.cursorY);
}
