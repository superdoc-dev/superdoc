/**
 * Tests for list marker font projection (SD-3238).
 */

import { describe, it, expect } from 'vitest';
import { syncListMarkerFontFromParagraphRuns } from './list-marker-font.js';

const minimalContext = {
  translatedNumbering: {
    definitions: { '1': { numId: 1, abstractNumId: 1 } },
    abstracts: {
      '1': {
        abstractNumId: 1,
        levels: { '0': { ilvl: 0, runProperties: {} } },
      },
    },
  },
  translatedLinkedStyles: { docDefaults: {}, styles: {} },
  tableInfo: null,
};

const symbolContext = {
  ...minimalContext,
  translatedNumbering: {
    definitions: { '1': { numId: 1, abstractNumId: 1 } },
    abstracts: {
      '1': {
        abstractNumId: 1,
        levels: {
          '0': {
            ilvl: 0,
            runProperties: { fontFamily: { ascii: 'Symbol' } },
          },
        },
      },
    },
  },
};

const paragraphWithTextStyle = (markAttrs: Record<string, unknown>) => ({
  content: {
    forEach(fn: (child: unknown) => void) {
      fn({
        content: {
          forEach(fn2: (child: unknown) => void) {
            fn2({
              isText: true,
              text: 'item',
              marks: [{ type: { name: 'textStyle' }, attrs: markAttrs }],
            });
          },
        },
      });
    },
  },
});

const listBlock = ({
  runs,
  markerFamily = 'Times New Roman, serif',
  markerSize = 12,
  markerText = '1.',
  numberingProperties = { numId: 1, ilvl: 0 },
}: {
  runs: Array<{ text: string; fontFamily?: string; fontSize?: number }>;
  markerFamily?: string;
  markerSize?: number;
  markerText?: string;
  numberingProperties?: { numId: number; ilvl: number };
}) => ({
  runs,
  attrs: {
    numberingProperties,
    wordLayout: {
      marker: {
        markerText,
        run: { fontFamily: markerFamily, fontSize: markerSize },
      },
    },
  },
});

describe('syncListMarkerFontFromParagraphRuns', () => {
  it('syncs marker font from freshly converted text runs', () => {
    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Georgia, serif', fontSize: 30 }],
    });

    syncListMarkerFontFromParagraphRuns({ block, converterContext: minimalContext as never });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Georgia');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(30);
  });

  it('prefers converted runs over live PM textStyle by default', () => {
    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Georgia, serif', fontSize: 30 }],
    });

    syncListMarkerFontFromParagraphRuns({
      block,
      converterContext: minimalContext as never,
      para: paragraphWithTextStyle({ fontFamily: 'Arial', fontSize: '12pt' }) as never,
    });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Georgia');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(30);
  });

  it('uses live PM textStyle over stale cached runs on cache hits', () => {
    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Times New Roman, serif', fontSize: 12 }],
    });

    syncListMarkerFontFromParagraphRuns({
      block,
      converterContext: minimalContext as never,
      para: paragraphWithTextStyle({ fontFamily: 'Georgia', fontSize: '30pt' }) as never,
      contentFontSource: 'paragraph',
    });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Georgia');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(40);
  });

  it('syncs only live PM textStyle properties on cache hits without using cached runs', () => {
    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Georgia, serif', fontSize: 12 }],
    });

    syncListMarkerFontFromParagraphRuns({
      block,
      converterContext: minimalContext as never,
      para: paragraphWithTextStyle({ fontSize: '30pt' }) as never,
      contentFontSource: 'paragraph',
    });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Times New Roman');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(40);
  });

  it('uses previousParagraphFont on cache hits when empty list items have no textStyle marks', () => {
    const block = listBlock({
      runs: [{ text: '', fontFamily: 'Times New Roman, serif', fontSize: 12 }],
      markerSize: 12,
    });

    syncListMarkerFontFromParagraphRuns({
      block,
      converterContext: minimalContext as never,
      para: { content: { forEach: () => {} } } as never,
      contentFontSource: 'paragraph',
      previousParagraphFont: { fontFamily: 'Georgia, serif', fontSize: 30 },
    });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Georgia');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(30);
    expect(block.runs[0]?.fontFamily).toContain('Georgia');
    expect(block.runs[0]?.fontSize).toBe(30);
  });

  it('does not fall back to stale cached runs on cache hits without textStyle or previousParagraphFont', () => {
    const block = listBlock({
      runs: [{ text: '', fontFamily: 'Times New Roman, serif', fontSize: 12 }],
      markerFamily: 'Times New Roman, serif',
      markerSize: 12,
    });

    syncListMarkerFontFromParagraphRuns({
      block,
      converterContext: minimalContext as never,
      para: { content: { forEach: () => {} } } as never,
      contentFontSource: 'paragraph',
    });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Times New Roman');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(12);
  });

  it('preserves numbering-defined marker font family but still syncs font size when size is unset', () => {
    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Georgia, serif', fontSize: 30 }],
      markerFamily: 'Symbol',
      markerText: '•',
    });

    syncListMarkerFontFromParagraphRuns({ block, converterContext: symbolContext as never });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Symbol');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(30);
  });

  it('preserves numbering-defined marker font size from w:sz', () => {
    const sizedSymbolContext = {
      ...symbolContext,
      translatedNumbering: {
        definitions: { '1': { numId: 1, abstractNumId: 1 } },
        abstracts: {
          '1': {
            abstractNumId: 1,
            levels: {
              '0': {
                ilvl: 0,
                runProperties: {
                  fontFamily: { ascii: 'Symbol' },
                  fontSize: 20,
                },
              },
            },
          },
        },
      },
    };

    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Georgia, serif', fontSize: 30 }],
      markerFamily: 'Symbol',
      markerSize: 10,
      markerText: '•',
    });

    syncListMarkerFontFromParagraphRuns({ block, converterContext: sizedSymbolContext as never });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Symbol');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(10);
  });

  it('preserves numbering-defined marker font size from w:szCs', () => {
    const sizedSymbolContext = {
      ...symbolContext,
      translatedNumbering: {
        definitions: { '1': { numId: 1, abstractNumId: 1 } },
        abstracts: {
          '1': {
            abstractNumId: 1,
            levels: {
              '0': {
                ilvl: 0,
                runProperties: {
                  fontFamily: { ascii: 'Symbol' },
                  fontSizeCs: 20,
                },
              },
            },
          },
        },
      },
    };

    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Georgia, serif', fontSize: 30 }],
      markerFamily: 'Symbol',
      markerSize: 10,
      markerText: '•',
    });

    syncListMarkerFontFromParagraphRuns({ block, converterContext: sizedSymbolContext as never });

    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(10);
  });

  it('reads numbering from block attrs on cache hits so Symbol font is preserved', () => {
    const block = listBlock({
      runs: [{ text: 'item', fontFamily: 'Georgia, serif', fontSize: 40 }],
      markerFamily: 'Symbol',
      markerText: '•',
    });

    syncListMarkerFontFromParagraphRuns({
      block,
      converterContext: symbolContext as never,
      para: paragraphWithTextStyle({ fontFamily: 'Georgia', fontSize: '30pt' }) as never,
      contentFontSource: 'paragraph',
    });

    expect(block.attrs.wordLayout?.marker?.run?.fontFamily).toContain('Symbol');
    expect(block.attrs.wordLayout?.marker?.run?.fontSize).toBe(40);
  });
});
