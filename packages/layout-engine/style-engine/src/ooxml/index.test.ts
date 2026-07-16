import { describe, expect, it } from 'bun:test';
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

  it('uses canonical built-in heading properties for localized heading style conflicts', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          Kop1: {
            type: 'paragraph',
            styleId: 'Kop1',
            name: 'heading 1',
            runProperties: { fontSize: 20, bold: true, color: { val: '000000' } },
            paragraphProperties: { spacing: { after: 120 } },
          },
          Heading1: {
            type: 'paragraph',
            styleId: 'Heading1',
            name: 'heading 1',
            runProperties: { fontSize: 32, bold: true, color: { val: '1F4E79' } },
            paragraphProperties: { spacing: { after: 240 }, keepNext: true },
          },
        },
      },
    });

    expect(resolveStyleChain('runProperties', params, 'Kop1')).toEqual({
      fontSize: 32,
      bold: true,
      color: { val: '1F4E79' },
    });
    expect(resolveParagraphProperties(params, { styleId: 'Kop1' }, null)).toEqual({
      styleId: 'Kop1',
      spacing: { after: 240 },
      keepNext: true,
      indent: undefined,
    });
  });

  it('resolves basedOn references through the canonical heading mapping for derived styles', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          MyHeading: {
            type: 'paragraph',
            styleId: 'MyHeading',
            name: 'My Heading',
            basedOn: 'Kop1',
            runProperties: { italic: true },
          },
          Kop1: {
            type: 'paragraph',
            styleId: 'Kop1',
            name: 'heading 1',
            runProperties: { fontSize: 20, bold: true, color: { val: '000000' } },
          },
          Heading1: {
            type: 'paragraph',
            styleId: 'Heading1',
            name: 'heading 1',
            runProperties: { fontSize: 32, color: { val: '1F4E79' } },
          },
        },
      },
    });

    // A custom style based on the localized `Kop1` must inherit the canonical
    // `Heading1` formatting, not the literal small/black `Kop1` definition.
    expect(resolveStyleChain('runProperties', params, 'MyHeading')).toEqual({
      fontSize: 32,
      color: { val: '1F4E79' },
      italic: true,
    });
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
    expect(result.fontSize).toBe(15); // nwCell (corner) is highest priority
    expect(result.bold).toBe(true); // wholeTable
    expect(result.italic).toBe(true); // band1Horz
    // Word applies COLUMN banding over row banding (verified vs Word renders, SD-3028),
    // so band1Vert's color wins over band1Horz's.
    expect(result.color).toEqual({ val: 'CCCCCC' });
  });
  it('does not treat paragraph mark run properties as inherited text styling', () => {
    const params = buildParams({ translatedLinkedStyles: null });
    const result = resolveRunProperties(params, { italic: true }, { runProperties: { bold: true } });
    expect(result).toEqual({ italic: true });
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

  // SD-3028 (Gabriel review): Word applies COLUMN banding over row banding (verified by 150dpi
  // Word renders of first_row_styling / conditional_style_regions: interior cells paint
  // band1Vert/band2Vert #EEEEEE/#FAFAFA, not band1Horz/band2Horz). When both band axes are
  // active, the vertical band must be the highest-priority (last) entry.
  it('applies column banding over row banding when both axes are active (matches Word)', () => {
    const params = buildParams({
      translatedLinkedStyles: {
        ...emptyStyles,
        styles: {
          TableBandBoth: {
            type: 'table',
            tableProperties: { tableStyleRowBandSize: 1, tableStyleColBandSize: 1 },
            tableStyleProperties: {
              wholeTable: { runProperties: { fontSize: 10 } },
              band1Horz: { runProperties: { fontSize: 40 } },
              band1Vert: { runProperties: { fontSize: 20 } },
            },
          },
        },
      },
    });
    const tableInfo = {
      // both band axes active (noHBand/noVBand unset), no edge flags
      tableProperties: { tableStyleId: 'TableBandBoth', tblLook: {} },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 4,
      numCells: 4,
    };
    const result = resolveCellStyles('runProperties', tableInfo, params.translatedLinkedStyles!);
    // Array is low -> high; the highest-priority (last) entry must be the column band.
    expect(result[result.length - 1]).toEqual({ fontSize: 20 }); // band1Vert wins over band1Horz
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

  // SD-3028 (Gabriel review, conditional_style_regions): the fixture declares 3 gridCol but
  // each row has 4 cells. Word auto-extends the grid to 4; SuperDoc must treat the actual cell
  // count as the column boundary so lastCol/ne/se apply ONLY to the true last column, not to
  // every column whose end reaches the (under-declared) grid width.
  it('uses actual cell count as the last-column boundary when the grid under-declares columns', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        UnderGrid: {
          type: 'table',
          tableProperties: { tableStyleRowBandSize: 1, tableStyleColBandSize: 1 },
          tableStyleProperties: {
            wholeTable: { tableCellProperties: { shading: { val: 'clear', color: 'auto', fill: 'FFFFFF' } } },
            lastCol: { tableCellProperties: { shading: { val: 'clear', color: 'auto', fill: 'AAAAAA' } } },
          },
        },
      },
    };
    const base = {
      tableProperties: { tableStyleId: 'UnderGrid', tblLook: { lastColumn: true, noHBand: true, noVBand: true } },
      rowIndex: 1,
      numRows: 4,
      numCells: 4,
      numGridCols: 3, // grid under-declares: 3 cols for 4 cells
    };
    // 3rd cell (grid col 2, end 3): NOT the last column once the grid is reconciled to 4.
    const col3 = resolveTableCellProperties(
      null,
      { ...base, cellIndex: 2, gridColumnStart: 2, gridColumnSpan: 1 },
      styles,
    );
    expect(col3.shading).toEqual({ val: 'clear', color: 'auto', fill: 'FFFFFF' });
    // 4th cell (grid col 3, end 4): the true last column.
    const col4 = resolveTableCellProperties(
      null,
      { ...base, cellIndex: 3, gridColumnStart: 3, gridColumnSpan: 1 },
      styles,
    );
    expect(col4.shading).toEqual({ val: 'clear', color: 'auto', fill: 'AAAAAA' });
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
// Style base-level tcPr as the wholeTable layer (ECMA-376 17.7.6, SD-3035)
// A table style's base-level <w:tcPr><w:shd/></w:tcPr> is stored on the style
// def's own tableCellProperties (sibling of tableStyleProperties) and IS the
// wholeTable conditional layer. Word paints it on every cell.
// ──────────────────────────────────────────────────────────────────────────────

describe('ooxml - style base-level tcPr surfaces as wholeTable (SD-3035)', () => {
  const interiorCell = (styleId: string) => ({
    tableProperties: { tableStyleId: styleId, tblLook: { noHBand: true, noVBand: true } },
    rowIndex: 1,
    cellIndex: 1,
    numRows: 3,
    numCells: 3,
  });

  it('resolves a base-level shading with no explicit wholeTable region', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        CondStyle: {
          type: 'table',
          tableProperties: {},
          tableCellProperties: { shading: { val: 'clear', color: 'auto', fill: 'F2F2F2' } },
        },
      },
    };
    const result = resolveTableCellProperties(null, interiorCell('CondStyle'), styles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: 'F2F2F2' });
  });

  it('leaf base-level shading beats an ancestor base-level shading via basedOn', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        BaseStyle: {
          type: 'table',
          tableProperties: {},
          tableCellProperties: { shading: { fill: 'AAAAAA' } },
        },
        LeafStyle: {
          type: 'table',
          basedOn: 'BaseStyle',
          tableProperties: {},
          tableCellProperties: { shading: { fill: 'F2F2F2' } },
        },
      },
    };
    const result = resolveTableCellProperties(null, interiorCell('LeafStyle'), styles);
    expect(result.shading).toEqual({ fill: 'F2F2F2' });
  });

  it('an explicit tableStyleProperties.wholeTable entry beats the base-level tcPr', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        CondStyle: {
          type: 'table',
          tableProperties: {},
          tableCellProperties: { shading: { fill: 'BASE99' } },
          tableStyleProperties: {
            wholeTable: { tableCellProperties: { shading: { fill: 'EXPL77' } } },
          },
        },
      },
    };
    const result = resolveTableCellProperties(null, interiorCell('CondStyle'), styles);
    expect(result.shading).toEqual({ fill: 'EXPL77' });
  });

  it('inline cell shading still wins over the base-level wholeTable fill', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        CondStyle: {
          type: 'table',
          tableProperties: {},
          tableCellProperties: { shading: { fill: 'F2F2F2' } },
        },
      },
    };
    const result = resolveTableCellProperties({ shading: { fill: '4472C4' } }, interiorCell('CondStyle'), styles);
    expect(result.shading).toEqual({ fill: '4472C4' });
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

