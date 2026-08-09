import type { DrawingBlock, ImageDrawing, ShapeGroupChild, ShapeGroupImageChild, TextPart } from '@superdoc/contracts';
import { applyImageClipPath } from './image-clip-path.js';
import { createBlockImageContent } from './image-block.js';
import type { BuildImageHyperlinkAnchor } from './types.js';
import { resolveImageOpacity } from '../runs/image-run.js';

export const createDrawingImageElement = (
  doc: Document,
  block: DrawingBlock,
  buildImageHyperlinkAnchor: BuildImageHyperlinkAnchor,
): HTMLElement => {
  const drawing = block as ImageDrawing;
  return createBlockImageContent({
    doc,
    block: drawing,
    className: 'superdoc-drawing-image',
    imageDisplay: 'block',
    buildImageHyperlinkAnchor,
  });
};

export const createShapeGroupImageElement = (doc: Document, child: ShapeGroupChild): HTMLElement => {
  const attrs = (child as ShapeGroupImageChild).attrs;
  const img = doc.createElement('img');
  img.src = attrs.src;
  img.alt = attrs.alt ?? '';
  img.style.objectFit = 'contain';
  img.style.display = 'block';
  applyImageClipPath(img, attrs.clipPath);
  const opacity = resolveImageOpacity(attrs);
  if (opacity != null) {
    img.style.opacity = opacity;
  }
  return img;
};

export const createShapeTextImageElement = (doc: Document, part: TextPart): HTMLElement => {
  const img = doc.createElement('img');
  img.src = part.src!;
  img.alt = part.alt ?? '';
  if (typeof part.width === 'number') img.style.width = `${part.width}px`;
  if (typeof part.height === 'number') img.style.height = `${part.height}px`;
  img.style.display = 'inline-block';
  img.style.verticalAlign = 'bottom';
  return img;
};
