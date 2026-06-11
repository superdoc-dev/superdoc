import { describe, expect, it } from 'vitest';
import {
  readDefaultTableStyle,
  setDefaultTableStyle,
  removeDefaultTableStyle,
  ensureSettingsRoot,
  readSettingsRoot,
  hasOddEvenHeadersFooters,
  readFootnoteNumberFormat,
  readEndnoteNumberFormat,
  readFootnoteNumberStart,
  readEndnoteNumberStart,
  readFootnoteNumberRestart,
  readEndnoteNumberRestart,
  readFootnotePosition,
  readEndnotePosition,
  readSectionNoteConfigs,
  type ConverterWithDocumentSettings,
} from './document-settings.ts';

function makeConverter(settingsElements: unknown[] = []): ConverterWithDocumentSettings {
  return {
    convertedXml: {
      'word/settings.xml': {
        type: 'element',
        name: 'document',
        elements: [
          {
            type: 'element',
            name: 'w:settings',
            elements: settingsElements,
          },
        ],
      },
    },
  };
}

describe('readDefaultTableStyle', () => {
  it('returns the style ID when w:defaultTableStyle is present', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:defaultTableStyle',
        attributes: { 'w:val': 'GridTable4-Accent1' },
        elements: [],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readDefaultTableStyle(root)).toBe('GridTable4-Accent1');
  });

  it('returns null when w:defaultTableStyle is absent', () => {
    const converter = makeConverter([{ type: 'element', name: 'w:evenAndOddHeaders', elements: [] }]);
    const root = readSettingsRoot(converter)!;
    expect(readDefaultTableStyle(root)).toBeNull();
  });

  it('returns null for empty w:val', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:defaultTableStyle',
        attributes: { 'w:val': '' },
        elements: [],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readDefaultTableStyle(root)).toBeNull();
  });

  it('returns null when settings.xml is absent', () => {
    const converter: ConverterWithDocumentSettings = { convertedXml: {} };
    const root = readSettingsRoot(converter);
    expect(root).toBeNull();
  });
});

describe('setDefaultTableStyle', () => {
  it('adds w:defaultTableStyle when not present', () => {
    const converter = makeConverter([]);
    const root = ensureSettingsRoot(converter.convertedXml!['word/settings.xml'] as any);
    setDefaultTableStyle(root, 'TableGrid');
    expect(readDefaultTableStyle(root)).toBe('TableGrid');
  });

  it('replaces existing w:defaultTableStyle', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:defaultTableStyle',
        attributes: { 'w:val': 'OldStyle' },
        elements: [],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    setDefaultTableStyle(root, 'NewStyle');
    expect(readDefaultTableStyle(root)).toBe('NewStyle');
  });

  it('preserves sibling settings elements', () => {
    const converter = makeConverter([{ type: 'element', name: 'w:evenAndOddHeaders', elements: [] }]);
    const root = readSettingsRoot(converter)!;
    setDefaultTableStyle(root, 'TableGrid');
    expect(hasOddEvenHeadersFooters(root)).toBe(true);
    expect(readDefaultTableStyle(root)).toBe('TableGrid');
  });
});

describe('removeDefaultTableStyle', () => {
  it('removes w:defaultTableStyle when present', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:defaultTableStyle',
        attributes: { 'w:val': 'TableGrid' },
        elements: [],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    removeDefaultTableStyle(root);
    expect(readDefaultTableStyle(root)).toBeNull();
  });

  it('is a no-op when w:defaultTableStyle is absent', () => {
    const converter = makeConverter([{ type: 'element', name: 'w:evenAndOddHeaders', elements: [] }]);
    const root = readSettingsRoot(converter)!;
    removeDefaultTableStyle(root);
    expect(hasOddEvenHeadersFooters(root)).toBe(true);
  });

  it('preserves sibling elements', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:defaultTableStyle',
        attributes: { 'w:val': 'TableGrid' },
        elements: [],
      },
      { type: 'element', name: 'w:evenAndOddHeaders', elements: [] },
    ]);
    const root = readSettingsRoot(converter)!;
    removeDefaultTableStyle(root);
    expect(readDefaultTableStyle(root)).toBeNull();
    expect(hasOddEvenHeadersFooters(root)).toBe(true);
  });
});

describe('defaultTableStyle roundtrip', () => {
  it('set then read returns the same value', () => {
    const converter = makeConverter([]);
    const root = ensureSettingsRoot(converter.convertedXml!['word/settings.xml'] as any);
    setDefaultTableStyle(root, 'GridTable5-Dark-Accent2');
    expect(readDefaultTableStyle(root)).toBe('GridTable5-Dark-Accent2');
  });

  it('set then remove then read returns null', () => {
    const converter = makeConverter([]);
    const root = ensureSettingsRoot(converter.convertedXml!['word/settings.xml'] as any);
    setDefaultTableStyle(root, 'TableGrid');
    removeDefaultTableStyle(root);
    expect(readDefaultTableStyle(root)).toBeNull();
  });
});

