import { describe, it, expect } from 'vitest';
import { numberingDefinesMarkerFontFamily } from './numbering-marker-font.js';

const contextWithSymbolFamily = {
  translatedNumbering: {
    definitions: { '1': { numId: 1, abstractNumId: 1 } },
    abstracts: {
      '1': {
        abstractNumId: 1,
        levels: {
          '0': {
            ilvl: 0,
            runProperties: { fontFamily: { ascii: 'Symbol' }, fontSize: 20 },
          },
        },
      },
    },
  },
  translatedLinkedStyles: { docDefaults: {}, styles: {} },
  tableInfo: null,
};

describe('numberingDefinesMarkerFontFamily', () => {
  it('returns true when level rPr defines font family', () => {
    expect(numberingDefinesMarkerFontFamily({ numId: 1, ilvl: 0 }, contextWithSymbolFamily as never)).toBe(true);
  });

  it('returns false when level rPr only defines font size', () => {
    const sizeOnlyContext = {
      ...contextWithSymbolFamily,
      translatedNumbering: {
        definitions: { '1': { numId: 1, abstractNumId: 1 } },
        abstracts: {
          '1': {
            abstractNumId: 1,
            levels: { '0': { ilvl: 0, runProperties: { fontSize: 20 } } },
          },
        },
      },
    };
    expect(numberingDefinesMarkerFontFamily({ numId: 1, ilvl: 0 }, sizeOnlyContext as never)).toBe(false);
  });

  it('returns false without converter context or numbering id', () => {
    expect(numberingDefinesMarkerFontFamily({ numId: 1, ilvl: 0 })).toBe(false);
    expect(numberingDefinesMarkerFontFamily({ numId: 0, ilvl: 0 }, contextWithSymbolFamily as never)).toBe(false);
  });
});
