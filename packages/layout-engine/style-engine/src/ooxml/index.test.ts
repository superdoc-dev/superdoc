import { describe, expect, it } from 'vitest';
import {
  resolveStyleChain,
  getNumberingProperties,
  resolveDocxFontFamily,
  resolveRunProperties,
  resolveParagraphProperties,
  resolveCellStyles,
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
  it('returns inline props when translatedLinkedStyles is null', () => {
    const params = buildParams({ translatedLinkedStyles: null });
    const result = resolveRunProperties(params, { bold: true }, null);
    expect(result).toEqual({ bold: true });
  });

  it('returns inline props when translatedLinkedStyles.styles is undefined', () => {
    const params = buildParams({
      translatedLinkedStyles: { docDefaults: {}, latentStyles: {} } as never,
    });
    const result = resolveRunProperties(params, { bold: true }, null);
    expect(result).toEqual({ bold: true });
  });

  it('returns empty object when both translatedLinkedStyles and inlineRpr are null', () => {
    const params = buildParams({ translatedLinkedStyles: null });
    const result = resolveRunProperties(params, null, null);
    expect(result).toEqual({});
  });

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

  it('applies table cell run properties in cascade order', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          TableStyle1: {
            type: 'table',
            runProperties: { color: { val: 'AAAAAA' } },
            tableProperties: { tableStyleRowBandSize: 1, tableStyleColBandSize: 1 },
            tableStyleProperties: {
              wholeTable: { runProperties: { bold: true, fontSize: 10 } },
              band1Horz: { runProperties: { italic: true, color: { val: 'BBBBBB' }, fontSize: 11 } },
              band1Vert: { runProperties: { color: { val: 'CCCCCC' }, fontSize: 12 } },
              firstRow: { runProperties: { fontSize: 13 } },
              firstCol: { runProperties: { fontSize: 14 } },
              nwCell: { runProperties: { fontSize: 15 } },
            },
          },
        },
      },
    });
    const tableInfo = {
      tableProperties: { tableStyleId: 'TableStyle1', tblLook: { firstRow: true, firstColumn: true } },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 2,
      numCells: 2,
    };
    const result = resolveRunProperties(params, {}, null, tableInfo);
    expect(result.fontSize).toBe(15);
    expect(result.bold).toBe(true);
    expect(result.italic).toBe(true);
    expect(result.color).toEqual({ val: 'CCCCCC' });
  });
});

describe('ooxml - resolveParagraphProperties', () => {
  it('returns inline props when translatedLinkedStyles is null', () => {
    const params = buildParams({ translatedLinkedStyles: null });
    const result = resolveParagraphProperties(params, { styleId: 'test' }, null);
    expect(result).toEqual({ styleId: 'test' });
  });

  it('returns inline props when translatedLinkedStyles.styles is undefined', () => {
    const params = buildParams({
      translatedLinkedStyles: { docDefaults: {}, latentStyles: {} } as never,
    });
    const result = resolveParagraphProperties(params, { styleId: 'test' }, null);
    expect(result).toEqual({ styleId: 'test' });
  });

  it('returns empty object when both translatedLinkedStyles and inlineProps are null', () => {
    const params = buildParams({ translatedLinkedStyles: null });
    const result = resolveParagraphProperties(params, null, null);
    expect(result).toEqual({});
  });

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

  it('applies table cell paragraph properties over table style props', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          TableStyle1: {
            type: 'table',
            paragraphProperties: { spacing: { before: 120, after: 120 }, keepNext: true },
            tableProperties: { tableStyleRowBandSize: 1, tableStyleColBandSize: 1 },
            tableStyleProperties: {
              firstRow: { paragraphProperties: { spacing: { after: 240 } } },
            },
          },
        },
      },
    });
    const tableInfo = {
      tableProperties: { tableStyleId: 'TableStyle1', tblLook: { firstRow: true } },
      rowIndex: 0,
      cellIndex: 2,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveParagraphProperties(params, {}, tableInfo);
    expect(result.spacing).toEqual({ before: 120, after: 240 });
    expect(result.keepNext).toBe(true);
  });
});

describe('ooxml - resolveCellStyles', () => {
  it('respects band sizes and tblLook flags', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          TableStyleBand: {
            type: 'table',
            tableProperties: { tableStyleRowBandSize: 2, tableStyleColBandSize: 3 },
            tableStyleProperties: {
              wholeTable: { runProperties: { fontSize: 10 } },
              band1Vert: { runProperties: { fontSize: 20 } },
              band2Vert: { runProperties: { fontSize: 30 } },
              band1Horz: { runProperties: { fontSize: 40 } },
              band2Horz: { runProperties: { fontSize: 50 } },
            },
          },
        },
      },
    });
    const tableInfo = {
      tableProperties: { tableStyleId: 'TableStyleBand', tblLook: { noVBand: true } },
      rowIndex: 3,
      cellIndex: 2,
      numRows: 5,
      numCells: 6,
    };
    const result = resolveCellStyles('runProperties', tableInfo, params.translatedLinkedStyles!);
    expect(result).toEqual([{ fontSize: 10 }, { fontSize: 50 }]);
  });
});