// SD-2986/B1: footnote / endnote w:numFmt
describe('readFootnoteNumberFormat', () => {
  it('returns the numFmt value when present', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'upperRoman' } }],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readFootnoteNumberFormat(root)).toBe('upperRoman');
  });

  it('returns null when w:footnotePr is absent', () => {
    const converter = makeConverter([]);
    const root = readSettingsRoot(converter)!;
    expect(readFootnoteNumberFormat(root)).toBeNull();
  });

  it('returns null when w:numFmt is missing inside w:footnotePr', () => {
    const converter = makeConverter([{ type: 'element', name: 'w:footnotePr', elements: [] }]);
    const root = readSettingsRoot(converter)!;
    expect(readFootnoteNumberFormat(root)).toBeNull();
  });

  it('returns null when w:val is empty', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': '' } }],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readFootnoteNumberFormat(root)).toBeNull();
  });
});

describe('readFootnoteNumberStart', () => {
  it('returns the configured start value', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:numStart', attributes: { 'w:val': '5' } }],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readFootnoteNumberStart(root)).toBe(5);
  });

  it('returns null when w:numStart is absent', () => {
    const converter = makeConverter([{ type: 'element', name: 'w:footnotePr', elements: [] }]);
    const root = readSettingsRoot(converter)!;
    expect(readFootnoteNumberStart(root)).toBeNull();
  });

  it('returns null for non-numeric or sub-1 values', () => {
    const mk = (val: string) =>
      makeConverter([
        {
          type: 'element',
          name: 'w:footnotePr',
          elements: [{ type: 'element', name: 'w:numStart', attributes: { 'w:val': val } }],
        },
      ]);
    expect(readFootnoteNumberStart(readSettingsRoot(mk('abc'))!)).toBeNull();
    expect(readFootnoteNumberStart(readSettingsRoot(mk('0'))!)).toBeNull();
    expect(readFootnoteNumberStart(readSettingsRoot(mk('-3'))!)).toBeNull();
  });

  it('floors fractional values', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:numStart', attributes: { 'w:val': '7.9' } }],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readFootnoteNumberStart(root)).toBe(7);
  });
});

describe('readEndnoteNumberStart', () => {
  it('returns the configured start value', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:endnotePr',
        elements: [{ type: 'element', name: 'w:numStart', attributes: { 'w:val': '10' } }],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readEndnoteNumberStart(root)).toBe(10);
  });
});

describe('readEndnoteNumberFormat', () => {
  it('returns the numFmt value when present', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:endnotePr',
        elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'lowerRoman' } }],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readEndnoteNumberFormat(root)).toBe('lowerRoman');
  });

  it('does not confuse footnotePr with endnotePr', () => {
    const converter = makeConverter([
      {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'upperRoman' } }],
      },
    ]);
    const root = readSettingsRoot(converter)!;
    expect(readEndnoteNumberFormat(root)).toBeNull();
    expect(readFootnoteNumberFormat(root)).toBe('upperRoman');
  });
});

// §17.11.19 / ST_RestartNumber §17.18.74
describe('readFootnoteNumberRestart / readEndnoteNumberRestart', () => {
  it('returns continuous / eachPage / eachSect when set', () => {
    for (const v of ['continuous', 'eachPage', 'eachSect'] as const) {
      const conv = makeConverter([
        {
          type: 'element',
          name: 'w:footnotePr',
          elements: [{ type: 'element', name: 'w:numRestart', attributes: { 'w:val': v } }],
        },
      ]);
      expect(readFootnoteNumberRestart(readSettingsRoot(conv)!)).toBe(v);
    }
  });

  it('returns null when w:numRestart absent', () => {
    const conv = makeConverter([{ type: 'element', name: 'w:footnotePr', elements: [] }]);
    expect(readFootnoteNumberRestart(readSettingsRoot(conv)!)).toBeNull();
  });

  it('rejects unknown values per ST_RestartNumber', () => {
    const conv = makeConverter([
      {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:numRestart', attributes: { 'w:val': 'chickenLetters' } }],
      },
    ]);
    expect(readFootnoteNumberRestart(readSettingsRoot(conv)!)).toBeNull();
  });

  it('endnote variant reads from w:endnotePr', () => {
    const conv = makeConverter([
      {
        type: 'element',
        name: 'w:endnotePr',
        elements: [{ type: 'element', name: 'w:numRestart', attributes: { 'w:val': 'eachSect' } }],
      },
    ]);
    expect(readEndnoteNumberRestart(readSettingsRoot(conv)!)).toBe('eachSect');
    expect(readFootnoteNumberRestart(readSettingsRoot(conv)!)).toBeNull();
  });
});

