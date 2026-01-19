import { describe, expect, it } from 'vitest';
import {
  resolveStyleChain,
  getNumberingProperties,
  resolveDocxFontFamily,
  resolveRunProperties,
  resolveParagraphProperties,
  type OoxmlResolverParams,
} from './index.js';

const emptyStyles = { docDefaults: {}, latentStyles: {}, styles: {} };
const emptyNumbering = { abstracts: {}, definitions: {} };

const buildParams = (overrides?: Partial<OoxmlResolverParams>): OoxmlResolverParams => ({
  translatedLinkedStyles: emptyStyles,
  translatedNumbering: emptyNumbering,
  ...overrides,
});

describe('ooxml - resolveStyleChain', () => {
  it('returns empty object when styleId is undefined', () => {
    const params = buildParams();
    const result = resolveStyleChain('runProperties', params, undefined);
    expect(result).toEqual({});
  });

  it('resolves a single style without basedOn', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          Heading1: { runProperties: { fontSize: 32, bold: true } },
        },
      },
    });
    const result = resolveStyleChain('runProperties', params, 'Heading1');
    expect(result).toEqual({ fontSize: 32, bold: true });
  });

  it('follows basedOn chain and combines properties', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          BaseStyle: { runProperties: { fontSize: 22, italic: true } },
          DerivedStyle: { basedOn: 'BaseStyle', runProperties: { fontSize: 24, bold: true } },
        },
      },
    });
    const result = resolveStyleChain('runProperties', params, 'DerivedStyle');
    expect(result).toEqual({ fontSize: 24, bold: true, italic: true });
  });

  it('returns empty object when styleId is missing from definitions', () => {
    const params = buildParams();
    const result = resolveStyleChain('runProperties', params, 'MissingStyle');
    expect(result).toEqual({});
  });
});

describe('ooxml - getNumberingProperties', () => {
  it('extracts properties from abstractNum level definition', () => {
    const params = buildParams({
      translatedNumbering: {
        definitions: {
          '1': { abstractNumId: 10 },
        },
        abstracts: {
          '10': {
            levels: {
              '0': { paragraphProperties: { spacing: { before: 240 } } },
            },
          },
        },
      },
    });
    const result = getNumberingProperties('paragraphProperties', params, 0, 1);
    expect(result).toEqual({ spacing: { before: 240 } });
  });

  it('applies lvlOverride over abstractNum properties', () => {
    const params = buildParams({
      translatedNumbering: {
        definitions: {
          '1': {
            abstractNumId: 10,
            lvlOverrides: {
              '0': { paragraphProperties: { spacing: { after: 120 } } },
            },
          },
        },
        abstracts: {
          '10': {
            levels: {
              '0': { paragraphProperties: { spacing: { before: 240 } } },
            },
          },
        },
      },
    });
    const result = getNumberingProperties('paragraphProperties', params, 0, 1);
    expect(result).toEqual({ spacing: { before: 240, after: 120 } });
  });

  it('returns empty object when numbering definition is missing', () => {
    const params = buildParams();
    const result = getNumberingProperties('paragraphProperties', params, 0, 999);
    expect(result).toEqual({});
  });
});

describe('ooxml - resolveDocxFontFamily', () => {
  it('extracts ascii font when available', () => {
    const result = resolveDocxFontFamily({ ascii: 'Calibri' }, null);
    expect(result).toBe('Calibri');
  });

  it('returns null when attributes is not an object', () => {
    expect(resolveDocxFontFamily(null, null)).toBeNull();
    expect(resolveDocxFontFamily(undefined, null)).toBeNull();
    expect(resolveDocxFontFamily('invalid' as never, null)).toBeNull();
  });
});

