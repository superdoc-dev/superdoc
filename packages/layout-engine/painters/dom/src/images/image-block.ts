import type { ImageBlock, ImageDrawing, ImageHyperlink } from '@superdoc/contracts';
import { buildImageFilters } from '../runs/image-run.js';
import { applyImageClipPath } from '../utils/image-clip-path.js';

type BlockImageSource = ImageBlock | ImageDrawing;

type BuildImageHyperlinkAnchor = (
  imageEl: HTMLElement,
  hyperlink: ImageHyperlink | undefined,
  display: 'block' | 'inline-block',
) => HTMLElement;

export type CreateBlockImageContentOptions = {
  doc: Document;
  block: BlockImageSource;
  className?: string;
  clipContainer?: HTMLElement;
  hyperlinkDisplay?: 'block' | 'inline-block';
  buildImageHyperlinkAnchor?: BuildImageHyperlinkAnchor;
};

const CLIP_PATH_PREFIXES = ['inset(', 'polygon(', 'circle(', 'ellipse(', 'path(', 'rect('];

export const readImageClipPathValue = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (normalized.length === 0) return '';
  const lower = normalized.toLowerCase();
  if (!CLIP_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix))) return '';
  return normalized;
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
  img.style.display = block.display === 'inline' ? 'inline-block' : 'block';

  const filters = buildImageFilters(block);
  if (filters.length > 0) {
    img.style.filter = filters.join(' ');
  }

  return buildImageHyperlinkAnchor?.(img, block.hyperlink, hyperlinkDisplay) ?? img;
};
