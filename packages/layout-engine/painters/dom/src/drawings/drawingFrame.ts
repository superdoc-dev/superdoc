import type { DrawingBlock, SdtMetadata } from '@superdoc/contracts';
import { createDrawingPlaceholder } from './placeholder.js';

export type RenderDrawingContentForPlacement = (
  block: DrawingBlock,
  options?: { clipContainer?: HTMLElement },
) => HTMLElement;

export type DrawingFramePlacement =
  | { mode: 'flowing-table-cell'; flexShrink?: string; left?: never; top?: never; zIndex?: never }
  | { mode: 'anchored-table-cell'; left: number; top: number; zIndex?: number; flexShrink?: never };

export type RenderDrawingFrameParams = {
  doc: Document;
  block: DrawingBlock;
  width: number;
  height: number;
  placement: DrawingFramePlacement;
  className: string;
  renderDrawingContent?: RenderDrawingContentForPlacement;
  applySdtDataset?: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
};

export const renderDrawingFrame = ({
  doc,
  block,
  width,
  height,
  placement,
  className,
  renderDrawingContent,
  applySdtDataset,
}: RenderDrawingFrameParams): HTMLElement => {
  const wrapper = doc.createElement('div');
  wrapper.style.position = placement.mode === 'anchored-table-cell' ? 'absolute' : 'relative';
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.overflow = 'hidden';
  if (placement.mode === 'anchored-table-cell' || placement.mode === 'flowing-table-cell') {
    wrapper.style.maxWidth = '100%';
  }
  if (placement.mode === 'anchored-table-cell') {
    wrapper.style.left = `${placement.left}px`;
    wrapper.style.top = `${placement.top}px`;
    if (placement.zIndex != null) {
      wrapper.style.zIndex = String(placement.zIndex);
    }
  } else if (placement.mode === 'flowing-table-cell') {
    if (placement.flexShrink != null) {
      wrapper.style.flexShrink = placement.flexShrink;
    }
  }
  applySdtDataset?.(wrapper, block.attrs?.sdt as SdtMetadata | undefined);

  const inner = doc.createElement('div');
  inner.classList.add(className);
  inner.style.width = '100%';
  inner.style.height = '100%';
  inner.style.display = 'flex';
  inner.style.alignItems = 'center';
  inner.style.justifyContent = 'center';
  inner.style.overflow = 'hidden';

  const drawingContent = renderDrawingContent?.(block, { clipContainer: inner }) ?? createDrawingPlaceholder(doc);
  drawingContent.style.width = '100%';
  drawingContent.style.height = '100%';
  inner.appendChild(drawingContent);
  wrapper.appendChild(inner);

  return wrapper;
};
