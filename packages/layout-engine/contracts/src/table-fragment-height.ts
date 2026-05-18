import type { PartialRowInfo, TableMeasure } from './index.js';

export function computeTableFragmentHeight(params: {
  measure: TableMeasure;
  fromRow: number;
  toRow: number;
  repeatHeaderCount?: number;
  borderCollapse?: 'collapse' | 'separate';
  partialRow?: PartialRowInfo | null;
  cellSpacingPx?: number;
}): number {
  const { measure, fromRow, toRow, repeatHeaderCount = 0, borderCollapse, partialRow } = params;
  const cellSpacingPx = params.cellSpacingPx ?? measure.cellSpacingPx ?? 0;
  let height = 0;
  let rowCount = 0;

  for (let r = 0; r < repeatHeaderCount && r < measure.rows.length; r += 1) {
    height += measure.rows[r].height;
    rowCount += 1;
  }

  for (let r = fromRow; r < toRow && r < measure.rows.length; r += 1) {
    height += partialRow?.rowIndex === r ? partialRow.partialHeight : measure.rows[r].height;
    rowCount += 1;
  }

  if (rowCount > 0 && cellSpacingPx > 0) {
    height += (rowCount + 1) * cellSpacingPx;
  }

  if (rowCount > 0 && borderCollapse === 'separate' && measure.tableBorderWidths) {
    height += measure.tableBorderWidths.top + measure.tableBorderWidths.bottom;
  }

  return height;
}
