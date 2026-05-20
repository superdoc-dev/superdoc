import type { PartialRowInfo, TableBlock, TableMeasure, TableRow } from '@superdoc/contracts';
import {
  computeCellSliceContentHeight,
  computeTableFragmentHeight,
  describeCellRenderBlocks,
  getCellLines,
  getCellSpacingPx,
  getEmbeddedRowLines,
  rescaleColumnWidths,
} from '@superdoc/contracts';

type RowSliceResult = {
  fromRow: number;
  toRow: number;
  partialRow?: PartialRowInfo;
};

export function getEmbeddedTableSegmentCount(measure: TableMeasure): number {
  let total = 0;
  for (const row of measure.rows) {
    total += getEmbeddedRowLines(row).length;
  }
  return total;
}

export function computeRenderedTableFragmentHeight(params: {
  block: TableBlock;
  measure: TableMeasure;
  fromRow: number;
  toRow: number;
  partialRow?: PartialRowInfo;
  repeatHeaderCount?: number;
}): number {
  const { block, measure, fromRow, toRow, partialRow, repeatHeaderCount = 0 } = params;
  const cellSpacingPx = measure.cellSpacingPx ?? getCellSpacingPx(block.attrs?.cellSpacing);
  const borderCollapse = block.attrs?.borderCollapse ?? (block.attrs?.cellSpacing != null ? 'separate' : 'collapse');

  return computeTableFragmentHeight({
    measure,
    fromRow,
    toRow,
    repeatHeaderCount,
    borderCollapse,
    partialRow,
    cellSpacingPx,
  });
}

export function createEmbeddedTableFragment(params: {
  block: TableBlock;
  measure: TableMeasure;
  availableWidth: number;
  fromRow?: number;
  toRow?: number;
  partialRow?: PartialRowInfo;
}) {
  const { block, measure, availableWidth, fromRow = 0, toRow = block.rows.length, partialRow } = params;
  const columnWidths = rescaleColumnWidths(measure.columnWidths, measure.totalWidth, availableWidth);
  const fragmentWidth = columnWidths ? availableWidth : measure.totalWidth;
  const height = computeRenderedTableFragmentHeight({ block, measure, fromRow, toRow, partialRow });

  return {
    fragment: {
      kind: 'table' as const,
      blockId: block.id,
      fromRow,
      toRow,
      x: 0,
      y: 0,
      width: fragmentWidth,
      height,
      columnWidths,
      partialRow,
    },
    effectiveColumnWidths: columnWidths ?? measure.columnWidths,
    cellSpacingPx: measure.cellSpacingPx ?? getCellSpacingPx(block.attrs?.cellSpacing),
  };
}

export function mapEmbeddedTableRowSlice(params: {
  block: TableBlock;
  measure: TableMeasure;
  localFrom: number;
  localTo: number;
}): RowSliceResult | null {
  const { block, measure, localFrom, localTo } = params;
  let segmentOffset = 0;
  let fromRow = -1;
  let toRow = -1;
  let partialRow: PartialRowInfo | undefined;

  for (let r = 0; r < measure.rows.length; r += 1) {
    const rowSegmentCount = getEmbeddedRowLines(measure.rows[r]).length;
    const rowStart = segmentOffset;
    const rowEnd = segmentOffset + rowSegmentCount;
    segmentOffset = rowEnd;

    if (rowEnd <= localFrom || rowStart >= localTo) continue;

    if (fromRow === -1) fromRow = r;
    toRow = r + 1;

    if (rowSegmentCount > 1 && (rowStart < localFrom || rowEnd > localTo)) {
      // AIDEV-NOTE: TableFragment supports one partialRow, so a slice that clips
      // multiple multi-segment rows keeps the last partial row's metadata.
      partialRow = buildPartialRowInfo({
        blockRow: block.rows[r],
        row: measure.rows[r],
        rowIndex: r,
        rowLocalFrom: Math.max(0, localFrom - rowStart),
        rowLocalTo: Math.min(rowSegmentCount, localTo - rowStart),
      });
    }
  }

  if (fromRow === -1) return null;
  return { fromRow, toRow, partialRow };
}

export function mapEmbeddedTableRowSlices(params: {
  block: TableBlock;
  measure: TableMeasure;
  localFrom: number;
  localTo: number;
}): RowSliceResult[] {
  const { block, measure, localFrom, localTo } = params;
  const slices: RowSliceResult[] = [];
  let segmentOffset = 0;

  for (let r = 0; r < measure.rows.length; r += 1) {
    const rowSegmentCount = getEmbeddedRowLines(measure.rows[r]).length;
    const rowStart = segmentOffset;
    const rowEnd = segmentOffset + rowSegmentCount;
    segmentOffset = rowEnd;

    if (rowEnd <= localFrom || rowStart >= localTo) continue;

    let partialRow: PartialRowInfo | undefined;
    if (rowSegmentCount > 1 && (rowStart < localFrom || rowEnd > localTo)) {
      partialRow = buildPartialRowInfo({
        blockRow: block.rows[r],
        row: measure.rows[r],
        rowIndex: r,
        rowLocalFrom: Math.max(0, localFrom - rowStart),
        rowLocalTo: Math.min(rowSegmentCount, localTo - rowStart),
      });
    }

    slices.push({ fromRow: r, toRow: r + 1, partialRow });
  }

  return slices;
}

function buildPartialRowInfo(params: {
  blockRow: TableRow | undefined;
  row: TableMeasure['rows'][number];
  rowIndex: number;
  rowLocalFrom: number;
  rowLocalTo: number;
}): PartialRowInfo {
  const { blockRow, row, rowIndex, rowLocalFrom, rowLocalTo } = params;
  const fromLineByCell: number[] = [];
  const toLineByCell: number[] = [];
  let partialHeight = 0;

  for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
    const cellMeasure = row.cells[cellIndex];
    const cellTotal = getCellLines(cellMeasure).length;
    const cellFrom = Math.min(rowLocalFrom, cellTotal);
    const cellTo = Math.min(rowLocalTo, cellTotal);
    const padding = getCellPadding(blockRow, cellIndex);
    const blocks = describeCellRenderBlocks(cellMeasure, blockRow?.cells?.[cellIndex], padding);

    fromLineByCell.push(cellFrom);
    toLineByCell.push(cellTo);
    partialHeight = Math.max(
      partialHeight,
      computeCellSliceContentHeight(blocks, cellFrom, cellTo) + padding.top + padding.bottom,
    );
  }

  return {
    rowIndex,
    fromLineByCell,
    toLineByCell,
    isFirstPart: rowLocalFrom === 0,
    isLastPart: rowLocalTo >= getEmbeddedRowLines(row).length,
    partialHeight,
  };
}

function getCellPadding(blockRow: TableRow | undefined, cellIndex: number): { top: number; bottom: number } {
  const padding = blockRow?.cells?.[cellIndex]?.attrs?.padding;
  return {
    top: padding?.top ?? 0,
    bottom: padding?.bottom ?? 0,
  };
}
