import { describe, expect, it } from 'vitest';
import type { DrawingBlock, ShapeGroupImageChild } from '@superdoc/contracts';
import { createDrawingImageElement, createShapeGroupImageElement } from './drawing-image.js';
import { buildImageHyperlinkAnchor } from './hyperlink.js';
import { resolveBlockImageClipPath } from './image-block.js';

describe('resolveBlockImageClipPath', () => {
  it('prefers a top-level clipPath over attrs.clipPath', () => {
    expect(
      resolveBlockImageClipPath({
        clipPath: 'inset(1% 2% 3% 4%)',
        attrs: { clipPath: 'inset(5% 6% 7% 8%)' },
      }),
    ).toBe('inset(1% 2% 3% 4%)');
  });

  it('falls back to attrs.clipPath when top-level clipPath is absent', () => {
    expect(resolveBlockImageClipPath({ attrs: { clipPath: 'inset(5% 6% 7% 8%)' } })).toBe('inset(5% 6% 7% 8%)');
  });

  it('ignores unsupported clip-path values', () => {
    expect(resolveBlockImageClipPath({ clipPath: 'url(#clip)' })).toBe('');
  });
});

describe('createDrawingImageElement', () => {
  const createDoc = (): Document => document.implementation.createHTMLDocument('drawing-image');

  it('applies unified image filters to drawing images', () => {
    const doc = createDoc();
    const drawing = {
      kind: 'drawing',
      drawingKind: 'image',
      id: 'drawing-image-filtered',
      src: 'data:image/png;base64,AAA',
      grayscale: true,
      gain: 2,
      alphaModFix: { amt: 9000 },
    } as DrawingBlock;

    const imgEl = createDrawingImageElement(doc, drawing, (imageEl) => imageEl) as HTMLImageElement;

    expect(imgEl.style.display).toBe('block');
    expect(imgEl.style.filter).toContain('grayscale(100%)');
    expect(imgEl.style.filter).toContain('contrast(2)');
    expect(imgEl.style.opacity).toBe('0.09');
  });

  it('wraps drawing images with unified hyperlink anchors', () => {
    const doc = createDoc();
    const drawing = {
      kind: 'drawing',
      drawingKind: 'image',
      id: 'drawing-image-linked',
      src: 'data:image/png;base64,AAA',
      hyperlink: { url: 'https://example.com/drawing-image', tooltip: 'Open drawing image' },
    } as DrawingBlock;

    const anchor = createDrawingImageElement(doc, drawing, (imageEl, hyperlink, display) =>
      buildImageHyperlinkAnchor(doc, imageEl, hyperlink, display),
    ) as HTMLAnchorElement;

    expect(anchor.tagName).toBe('A');
    expect(anchor.classList.contains('superdoc-link')).toBe(true);
    expect(anchor.href).toBe('https://example.com/drawing-image');
    expect(anchor.style.display).toBe('block');
    expect(anchor.querySelector('img.superdoc-drawing-image')).toBeTruthy();
  });
});

describe('createShapeGroupImageElement', () => {
  const createDoc = (): Document => document.implementation.createHTMLDocument('shape-group-image');

  it('applies DrawingML fixed alpha to grouped images', () => {
    const doc = createDoc();
    const child: ShapeGroupImageChild = {
      shapeType: 'image',
      attrs: {
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        src: 'data:image/png;base64,AAA',
        alphaModFix: { amt: 9000 },
      },
    };

    const imgEl = createShapeGroupImageElement(doc, child) as HTMLImageElement;

    expect(imgEl.src).toBe('data:image/png;base64,AAA');
    expect(imgEl.style.display).toBe('block');
    expect(imgEl.style.opacity).toBe('0.09');
  });
});
