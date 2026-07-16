import type { ImageBlock, ImageDrawing } from '@superdoc/contracts';
import { buildImageFilters, resolveImageOpacity } from '../runs/image-run.js';
import { applyImageClipPath, readImageClipPathValue } from './image-clip-path.js';
import { applyImageObjectFit } from './object-fit.js';
import type { BuildImageHyperlinkAnchor } from './types.js';

type BlockImageSource = ImageBlock | ImageDrawing;

export type CreateBlockImageContentOptions = {
  doc: Document;
  block: BlockImageSource;
  className?: string;
  clipContainer?: HTMLElement;
  imageDisplay?: 'block' | 'inline-block';
  hyperlinkDisplay?: 'block' | 'inline-block';
  buildImageHyperlinkAnchor?: BuildImageHyperlinkAnchor;
};

const resolveClipPathFromAttrs = (attrs: unknown): string => {
  if (!attrs || typeof attrs !== 'object') return '';
  const record = attrs as Record<string, unknown>;
  return readImageClipPathValue(record.clipPath);
};

export const resolveBlockImageClipPath = (block: unknown): string => {
  if (!block || typeof block !== 'object') return '';
  const record = block as Record<string, unknown>;
  return readImageClipPathValue(record.clipPath) || resolveClipPathFromAttrs(record.attrs);
};

export const resolveBlockImageShapeClipPath = (block: unknown): string => {
  if (!block || typeof block !== 'object') return '';
  const record = block as Record<string, unknown>;
  const attrs =
    record.attrs && typeof record.attrs === 'object' ? (record.attrs as Record<string, unknown>) : undefined;
  return readImageClipPathValue(record.shapeClipPath) || readImageClipPathValue(attrs?.shapeClipPath);
};

export const createBlockImageContent = ({
  doc,
  block,
  className,
  clipContainer,
  imageDisplay,
  hyperlinkDisplay = 'block',
  buildImageHyperlinkAnchor,
}: CreateBlockImageContentOptions): HTMLElement => {
  const img = doc.createElement('img');
  if (className) {
    img.classList.add(className);
  }
  if (block.src) {
    img.src = block.src;
  }
  img.alt = block.alt ?? '';
  img.style.width = '100%';
  img.style.height = '100%';
  applyImageObjectFit(img, block.objectFit ?? 'contain');
  const shapeClipPath = resolveBlockImageShapeClipPath(block);
  // Without a caller-supplied clip container, the shape mask still needs an
  // element distinct from the img so srcRect cropping keeps its own clip-path.
  const ownShapeClipContainer = shapeClipPath && !clipContainer ? doc.createElement('div') : undefined;
  if (ownShapeClipContainer) {
    ownShapeClipContainer.style.width = '100%';
    ownShapeClipContainer.style.height = '100%';
  }
  const shapeClipContainer = clipContainer ?? ownShapeClipContainer;
  if (shapeClipPath && shapeClipContainer) {
    shapeClipContainer.style.clipPath = shapeClipPath;
    shapeClipContainer.style.overflow = 'hidden';
  }
  applyImageClipPath(
    img,
    resolveBlockImageClipPath(block),
    shapeClipContainer ? { clipContainer: shapeClipContainer } : undefined,
  );
  img.style.display = imageDisplay ?? (block.display === 'inline' ? 'inline-block' : 'block');

  const filters = buildImageFilters(block);
  if (filters.length > 0) {
    img.style.filter = filters.join(' ');
  }
  const opacity = resolveImageOpacity(block);
  if (opacity != null) {
    img.style.opacity = opacity;
  }

  const content = buildImageHyperlinkAnchor?.(img, block.hyperlink, hyperlinkDisplay) ?? img;
  if (ownShapeClipContainer) {
    ownShapeClipContainer.appendChild(content);
    return ownShapeClipContainer;
  }
  return content;
};
