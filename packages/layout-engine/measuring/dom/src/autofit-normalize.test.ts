import { describe, expect, it } from 'vitest';
import type { TableBlock } from '@superdoc/contracts';
import { buildAutoFitWorkingGridInput } from './autofit-normalize.js';

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
      { preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
    ]);
    expect(result.rows[0].skippedAfter).toEqual([
      { preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
      { preferredWidth: undefined, minContentWidth: 0, maxContentWidth: 0 },
    ]);
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
      { preferredWidth: 10, minContentWidth: 0, maxContentWidth: 0 },
      { preferredWidth: 10, minContentWidth: 0, maxContentWidth: 0 },
    ]);
    expect(result.rows[0].skippedAfter).toEqual([{ preferredWidth: 100 / 15, minContentWidth: 0, maxContentWidth: 0 }]);
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

    expect(result.rows[0].cells).toEqual([{ span: 3, preferredWidth: undefined }]);
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
      { span: 1, preferredWidth: 100 },
      { span: 1, preferredWidth: 150 },
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
});
