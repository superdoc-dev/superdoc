import type { DrawingBlock, DrawingGeometry, SdtMetadata } from '@superdoc/contracts';
import { createDrawingPlaceholder } from './placeholder.js';

export type RenderDrawingContentForPlacement = (
  block: DrawingBlock,
  options?: { clipContainer?: HTMLElement },
) => HTMLElement;

export type DrawingFramePlacement =
  | { mode: 'body'; left?: never; top?: never; zIndex?: never; flexShrink?: never }
  | { mode: 'flowing-table-cell'; flexShrink?: string; left?: never; top?: never; zIndex?: never }
  | { mode: 'anchored-table-cell'; left: number; top: number; zIndex?: number; flexShrink?: never };

export type RenderDrawingFrameParams = {
  doc: Document;
  block: DrawingBlock;
  width: number;
  height: number;
  placement: DrawingFramePlacement;
  className: string;
  geometry?: DrawingGeometry;
  scale?: number;
  suppressTransforms?: boolean;
  renderDrawingContent?: RenderDrawingContentForPlacement;
  applySdtDataset?: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
};

const applyBodyDrawingTransform = (
  target: HTMLElement,
  geometry: DrawingGeometry | undefined,
  scale: number | undefined,
): void => {
  if (!geometry) return;
  const transforms: string[] = ['translate(-50%, -50%)'];
  transforms.push(`rotate(${geometry.rotation ?? 0}deg)`);
  transforms.push(`scaleX(${geometry.flipH ? -1 : 1})`);
  transforms.push(`scaleY(${geometry.flipV ? -1 : 1})`);
  transforms.push(`scale(${scale ?? 1})`);
  target.style.transform = transforms.join(' ');
};

export const renderDrawingFrame = ({
  doc,
  block,
  width,
  height,
  placement,
  className,
  geometry,
  scale,
  suppressTransforms,
  renderDrawingContent,
  applySdtDataset,
}: RenderDrawingFrameParams): HTMLElement => {
  const wrapper = doc.createElement('div');
  wrapper.style.position =
    placement.mode === 'anchored-table-cell' || placement.mode === 'body' ? 'absolute' : 'relative';
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.overflow = 'hidden';
  if (placement.mode === 'anchored-table-cell') {
    wrapper.style.left = `${placement.left}px`;
    wrapper.style.top = `${placement.top}px`;
    if (placement.zIndex != null) {
      wrapper.style.zIndex = String(placement.zIndex);
    }
  } else if (placement.mode === 'flowing-table-cell') {
    wrapper.style.maxWidth = '100%';
    if (placement.flexShrink != null) {
      wrapper.style.flexShrink = placement.flexShrink;
    }
  }
  applySdtDataset?.(wrapper, block.attrs?.sdt as SdtMetadata | undefined);

  const inner = doc.createElement('div');
  inner.classList.add(className);
  inner.style.width = '100%';
  inner.style.height = '100%';
  if (placement.mode === 'body') {
    inner.style.position = 'absolute';
    inner.style.left = '50%';
    inner.style.top = '50%';
    inner.style.width = `${width}px`;
    inner.style.height = `${height}px`;
    inner.style.transformOrigin = 'center';
    if (!suppressTransforms) {
      applyBodyDrawingTransform(inner, geometry, scale);
    }
  } else {
    inner.style.display = 'flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
  }
  inner.style.overflow = 'hidden';

  const drawingContent = renderDrawingContent?.(block, { clipContainer: inner }) ?? createDrawingPlaceholder(doc);
  drawingContent.style.width = '100%';
  drawingContent.style.height = '100%';
  inner.appendChild(drawingContent);
  wrapper.appendChild(inner);

  return wrapper;
};
