import { describe, expect, it } from 'vitest';
import type { DrawingBlock } from '@superdoc/contracts';
import { buildImageHyperlinkAnchor } from '../images/hyperlink.js';
import { renderDrawingContent } from './renderDrawingContent.js';

describe('renderDrawingContent', () => {
  const createDoc = (): Document => document.implementation.createHTMLDocument('drawing-content');

  it('renders vector shapes through the shared drawing content path', () => {
    const doc = createDoc();
    const block: DrawingBlock = {
      kind: 'drawing',
      id: 'shape-1',
      drawingKind: 'vectorShape',
      geometry: { width: 100, height: 50 },
      shapeKind: 'rect',
      fillColor: '#ff0000',
      strokeColor: '#000000',
    };

    const el = renderDrawingContent({
      doc,
      block,
      geometry: block.geometry,
      buildImageHyperlinkAnchor: (imageEl) => imageEl,
    });

    expect(el.classList.contains('superdoc-vector-shape')).toBe(true);
    expect(el.querySelector('svg')).toBeTruthy();
  });

  it('renders vector shape text through the textbox renderer', () => {
    const doc = createDoc();
    const block: DrawingBlock = {
      kind: 'drawing',
      id: 'shape-text-1',
      drawingKind: 'vectorShape',
      geometry: { width: 120, height: 60 },
      shapeKind: 'rect',
      fillColor: '#ffffff',
      strokeColor: '#000000',
      textAlign: 'left',
      textVerticalAlign: 'center',
      textInsets: { top: 2, right: 4, bottom: 6, left: 8 },
      textContent: {
        parts: [{ text: 'Shape text', formatting: { bold: true } }],
      },
    };

    const el = renderDrawingContent({
      doc,
      block,
      geometry: block.geometry,
      buildImageHyperlinkAnchor: (imageEl) => imageEl,
    });

    const textOverlay = el.querySelector('div[style*="display: flex"]') as HTMLElement | null;
    const span = textOverlay?.querySelector('span') as HTMLSpanElement | null;
    expect(textOverlay).toBeTruthy();
    expect(textOverlay?.style.justifyContent).toBe('center');
    expect(textOverlay?.style.padding).toBe('2px 4px 6px 8px');
    expect(span?.textContent).toBe('Shape text');
    expect(span?.style.fontWeight).toBe('bold');
  });

  it('renders shape groups and charts through the shared drawing content path', () => {
    const doc = createDoc();
    const shapeGroup: DrawingBlock = {
      kind: 'drawing',
      id: 'group-1',
      drawingKind: 'shapeGroup',
      geometry: { width: 100, height: 100 },
      shapes: [{ shapeType: 'image', attrs: { x: 0, y: 0, width: 40, height: 30, src: 'data:image/png;base64,AAA' } }],
    };
    const chart: DrawingBlock = {
      kind: 'drawing',
      id: 'chart-1',
      drawingKind: 'chart',
      geometry: { width: 120, height: 80 },
      chartData: undefined,
    };

    const groupEl = renderDrawingContent({
      doc,
      block: shapeGroup,
      geometry: shapeGroup.geometry,
      buildImageHyperlinkAnchor: (imageEl) => imageEl,
    });
    const chartEl = renderDrawingContent({
      doc,
      block: chart,
      geometry: chart.geometry,
      buildImageHyperlinkAnchor: (imageEl) => imageEl,
    });

    expect(groupEl.classList.contains('superdoc-shape-group')).toBe(true);
    expect(groupEl.querySelector('img')).toBeTruthy();
    expect(chartEl.classList.contains('superdoc-chart')).toBe(true);
    expect(chartEl.querySelector('svg')).toBeFalsy();
    expect(chartEl.style.display).toBe('flex');
  });

  it('renders fallback placeholders through the shared drawing content path', () => {
    const doc = createDoc();
    const block = {
      kind: 'drawing',
      id: 'unknown-1',
      drawingKind: 'unsupported',
    } as unknown as DrawingBlock;

    const el = renderDrawingContent({
      doc,
      block,
      buildImageHyperlinkAnchor: (imageEl) => imageEl,
    });

    expect(el.classList.contains('superdoc-drawing-placeholder')).toBe(true);
    expect(el.style.border).toContain('dashed');
  });

  it('uses shared image behavior for filters, hyperlinks, and clip containers', () => {
    const doc = createDoc();
    const clipContainer = doc.createElement('div');
    const block: DrawingBlock = {
      kind: 'drawing',
      id: 'image-1',
      drawingKind: 'image',
      src: 'data:image/png;base64,AAA',
      clipPath: 'inset(10% 20% 30% 40%)',
      grayscale: true,
      hyperlink: { url: 'https://example.com/image', tooltip: 'Open image' },
    };

    const el = renderDrawingContent({
      doc,
      block,
      clipContainer,
      buildImageHyperlinkAnchor: (imageEl, hyperlink, display) =>
        buildImageHyperlinkAnchor(doc, imageEl, hyperlink, display),
    });

    const anchor = el as HTMLAnchorElement;
    const img = anchor.querySelector('img.superdoc-drawing-image') as HTMLImageElement | null;
    expect(anchor.tagName).toBe('A');
    expect(anchor.href).toBe('https://example.com/image');
    expect(img?.style.filter).toContain('grayscale(100%)');
    expect(img?.style.clipPath).toBe('inset(10% 20% 30% 40%)');
    expect(clipContainer.style.overflow).toBe('hidden');
  });
});