// ──────────────────────────────────────────────────────────────────────────────
// Corner gating: corners only apply when both row and column toggles are on
// (Word / Office behavior per MS-OI29500 §2.1.1310)
// ──────────────────────────────────────────────────────────────────────────────

describe('ooxml - corner cell gating matches Word behavior', () => {
  const cornerStyles = {
    ...emptyStyles,
    styles: {
      TestCorner: {
        type: 'table',
        tableProperties: {},
        tableStyleProperties: {
          wholeTable: { tableCellProperties: { shading: { fill: 'DEFAULT' } } },
          firstRow: { tableCellProperties: { shading: { fill: 'FIRST_ROW' } } },
          lastRow: { tableCellProperties: { shading: { fill: 'LAST_ROW' } } },
          firstCol: { tableCellProperties: { shading: { fill: 'FIRST_COL' } } },
          lastCol: { tableCellProperties: { shading: { fill: 'LAST_COL' } } },
          nwCell: { tableCellProperties: { shading: { fill: 'NW' } } },
          neCell: { tableCellProperties: { shading: { fill: 'NE' } } },
          swCell: { tableCellProperties: { shading: { fill: 'SW' } } },
          seCell: { tableCellProperties: { shading: { fill: 'SE' } } },
        },
      },
    },
  };

  it('does NOT apply swCell when lastRow is true but firstColumn is false', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: { firstRow: true, lastRow: true, firstColumn: false, lastColumn: false, noHBand: true, noVBand: true },
      },
      rowIndex: 2,
      cellIndex: 0,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('LAST_ROW');
    expect(fills).not.toContain('SW');
  });

  it('does NOT apply seCell when lastRow is true but lastColumn is false', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: { firstRow: true, lastRow: true, firstColumn: false, lastColumn: false, noHBand: true, noVBand: true },
      },
      rowIndex: 2,
      cellIndex: 2,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('LAST_ROW');
    expect(fills).not.toContain('SE');
  });

  it('applies swCell when both lastRow and firstColumn are true', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: { firstRow: true, lastRow: true, firstColumn: true, lastColumn: false, noHBand: true, noVBand: true },
      },
      rowIndex: 2,
      cellIndex: 0,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('LAST_ROW');
    expect(fills).toContain('FIRST_COL');
    expect(fills).toContain('SW');
  });

  it('applies seCell when both lastRow and lastColumn are true', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: { firstRow: true, lastRow: true, firstColumn: false, lastColumn: true, noHBand: true, noVBand: true },
      },
      rowIndex: 2,
      cellIndex: 2,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('LAST_ROW');
    expect(fills).toContain('LAST_COL');
    expect(fills).toContain('SE');
  });

  it('does NOT apply nwCell when firstRow is true but firstColumn is false', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: {
          firstRow: true,
          lastRow: false,
          firstColumn: false,
          lastColumn: false,
          noHBand: true,
          noVBand: true,
        },
      },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('FIRST_ROW');
    expect(fills).not.toContain('NW');
  });

  it('applies nwCell when both firstRow and firstColumn are true', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: { firstRow: true, lastRow: false, firstColumn: true, lastColumn: false, noHBand: true, noVBand: true },
      },
      rowIndex: 0,
      cellIndex: 0,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('FIRST_ROW');
    expect(fills).toContain('FIRST_COL');
    expect(fills).toContain('NW');
  });

  it('does NOT apply neCell when firstRow is true but lastColumn is false', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: {
          firstRow: true,
          lastRow: false,
          firstColumn: false,
          lastColumn: false,
          noHBand: true,
          noVBand: true,
        },
      },
      rowIndex: 0,
      cellIndex: 2,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('FIRST_ROW');
    expect(fills).not.toContain('NE');
  });

  it('applies neCell when both firstRow and lastColumn are true', () => {
    const tableInfo = {
      tableProperties: {
        tableStyleId: 'TestCorner',
        tblLook: { firstRow: true, lastRow: false, firstColumn: false, lastColumn: true, noHBand: true, noVBand: true },
      },
      rowIndex: 0,
      cellIndex: 2,
      numRows: 3,
      numCells: 3,
    };
    const result = resolveCellStyles('tableCellProperties', tableInfo, cornerStyles);
    const fills = result.map((r: any) => r.shading?.fill);
    expect(fills).toContain('FIRST_ROW');
    expect(fills).toContain('LAST_COL');
    expect(fills).toContain('NE');
  });
});

