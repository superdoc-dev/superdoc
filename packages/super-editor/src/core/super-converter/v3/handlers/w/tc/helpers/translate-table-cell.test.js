import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock children translation to keep tests focused on this module
vi.mock('@converter/v2/exporter/helpers/index', () => ({
  translateChildNodes: vi.fn(() => [{ name: 'w:p', elements: [] }]),
}));

import { pixelsToTwips, pixelsToEightPoints, twipsToPixels } from '@converter/helpers.js';
import { translateTableCell, generateTableCellProperties } from './translate-table-cell.js';

describe('translate-table-cell helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateTableCellProperties builds tcPr with width, span, bg, margins, vAlign, vMerge, and borders', () => {
    const node = {
      attrs: {
        colwidth: [100, 50],
        widthUnit: 'px',
        cellWidthType: 'dxa',
        background: { color: '#FF00FF' },
        colspan: 2,
        rowspan: 3,
        cellMargins: { top: 96, right: 48, bottom: 0, left: 24 },
        verticalAlign: 'center',
        borders: {
          top: { color: '#FF0000', size: 2, space: 1 },
          bottom: { val: 'none' },
        },
      },
    };

    const tcPr = generateTableCellProperties(node);
    expect(tcPr.name).toBe('w:tcPr');

    const byName = Object.fromEntries(tcPr.elements.map((e) => [e.name, e]));

    // tcW
    expect(byName['w:tcW'].attributes['w:w']).toBe(String(pixelsToTwips(150)));
    expect(byName['w:tcW'].attributes['w:type']).toBe('dxa');

    // gridSpan
    expect(byName['w:gridSpan'].attributes['w:val']).toBe('2');

    // background
    expect(byName['w:shd'].attributes['w:fill']).toBe('#FF00FF');

    // tcMar
    const mar = byName['w:tcMar'];

    expect(Array.isArray(mar.elements)).toBe(true);
    const marMap = Object.fromEntries(mar.elements.map((e) => [e.name, e.attributes['w:w']]));
    expect(marMap['w:top']).toBe(String(pixelsToTwips(96)));
    expect(marMap['w:right']).toBe(String(pixelsToTwips(48)));
    expect(marMap['w:bottom']).toBe(String(pixelsToTwips(0)));
    expect(marMap['w:left']).toBe(String(pixelsToTwips(24)));

    // vAlign
    expect(byName['w:vAlign'].attributes['w:val']).toBe('center');

    // vMerge for start of a vertical merge
    expect(byName['w:vMerge'].attributes['w:val']).toBe('restart');

    // borders
    const borders = byName['w:tcBorders'];
    const bMap = Object.fromEntries(borders.elements.map((e) => [e.name, e]));
    expect(bMap['w:top'].attributes).toMatchObject({
      'w:val': 'single',
      'w:color': 'FF0000',
      'w:sz': String(pixelsToEightPoints(2)),
      'w:space': '1',
    });
    expect(bMap['w:bottom'].attributes['w:val']).toBe('nil');
  });

  it('generateTableCellProperties adds continuation vMerge when continueMerge is set', () => {
    const node = { attrs: { colwidth: [10], widthUnit: 'px', continueMerge: true } };
    const tcPr = generateTableCellProperties(node);
    const vMerge = tcPr.elements.find((e) => e.name === 'w:vMerge');
    expect(vMerge).toBeTruthy();
    expect(vMerge.attributes).toEqual({ 'w:val': 'continue' });
  });

  it('translateTableCell wraps children with tcPr as the first element', async () => {
    const params = {
      node: { attrs: { colwidth: [60], widthUnit: 'px' } },
      children: [],
    };

    const out = translateTableCell(params);
    expect(out.name).toBe('w:tc');
    expect(Array.isArray(out.elements)).toBe(true);
    expect(out.elements[0].name).toBe('w:tcPr');
    // mocked child from translateChildNodes
    expect(out.elements[1]).toMatchObject({ name: 'w:p' });
  });
});

