import type { DrawingBlock, SdtMetadata } from '@superdoc/contracts';
import { renderDrawingFrame, type RenderDrawingContentForPlacement } from './drawingFrame.js';

export type RenderTableDrawingFrameParams = {
  doc: Document;
  block: DrawingBlock;
  width: number;
  height: number;
  position: 'relative' | 'absolute';
  left?: number;
  top?: number;
  zIndex?: number;
  flexShrink?: string;
  renderDrawingContent?: RenderDrawingContentForPlacement;
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
};

export const renderTableDrawingFrame = ({
  doc,
  block,
  width,
  height,
  position,
  left,
  top,
  zIndex,
  flexShrink,
  renderDrawingContent,
  applySdtDataset,
}: RenderTableDrawingFrameParams): HTMLElement => {
  return renderDrawingFrame({
    doc,
    block,
    width,
    height,
    placement:
      position === 'absolute'
        ? { mode: 'anchored-table-cell', left: left ?? 0, top: top ?? 0, zIndex }
        : { mode: 'flowing-table-cell', flexShrink },
    className: 'superdoc-table-drawing',
    suppressTransforms: true,
    renderDrawingContent,
    applySdtDataset,
  });
};

export type { RenderDrawingContentForPlacement };
