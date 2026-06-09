import type { ImageBlock, ImageDrawing } from '@superdoc/contracts';
import { buildImageFilters } from '../runs/image-run.js';
import { applyImageClipPath, readImageClipPathValue } from './image-clip-path.js';
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
  img.style.objectFit = block.objectFit ?? 'contain';
  if (block.objectFit === 'cover') {
    img.style.objectPosition = 'left top';
  }
  applyImageClipPath(img, resolveBlockImageClipPath(block), clipContainer ? { clipContainer } : undefined);
  img.style.display = imageDisplay ?? (block.display === 'inline' ? 'inline-block' : 'block');

  const filters = buildImageFilters(block);
  if (filters.length > 0) {
    img.style.filter = filters.join(' ');
  }

  return buildImageHyperlinkAnchor?.(img, block.hyperlink, hyperlinkDisplay) ?? img;
};
