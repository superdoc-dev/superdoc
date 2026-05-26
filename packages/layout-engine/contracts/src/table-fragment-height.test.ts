import { describe, expect, it } from 'vitest';
import type { PartialRowInfo, TableMeasure } from './index.js';
import { computeTableFragmentHeight } from './table-fragment-height.js';

describe('computeTableFragmentHeight', () => {
  const measure: TableMeasure = {
    kind: 'table',
    rows: [
      { height: 10, cells: [] },
      { height: 20, cells: [] },
      { height: 30, cells: [] },
    ],
    columnWidths: [100],
    totalWidth: 100,
    totalHeight: 72,
    cellSpacingPx: 2,
    tableBorderWidths: { top: 3, right: 0, bottom: 5, left: 0 },
  };

  it('includes repeated headers, body rows, spacing, and separate borders', () => {
    expect(
      computeTableFragmentHeight({
        measure,
        fromRow: 1,
        toRow: 3,
        repeatHeaderCount: 1,
        borderCollapse: 'separate',
      }),
    ).toBe(10 + 20 + 30 + 4 * 2 + 3 + 5);
  });

  it('substitutes partial row height', () => {
    const partialRow: PartialRowInfo = {
      rowIndex: 1,
      fromLineByCell: [0],
      toLineByCell: [1],
      isFirstPart: true,
      isLastPart: false,
      partialHeight: 12,
    };

    expect(
      computeTableFragmentHeight({
        measure,
        fromRow: 1,
        toRow: 2,
        partialRow,
      }),
    ).toBe(12 + 2 * 2);
  });
});
