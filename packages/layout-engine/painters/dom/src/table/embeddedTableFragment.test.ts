import { describe, expect, it } from 'vitest';
import type { TableBlock, TableMeasure } from '@superdoc/contracts';
import { mapEmbeddedTableRowSlice, mapEmbeddedTableRowSlices } from './embeddedTableFragment.js';

const makeNestedTableMeasure = (rowHeights: number[]): TableMeasure => ({
  kind: 'table',
  rows: rowHeights.map((height) => ({ height, cells: [{ width: 40, height, blocks: [] }] })),
  columnWidths: [40],
  totalWidth: 40,
  totalHeight: rowHeights.reduce((sum, height) => sum + height, 0),
});

const makeNestedTableBlock = (id: string, rowCount: number): TableBlock => ({
  kind: 'table',
  id,
  rows: Array.from({ length: rowCount }, (_, index) => ({
    id: `${id}-row-${index}`,
    cells: [{ id: `${id}-cell-${index}`, blocks: [], attrs: {} }],
    attrs: {},
  })),
});

describe('mapEmbeddedTableRowSlice', () => {
  it('maps a single-segment row without creating partial row info', () => {
    const block: TableBlock = {
      kind: 'table',
      id: 'table',
      rows: [
        { id: 'row-0', cells: [{ id: 'cell-0', blocks: [], attrs: {} }], attrs: {} },
        { id: 'row-1', cells: [{ id: 'cell-1', blocks: [], attrs: {} }], attrs: {} },
      ],
    };
    const measure: TableMeasure = {
      kind: 'table',
      rows: [
        { height: 10, cells: [{ width: 40, height: 10, blocks: [] }] },
        { height: 12, cells: [{ width: 40, height: 12, blocks: [] }] },
      ],
      columnWidths: [40],
      totalWidth: 40,
      totalHeight: 22,
    };

    expect(mapEmbeddedTableRowSlice({ block, measure, localFrom: 0, localTo: 1 })).toEqual({
      fromRow: 0,
      toRow: 1,
      partialRow: undefined,
    });
  });

  it('computes partial row info for a multi-segment row clipped at both ends', () => {
    const innerMeasure = makeNestedTableMeasure([5, 7, 11, 13]);
    const innerBlock = makeNestedTableBlock('inner', 4);
    const block: TableBlock = {
      kind: 'table',
      id: 'table',
      rows: [
        {
          id: 'row-0',
          cells: [{ id: 'cell-0', blocks: [innerBlock], attrs: { padding: { top: 2, bottom: 3 } } }],
          attrs: {},
        },
      ],
    };
    const measure: TableMeasure = {
      kind: 'table',
      rows: [{ height: 36, cells: [{ width: 40, height: 36, blocks: [innerMeasure] }] }],
      columnWidths: [40],
      totalWidth: 40,
      totalHeight: 36,
    };

    expect(mapEmbeddedTableRowSlice({ block, measure, localFrom: 1, localTo: 3 })).toEqual({
      fromRow: 0,
      toRow: 1,
      partialRow: {
        rowIndex: 0,
        fromLineByCell: [1],
        toLineByCell: [3],
        isFirstPart: false,
        isLastPart: false,
        partialHeight: 23,
      },
    });
  });

  it('preserves both partial rows when a segment window clips adjacent multi-segment rows', () => {
    const firstInnerMeasure = makeNestedTableMeasure([5, 7]);
    const secondInnerMeasure = makeNestedTableMeasure([11, 13]);
    const firstInnerBlock = makeNestedTableBlock('first-inner', 2);
    const secondInnerBlock = makeNestedTableBlock('second-inner', 2);
    const block: TableBlock = {
      kind: 'table',
      id: 'table',
      rows: [
        {
          id: 'row-0',
          cells: [{ id: 'cell-0', blocks: [firstInnerBlock], attrs: {} }],
          attrs: {},
        },
        {
          id: 'row-1',
          cells: [{ id: 'cell-1', blocks: [secondInnerBlock], attrs: {} }],
          attrs: {},
        },
      ],
    };
    const measure: TableMeasure = {
      kind: 'table',
      rows: [
        { height: 12, cells: [{ width: 40, height: 12, blocks: [firstInnerMeasure] }] },
        { height: 24, cells: [{ width: 40, height: 24, blocks: [secondInnerMeasure] }] },
      ],
      columnWidths: [40],
      totalWidth: 40,
      totalHeight: 36,
    };

    expect(mapEmbeddedTableRowSlices({ block, measure, localFrom: 1, localTo: 3 })).toEqual([
      {
        fromRow: 0,
        toRow: 1,
        partialRow: {
          rowIndex: 0,
          fromLineByCell: [1],
          toLineByCell: [2],
          isFirstPart: false,
          isLastPart: true,
          partialHeight: 7,
        },
      },
      {
        fromRow: 1,
        toRow: 2,
        partialRow: {
          rowIndex: 1,
          fromLineByCell: [0],
          toLineByCell: [1],
          isFirstPart: true,
          isLastPart: false,
          partialHeight: 11,
        },
      },
    ]);
  });

  it('coalesces adjacent full rows into one fragment slice', () => {
    const block = makeNestedTableBlock('table', 2);
    const measure: TableMeasure = {
      kind: 'table',
      rows: [
        { height: 10, cells: [{ width: 40, height: 10, blocks: [] }] },
        { height: 12, cells: [{ width: 40, height: 12, blocks: [] }] },
      ],
      columnWidths: [40],
      totalWidth: 40,
      totalHeight: 22,
    };

    expect(mapEmbeddedTableRowSlices({ block, measure, localFrom: 0, localTo: 2 })).toEqual([
      { fromRow: 0, toRow: 2, partialRow: undefined },
    ]);
  });

  it('returns null for an out-of-range segment window', () => {
    const block = makeNestedTableBlock('table', 1);
    const measure: TableMeasure = {
      kind: 'table',
      rows: [{ height: 10, cells: [{ width: 40, height: 10, blocks: [] }] }],
      columnWidths: [40],
      totalWidth: 40,
      totalHeight: 10,
    };

    expect(mapEmbeddedTableRowSlice({ block, measure, localFrom: 2, localTo: 3 })).toBeNull();
  });
});