/**
 * SD-3028 G7: conditional firstCol/lastCol regions are GRID positions in Word,
 * not display-cell indices. gridSpan, vMerge continuations (merged away at
 * import), and gridBefore placeholders all shift display indices off the grid,
 * landing edge styling one column early. TableInfo carries optional grid
 * positions; display indices remain the fallback for legacy callers.
 *
 * Fixture evidence: merged_cells_with_styles.docx, Word render 2026-06-06
 * (B3 stays unshaded; the lastCol green follows grid column 3 through the
 * vMerge; the gridSpan firstRow cell keeps firstCol at grid start).
 */
describe('grid-position conditional regions (SD-3028 G7)', () => {
  const condGridStyles = {
    ...emptyStyles,
    styles: {
      CondGrid: {
        type: 'table',
        tableStyleProperties: {
          firstCol: { tableCellProperties: { shading: { val: 'clear', color: 'auto', fill: 'FFFF00' } } },
          lastCol: { tableCellProperties: { shading: { val: 'clear', color: 'auto', fill: '92D050' } } },
        },
      },
    },
  };

  const tableInfoBase = {
    tableProperties: {
      tableStyleId: 'CondGrid',
      tblLook: { firstRow: false, lastRow: false, firstColumn: true, lastColumn: true, noHBand: true, noVBand: true },
    },
    numRows: 3,
  };

  it('does not mark a middle cell lastCol when a vMerge hides the trailing display cell', () => {
    // Row 3 of the fixture: display cells [A3, B3] because C3 is a vMerge
    // continuation. B3 is display-last but sits at grid column 1 of 3.
    const tableInfo = {
      ...tableInfoBase,
      rowIndex: 2,
      cellIndex: 1,
      numCells: 2,
      gridColumnStart: 1,
      gridColumnSpan: 1,
      numGridCols: 3,
    };
    const result = resolveTableCellProperties(null, tableInfo, condGridStyles);
    expect(result.shading).toBeUndefined();
  });

  it('marks lastCol when the cell grid span reaches the last grid column', () => {
    // The vMerge restart cell in column C: display index 2, grid columns 2..3.
    const tableInfo = {
      ...tableInfoBase,
      rowIndex: 1,
      cellIndex: 2,
      numCells: 3,
      gridColumnStart: 2,
      gridColumnSpan: 1,
      numGridCols: 3,
    };
    const result = resolveTableCellProperties(null, tableInfo, condGridStyles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: '92D050' });
  });

  it('keeps firstCol by grid start when a placeholder shifts the display index', () => {
    // A gridBefore placeholder makes the first REAL cell display index 1, but
    // it still starts at grid column 0.
    const tableInfo = {
      ...tableInfoBase,
      rowIndex: 1,
      cellIndex: 1,
      numCells: 3,
      gridColumnStart: 0,
      gridColumnSpan: 1,
      numGridCols: 3,
    };
    const result = resolveTableCellProperties(null, tableInfo, condGridStyles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: 'FFFF00' });
  });

  it('falls back to display indices when grid positions are absent', () => {
    const tableInfo = {
      ...tableInfoBase,
      rowIndex: 1,
      cellIndex: 2,
      numCells: 3,
    };
    const result = resolveTableCellProperties(null, tableInfo, condGridStyles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: '92D050' });
  });
});