describe('ooxml - resolveRunProperties', () => {
  it('returns resolved run properties with defaults', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        docDefaults: { runProperties: { fontSize: 20 } },
        styles: {
          Normal: { default: true, runProperties: { fontSize: 22 } },
        },
      },
    });
    const result = resolveRunProperties(params, null, null);
    expect(result).toHaveProperty('fontSize', 22);
  });

  it('prefers defaults over Normal when Normal is not default', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        docDefaults: { runProperties: { fontSize: 20, color: { val: 'AAAAAA' } } },
        styles: {
          Normal: { default: false, runProperties: { fontSize: 22, color: { val: 'BBBBBB' } } },
        },
      },
    });
    const result = resolveRunProperties(params, null, null);
    expect(result).toEqual({ fontSize: 20, color: { val: 'AAAAAA' } });
  });

  it('skips run style props for TOC paragraphs', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          TOC1: { runProperties: { bold: true } },
          Emphasis: { runProperties: { italic: true } },
        },
      },
    });
    const result = resolveRunProperties(params, { styleId: 'Emphasis', color: { val: 'FF0000' } }, { styleId: 'TOC1' });
    expect(result.bold).toBe(true);
    expect(result.italic).toBeUndefined();
    expect(result.color).toEqual({ val: 'FF0000' });
  });

  it('ignores inline rPr for list numbers when numbering is not inline', () => {
    const params = buildParams({
      translatedNumbering: {
        definitions: { '1': { abstractNumId: 10 } },
        abstracts: {
          '10': {
            levels: {
              '0': { runProperties: { bold: false, color: { val: '00FF00' } } },
            },
          },
        },
      },
    });
    const result = resolveRunProperties(
      params,
      { underline: { val: 'single' }, bold: true },
      { numberingProperties: { numId: 1, ilvl: 0 } },
      null,
      true,
      false,
    );
    expect(result.bold).toBe(false);
    expect(result.underline).toBeUndefined();
    expect(result.color).toEqual({ val: '00FF00' });
  });
});

describe('ooxml - resolveParagraphProperties', () => {
  it('combines defaults, Normal, and inline props', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        docDefaults: { paragraphProperties: { spacing: { before: 240 } } },
        styles: {
          Normal: { default: true, paragraphProperties: { spacing: { after: 120 } } },
        },
      },
    });
    const inlineProps = { spacing: { before: 480 } };
    const result = resolveParagraphProperties(params, inlineProps);
    expect(result.spacing).toEqual({ before: 480, after: 120 });
  });

  it('lets numbering override style indent when numbering is defined inline', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          ListStyle: { paragraphProperties: { indent: { left: 1200 } } },
        },
      },
      translatedNumbering: {
        definitions: { '1': { abstractNumId: 10 } },
        abstracts: {
          '10': {
            levels: {
              '0': { paragraphProperties: { indent: { left: 720 } } },
            },
          },
        },
      },
    });
    const result = resolveParagraphProperties(params, {
      styleId: 'ListStyle',
      numberingProperties: { numId: 1, ilvl: 0 },
    });
    expect(result.indent?.left).toBe(720);
  });

  it('uses numbering style but ignores basedOn chain for indentation', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          BaseStyle: { paragraphProperties: { indent: { left: 2000 } } },
          NumberedStyle: {
            basedOn: 'BaseStyle',
            paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
          },
        },
      },
      translatedNumbering: {
        definitions: { '1': { abstractNumId: 10 } },
        abstracts: {
          '10': {
            levels: {
              '0': { paragraphProperties: { indent: { left: 800 } }, styleId: 'NumberedStyle' },
            },
          },
        },
      },
    });
    const inlineProps = { numberingProperties: { numId: 1, ilvl: 0 } };
    const result = resolveParagraphProperties(params, inlineProps);
    expect(result.indent?.left).toBe(800);
  });

  it('overrides tabStops across the cascade', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        docDefaults: { paragraphProperties: { tabStops: [{ pos: 720 }] } },
        styles: {
          Normal: { default: true, paragraphProperties: { tabStops: [{ pos: 1440 }] } },
        },
      },
    });
    const result = resolveParagraphProperties(params, { tabStops: [{ pos: 2160 }] });
    expect(result.tabStops).toEqual([{ pos: 2160 }]);
  });
});
