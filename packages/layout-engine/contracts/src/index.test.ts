import { describe, expect, it } from 'vitest';
import { cloneColumnLayout, extractHeaderFooterSpace, normalizeColumnLayout, widthsEqual } from './index.js';
import type { FlowBlock, Layout, PainterDOM, PainterPDF } from './index.js';

describe('contracts', () => {
  it('accepts a basic FlowBlock structure', () => {
    const block: FlowBlock = {
      id: 'block-1',
      runs: [
        {
          text: 'Hello world',
          fontFamily: 'Inter',
          fontSize: 12,
          bold: true,
        },
      ],
      attrs: { align: 'left' },
    };

    expect(block.id).toBe('block-1');
  });

  it('describes a minimal layout', async () => {
    const layout: Layout = {
      pageSize: { w: 612, h: 792 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'block-1',
              fromLine: 0,
              toLine: 1,
              x: 72,
              y: 72,
              width: 468,
            },
          ],
        },
      ],
      headerFooter: {
        default: {
          height: 36,
          pages: [
            {
              number: 1,
              fragments: [
                {
                  kind: 'para',
                  blockId: 'block-1',
                  fromLine: 0,
                  toLine: 1,
                  x: 0,
                  y: 0,
                  width: 468,
                },
              ],
            },
          ],
        },
      },
    };

    const domPainter: PainterDOM = {
      paint(received, mount) {
        mount.dataset.pageCount = String(received.pages.length);
      },
    };

    const pdfPainter: PainterPDF = {
      async render(received) {
        expect(received.pages.length).toBeGreaterThan(0);
        return new Blob([JSON.stringify(received)]);
      },
    };

    const mount = document.createElement('div');
    domPainter.paint(layout, mount);
    expect(mount.dataset.pageCount).toBe('1');

    const blob = await pdfPainter.render(layout);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('extracts header/footer spacing from margins', () => {
    const spacing = extractHeaderFooterSpace({ header: 1.25, footer: 0.5 });
    expect(spacing.headerSpace).toBeCloseTo(1.25);
    expect(spacing.footerSpace).toBeCloseTo(0.5);

    const zeroSpacing = extractHeaderFooterSpace();
    expect(zeroSpacing.headerSpace).toBe(0);
    expect(zeroSpacing.footerSpace).toBe(0);
  });

  it('re-exports column layout helpers from the package entrypoint', () => {
    expect(widthsEqual([72, 144], [72, 144])).toBe(true);
    expect(cloneColumnLayout({ count: 2, gap: 18, widths: [72, 144] })).toEqual({
      count: 2,
      gap: 18,
      widths: [72, 144],
    });
    expect(normalizeColumnLayout({ count: 2, gap: 24 }, 624).widths).toEqual([300, 300]);
  });
});
