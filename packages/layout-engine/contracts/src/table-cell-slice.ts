import type {
  ParagraphMeasure,
  TableCell,
  TableCellMeasure,
  TableMeasure,
  TableRow,
  TableRowMeasure,
} from './index.js';
import { effectiveTableCellSpacing } from './table-cell-spacing.js';

/**
 * Shared cell-slice helpers for table pagination and rendering.
 *
 * These descriptors are consumed by layout pagination, layout-bridge selection
 * geometry, and DomPainter nested-table rendering. Keep their height semantics
 * aligned with the actual table-cell renderer.
 */
export type CellRenderBlock = {
  kind: 'paragraph' | 'table' | 'other';
  globalStartLine: number;
  globalEndLine: number;
  lineHeights: number[];
  totalHeight: number;
  visibleHeight: number;
  isFirstBlock: boolean;
  isLastBlock: boolean;
  spacingBefore: number;
  spacingAfter: number;
  tableRows?: TableRenderRow[];
  cellSpacingPx?: number;
  tableBorderVerticalPx?: number;
};

export interface CellSliceCursor {
  advanceLine(globalLineIndex: number): number;
  minSegmentCost(globalLineIndex: number): number;
}

type TableRenderRow = {
  localStartLine: number;
  localEndLine: number;
  height: number;
  lineHeights: number[];
  cells: TableCellMeasure[];
  blockRow?: TableRow;
};

/** @internal */
export function getEmbeddedRowLines(row: TableRowMeasure): Array<{ lineHeight: number }> {
  const hasNestedTable = row.cells.some((cell) => cell.blocks?.some((block) => block.kind === 'table'));

  if (!hasNestedTable) {
    return [{ lineHeight: row.height || 0 }];
  }

  let tallestLines: Array<{ lineHeight: number }> = [];
  for (const cell of row.cells) {
    const cellLines = getCellLines(cell);
    if (cellLines.length > tallestLines.length) {
      tallestLines = cellLines;
    }
  }

  return tallestLines.length > 0 ? tallestLines : [{ lineHeight: row.height || 0 }];
}

/** @internal */
export function getCellLines(cell: TableCellMeasure): Array<{ lineHeight: number }> {
  if (cell.blocks && cell.blocks.length > 0) {
    const allLines: Array<{ lineHeight: number }> = [];
    for (const block of cell.blocks) {
      if (block.kind === 'paragraph') {
        allLines.push(...((block as ParagraphMeasure).lines ?? []));
      } else if (block.kind === 'table') {
        const table = block as TableMeasure;
        for (const row of table.rows) {
          allLines.push(...getEmbeddedRowLines(row));
        }
      } else {
        const blockHeight = 'height' in block ? (block as { height: number }).height : 0;
        if (blockHeight > 0) {
          allLines.push({ lineHeight: blockHeight });
        }
      }
    }
    return allLines;
  }

  return cell.paragraph?.lines ?? [];
}

