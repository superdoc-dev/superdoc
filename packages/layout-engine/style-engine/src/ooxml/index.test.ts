import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TBL_LOOK,
  resolveStyleChain,
  getNumberingProperties,
  resolveDocxFontFamily,
  resolveRunProperties,
  resolveParagraphProperties,
  resolveCellStyles,
  resolveTableCellProperties,
  resolveTableProperties,
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

  it('uses Normal style when paragraph style is not specified', () => {
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
    expect(result).toEqual({ fontSize: 22, color: { val: 'BBBBBB' } });
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

  it('accumulates tabStops across the cascade', () => {
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
    expect(result.tabStops).toEqual([{ pos: 720 }, { pos: 1440 }, { pos: 2160 }]);
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

describe('ooxml - resolveTableCellProperties', () => {
  const gridTable4Styles = {
    ...emptyStyles,
    styles: {
      'GridTable4-Accent1': {
        type: 'table',
        tableProperties: { tableStyleRowBandSize: 1, tableStyleColBandSize: 1 },
        tableStyleProperties: {
          firstRow: {
            tableCellProperties: {
              shading: { val: 'clear', color: 'auto', fill: '156082' },
              borders: { top: { val: 'single', color: '156082', size: 4 } },
            },
          },
          band1Horz: {
            tableCellProperties: {
              shading: { val: 'clear', color: 'auto', fill: 'C1E4F5' },
            },
          },
          wholeTable: {
            tableCellProperties: {
              shading: { val: 'clear', color: 'auto', fill: 'EEEEEE' },
            },
          },
        },
      },
    },
  };

  it('resolves firstRow shading from table style', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'GridTable4-Accent1',
        tblLook: { firstRow: true, noHBand: false, noVBand: true },
      },
      rowIndex: 0,
      cellIndex: 1,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, gridTable4Styles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: '156082' });
  });

  it('resolves band1Horz shading for data rows', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'GridTable4-Accent1',
        tblLook: { firstRow: true, noHBand: false, noVBand: true },
      },
      rowIndex: 1,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, gridTable4Styles);
    // band1Horz overrides wholeTable
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: 'C1E4F5' });
  });

  it('falls back to wholeTable when no band matches', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'GridTable4-Accent1',
        tblLook: { firstRow: true, noHBand: true, noVBand: true },
      },
      rowIndex: 1,
      cellIndex: 1,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, gridTable4Styles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: 'EEEEEE' });
  });

  it('inline cell shading overrides style shading', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'GridTable4-Accent1',
        tblLook: { firstRow: true, noHBand: false, noVBand: true },
      },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const inlineProps = { shading: { val: 'clear', color: 'auto', fill: 'FF0000' } };
    const result = resolveTableCellProperties(inlineProps, tableInfo, gridTable4Styles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: 'FF0000' });
  });

  it('returns inline props when no table style exists', () => {
    const tableInfo = {
      tableProperties: {},
      rowIndex: 0,
      cellIndex: 0,
      numRows: 1,
      numCells: 1,
    };
    const inlineProps = { shading: { val: 'clear', fill: 'AABBCC' } };
    const result = resolveTableCellProperties(inlineProps, tableInfo, gridTable4Styles);
    expect(result.shading).toEqual({ val: 'clear', fill: 'AABBCC' });
  });

  it('returns empty object when no props available', () => {
    const result = resolveTableCellProperties(null, null, null);
    expect(result).toEqual({});
  });

  it('merges borders from style and inline', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'GridTable4-Accent1',
        tblLook: { firstRow: true, noHBand: false, noVBand: true },
      },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const inlineProps = { borders: { bottom: { val: 'double', color: '000000', size: 8 } } };
    const result = resolveTableCellProperties(inlineProps, tableInfo, gridTable4Styles);
    // firstRow style provides top border, inline provides bottom border - both should be present
    expect(result.borders?.top).toEqual({ val: 'single', color: '156082', size: 4 });
    expect(result.borders?.bottom).toEqual({ val: 'double', color: '000000', size: 8 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveStyleChain – cycle detection
// ──────────────────────────────────────────────────────────────────────────────

describe('ooxml - resolveStyleChain cycle detection', () => {
  it('handles direct cycle: A → B → A', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          A: { basedOn: 'B', runProperties: { bold: true } },
          B: { basedOn: 'A', runProperties: { italic: true } },
        },
      },
    });
    // Should not infinite loop — returns combined properties from the partial chain
    const result = resolveStyleChain('runProperties', params, 'A');
    expect(result).toEqual({ bold: true, italic: true });
  });

  it('handles indirect cycle: A → B → C → B', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          A: { basedOn: 'B', runProperties: { bold: true } },
          B: { basedOn: 'C', runProperties: { italic: true } },
          C: { basedOn: 'B', runProperties: { fontSize: 24 } },
        },
      },
    });
    const result = resolveStyleChain('runProperties', params, 'A');
    expect(result.bold).toBe(true);
    expect(result.italic).toBe(true);
    expect(result.fontSize).toBe(24);
  });

  it('handles self-referencing cycle: A → A', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          A: { basedOn: 'A', runProperties: { bold: true } },
        },
      },
    });
    const result = resolveStyleChain('runProperties', params, 'A');
    expect(result).toEqual({ bold: true });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveTableProperties
