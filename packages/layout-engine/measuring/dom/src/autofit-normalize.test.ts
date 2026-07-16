import { describe, expect, it } from 'vitest';
import type { TableBlock } from '@superdoc/contracts';
import { buildAutoFitWorkingGridInput } from './autofit-normalize.js';
import { computeFixedTableColumnWidths } from './fixed-table-columns.js';

/**
 * Build a minimal runtime table block for normalization tests.
 *
 * @param overrides - Partial table block overrides for the scenario under test.
 * @returns Table block with stable defaults.
 */
function createTableBlock(overrides: Partial<TableBlock> = {}): TableBlock {
  return {
    kind: 'table',
    id: 'table-1',
    rows: [],
    attrs: {},
    columnWidths: [],
    ...overrides,
  };
}

describe('buildAutoFitWorkingGridInput', () => {
  it('normalizes a plain grid-backed table', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 320, type: 'px' },
      },
      columnWidths: [100, 220],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', colSpan: 1 },
            { id: 'cell-2', colSpan: 1 },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.layoutMode).toBe('fixed');
    expect(result.preferredTableWidth).toBe(320);
    expect(result.preferredColumnWidths).toEqual([100, 220]);
    expect(result.gridColumnCount).toBe(2);
    expect(result.rows[0].logicalColumnCount).toBe(2);
    expect(result.rows[0].cells).toEqual([
      { cellId: 'cell-1', startColumn: 0, span: 1, preferredWidth: undefined },
      { cellId: 'cell-2', startColumn: 1, span: 1, preferredWidth: undefined },
    ]);
  });

  it('marks complete fixed grids that already match tblW as authoritative', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 400, type: 'px' },
      },
      columnWidths: [57.53333333333333, 239.46666666666667, 103],
      rows: [
        {
          id: 'row-1',
          cells: [
            {
              id: 'cell-1',
              attrs: { tableCellProperties: { cellWidth: { value: 2880, type: 'dxa' } } },
            },
            {
              id: 'cell-2',
              attrs: { tableCellProperties: { cellWidth: { value: 1440, type: 'dxa' } } },
            },
            {
              id: 'cell-3',
              attrs: { tableCellProperties: { cellWidth: { value: 5760, type: 'dxa' } } },
            },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.preserveAuthoredGrid).toBe(true);
  });

  it('marks complete fixed grids that are slightly under tblW as authoritative', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 386, type: 'px' },
      },
      columnWidths: [86.8, 56.667, 56.667, 56.667, 56.667, 56.667],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1' },
            { id: 'cell-2' },
            { id: 'cell-3' },
            { id: 'cell-4' },
            { id: 'cell-5' },
            { id: 'cell-6' },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 386 });

    expect(result.preserveAuthoredGrid).toBe(true);
  });

  it('does not mark incomplete fixed grids as authoritative', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 400, type: 'px' },
      },
      columnWidths: [120, 180],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }, { id: 'cell-3' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.preserveAuthoredGrid).toBeUndefined();
    expect(result.gridColumnCount).toBe(3);
  });

  // SD-3309: a pct-width table re-resolves its absolute width against the CURRENT available
  // width, so the authored grid sum (from authoring-time twips) legitimately differs from the
  // re-resolved table width while the grid PROPORTIONS stay authoritative. Word honors those
  // proportions (300dpi probes: a tblW=pct table with grid 30/70 + short content renders 30/70,
  // not content-sized). The grid sum must NOT have to equal the table width for a pct table.
  it('preserves an explicit non-uniform grid for a pct-width table even when the grid sum differs from the resolved width', () => {
    const block = createTableBlock({
      attrs: {
        // 100% of available; resolves to 624 at maxWidth 624, but the authored grid sums to 640.
        tableWidth: { width: 5000, type: 'pct' },
      },
      columnWidths: [192, 448], // 30 / 70, authored twips->px, sum 640 != 624
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 624 });

    expect(result.layoutMode).toBe('autofit');
    expect(result.preferredTableWidth).toBe(624);
    expect(result.preserveExplicitAutoGrid).toBe(true);
  });

  it('does not preserve a uniform pct-width grid with no concrete cell widths (lets content size it)', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { width: 5000, type: 'pct' },
      },
      columnWidths: [312, 312], // uniform, no cell width hints
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 624 });

    expect(result.preserveExplicitAutoGrid).toBeUndefined();
  });

  it('does not mark complete fixed grids far under tblW as authoritative', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 500, type: 'px' },
      },
      columnWidths: [120, 180],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.preserveAuthoredGrid).toBeUndefined();
  });

  it('marks complete non-uniform tblW auto grids as preferred AutoFit geometry', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { value: 0, type: 'auto' },
      },
      columnWidths: [290, 152],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.layoutMode).toBe('autofit');
    expect(result.preferredTableWidth).toBeUndefined();
    expect(result.preserveAutoGrid).toBe(true);
  });

  it('does not mark uniform tblW auto grids as preferred AutoFit geometry', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { value: 0, type: 'auto' },
      },
      columnWidths: [156, 156, 156, 156],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }, { id: 'cell-3' }, { id: 'cell-4' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 624 });

    expect(result.preserveAutoGrid).toBeUndefined();
    expect(result.gridColumnCount).toBe(4);
  });

  it('records a fitting uniform tblW auto grid as the AutoFit width budget even when tcW preferences overflow it', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { value: 0, type: 'auto' },
      },
      columnWidths: [144, 144, 144, 144],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', attrs: { tableCellProperties: { cellWidth: { value: 3600, type: 'dxa' } } } },
            { id: 'cell-2', attrs: { tableCellProperties: { cellWidth: { value: 1152, type: 'dxa' } } } },
            { id: 'cell-3', attrs: { tableCellProperties: { cellWidth: { value: 2160, type: 'dxa' } } } },
            { id: 'cell-4', attrs: { tableCellProperties: { cellWidth: { value: 4320, type: 'dxa' } } } },
          ],
        },
        {
          id: 'row-2',
          cells: [
            { id: 'cell-5', attrs: { tableCellProperties: { cellWidth: { value: 2160, type: 'dxa' } } } },
            { id: 'cell-6', attrs: { tableCellProperties: { cellWidth: { value: 2160, type: 'dxa' } } } },
            { id: 'cell-7', attrs: { tableCellProperties: { cellWidth: { value: 2160, type: 'dxa' } } } },
            { id: 'cell-8', attrs: { tableCellProperties: { cellWidth: { value: 2160, type: 'dxa' } } } },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 576 });

    expect(result.preferredTableWidth).toBeUndefined();
    expect(result.preferredColumnWidths).toEqual([144, 144, 144, 144]);
    expect(result.preserveAutoGrid).toBeUndefined();
    expect(result).toMatchObject({ autoGridWidthBudget: 576 });
  });

  it('records a fitting non-uniform tblW auto grid as the AutoFit width budget when tcW preferences overflow it', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { value: 0, type: 'auto' },
      },
      columnWidths: [180, 120, 276],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', attrs: { tableCellProperties: { cellWidth: { value: 3600, type: 'dxa' } } } },
            { id: 'cell-2', attrs: { tableCellProperties: { cellWidth: { value: 2160, type: 'dxa' } } } },
            { id: 'cell-3', attrs: { tableCellProperties: { cellWidth: { value: 5400, type: 'dxa' } } } },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 576 });

    expect(result.preserveAutoGrid).toBe(true);
    expect(result.preferredColumnWidths).toEqual([180, 120, 276]);
    expect(result).toMatchObject({ autoGridWidthBudget: 576 });
  });

  it('does not create an AutoFit grid budget from fallback widths when tblW and tblGrid are omitted', () => {
    const block = createTableBlock({
      attrs: {},
      columnWidths: [312, 312],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', attrs: { tableCellProperties: { cellWidth: { value: 3885, type: 'dxa' } } } },
            { id: 'cell-2', attrs: { tableCellProperties: { cellWidth: { value: 3900, type: 'dxa' } } } },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 624 });

    expect(result.preferredTableWidth).toBeUndefined();
    expect(result.preferredColumnWidths).toEqual([312, 312]);
    expect(result.autoGridWidthBudget).toBeUndefined();
  });

  it('does not mark incomplete tblW auto grids as preferred AutoFit geometry', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { value: 0, type: 'auto' },
      },
      columnWidths: [290],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.preserveAutoGrid).toBeUndefined();
    expect(result.gridColumnCount).toBe(2);
  });

  it('marks complete explicit tblW AutoFit grids that match tblW as preferred geometry', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { width: 652.867, type: 'px' },
      },
      columnWidths: [95.867, 472.533, 84.467],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }, { id: 'cell-3' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 800 });

    expect(result.layoutMode).toBe('autofit');
    expect(result.preferredTableWidth).toBe(652.867);
    expect(result.preserveExplicitAutoGrid).toBe(true);
  });

  it('does not mark explicit tblW AutoFit grids when the grid does not match tblW', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { width: 600, type: 'px' },
      },
      columnWidths: [95.867, 472.533, 84.467],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }, { id: 'cell-3' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 800 });

    expect(result.preserveExplicitAutoGrid).toBeUndefined();
  });

  it('marks uniform explicit tblW AutoFit grids as preferred geometry when they match tblW', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { width: 624, type: 'px' },
      },
      columnWidths: [156, 156, 156, 156],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', attrs: { tableCellProperties: { cellWidth: { value: 2340, type: 'dxa' } } } },
            { id: 'cell-2', attrs: { tableCellProperties: { cellWidth: { value: 2340, type: 'dxa' } } } },
            { id: 'cell-3', attrs: { tableCellProperties: { cellWidth: { value: 2340, type: 'dxa' } } } },
            { id: 'cell-4', attrs: { tableCellProperties: { cellWidth: { value: 2340, type: 'dxa' } } } },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 624 });

    expect(result.preserveExplicitAutoGrid).toBe(true);
  });

  it('does not mark uniform explicit tblW AutoFit grids with auto cell widths as preferred geometry', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { width: 624, type: 'px' },
      },
      columnWidths: [156, 156, 156, 156],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', attrs: { tableCellProperties: { cellWidth: { value: 0, type: 'auto' } } } },
            { id: 'cell-2', attrs: { tableCellProperties: { cellWidth: { value: 0, type: 'auto' } } } },
            { id: 'cell-3', attrs: { tableCellProperties: { cellWidth: { value: 0, type: 'auto' } } } },
            { id: 'cell-4', attrs: { tableCellProperties: { cellWidth: { value: 0, type: 'auto' } } } },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 624 });

    expect(result.preserveExplicitAutoGrid).toBeUndefined();
  });

  it('trims trailing unused placeholder grid columns', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 386, type: 'px' },
      },
      columnWidths: [86.8, 56.667, 56.667, 56.667, 56.667, 56.667, 0.4],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1' },
            { id: 'cell-2' },
            { id: 'cell-3' },
            { id: 'cell-4' },
            { id: 'cell-5' },
            { id: 'cell-6' },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 386 });

    expect(result.preferredColumnWidths).toEqual([86.8, 56.667, 56.667, 56.667, 56.667, 56.667]);
    expect(result.gridColumnCount).toBe(6);
  });

  it('ignores near-zero gridAfter placeholder columns', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 386, type: 'px' },
      },
      columnWidths: [86.8, 56.667, 56.667, 56.667, 56.667, 56.667, 0.4],
      rows: [
        {
          id: 'row-1',
          attrs: {
            tableRowProperties: {
              gridAfter: 1,
              wAfter: { value: 8, type: 'dxa' },
            },
          },
          cells: [
            { id: 'cell-1' },
            { id: 'cell-2' },
            { id: 'cell-3' },
            { id: 'cell-4' },
            { id: 'cell-5' },
            { id: 'cell-6' },
          ],
        },
        {
          id: 'row-2',
          cells: [{ id: 'cell-full-span', colSpan: 7 }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 386 });

    expect(result.rows[0].skippedAfter).toEqual([]);
    expect(result.rows[1].cells[0].span).toBe(6);
    expect(result.preferredColumnWidths).toEqual([86.8, 56.667, 56.667, 56.667, 56.667, 56.667]);
    expect(result.gridColumnCount).toBe(6);
  });

  it('keeps substantive gridAfter columns', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 400, type: 'px' },
      },
      columnWidths: [100, 100, 40],
      rows: [
        {
          id: 'row-1',
          attrs: {
            tableRowProperties: {
              gridAfter: 1,
              wAfter: { value: 600, type: 'dxa' },
            },
          },
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 400 });

    expect(result.rows[0].skippedAfter).toHaveLength(1);
    expect(result.preferredColumnWidths).toEqual([100, 100, 40]);
    expect(result.gridColumnCount).toBe(3);
  });

  it('keeps trailing unused authored grid columns when they are not placeholders', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: 400, type: 'px' },
      },
      columnWidths: [100, 100, 40],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1' }, { id: 'cell-2' }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 400 });

    expect(result.preferredColumnWidths).toEqual([100, 100, 40]);
    expect(result.gridColumnCount).toBe(3);
  });

  it('normalizes omitted tblLayout to autofit mode', () => {
    const block = createTableBlock({
      rows: [{ id: 'row-1', cells: [{ id: 'cell-1', colSpan: 1 }] }],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.layoutMode).toBe('autofit');
  });

  it('normalizes the OOXML auto literal to autofit mode', () => {
    const block = createTableBlock({
      attrs: {
        tableLayout: 'auto',
      },
      rows: [{ id: 'row-1', cells: [{ id: 'cell-1', colSpan: 1 }] }],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.layoutMode).toBe('autofit');
  });

  it('turns row skips into real logical columns', () => {
    const block = createTableBlock({
      rows: [
        {
          id: 'row-1',
          attrs: {
            tableRowProperties: {
              gridBefore: 1,
              gridAfter: 2,
            },
          },
          cells: [{ id: 'cell-1', colSpan: 1 }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.rows[0].skippedBefore).toHaveLength(1);
    expect(result.rows[0].skippedAfter).toHaveLength(2);
    expect(result.rows[0].skippedBefore).toEqual([
      { columnIndex: 0, preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
    ]);
    expect(result.rows[0].skippedAfter).toEqual([
      { columnIndex: 2, preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
      { columnIndex: 3, preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
    ]);
    expect(result.rows[0].skippedColumns).toEqual([
      { columnIndex: 0, preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
      { columnIndex: 2, preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
      { columnIndex: 3, preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
    ]);
    expect(result.rows[0].cells).toEqual([{ cellId: 'cell-1', startColumn: 1, span: 1, preferredWidth: undefined }]);
    expect(result.gridColumnCount).toBe(4);
  });

  it('preserves wBefore and wAfter as preferred-width skipped-column seeds', () => {
    const block = createTableBlock({
      rows: [
        {
          id: 'row-1',
          attrs: {
            tableRowProperties: {
              gridBefore: 2,
              gridAfter: 1,
              wBefore: { value: 300, type: 'dxa' },
              wAfter: { value: 100, type: 'dxa' },
            },
          },
          cells: [{ id: 'cell-1', colSpan: 1 }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.rows[0].skippedBefore).toEqual([
      { columnIndex: 0, preferredWidth: 10, minContentWidth: 0, maxContentWidth: 0 },
      { columnIndex: 1, preferredWidth: 10, minContentWidth: 0, maxContentWidth: 0 },
    ]);
    expect(result.rows[0].skippedAfter).toEqual([
      { columnIndex: 3, preferredWidth: 100 / 15, minContentWidth: 0, maxContentWidth: 0 },
    ]);
  });

  it('preserves colspan cells as span-aware inputs', () => {
    const block = createTableBlock({
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1', colSpan: 3 }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.rows[0].cells).toEqual([{ cellId: 'cell-1', startColumn: 0, span: 3, preferredWidth: undefined }]);
    expect(result.gridColumnCount).toBe(3);
  });

  it('preserves preferred cell width metadata', () => {
    const block = createTableBlock({
      attrs: {
        tableWidth: { value: 2500, type: 'pct' },
      },
      rows: [
        {
          id: 'row-1',
          cells: [
            {
              id: 'cell-1',
              colSpan: 1,
              attrs: {
                tableCellProperties: {
                  cellWidth: { value: 1500, type: 'dxa' },
                },
              },
            },
            {
              id: 'cell-2',
              colSpan: 1,
              attrs: {
                tableCellProperties: {
                  cellWidth: { value: 2500, type: 'pct' },
                },
              },
            },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.preferredTableWidth).toBe(300);
    expect(result.rows[0].cells).toEqual([
      { cellId: 'cell-1', startColumn: 0, span: 1, preferredWidth: 100 },
      { cellId: 'cell-2', startColumn: 1, span: 1, preferredWidth: 150 },
    ]);
  });

  it('surfaces a grid extension requirement when spans exceed current grid width', () => {
    const block = createTableBlock({
      columnWidths: [120],
      rows: [
        {
          id: 'row-1',
          cells: [{ id: 'cell-1', colSpan: 3 }],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.preferredColumnWidths).toEqual([120]);
    expect(result.gridColumnCount).toBe(3);
  });

  it('produces explicit logical placement for mixed skips and spans', () => {
    const block = createTableBlock({
      rows: [
        {
          id: 'row-1',
          attrs: {
            tableRowProperties: {
              gridBefore: 1,
              gridAfter: 1,
              wBefore: { value: 150, type: 'dxa' },
            },
          },
          cells: [
            { id: 'cell-1', colSpan: 2 },
            { id: 'cell-2', colSpan: 1 },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.rows[0]).toMatchObject({
      logicalColumnCount: 5,
      skippedColumns: [
        { columnIndex: 0, preferredWidth: 10 },
        { columnIndex: 4, preferredWidth: undefined },
      ],
      cells: [
        { cellId: 'cell-1', startColumn: 1, span: 2, preferredWidth: undefined },
        { cellId: 'cell-2', startColumn: 3, span: 1, preferredWidth: undefined },
      ],
    });
  });

  it('skips columns occupied by active rowspans when placing later-row cells', () => {
    const block = createTableBlock({
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', colSpan: 1, rowSpan: 2 },
            { id: 'cell-2', colSpan: 1 },
          ],
        },
        {
          id: 'row-2',
          cells: [
            {
              id: 'cell-3',
              colSpan: 1,
              attrs: {
                tableCellProperties: {
                  cellWidth: { value: 1500, type: 'dxa' },
                },
              },
            },
          ],
        },
      ],
    });

    const result = buildAutoFitWorkingGridInput(block, { maxWidth: 600 });

    expect(result.rows[0].cells).toEqual([
      { cellId: 'cell-1', startColumn: 0, span: 1, preferredWidth: undefined },
      { cellId: 'cell-2', startColumn: 1, span: 1, preferredWidth: undefined },
    ]);
    expect(result.rows[1]).toMatchObject({
      logicalColumnCount: 2,
      cells: [{ cellId: 'cell-3', startColumn: 1, span: 1, preferredWidth: 100 }],
    });
    expect(result.gridColumnCount).toBe(2);
  });
});

/**
 * SD-1513 regression locks: overhanging fixed-layout tables with a merged,
 * inset row (gridBefore/gridAfter + wBefore/wAfter + gridSpan).
 *
 * Contract, verified against Word renders and the live production pipeline:
 * the authored grid is preserved verbatim (preserveAuthoredGrid), so the
 * merged span resolves to exactly grid_sum - wBefore - wAfter. Word wraps the
 * cell text at that width; any narrowing here reflows lines one word early.
 *
 * Block shapes below mirror the v1 layout-adapter output captured from the
 * running pipeline: tableWidth pre-converted to px, cell widths as raw dxa
 * measurements, row skips on attrs.tableRowProperties.
 */
describe('overhanging fixed tables with a merged inset row (SD-1513)', () => {
  const TWIPS_PER_PX = 15;

  /** Table block mirroring the adapter output for a fixed table with one merged inset row. */
  function createOverhangBlock(args: {
    gridDxa: number[];
    headerCells: Array<{ span?: number; widthDxa: number }>;
    insetRow: { wBeforeDxa: number; wAfterDxa: number; span: number; widthDxa: number };
  }): TableBlock {
    const gridSumDxa = args.gridDxa.reduce((sum, w) => sum + w, 0);
    return createTableBlock({
      attrs: {
        tableLayout: 'fixed',
        tableWidth: { width: gridSumDxa / TWIPS_PER_PX, type: 'dxa' },
      },
      columnWidths: args.gridDxa.map((w) => w / TWIPS_PER_PX),
      rows: [
        {
          id: 'header-row',
          cells: args.headerCells.map((cell, index) => ({
            id: `header-${index}`,
            colSpan: cell.span ?? 1,
            attrs: { tableCellProperties: { cellWidth: { value: cell.widthDxa, type: 'dxa' } } },
          })),
        },
        {
          id: 'inset-row',
          attrs: {
            tableRowProperties: {
              gridBefore: 1,
              gridAfter: 1,
              wBefore: { value: args.insetRow.wBeforeDxa, type: 'dxa' },
              wAfter: { value: args.insetRow.wAfterDxa, type: 'dxa' },
            },
          },
          cells: [
            {
              id: 'merged-cell',
              colSpan: args.insetRow.span,
              attrs: { tableCellProperties: { cellWidth: { value: args.insetRow.widthDxa, type: 'dxa' } } },
            },
          ],
        },
      ],
    } as Partial<TableBlock>);
  }

  /** Resolve the merged span's final width: the solved columns it covers. */
  function solveMergedSpanWidth(block: TableBlock, maxWidth: number, span: number): number {
    const working = buildAutoFitWorkingGridInput(block, { maxWidth });
    // The overhang shape must take the authored-grid early return; the shrink
    // path is what could narrow the merged span.
    expect(working.preserveAuthoredGrid).toBe(true);
    const solved = computeFixedTableColumnWidths(working);
    return solved.columnWidths.slice(1, 1 + span).reduce((sum, w) => sum + w, 0);
  }

  it('keeps the ticket repro merged span at grid_sum - wBefore - wAfter (9920 grid)', () => {
    // overhang__first row overhangs margins: grid 9920 dxa > 9360 text column.
    const block = createOverhangBlock({
      gridDxa: [280, 1900, 1900, 1900, 1900, 1840, 200],
      headerCells: [
        { span: 2, widthDxa: 2180 },
        { widthDxa: 1900 },
        { widthDxa: 1900 },
        { widthDxa: 1900 },
        { span: 2, widthDxa: 2040 },
      ],
      insetRow: { wBeforeDxa: 280, wAfterDxa: 200, span: 5, widthDxa: 9440 },
    });

    const mergedWidth = solveMergedSpanWidth(block, 624, 5);
    expect(mergedWidth).toBeCloseTo((9920 - 280 - 200) / TWIPS_PER_PX, 1);
  });

  it('keeps the canonical repro merged span at grid_sum - wBefore - wAfter (9360 grid)', () => {
    // sd1513-paragraph-allignment: grid exactly the text column width.
    const block = createOverhangBlock({
      gridDxa: [185, 51, 1451, 1503, 1503, 1503, 1503, 1503, 158],
      headerCells: [
        { span: 2, widthDxa: 236 },
        { widthDxa: 1451 },
        { widthDxa: 1503 },
        { widthDxa: 1503 },
        { widthDxa: 1503 },
        { widthDxa: 1503 },
        { span: 2, widthDxa: 1661 },
      ],
      insetRow: { wBeforeDxa: 185, wAfterDxa: 158, span: 7, widthDxa: 9017 },
    });

    const mergedWidth = solveMergedSpanWidth(block, 624, 7);
    expect(mergedWidth).toBeCloseTo((9360 - 185 - 158) / TWIPS_PER_PX, 1);
  });
});