export function describeCellRenderBlocks(
  cellMeasure: TableCellMeasure,
  cellBlock: TableCell | undefined,
  cellPadding: { top: number; bottom: number },
): CellRenderBlock[] {
  const measuredBlocks = cellMeasure.blocks;
  const blockDataArray = cellBlock?.blocks;

  if (!measuredBlocks || measuredBlocks.length === 0) {
    if (cellMeasure.paragraph) {
      return buildSingleParagraphBlock(cellMeasure.paragraph, cellBlock?.paragraph, cellPadding);
    }
    return [];
  }

  const result: CellRenderBlock[] = [];
  let globalLine = 0;
  const visibleBlockIndexes = getVisibleCellBlockIndexes(measuredBlocks);
  const firstVisibleBlockIndex = visibleBlockIndexes[0] ?? -1;
  const lastVisibleBlockIndex = visibleBlockIndexes[visibleBlockIndexes.length - 1] ?? -1;

  for (let i = 0; i < measuredBlocks.length; i += 1) {
    const measure = measuredBlocks[i];
    const data = i < (blockDataArray?.length ?? 0) ? blockDataArray![i] : undefined;
    const isFirstBlock = i === firstVisibleBlockIndex;
    const isLastBlock = i === lastVisibleBlockIndex;

    if (measure.kind === 'paragraph') {
      const paraMeasure = measure as ParagraphMeasure;
      const paraData = data?.kind === 'paragraph' ? data : undefined;
      const lineHeights = (paraMeasure.lines ?? []).map((line) => line.lineHeight);
      const sumLines = sumArray(lineHeights);
      const startLine = globalLine;
      globalLine += lineHeights.length;

      result.push({
        kind: 'paragraph',
        globalStartLine: startLine,
        globalEndLine: globalLine,
        lineHeights,
        totalHeight: paraMeasure.totalHeight ?? sumLines,
        visibleHeight: sumLines,
        isFirstBlock,
        isLastBlock,
        spacingBefore: effectiveTableCellSpacing(paraData?.attrs?.spacing?.before, isFirstBlock, cellPadding.top),
        spacingAfter: resolveSpacingAfter(paraData?.attrs?.spacing?.after, isLastBlock),
      });
    } else if (measure.kind === 'table') {
      const tableMeasure = measure as TableMeasure;
      const tableData = data?.kind === 'table' ? data : undefined;
      const lineHeights: number[] = [];
      const tableRows: TableRenderRow[] = [];
      let tableLocalLine = 0;
      for (let rowIndex = 0; rowIndex < tableMeasure.rows.length; rowIndex += 1) {
        const row = tableMeasure.rows[rowIndex];
        const rowLineHeights: number[] = [];
        for (const segment of getEmbeddedRowLines(row)) {
          rowLineHeights.push(segment.lineHeight);
        }
        lineHeights.push(...rowLineHeights);
        tableRows.push({
          localStartLine: tableLocalLine,
          localEndLine: tableLocalLine + rowLineHeights.length,
          height: row.height,
          lineHeights: rowLineHeights,
          cells: row.cells,
          blockRow: tableData?.rows?.[rowIndex],
        });
        tableLocalLine += rowLineHeights.length;
      }

      const startLine = globalLine;
      globalLine += lineHeights.length;
      const sumLines = sumArray(lineHeights);
      const borderCollapse =
        tableData?.attrs?.borderCollapse ?? (tableData?.attrs?.cellSpacing != null ? 'separate' : 'collapse');
      const tableBorderVerticalPx =
        borderCollapse === 'separate' && tableMeasure.tableBorderWidths
          ? tableMeasure.tableBorderWidths.top + tableMeasure.tableBorderWidths.bottom
          : 0;

      result.push({
        kind: 'table',
        globalStartLine: startLine,
        globalEndLine: globalLine,
        lineHeights,
        totalHeight: tableMeasure.totalHeight ?? sumLines,
        visibleHeight: sumLines,
        isFirstBlock,
        isLastBlock,
        spacingBefore: 0,
        spacingAfter: 0,
        tableRows,
        cellSpacingPx: tableMeasure.cellSpacingPx ?? 0,
        tableBorderVerticalPx,
      });
    } else {
      const blockHeight = 'height' in measure ? (measure as { height: number }).height : 0;
      if (blockHeight <= 0) continue;

      const outOfFlow = isAnchoredOutOfFlow(data);
      const startLine = globalLine;
      globalLine += 1;

      result.push({
        kind: 'other',
        globalStartLine: startLine,
        globalEndLine: globalLine,
        lineHeights: [blockHeight],
        totalHeight: outOfFlow ? 0 : blockHeight,
        visibleHeight: outOfFlow ? 0 : blockHeight,
        isFirstBlock,
        isLastBlock,
        spacingBefore: 0,
        spacingAfter: 0,
      });
    }
  }

  return result;
}