// ──────────────────────────────────────────────────────────────────────────────

describe('ooxml - resolveTableProperties', () => {
  it('returns empty object for null/undefined style ID', () => {
    expect(resolveTableProperties(null, emptyStyles)).toEqual({});
    expect(resolveTableProperties(undefined, emptyStyles)).toEqual({});
  });

  it('returns empty object when style does not exist', () => {
    expect(resolveTableProperties('MissingStyle', emptyStyles)).toEqual({});
  });

  it('resolves table properties from a single style', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        TableGrid: {
          type: 'table',
          tableProperties: {
            borders: { top: { val: 'single', size: 4, color: '000000' } },
            justification: 'center',
          },
        },
      },
    };
    const result = resolveTableProperties('TableGrid', styles);
    expect(result.borders).toEqual({ top: { val: 'single', size: 4, color: '000000' } });
    expect(result.justification).toBe('center');
  });

  it('follows basedOn chain for table properties (single level)', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        TableNormal: {
          type: 'table',
          tableProperties: {
            cellMargins: { marginLeft: { value: 108, type: 'dxa' } },
            justification: 'left',
          },
        },
        TableGrid: {
          type: 'table',
          basedOn: 'TableNormal',
          tableProperties: {
            borders: { top: { val: 'single', size: 4 } },
          },
        },
      },
    };
    const result = resolveTableProperties('TableGrid', styles);
    // From TableGrid
    expect(result.borders).toEqual({ top: { val: 'single', size: 4 } });
    // Inherited from TableNormal
    expect(result.cellMargins).toEqual({ marginLeft: { value: 108, type: 'dxa' } });
    expect(result.justification).toBe('left');
  });

  it('follows multi-level basedOn chain', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        Base: {
          type: 'table',
          tableProperties: { justification: 'left' },
        },
        Mid: {
          type: 'table',
          basedOn: 'Base',
          tableProperties: { cellMargins: { marginTop: { value: 50, type: 'dxa' } } },
        },
        Derived: {
          type: 'table',
          basedOn: 'Mid',
          tableProperties: { borders: { top: { val: 'single' } } },
        },
      },
    };
    const result = resolveTableProperties('Derived', styles);
    expect(result.borders).toEqual({ top: { val: 'single' } });
    expect(result.cellMargins).toEqual({ marginTop: { value: 50, type: 'dxa' } });
    expect(result.justification).toBe('left');
  });

  it('derived properties override base properties', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        Base: {
          type: 'table',
          tableProperties: { justification: 'left', tableCellSpacing: { value: 10, type: 'dxa' } },
        },
        Derived: {
          type: 'table',
          basedOn: 'Base',
          tableProperties: { justification: 'center' },
        },
      },
    };
    const result = resolveTableProperties('Derived', styles);
    // Overridden
    expect(result.justification).toBe('center');
    // Inherited
    expect(result.tableCellSpacing).toEqual({ value: 10, type: 'dxa' });
  });

  it('returns empty object when translatedLinkedStyles is null', () => {
    expect(resolveTableProperties('TableGrid', null)).toEqual({});
  });

  it('handles marginStart/marginEnd in cellMargins', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        RTLTable: {
          type: 'table',
          tableProperties: {
            cellMargins: {
              marginStart: { value: 100, type: 'dxa' },
              marginEnd: { value: 200, type: 'dxa' },
            },
          },
        },
      },
    };
    const result = resolveTableProperties('RTLTable', styles);
    expect(result.cellMargins?.marginStart).toEqual({ value: 100, type: 'dxa' });
    expect(result.cellMargins?.marginEnd).toEqual({ value: 200, type: 'dxa' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// basedOn inheritance for tblStylePr (conditional table style properties)
// ──────────────────────────────────────────────────────────────────────────────

describe('ooxml - resolveTableCellProperties basedOn tblStylePr inheritance', () => {
  it('inherits firstRow shading from base style when child has no firstRow entry', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        BaseTable: {
          type: 'table',
          tableProperties: { tableStyleRowBandSize: 1 },
          tableStyleProperties: {
            firstRow: {
              tableCellProperties: { shading: { val: 'clear', fill: 'AA0000' } },
            },
          },
        },
        ChildTable: {
          type: 'table',
          basedOn: 'BaseTable',
          tableProperties: {},
          tableStyleProperties: {
            wholeTable: {
              tableCellProperties: { shading: { val: 'clear', fill: 'EEEEEE' } },
            },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'ChildTable', tblLook: { firstRow: true, noHBand: true, noVBand: true } },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    expect(result.shading).toEqual({ val: 'clear', fill: 'AA0000' });
  });

  it('child tblStylePr overrides base tblStylePr for the same style type', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        BaseTable: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            band1Horz: {
              tableCellProperties: { shading: { val: 'clear', fill: 'CCCCCC' } },
            },
          },
        },
        ChildTable: {
          type: 'table',
          basedOn: 'BaseTable',
          tableProperties: {},
          tableStyleProperties: {
            band1Horz: {
              tableCellProperties: { shading: { val: 'clear', fill: 'FF0000' } },
            },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'ChildTable', tblLook: { noVBand: true } },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    expect(result.shading).toEqual({ val: 'clear', fill: 'FF0000' });
  });

  it('follows a 3-level basedOn chain for tblStylePr', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        Grandparent: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            firstRow: {
              tableCellProperties: { shading: { val: 'clear', fill: 'AAAAAA' } },
            },
          },
        },
        Parent: {
          type: 'table',
          basedOn: 'Grandparent',
          tableProperties: {},
          tableStyleProperties: {
            firstRow: {
              tableCellProperties: { shading: { val: 'clear', fill: 'BBBBBB' } },
            },
          },
        },
        Leaf: {
          type: 'table',
          basedOn: 'Parent',
          tableProperties: {},
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'Leaf', tblLook: { firstRow: true, noHBand: true, noVBand: true } },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 2,
      numCells: 2,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    // Parent overrides Grandparent; Leaf has no firstRow so Parent wins
    expect(result.shading).toEqual({ val: 'clear', fill: 'BBBBBB' });
  });

  it('inherits band sizes from base style', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        BaseTable: {
          type: 'table',
          tableProperties: { tableStyleRowBandSize: 2 },
          tableStyleProperties: {
            band1Horz: { tableCellProperties: { shading: { fill: 'AAA' } } },
            band2Horz: { tableCellProperties: { shading: { fill: 'BBB' } } },
          },
        },
        ChildTable: {
          type: 'table',
          basedOn: 'BaseTable',
          tableProperties: {},
        },
      },
    };
    // With bandSize=2, rows 0-1 are band1, rows 2-3 are band2
    const tableInfoRow2 = {
      tableProperties: { tableStyleId: 'ChildTable', tblLook: { noVBand: true } },
      rowIndex: 2,
      cellIndex: 0,
      numRows: 4,
      numCells: 2,
    };
    const result = resolveTableCellProperties(null, tableInfoRow2, styles);
    expect(result.shading).toEqual({ fill: 'BBB' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// cnfStyle supplementing index-based conditional type detection
// ──────────────────────────────────────────────────────────────────────────────

describe('ooxml - resolveCellStyles cnfStyle flags', () => {
  it('includes firstRow properties when cellCnfStyle.firstRow is true at non-zero rowIndex', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        TestTable: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            firstRow: { tableCellProperties: { shading: { fill: 'HEADER' } } },
            wholeTable: { tableCellProperties: { shading: { fill: 'DEFAULT' } } },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'TestTable', tblLook: { firstRow: true, noHBand: true, noVBand: true } },
      rowIndex: 2, // Not row 0, but cnfStyle says firstRow
      cellIndex: 0,
      numRows: 4,
      numCells: 3,
      cellCnfStyle: { firstRow: true },
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, styles);
    // Should contain both wholeTable and firstRow (from cnfStyle)
    expect(result).toEqual([{ shading: { fill: 'DEFAULT' } }, { shading: { fill: 'HEADER' } }]);
  });

  it('firstRow wins over cnfStyle-added band1Horz (ECMA-376 precedence)', () => {
    // Regression: cnfStyle-added bands must not override row/corner types.
    // ECMA-376 §17.7.6 precedence: wholeTable < bands < firstCol/lastCol < firstRow/lastRow < corners
    const styles = {
      ...emptyStyles,
      styles: {
        TestTable: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            band1Horz: { tableCellProperties: { shading: { fill: 'BAND' } } },
            firstRow: { tableCellProperties: { shading: { fill: 'HEADER' } } },
            wholeTable: { tableCellProperties: { shading: { fill: 'DEFAULT' } } },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestTable',
        tblLook: { firstRow: true, noHBand: true, noVBand: true },
      },
      rowIndex: 0, // row 0 = firstRow
      cellIndex: 0,
      numRows: 4,
      numCells: 3,
      // cnfStyle adds band1Horz even though noHBand suppressed it from index logic
      rowCnfStyle: { firstRow: true, oddHBand: true },
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, styles);
    // Order must be: wholeTable → band1Horz → firstRow (last wins in combineProperties)
    expect(result).toEqual([
      { shading: { fill: 'DEFAULT' } },
      { shading: { fill: 'BAND' } },
      { shading: { fill: 'HEADER' } },
    ]);
  });

  it('returns same result without cnfStyle (no regression)', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        TestTable: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            wholeTable: { tableCellProperties: { shading: { fill: 'DEFAULT' } } },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'TestTable', tblLook: { noHBand: true, noVBand: true } },
      rowIndex: 1,
      cellIndex: 0,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, styles);
    expect(result).toEqual([{ shading: { fill: 'DEFAULT' } }]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DEFAULT_TBL_LOOK fallback when tblLook is absent (SD-2086)
// ──────────────────────────────────────────────────────────────────────────────

describe('ooxml - DEFAULT_TBL_LOOK fallback when tblLook is absent', () => {
  it('applies firstRow shading when tblLook is absent (SD-2086)', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        GridTable4: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            firstRow: {
              tableCellProperties: { shading: { val: 'clear', fill: 'HEADER' } },
            },
            wholeTable: {
              tableCellProperties: { shading: { val: 'clear', fill: 'DEFAULT' } },
            },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'GridTable4', tblLook: undefined },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    // DEFAULT_TBL_LOOK has firstRow: true, so row 0 gets firstRow shading
    expect(result.shading).toEqual({ val: 'clear', fill: 'HEADER' });
  });

  it('explicit tblLook.firstRow: false still suppresses firstRow formatting', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        GridTable4: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            firstRow: {
              tableCellProperties: { shading: { val: 'clear', fill: 'HEADER' } },
            },
            wholeTable: {
              tableCellProperties: { shading: { val: 'clear', fill: 'DEFAULT' } },
            },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'GridTable4',
        tblLook: { firstRow: false, noHBand: true, noVBand: true },
      },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    // Explicit tblLook overrides the default — firstRow is suppressed
    expect(result.shading).toEqual({ val: 'clear', fill: 'DEFAULT' });
  });

  it('applies firstRow through basedOn chain when tblLook is absent', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        BaseTable: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            firstRow: {
              tableCellProperties: { shading: { val: 'clear', fill: 'INHERITED_HEADER' } },
            },
          },
        },
        ChildTable: {
          type: 'table',
          basedOn: 'BaseTable',
          tableProperties: {},
          tableStyleProperties: {
            wholeTable: {
              tableCellProperties: { shading: { val: 'clear', fill: 'CHILD_DEFAULT' } },
            },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'ChildTable', tblLook: undefined },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    // firstRow inherited from BaseTable, enabled by DEFAULT_TBL_LOOK
    expect(result.shading).toEqual({ val: 'clear', fill: 'INHERITED_HEADER' });
  });

  it('noVBand defaults to true — vertical banding is suppressed', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        BandTable: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            band1Vert: {
              tableCellProperties: { shading: { val: 'clear', fill: 'VBAND' } },
            },
            wholeTable: {
              tableCellProperties: { shading: { val: 'clear', fill: 'DEFAULT' } },
            },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'BandTable', tblLook: undefined },
      rowIndex: 1,
      cellIndex: 1,
      numRows: 3,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    // DEFAULT_TBL_LOOK has noVBand: true, so band1Vert should NOT appear
    expect(result.shading).toEqual({ val: 'clear', fill: 'DEFAULT' });
  });

  it('noHBand defaults to false — horizontal banding is enabled', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        BandTable: {
          type: 'table',
          tableProperties: {},
          tableStyleProperties: {
            band1Horz: {
              tableCellProperties: { shading: { val: 'clear', fill: 'HBAND' } },
            },
            wholeTable: {
              tableCellProperties: { shading: { val: 'clear', fill: 'DEFAULT' } },
            },
          },
        },
      },
    };
    const tableInfo = {
      tableProperties: { tableStyleId: 'BandTable', tblLook: undefined },
      // Row 1 is the first data row (row 0 is firstRow with DEFAULT_TBL_LOOK).
      // band1Horz applies to the first banding group after the header.
      rowIndex: 1,
      cellIndex: 0,
      numRows: 4,
      numCells: 4,
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    // DEFAULT_TBL_LOOK has noHBand: false, so band1Horz IS applied
    expect(result.shading).toEqual({ val: 'clear', fill: 'HBAND' });
  });
});