/** Helper: extract w:tcW element from a generateTableCellProperties result */
function getTcW(tcPr) {
  return tcPr.elements?.find((e) => e.name === 'w:tcW') ?? null;
}

describe('IT-550: tableHeader width export fixes', () => {
  it('uses pixelsToTwips when widthUnit is px', () => {
    const node = { attrs: { colwidth: [100], widthUnit: 'px' } };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    expect(tcW.attributes['w:w']).toBe(String(pixelsToTwips(100)));
    expect(tcW.attributes['w:type']).toBe('dxa');
  });

  it('defaults widthUnit to px when missing', () => {
    // Simulates a tableHeader node before Step 1 fix — no widthUnit attr at all
    const node = { attrs: { colwidth: [100] } };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    // Should use pixelsToTwips (not inchesToTwips), producing 1500, not 144000
    expect(tcW.attributes['w:w']).toBe(String(pixelsToTwips(100)));
  });

  it('preserves existing cellWidth when colwidth is null', () => {
    const originalCellWidth = { value: 3000, type: 'dxa' };
    const node = {
      attrs: {
        colwidth: null,
        widthUnit: 'px',
        tableCellProperties: { cellWidth: originalCellWidth },
      },
    };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    // Should preserve the original value, not write 0
    expect(tcW.attributes['w:w']).toBe('3000');
    expect(tcW.attributes['w:type']).toBe('dxa');
  });

  it('preserves existing cellWidth when colwidth is empty array', () => {
    const originalCellWidth = { value: 3000, type: 'dxa' };
    const node = {
      attrs: {
        colwidth: [],
        widthUnit: 'px',
        tableCellProperties: { cellWidth: originalCellWidth },
      },
    };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    expect(tcW.attributes['w:w']).toBe('3000');
  });

  it('filters non-finite values from colwidth', () => {
    const node = { attrs: { colwidth: [100, NaN, 50], widthUnit: 'px' } };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    // Only 100 + 50 = 150 should be summed (NaN filtered out)
    expect(tcW.attributes['w:w']).toBe(String(pixelsToTwips(150)));
  });

  it('preserves original cellWidth for pct width type', () => {
    // Simulates a pct-imported cell: widthType is 'pct', colwidth is in pixels (from tblGrid fallback)
    const originalCellWidth = { value: 5000, type: 'pct' };
    const node = {
      attrs: {
        colwidth: [200],
        widthUnit: 'px',
        widthType: 'pct',
        tableCellProperties: { cellWidth: originalCellWidth },
      },
    };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    // Should preserve original pct value, NOT rewrite with pixelsToTwips(200)
    expect(tcW.attributes['w:w']).toBe('5000');
    expect(tcW.attributes['w:type']).toBe('pct');
  });

  it('resolves widthType dxa from node attrs', () => {
    const node = { attrs: { colwidth: [100], widthUnit: 'px', widthType: 'dxa' } };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    expect(tcW.attributes['w:type']).toBe('dxa');
  });

  it('falls through auto widthType to tableCellProperties.cellWidth.type', () => {
    const node = {
      attrs: {
        colwidth: [100],
        widthUnit: 'px',
        widthType: 'auto',
        tableCellProperties: { cellWidth: { value: 1500, type: 'dxa' } },
      },
    };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    // 'auto' is the uninformative default — should fall through to tableCellProperties type
    expect(tcW.attributes['w:type']).toBe('dxa');
  });

  it('falls through auto widthType to dxa when no tableCellProperties type', () => {
    const node = {
      attrs: {
        colwidth: [100],
        widthUnit: 'px',
        widthType: 'auto',
      },
    };
    const tcPr = generateTableCellProperties(node);
    const tcW = getTcW(tcPr);
    expect(tcW.attributes['w:type']).toBe('dxa');
  });
});