export function computeCellSliceContentHeight(blocks: CellRenderBlock[], fromLine: number, toLine: number): number {
  let height = 0;

  for (const block of blocks) {
    if (block.globalEndLine <= fromLine || block.globalStartLine >= toLine) continue;

    const localStart = Math.max(0, fromLine - block.globalStartLine);
    const localEnd = Math.min(block.lineHeights.length, toLine - block.globalStartLine);
    const rendersEntireBlock = localStart === 0 && localEnd >= block.lineHeights.length;

    if (block.kind === 'paragraph') {
      if (localStart === 0) {
        height += block.spacingBefore;
      }

      const sliceLineSum = sumArray(block.lineHeights.slice(localStart, localEnd));
      if (rendersEntireBlock) {
        height += Math.max(sliceLineSum, block.totalHeight);
        height += block.spacingAfter;
      } else {
        height += sliceLineSum;
      }
    } else if (block.visibleHeight > 0) {
      if (block.kind === 'table') {
        const tableSliceHeight = computeTableBlockSliceHeight(block, localStart, localEnd);
        if (rendersEntireBlock) {
          height += Math.max(tableSliceHeight, block.totalHeight);
        } else {
          height += tableSliceHeight;
        }
        continue;
      }

      for (let i = localStart; i < localEnd; i += 1) {
        height += block.lineHeights[i] ?? 0;
      }
    }
  }

  return height;
}

export function createCellSliceCursor(blocks: CellRenderBlock[], startLine: number): CellSliceCursor {
  let blockIdx = 0;
  let startedFromLine0 = false;
  let blockLineSum = 0;
  let tableSliceStartLocal = 0;
  let tableSliceHeight = 0;

  while (blockIdx < blocks.length && blocks[blockIdx].globalEndLine <= startLine) {
    blockIdx += 1;
  }
  if (blockIdx < blocks.length) {
    const block = blocks[blockIdx];
    startedFromLine0 = startLine <= block.globalStartLine;
    tableSliceStartLocal = Math.max(0, startLine - block.globalStartLine);
    if (!startedFromLine0) {
      for (let li = 0; li < startLine - block.globalStartLine; li += 1) {
        blockLineSum += block.lineHeights[li] ?? 0;
      }
    }
  }

  return {
    advanceLine(globalLineIndex: number): number {
      while (blockIdx < blocks.length && blocks[blockIdx].globalEndLine <= globalLineIndex) {
        blockIdx += 1;
        startedFromLine0 = true;
        blockLineSum = 0;
        tableSliceStartLocal = 0;
        tableSliceHeight = 0;
      }
      if (blockIdx >= blocks.length) return 0;

      const block = blocks[blockIdx];
      const localLine = globalLineIndex - block.globalStartLine;
      const lineHeight = block.lineHeights[localLine] ?? 0;
      let cost = 0;

      if (block.kind === 'table') {
        const nextTableSliceHeight = computeTableBlockSliceHeight(block, tableSliceStartLocal, localLine + 1);
        cost = Math.max(0, nextTableSliceHeight - tableSliceHeight);
        tableSliceHeight = nextTableSliceHeight;

        const isBlockComplete = localLine === block.lineHeights.length - 1;
        if (isBlockComplete) {
          if (startedFromLine0) {
            cost += Math.max(0, block.totalHeight - tableSliceHeight);
          }
          blockIdx += 1;
          startedFromLine0 = true;
          blockLineSum = 0;
          tableSliceStartLocal = 0;
          tableSliceHeight = 0;
        }

        return cost;
      }

      if (localLine === 0 && startedFromLine0 && block.kind === 'paragraph') {
        cost += block.spacingBefore;
      }
      if (block.kind === 'paragraph' || block.visibleHeight > 0) {
        cost += lineHeight;
      }

      blockLineSum += lineHeight;

      const isBlockComplete = localLine === block.lineHeights.length - 1;
      if (isBlockComplete && startedFromLine0 && block.kind === 'paragraph') {
        cost += Math.max(0, block.totalHeight - blockLineSum);
      }
      if (isBlockComplete && startedFromLine0 && block.kind === 'paragraph') {
        cost += block.spacingAfter;
      }
      if (isBlockComplete) {
        blockIdx += 1;
        startedFromLine0 = true;
        blockLineSum = 0;
        tableSliceStartLocal = 0;
        tableSliceHeight = 0;
      }

      return cost;
    },

    minSegmentCost(globalLineIndex: number): number {
      const block = findBlockForLine(blocks, globalLineIndex);
      if (!block) return 0;

      const localLine = globalLineIndex - block.globalStartLine;
      const lineHeight = block.lineHeights[localLine] ?? 0;
      let cost = 0;

      if (localLine === 0 && block.kind === 'paragraph') {
        cost += block.spacingBefore;
      }
      if (block.kind === 'paragraph' || block.visibleHeight > 0) {
        cost += lineHeight;
      }
      if (block.kind === 'table') {
        return computeTableBlockSliceHeight(block, localLine, localLine + 1);
      }
      if (block.lineHeights.length === 1 && block.kind === 'paragraph') {
        cost += Math.max(0, block.totalHeight - lineHeight);
      }
      if (block.lineHeights.length === 1 && block.kind === 'paragraph') {
        cost += block.spacingAfter;
      }

      return cost;
    },
  };
}

