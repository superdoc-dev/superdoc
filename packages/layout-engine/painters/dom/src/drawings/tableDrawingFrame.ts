import type { DrawingBlock, SdtMetadata } from '@superdoc/contracts';
import { createDrawingImageElement } from '../images/drawing-image.js';
import type { BuildImageHyperlinkAnchor } from '../images/types.js';
import { createDrawingPlaceholder } from './renderDrawingContent.js';

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
  renderDrawingContent?: (block: DrawingBlock, options?: { clipContainer?: HTMLElement }) => HTMLElement;
  buildImageHyperlinkAnchor: BuildImageHyperlinkAnchor;
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
  buildImageHyperlinkAnchor,
  applySdtDataset,
}: RenderTableDrawingFrameParams): HTMLElement => {
  const drawingWrapper = doc.createElement('div');
  drawingWrapper.style.position = position;
  if (left != null) {
    drawingWrapper.style.left = `${left}px`;
  }
  if (top != null) {
    drawingWrapper.style.top = `${top}px`;
  }
  drawingWrapper.style.width = `${width}px`;
  drawingWrapper.style.height = `${height}px`;
  if (flexShrink != null) {
    drawingWrapper.style.flexShrink = flexShrink;
  }
  drawingWrapper.style.maxWidth = '100%';
  drawingWrapper.style.boxSizing = 'border-box';
  if (zIndex != null) {
    drawingWrapper.style.zIndex = String(zIndex);
  }
  applySdtDataset(drawingWrapper, block.attrs?.sdt as SdtMetadata | undefined);

  const drawingInner = doc.createElement('div');
  drawingInner.classList.add('superdoc-table-drawing');
  drawingInner.style.width = '100%';
  drawingInner.style.height = '100%';
  drawingInner.style.display = 'flex';
  drawingInner.style.alignItems = 'center';
  drawingInner.style.justifyContent = 'center';
  drawingInner.style.overflow = 'hidden';

  const drawingContent =
    block.drawingKind === 'image'
      ? createDrawingImageElement(doc, block, buildImageHyperlinkAnchor, drawingInner)
      : (renderDrawingContent?.(block, { clipContainer: drawingInner }) ?? createDrawingPlaceholder(doc));
  drawingContent.style.width = '100%';
  drawingContent.style.height = '100%';
  drawingInner.appendChild(drawingContent);

  drawingWrapper.appendChild(drawingInner);
  return drawingWrapper;
};
