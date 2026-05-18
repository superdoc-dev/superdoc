import { describe, expect, it } from 'vitest';
import type { ParagraphMeasure, TableCellMeasure, TableMeasure } from './index.js';
import {
  computeCellSliceContentHeight,
  computeFullCellContentHeight,
  createCellSliceCursor,
  describeCellRenderBlocks,
  getCellLines,
} from './table-cell-slice.js';

describe('table cell segment mapping', () => {
  const makeParagraph = (lineCount: number): ParagraphMeasure => ({
    kind: 'paragraph',
    lines: Array.from({ length: lineCount }, () => ({
      lineHeight: 20,
      width: 100,
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      ascent: 14,
      descent: 6,
    })),
    totalHeight: lineCount * 20,
  });

  const makeImage = (height: number) => ({
    kind: 'image' as const,
    width: 100,
    height,
  });

  it('counts paragraph and positive-height object segments', () => {
    const cell: TableCellMeasure = {
      blocks: [makeParagraph(2), makeImage(50), makeImage(0), makeParagraph(3)],
      width: 200,
      height: 150,
    };

    expect(getCellLines(cell)).toHaveLength(6);
  });

  it('falls back to legacy single-paragraph cells', () => {
    const cell: TableCellMeasure = {
      paragraph: makeParagraph(3),
      width: 200,
      height: 60,
    };

    expect(getCellLines(cell)).toHaveLength(3);
  });

  it('expands nested table rows recursively', () => {
    const innermostTable: TableMeasure = {
      kind: 'table',
      rows: [
        { cells: [{ blocks: [makeParagraph(2)], width: 60, height: 40 }], height: 40 },
        { cells: [{ blocks: [makeParagraph(3)], width: 60, height: 60 }], height: 60 },
      ],
      columnWidths: [60],
      totalWidth: 60,
      totalHeight: 100,
    };
    const middleTable: TableMeasure = {
      kind: 'table',
      rows: [{ cells: [{ blocks: [innermostTable], width: 80, height: 100 }], height: 100 }],
      columnWidths: [80],
      totalWidth: 80,
      totalHeight: 100,
    };
    const outerTable: TableMeasure = {
      kind: 'table',
      rows: [{ cells: [{ blocks: [middleTable], width: 100, height: 100 }], height: 100 }],
      columnWidths: [100],
      totalWidth: 100,
      totalHeight: 100,
    };
    const cell: TableCellMeasure = {
      blocks: [outerTable],
      width: 200,
      height: 100,
    };

    expect(getCellLines(cell)).toHaveLength(2);
  });

  it('uses embedded table total height for full table slices', () => {
    const nestedTable: TableMeasure = {
      kind: 'table',
      rows: [{ cells: [{ blocks: [makeParagraph(1)], width: 80, height: 20 }], height: 20 }],
      columnWidths: [80],
      totalWidth: 80,
      totalHeight: 24,
      cellSpacingPx: 2,
    };
    const cell: TableCellMeasure = {
      blocks: [nestedTable],
      width: 100,
      height: 24,
    };
    const blocks = describeCellRenderBlocks(cell, undefined, { top: 0, bottom: 0 });

    expect(computeCellSliceContentHeight(blocks, 0, 1)).toBe(24);
    expect(computeFullCellContentHeight(cell, undefined, { top: 0, bottom: 0 })).toBe(24);
    expect(createCellSliceCursor(blocks, 0).advanceLine(0)).toBe(24);
    expect(createCellSliceCursor(blocks, 0).minSegmentCost(0)).toBe(24);
  });

  it('includes embedded table fragment spacing for partial row-boundary slices', () => {
    const nestedTable: TableMeasure = {
      kind: 'table',
      rows: [
        { cells: [{ blocks: [makeParagraph(1)], width: 80, height: 20 }], height: 20 },
        { cells: [{ blocks: [makeParagraph(1)], width: 80, height: 20 }], height: 20 },
      ],
      columnWidths: [80],
      totalWidth: 80,
      totalHeight: 46,
      cellSpacingPx: 2,
    };
    const cell: TableCellMeasure = {
      blocks: [nestedTable],
      width: 100,
      height: 46,
    };
    const blocks = describeCellRenderBlocks(cell, undefined, { top: 0, bottom: 0 });

    expect(computeCellSliceContentHeight(blocks, 0, 1)).toBe(24);
    expect(createCellSliceCursor(blocks, 0).advanceLine(0)).toBe(24);
    expect(createCellSliceCursor(blocks, 0).minSegmentCost(0)).toBe(24);
  });
});
