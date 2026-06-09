import type {
  DrawingBlock,
  ImageDrawing,
  PositionedDrawingGeometry,
  ShapeGroupChild,
  TextPart,
} from '@superdoc/contracts';
import { applyImageClipPath } from './image-clip-path.js';
import { createBlockImageContent } from './image-block.js';
import type { BuildImageHyperlinkAnchor } from './types.js';

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
  const attrs = child.attrs as PositionedDrawingGeometry & {
    src: string;
    alt?: string;
    clipPath?: string;
  };
  const img = doc.createElement('img');
  img.src = attrs.src;
  img.alt = attrs.alt ?? '';
  img.style.objectFit = 'contain';
  img.style.display = 'block';
  applyImageClipPath(img, attrs.clipPath);
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
