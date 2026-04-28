import { describe, it, expect } from 'vitest';
import { findSymbolFontsOnOrderedLevels } from './numbering-consistency.js';

/**
 * Build a minimal OOXML-shaped `<w:abstractNum>` element for tests.
 * Each entry in `levels` may set `numFmt` and (optionally) a `font`.
 */
function makeAbstractNum(levels) {
  return {
    name: 'w:abstractNum',
    attributes: { 'w:abstractNumId': '0' },
    elements: levels.map((lvl, i) => ({
      name: 'w:lvl',
      attributes: { 'w:ilvl': String(i) },
      elements: [
        { name: 'w:numFmt', attributes: { 'w:val': lvl.numFmt } },
        ...(lvl.font
          ? [
              {
                name: 'w:rPr',
                elements: [
                  {
                    name: 'w:rFonts',
                    attributes: { 'w:ascii': lvl.font, 'w:hAnsi': lvl.font },
                  },
                ],
              },
            ]
          : []),
      ],
    })),
  };
}

describe('findSymbolFontsOnOrderedLevels', () => {
  it('returns [] for undefined / null / malformed input', () => {
    expect(findSymbolFontsOnOrderedLevels(undefined)).toEqual([]);
    expect(findSymbolFontsOnOrderedLevels(null)).toEqual([]);
    expect(findSymbolFontsOnOrderedLevels({})).toEqual([]);
    expect(findSymbolFontsOnOrderedLevels({ elements: [] })).toEqual([]);
    expect(findSymbolFontsOnOrderedLevels({ elements: 'not-an-array' })).toEqual([]);
  });

  it('does NOT flag bullet levels that use symbol fonts (the normal case)', () => {
    // Bullet lists legitimately render glyphs through Wingdings / Symbol —
    // that is the entire point. Flagging these would produce false positives.
    const abstract = makeAbstractNum([
      { numFmt: 'bullet', font: 'Courier New' },
      { numFmt: 'bullet', font: 'Wingdings' },
      { numFmt: 'bullet', font: 'Symbol' },
      { numFmt: 'bullet', font: 'Webdings' },
      { numFmt: 'bullet', font: 'Zapf Dingbats' },
    ]);
    expect(findSymbolFontsOnOrderedLevels(abstract)).toEqual([]);
  });

  it('does NOT flag ordered levels with safe fonts', () => {
    const abstract = makeAbstractNum([
      { numFmt: 'decimal', font: 'Courier New' },
      { numFmt: 'lowerLetter', font: 'Arial' },
      { numFmt: 'lowerRoman', font: 'Times New Roman' },
      { numFmt: 'upperRoman', font: 'Calibri' },
    ]);
    expect(findSymbolFontsOnOrderedLevels(abstract)).toEqual([]);
  });

  it('does NOT flag ordered levels that have no rFonts override (body font fallback)', () => {
    const abstract = makeAbstractNum([{ numFmt: 'decimal' }, { numFmt: 'lowerLetter' }, { numFmt: 'lowerRoman' }]);
    expect(findSymbolFontsOnOrderedLevels(abstract)).toEqual([]);
  });

  it('flags ordered numFmt paired with Wingdings / Symbol (the core bug signature)', () => {
    const abstract = makeAbstractNum([
      { numFmt: 'decimal', font: 'Courier New' }, // L0 clean
      { numFmt: 'decimal', font: 'Courier New' }, // L1 clean
      { numFmt: 'decimal', font: 'Wingdings' }, //   L2 violation
      { numFmt: 'decimal', font: 'Symbol' }, //      L3 violation
    ]);
    expect(findSymbolFontsOnOrderedLevels(abstract)).toEqual([
      { ilvl: 2, numFmt: 'decimal', font: 'Wingdings' },
      { ilvl: 3, numFmt: 'decimal', font: 'Symbol' },
    ]);
  });

  it('flags every ordered numFmt variant when paired with any symbol font', () => {
    const abstract = makeAbstractNum([
      { numFmt: 'lowerLetter', font: 'Wingdings' },
      { numFmt: 'upperLetter', font: 'Wingdings 2' },
      { numFmt: 'lowerRoman', font: 'Webdings' },
      { numFmt: 'upperRoman', font: 'Zapf Dingbats' },
      { numFmt: 'decimalZero', font: 'ZapfDingbats' },
    ]);
    const result = findSymbolFontsOnOrderedLevels(abstract);
    expect(result).toHaveLength(5);
    expect(result.map((v) => v.numFmt)).toEqual([
      'lowerLetter',
      'upperLetter',
      'lowerRoman',
      'upperRoman',
      'decimalZero',
    ]);
  });

  it('ignores unknown numFmt values', () => {
    // `chicago` is in the set; arbitrary strings are not.
    const abstract = makeAbstractNum([
      { numFmt: 'chicago', font: 'Wingdings' },
      { numFmt: 'some-unknown-format', font: 'Wingdings' },
    ]);
    const result = findSymbolFontsOnOrderedLevels(abstract);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ilvl: 0, numFmt: 'chicago' });
  });

  it('falls back to hAnsi / cs / eastAsia when ascii is absent', () => {
    const abstract = {
      name: 'w:abstractNum',
      attributes: { 'w:abstractNumId': '0' },
      elements: [
        {
          name: 'w:lvl',
          attributes: { 'w:ilvl': '0' },
          elements: [
            { name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
            {
              name: 'w:rPr',
              elements: [{ name: 'w:rFonts', attributes: { 'w:hAnsi': 'Wingdings' } }],
            },
          ],
        },
      ],
    };
    expect(findSymbolFontsOnOrderedLevels(abstract)).toEqual([{ ilvl: 0, numFmt: 'decimal', font: 'Wingdings' }]);
  });
});
