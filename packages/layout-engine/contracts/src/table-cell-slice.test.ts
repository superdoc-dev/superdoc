import { describe, expect, it } from 'vitest';
import type { ParagraphMeasure, TableBlock, TableCell, TableCellMeasure, TableMeasure } from './index.js';
import {
  computeCellSliceContentHeight,
  computeFullCellContentHeight,
  createCellSliceCursor,
  describeCellRenderBlocks,
  getCellLines,
} from './table-cell-slice.js';

describe('table cell segment mapping', () => {
  const makeParagraph = (lineCount: number, lineHeight = 20): ParagraphMeasure => ({
    kind: 'paragraph',
    lines: Array.from({ length: lineCount }, () => ({
      lineHeight,
      width: 100,
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      ascent: 14,
      descent: 6,
    })),
    totalHeight: lineCount * lineHeight,
  });

  const makeImage = (height: number) => ({
    kind: 'image' as const,
    width: 100,
    height,
  });

  const makeParagraphBlock = (
    id: string,
    spacing?: { before?: number; after?: number },
  ): TableCell['blocks'][number] => ({
    kind: 'paragraph' as const,
    id,
    runs: [],
    attrs: spacing ? { spacing } : undefined,
  });

  const makeImageBlock = (): TableCell['blocks'][number] => ({
    kind: 'image',
    id: 'zero-height-image',
    src: 'data:image/png;base64,AAA',
  });

  const makeAnchoredImageBlock = (): TableCell['blocks'][number] => ({
    kind: 'image',
    id: 'anchored-image',
    src: 'data:image/png;base64,AAA',
    anchor: { isAnchored: true },
    wrap: { type: 'None' },
  });

  it('counts paragraph and positive-height object segments', () => {
    const cell: TableCellMeasure = {
      blocks: [makeParagraph(2), makeImage(50), makeImage(0), makeParagraph(3)],
      width: 200,
      height: 150,
    };

    expect(getCellLines(cell)).toHaveLength(6);
  });

  it('ignores zero-height object blocks for final paragraph spacing', () => {
    const cell: TableCellMeasure = {
      blocks: [makeParagraph(1), makeImage(0)],
      width: 200,
      height: 20,
    };
    const block: TableCell = {
      id: 'cell-zero-height-tail',
      blocks: [makeParagraphBlock('paragraph-after', { after: 12 }), makeImageBlock()],
    };
    const blocks = describeCellRenderBlocks(cell, block, { top: 0, bottom: 5 });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].isLastBlock).toBe(true);
    expect(blocks[0].spacingAfter).toBe(0);
    expect(computeFullCellContentHeight(cell, block, { top: 0, bottom: 5 })).toBe(27);
  });

  it('ignores anchored out-of-flow object blocks for final paragraph spacing', () => {
    const cell: TableCellMeasure = {
      blocks: [makeParagraph(1), makeImage(20)],
      width: 200,
      height: 20,
    };
    const block: TableCell = {
      id: 'cell-anchored-tail',
      blocks: [makeParagraphBlock('paragraph-before-anchor', { after: 12 }), makeAnchoredImageBlock()],
    };
    const blocks = describeCellRenderBlocks(cell, block, { top: 0, bottom: 5 });

    expect(blocks).toHaveLength(2);
    expect(blocks[0].isLastBlock).toBe(true);
    expect(blocks[0].spacingAfter).toBe(0);
    expect(computeFullCellContentHeight(cell, block, { top: 0, bottom: 5 })).toBe(27);
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

  it('includes embedded partial row cell padding and block spacing', () => {
    const innerTableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        { cells: [{ blocks: [makeParagraph(1, 10)], width: 40, height: 10 }], height: 10 },
        { cells: [{ blocks: [makeParagraph(1, 10)], width: 40, height: 10 }], height: 10 },
      ],
      columnWidths: [40],
      totalWidth: 40,
      totalHeight: 20,
    };
    const nestedTableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          cells: [
            { blocks: [innerTableMeasure], width: 50, height: 20 },
            { blocks: [makeParagraph(2, 10)], width: 50, height: 28 },
          ],
          height: 20,
        },
      ],
      columnWidths: [50, 50],
      totalWidth: 100,
      totalHeight: 20,
    };
    const innerTableBlock: TableBlock = {
      kind: 'table',
      id: 'inner-table',
      rows: [
        { id: 'inner-row-1', cells: [{ id: 'inner-cell-1', blocks: [makeParagraphBlock('inner-p-1')] }] },
        { id: 'inner-row-2', cells: [{ id: 'inner-cell-2', blocks: [makeParagraphBlock('inner-p-2')] }] },
      ],
    };
    const nestedTableBlock: TableBlock = {
      kind: 'table',
      id: 'nested-table',
      rows: [
        {
          id: 'nested-row',
          cells: [
            { id: 'nested-cell-1', blocks: [innerTableBlock], attrs: { padding: { top: 3, bottom: 4 } } },
            {
              id: 'nested-cell-2',
              blocks: [makeParagraphBlock('nested-p', { before: 12 })],
              attrs: { padding: { top: 5, bottom: 6 } },
            },
          ],
        },
      ],
    };
    const cell: TableCellMeasure = {
      blocks: [nestedTableMeasure],
      width: 100,
      height: 28,
    };
    const cellBlock = { id: 'outer-cell', blocks: [nestedTableBlock] };
    const blocks = describeCellRenderBlocks(cell, cellBlock, { top: 0, bottom: 0 });

    expect(computeCellSliceContentHeight(blocks, 0, 1)).toBe(28);
    expect(createCellSliceCursor(blocks, 0).advanceLine(0)).toBe(28);
    expect(createCellSliceCursor(blocks, 0).minSegmentCost(0)).toBe(28);
  });
});