export function computeFullCellContentHeight(
  cellMeasure: TableCellMeasure,
  cellBlock: TableCell | undefined,
  cellPadding: { top: number; bottom: number },
): number {
  const measuredBlocks = cellMeasure.blocks;
  const blockDataArray = cellBlock?.blocks;

  if (!measuredBlocks || measuredBlocks.length === 0) {
    if (!cellMeasure.paragraph) return 0;

    const lineSum = sumArray(cellMeasure.paragraph.lines.map((line) => line.lineHeight));
    const paraData = cellBlock?.paragraph;
    const spacingBefore = effectiveTableCellSpacing(paraData?.attrs?.spacing?.before, true, cellPadding.top);
    const spacingAfter = effectiveTableCellSpacing(paraData?.attrs?.spacing?.after, true, cellPadding.bottom);
    return spacingBefore + Math.max(lineSum, cellMeasure.paragraph.totalHeight ?? lineSum) + spacingAfter;
  }

  // This function uses measurement semantics: the final paragraph's spacing.after
  // contributes only when it exceeds cell padding. Renderer-slice helpers skip
  // last-block spacing.after because DomPainter positions the visible content
  // inside the already padded cell. Keeping that distinction explicit prevents
  // row-height preflight from comparing measured row heights to renderer-only
  // slice heights.
  let height = 0;
  const visibleBlockIndexes = getVisibleCellBlockIndexes(measuredBlocks);
  const firstVisibleBlockIndex = visibleBlockIndexes[0] ?? -1;
  const lastVisibleBlockIndex = visibleBlockIndexes[visibleBlockIndexes.length - 1] ?? -1;

  for (let i = 0; i < measuredBlocks.length; i += 1) {
    const measure = measuredBlocks[i];
    const data = i < (blockDataArray?.length ?? 0) ? blockDataArray![i] : undefined;
    const isFirstBlock = i === firstVisibleBlockIndex;
    const isLastBlock = i === lastVisibleBlockIndex;

    if (measure.kind === 'paragraph') {
      const paraMeasure = measure as ParagraphMeasure;
      const paraData = data?.kind === 'paragraph' ? data : undefined;
      const lineSum = sumArray((paraMeasure.lines ?? []).map((line) => line.lineHeight));

      height += effectiveTableCellSpacing(paraData?.attrs?.spacing?.before, isFirstBlock, cellPadding.top);
      height += Math.max(lineSum, paraMeasure.totalHeight ?? lineSum);
      if (isLastBlock) {
        height += effectiveTableCellSpacing(paraData?.attrs?.spacing?.after, true, cellPadding.bottom);
      } else {
        height += resolveSpacingAfter(paraData?.attrs?.spacing?.after, false);
      }
    } else if (measure.kind === 'table') {
      const table = measure as TableMeasure;
      height += table.totalHeight;
    } else {
      const blockHeight = 'height' in measure ? (measure as { height: number }).height : 0;
      if (blockHeight > 0 && !isAnchoredOutOfFlow(data)) {
        height += blockHeight;
      }
    }
  }

  return height;
}

