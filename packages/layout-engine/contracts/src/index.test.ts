import { describe, expect, it } from 'vite-plus/test';
import {
  cloneColumnLayout,
  extractHeaderFooterSpace,
  getRenderedTableBorderWidthPx,
  normalizeColumnLayout,
  widthsEqual,
} from './index.js';
import type {
  FlowBlock,
  ImageRun,
  ImageRunVerticalAlign,
  InlineBoxSpan,
  Line,
  LineInlineBox,
  LineInlineImageAlignment,
  Layout,
} from './index.js';

describe('contracts', () => {
  it('keeps OOXML compound-border width as the complete painted band', () => {
    expect(getRenderedTableBorderWidthPx({ style: 'double', width: 2 / 3 })).toBe(2 / 3);
    expect(getRenderedTableBorderWidthPx({ style: 'single', width: 2 / 3 })).toBe(2 / 3);
  });

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

  it('describes a minimal layout', () => {
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

    expect(layout.pages.length).toBe(1);
    expect(layout.pages[0].fragments.length).toBe(1);
  });

  it('extracts header/footer spacing from margins', () => {
    const spacing = extractHeaderFooterSpace({ header: 1.25, footer: 0.5 });
    expect(spacing.headerSpace).toBeCloseTo(1.25);
    expect(spacing.footerSpace).toBeCloseTo(0.5);

    const zeroSpacing = extractHeaderFooterSpace();
    expect(zeroSpacing.headerSpace).toBe(0);
    expect(zeroSpacing.footerSpace).toBe(0);
  });

  it('represents baseline inline-image alignment on ImageRun and Line', () => {
    const baseline: ImageRunVerticalAlign = 'baseline';
    const imageRun: ImageRun = {
      kind: 'image',
      src: 'data:image/png;base64,AAAA',
      width: 11,
      height: 10,
      verticalAlign: baseline,
    };
    expect(imageRun.verticalAlign).toBe('baseline');

    const alignment: LineInlineImageAlignment = { runIndex: 0, verticalAlign: 'baseline' };
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 2,
      toChar: 5,
      width: 120,
      ascent: 12,
      descent: 3,
      lineHeight: 18,
      inlineImageAlignments: [alignment],
    };
    expect(line.inlineImageAlignments?.[0]).toEqual({ runIndex: 0, verticalAlign: 'baseline' });
  });

  it('preserves inlineImageAlignments when a line is shallow-cloned/normalized', () => {
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 12,
      ascent: 12,
      descent: 3,
      lineHeight: 18,
      inlineImageAlignments: [{ runIndex: 1, verticalAlign: 'baseline' }],
    };
    // Helpers that clone/normalize lines must not drop the measured channel.
    const cloned: Line = { ...line };
    expect(cloned.inlineImageAlignments).toEqual([{ runIndex: 1, verticalAlign: 'baseline' }]);
  });

  it('represents paragraph spans and paint-ready line inline boxes', () => {
    const span: InlineBoxSpan = {
      id: 'references.citation-1',
      from: 2,
      to: 8,
      layout: {
        paddingInlineStart: 4,
        paddingInlineEnd: 4,
        paddingBlockStart: 1,
        paddingBlockEnd: 1,
        gapBefore: 1,
        gapAfter: 1,
        borderWidth: 1,
      },
      appearance: { backgroundColor: '#eef2ff', borderStyle: 'solid' },
      className: 'citation-pill',
      data: { citationId: 'citation-1' },
    };
    const lineBox: LineInlineBox = {
      id: span.id,
      from: 2,
      to: 8,
      x: 12,
      width: 48,
      top: 0,
      height: 20,
      startsRange: true,
      endsRange: true,
      style: { ...span.layout, ...span.appearance },
    };
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 10,
      width: 80,
      ascent: 12,
      descent: 3,
      lineHeight: 20,
      inlineBoxes: [lineBox],
    };

    expect(line.inlineBoxes?.[0]).toEqual(lineBox);
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