/**
 * SD-3028 G5 remainder, DISPROVEN and locked: a table STYLE's table-level
 * shading (w:tblPr > w:shd) does NOT fill cells in Word. Measured from the
 * nested_tables_with_styles.docx Word render (NestedSage style carries
 * <w:tblPr><w:shd w:fill="C6E0B4"/> and no tcPr shading): the inner cells
 * render pure white (zero C6E0B4 pixels); only the style's borders and run
 * formatting apply. Cell fills come from the style's base tcPr (the
 * wholeTable layer), conditional regions, or inline cell shading.
 */
describe('table style tblPr shading stays off cells (SD-3028 G5, Word-verified)', () => {
  const tableInfo = {
    tableProperties: { tableStyleId: 'NestedSage', tblLook: { noHBand: true, noVBand: true } },
    rowIndex: 0,
    cellIndex: 0,
    numRows: 2,
    numCells: 2,
  };

  it('does not paint the style table-level shading onto cells', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        NestedSage: {
          type: 'table',
          tableProperties: { shading: { val: 'clear', color: 'auto', fill: 'C6E0B4' } },
        },
      },
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    expect(result.shading).toBeUndefined();
  });

  it('still fills cells from the style base tcPr when both shadings exist', () => {
    const styles = {
      ...emptyStyles,
      styles: {
        NestedSage: {
          type: 'table',
          tableProperties: { shading: { val: 'clear', color: 'auto', fill: 'C6E0B4' } },
          tableCellProperties: { shading: { val: 'clear', color: 'auto', fill: 'F2F2F2' } },
        },
      },
    };
    const result = resolveTableCellProperties(null, tableInfo, styles);
    expect(result.shading).toEqual({ val: 'clear', color: 'auto', fill: 'F2F2F2' });
  });
});
