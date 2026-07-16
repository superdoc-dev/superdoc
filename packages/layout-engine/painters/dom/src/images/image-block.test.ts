import { describe, expect, it } from 'vitest';
import type { DrawingBlock, ShapeGroupImageChild } from '@superdoc/contracts';
import { createDrawingImageElement, createShapeGroupImageElement } from './drawing-image.js';
import { buildImageHyperlinkAnchor } from './hyperlink.js';
import { createBlockImageContent, resolveBlockImageClipPath, resolveBlockImageShapeClipPath } from './image-block.js';

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

describe('resolveBlockImageShapeClipPath', () => {
  it('prefers a top-level shapeClipPath over attrs.shapeClipPath', () => {
    expect(
      resolveBlockImageShapeClipPath({
        shapeClipPath: 'ellipse(50% 50% at 50% 50%)',
        attrs: { shapeClipPath: 'circle(50% at 50% 50%)' },
      }),
    ).toBe('ellipse(50% 50% at 50% 50%)');
  });

  it('falls back to attrs.shapeClipPath when top-level shapeClipPath is absent', () => {
    expect(resolveBlockImageShapeClipPath({ attrs: { shapeClipPath: 'circle(50% at 50% 50%)' } })).toBe(
      'circle(50% at 50% 50%)',
    );
  });

  it('ignores unsupported shape clip-path values', () => {
    expect(resolveBlockImageShapeClipPath({ attrs: { shapeClipPath: 'url(#clip)' } })).toBe('');
  });
});

describe('createBlockImageContent', () => {
  const createDoc = (): Document => document.implementation.createHTMLDocument('block-image');

  it('applies shape masks to the clip container separately from source crop clipping', () => {
    const doc = createDoc();
    const clipContainer = doc.createElement('div');
    const imgEl = createBlockImageContent({
      doc,
      clipContainer,
      block: {
        kind: 'image',
        id: 'masked-image',
        src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        objectFit: 'fill',
        attrs: {
          clipPath: 'inset(6.7% 0% 15.436% 0%)',
          shapeClipPath: 'ellipse(50% 50% at 50% 50%)',
        },
      },
    }) as HTMLImageElement;

    expect(clipContainer.style.clipPath).toBe('ellipse(50% 50% at 50% 50%)');
    expect(clipContainer.style.overflow).toBe('hidden');
    expect(imgEl.style.clipPath).toBe('inset(6.7% 0% 15.436% 0%)');
    expect(imgEl.style.objectFit).toBe('fill');
  });

  it('wraps the image in its own clip container when a shape mask has no caller container', () => {
    const doc = createDoc();
    const wrapper = createBlockImageContent({
      doc,
      block: {
        kind: 'image',
        id: 'masked-image-standalone',
        src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        attrs: {
          clipPath: 'inset(6.7% 0% 15.436% 0%)',
          shapeClipPath: 'ellipse(50% 50% at 50% 50%)',
        },
      },
    });

    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.style.clipPath).toBe('ellipse(50% 50% at 50% 50%)');
    expect(wrapper.style.overflow).toBe('hidden');
    expect(wrapper.style.width).toBe('100%');
    expect(wrapper.style.height).toBe('100%');
    const imgEl = wrapper.querySelector('img') as HTMLImageElement;
    expect(imgEl.style.clipPath).toBe('inset(6.7% 0% 15.436% 0%)');
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

  it('applies shape masks to drawing images without a caller-supplied clip container', () => {
    const doc = createDoc();
    const drawing = {
      kind: 'drawing',
      drawingKind: 'image',
      id: 'drawing-image-shape-masked',
      src: 'data:image/png;base64,AAA',
      attrs: { shapeClipPath: 'ellipse(50% 50% at 50% 50%)' },
    } as unknown as DrawingBlock;

    const wrapper = createDrawingImageElement(doc, drawing, (imageEl) => imageEl);

    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.style.clipPath).toBe('ellipse(50% 50% at 50% 50%)');
    expect(wrapper.style.overflow).toBe('hidden');
    expect(wrapper.querySelector('img.superdoc-drawing-image')).toBeTruthy();
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

  it('uses top-left crop anchoring for grouped cover images', () => {
    const doc = createDoc();
    const imgEl = createShapeGroupImageElement(doc, {
      shapeType: 'image',
      attrs: {
        x: 0,
        y: 0,
        width: 80,
        height: 40,
        src: 'data:image/png;base64,AAA',
        objectFit: 'cover',
      },
    }) as HTMLImageElement;

    expect(imgEl.style.objectFit).toBe('cover');
    expect(imgEl.style.objectPosition).toBe('left top');
  });
});