// §17.11.21 / ST_FtnPos §17.18.34 — footnote / endnote placement
describe('readFootnotePosition / readEndnotePosition (§17.11.21)', () => {
  it('returns each of the 4 ST_FtnPos values when set', () => {
    for (const v of ['pageBottom', 'beneathText', 'sectEnd', 'docEnd'] as const) {
      const conv = makeConverter([
        {
          type: 'element',
          name: 'w:footnotePr',
          elements: [{ type: 'element', name: 'w:pos', attributes: { 'w:val': v } }],
        },
      ]);
      expect(readFootnotePosition(readSettingsRoot(conv)!)).toBe(v);
    }
  });

  it('returns null when w:pos absent', () => {
    const conv = makeConverter([{ type: 'element', name: 'w:footnotePr', elements: [] }]);
    expect(readFootnotePosition(readSettingsRoot(conv)!)).toBeNull();
  });

  it('rejects unknown values per ST_FtnPos', () => {
    const conv = makeConverter([
      {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:pos', attributes: { 'w:val': 'chickenLetters' } }],
      },
    ]);
    expect(readFootnotePosition(readSettingsRoot(conv)!)).toBeNull();
  });

  it('endnote variant reads w:endnotePr/w:pos only', () => {
    const conv = makeConverter([
      {
        type: 'element',
        name: 'w:endnotePr',
        elements: [{ type: 'element', name: 'w:pos', attributes: { 'w:val': 'docEnd' } }],
      },
    ]);
    expect(readEndnotePosition(readSettingsRoot(conv)!)).toBe('docEnd');
    expect(readFootnotePosition(readSettingsRoot(conv)!)).toBeNull();
  });
});

// §17.11.11 + §17.11.21 — section-level reader
describe('readSectionNoteConfigs (§17.11.11)', () => {
  function makeDocRoot(sectPrs: Array<{ kind: 'standalone' | 'wrappedInP'; pr: unknown }>) {
    const bodyChildren: unknown[] = [];
    for (const s of sectPrs) {
      if (s.kind === 'standalone') {
        bodyChildren.push(s.pr);
      } else {
        bodyChildren.push({
          type: 'element',
          name: 'w:p',
          elements: [{ type: 'element', name: 'w:pPr', elements: [s.pr] }],
        });
      }
    }
    return {
      type: 'element',
      name: 'document',
      elements: [{ type: 'element', name: 'w:body', elements: bodyChildren }],
    } as XmlElementLike;
  }
  type XmlElementLike = {
    type?: string;
    name: string;
    elements?: XmlElementLike[];
    attributes?: Record<string, unknown>;
  };

  it('returns empty map when no sections have footnotePr overrides', () => {
    const doc = makeDocRoot([
      {
        kind: 'standalone',
        pr: { type: 'element', name: 'w:sectPr', elements: [] },
      },
    ]);
    expect(readSectionNoteConfigs(doc as never, 'w:footnotePr').size).toBe(0);
  });

  it('extracts numFmt + numStart + numRestart per section', () => {
    const doc = makeDocRoot([
      {
        kind: 'wrappedInP',
        pr: {
          type: 'element',
          name: 'w:sectPr',
          elements: [
            {
              type: 'element',
              name: 'w:footnotePr',
              elements: [
                { type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
                { type: 'element', name: 'w:numStart', attributes: { 'w:val': '3' } },
                { type: 'element', name: 'w:numRestart', attributes: { 'w:val': 'eachSect' } },
              ],
            },
          ],
        },
      },
      {
        kind: 'standalone',
        pr: {
          type: 'element',
          name: 'w:sectPr',
          elements: [
            {
              type: 'element',
              name: 'w:footnotePr',
              elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'upperRoman' } }],
            },
          ],
        },
      },
    ]);
    const map = readSectionNoteConfigs(doc as never, 'w:footnotePr');
    expect(map.get(0)).toEqual({ numFmt: 'decimal', numStart: 3, numRestart: 'eachSect' });
    expect(map.get(1)).toEqual({ numFmt: 'upperRoman' });
  });

  it('§17.11.21 — section-level w:pos is ignored (not in config)', () => {
    const doc = makeDocRoot([
      {
        kind: 'standalone',
        pr: {
          type: 'element',
          name: 'w:sectPr',
          elements: [
            {
              type: 'element',
              name: 'w:footnotePr',
              elements: [
                { type: 'element', name: 'w:pos', attributes: { 'w:val': 'beneathText' } },
                { type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
              ],
            },
          ],
        },
      },
    ]);
    const cfg = readSectionNoteConfigs(doc as never, 'w:footnotePr').get(0);
    expect(cfg).toEqual({ numFmt: 'decimal' });
    expect(cfg).not.toHaveProperty('pos');
  });

  it('endnote variant reads w:endnotePr only', () => {
    const doc = makeDocRoot([
      {
        kind: 'standalone',
        pr: {
          type: 'element',
          name: 'w:sectPr',
          elements: [
            {
              type: 'element',
              name: 'w:endnotePr',
              elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'lowerRoman' } }],
            },
            {
              type: 'element',
              name: 'w:footnotePr',
              elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'decimal' } }],
            },
          ],
        },
      },
    ]);
    expect(readSectionNoteConfigs(doc as never, 'w:endnotePr').get(0)).toEqual({ numFmt: 'lowerRoman' });
    expect(readSectionNoteConfigs(doc as never, 'w:footnotePr').get(0)).toEqual({ numFmt: 'decimal' });
  });

  it('handles undefined document root gracefully', () => {
    expect(readSectionNoteConfigs(undefined, 'w:footnotePr').size).toBe(0);
  });
});