function buildSingleParagraphBlock(
  paraMeasure: ParagraphMeasure,
  paraData: { attrs?: { spacing?: { before?: number; after?: number } } } | undefined,
  cellPadding: { top: number; bottom: number },
): CellRenderBlock[] {
  const lines = paraMeasure.lines ?? [];
  if (lines.length === 0) return [];

  const lineHeights = lines.map((line) => line.lineHeight);
  const sumLines = sumArray(lineHeights);

  return [
    {
      kind: 'paragraph',
      globalStartLine: 0,
      globalEndLine: lines.length,
      lineHeights,
      totalHeight: paraMeasure.totalHeight ?? sumLines,
      visibleHeight: sumLines,
      isFirstBlock: true,
      isLastBlock: true,
      spacingBefore: effectiveTableCellSpacing(paraData?.attrs?.spacing?.before, true, cellPadding.top),
      spacingAfter: 0,
    },
  ];
}

function resolveSpacingAfter(spacingAfter: number | undefined, isLastBlock: boolean): number {
  if (isLastBlock) return 0;
  return typeof spacingAfter === 'number' && spacingAfter > 0 ? spacingAfter : 0;
}

function getVisibleCellBlockIndexes(measuredBlocks: TableCellMeasure['blocks']): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < measuredBlocks.length; i += 1) {
    if (isVisibleCellBlockMeasure(measuredBlocks[i])) indexes.push(i);
  }
  return indexes;
}

function isVisibleCellBlockMeasure(measure: TableCellMeasure['blocks'][number]): boolean {
  if (measure.kind === 'paragraph' || measure.kind === 'table') return true;
  return 'height' in measure && typeof measure.height === 'number' && measure.height > 0;
}

function isAnchoredOutOfFlow(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  const anchor = b.anchor as Record<string, unknown> | undefined;
  if (!anchor?.isAnchored) return false;
  const wrap = b.wrap as Record<string, string> | undefined;
  return (wrap?.type ?? 'Inline') !== 'Inline';
}

function findBlockForLine(blocks: CellRenderBlock[], globalLineIndex: number): CellRenderBlock | undefined {
  return blocks.find((block) => globalLineIndex >= block.globalStartLine && globalLineIndex < block.globalEndLine);
}

function computeTableBlockSliceHeight(block: CellRenderBlock, localStart: number, localEnd: number): number {
  if (!block.tableRows) {
    return sumArray(block.lineHeights.slice(localStart, localEnd));
  }

  let height = 0;
  let rowCount = 0;

  for (const row of block.tableRows) {
    if (row.localEndLine <= localStart || row.localStartLine >= localEnd) continue;

    rowCount += 1;
    const rowLocalStart = Math.max(0, localStart - row.localStartLine);
    const rowLocalEnd = Math.min(row.lineHeights.length, localEnd - row.localStartLine);
    const rendersFullRow = rowLocalStart === 0 && rowLocalEnd >= row.lineHeights.length;

    if (rendersFullRow) {
      height += row.height;
    } else {
      height += computePartialTableRowSliceHeight(row, rowLocalStart, rowLocalEnd);
    }
  }

  if (rowCount > 0) {
    height += (rowCount + 1) * (block.cellSpacingPx ?? 0);
    height += block.tableBorderVerticalPx ?? 0;
  }

  return height;
}

function computePartialTableRowSliceHeight(row: TableRenderRow, rowLocalStart: number, rowLocalEnd: number): number {
  let partialHeight = 0;

  for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
    const cellMeasure = row.cells[cellIndex];
    const cellLineCount = getCellLines(cellMeasure).length;
    const cellFrom = Math.min(rowLocalStart, cellLineCount);
    const cellTo = Math.min(rowLocalEnd, cellLineCount);
    const padding = getCellPadding(row.blockRow, cellIndex);
    const blocks = describeCellRenderBlocks(cellMeasure, row.blockRow?.cells?.[cellIndex], padding);

    partialHeight = Math.max(
      partialHeight,
      computeCellSliceContentHeight(blocks, cellFrom, cellTo) + padding.top + padding.bottom,
    );
  }

  return partialHeight;
}

function getCellPadding(blockRow: TableRow | undefined, cellIndex: number): { top: number; bottom: number } {
  const padding = blockRow?.cells?.[cellIndex]?.attrs?.padding;
  return {
    top: padding?.top ?? 0,
    bottom: padding?.bottom ?? 0,
  };
}

function sumArray(arr: number[]): number {
  let total = 0;
  for (const value of arr) total += value;
  return total;
}
