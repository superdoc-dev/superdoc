import { describe, expect, it } from 'vitest';
import type { ParagraphMeasure, TableCellMeasure, TableCell, TableMeasure } from '@superdoc/contracts';
import type { BlockId } from '@superdoc/contracts';
import {
  describeCellRenderBlocks,
  computeCellSliceContentHeight,
  computeFullCellContentHeight,
  createCellSliceCursor,
  type CellRenderBlock,
} from './table-cell-slice.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeLine(height: number) {
  return {
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: 1,
    width: 100,
    ascent: height * 0.7,
    descent: height * 0.3,
    lineHeight: height,
  };
}

function makeParaMeasure(lineHeights: number[], totalHeight?: number): ParagraphMeasure {
  const lines = lineHeights.map(makeLine);
  const sumLines = lineHeights.reduce((s, h) => s + h, 0);
  return { kind: 'paragraph', lines, totalHeight: totalHeight ?? sumLines };
}

function makeParaBlock(spacingBefore?: number, spacingAfter?: number) {
  return {
    kind: 'paragraph' as const,
    id: 'para' as BlockId,
    runs: [],
    attrs: {
      spacing: {
        ...(spacingBefore != null ? { before: spacingBefore } : {}),
        ...(spacingAfter != null ? { after: spacingAfter } : {}),
      },
    },
  };
}

function makeCellMeasure(blocks: ParagraphMeasure[]): TableCellMeasure {
  return { blocks, width: 100, height: 100 };
}

function makeCellBlock(blocks: ReturnType<typeof makeParaBlock>[]): TableCell {
  return { id: 'cell' as BlockId, blocks };
}

const NO_PADDING = { top: 0, bottom: 0 };

// ─── describeCellRenderBlocks ────────────────────────────────────────────────

describe('describeCellRenderBlocks', () => {
  it('handles a single paragraph with no spacing', () => {
    const measure = makeCellMeasure([makeParaMeasure([10, 12])]);
    const block = makeCellBlock([makeParaBlock()]);
    const blocks = describeCellRenderBlocks(measure, block, NO_PADDING);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('paragraph');
    expect(blocks[0].globalStartLine).toBe(0);
    expect(blocks[0].globalEndLine).toBe(2);
    expect(blocks[0].lineHeights).toEqual([10, 12]);
    expect(blocks[0].spacingBefore).toBe(0);
    expect(blocks[0].spacingAfter).toBe(0); // last block
    expect(blocks[0].isFirstBlock).toBe(true);
    expect(blocks[0].isLastBlock).toBe(true);
  });

  it('applies spacing.before for first block, absorbing padding', () => {
    const measure = makeCellMeasure([makeParaMeasure([10])]);
    const block = makeCellBlock([makeParaBlock(15)]);
    const padding = { top: 5, bottom: 0 };
    const blocks = describeCellRenderBlocks(measure, block, padding);

    // spacing.before=15, padding.top=5 → effective = 15 - 5 = 10
    expect(blocks[0].spacingBefore).toBe(10);
  });

  it('fully absorbs spacing.before when less than padding.top', () => {
    const measure = makeCellMeasure([makeParaMeasure([10])]);
    const block = makeCellBlock([makeParaBlock(3)]);
    const padding = { top: 5, bottom: 0 };
    const blocks = describeCellRenderBlocks(measure, block, padding);

    // spacing.before=3 < padding.top=5 → effective = 0
    expect(blocks[0].spacingBefore).toBe(0);
  });

  it('applies spacing.after for non-last blocks, skips for last', () => {
    const m1 = makeParaMeasure([10]);
    const m2 = makeParaMeasure([10]);
    const b1 = makeParaBlock(0, 8);
    const b2 = makeParaBlock(0, 12);
    const measure = makeCellMeasure([m1, m2]);
    const block = makeCellBlock([b1, b2]);
    const blocks = describeCellRenderBlocks(measure, block, NO_PADDING);

    expect(blocks[0].spacingAfter).toBe(8); // non-last
    expect(blocks[1].spacingAfter).toBe(0); // last → 0
  });

  it('sets totalHeight from ParagraphMeasure.totalHeight', () => {
    const measure = makeCellMeasure([makeParaMeasure([10, 10], 30)]);
    const block = makeCellBlock([makeParaBlock()]);
    const blocks = describeCellRenderBlocks(measure, block, NO_PADDING);

    expect(blocks[0].totalHeight).toBe(30);
    expect(blocks[0].visibleHeight).toBe(20); // sum of lines
  });

  it('falls back to sum(lineHeights) when totalHeight is not provided', () => {
    const pm: ParagraphMeasure = { kind: 'paragraph', lines: [makeLine(15), makeLine(10)], totalHeight: 25 };
    const measure = makeCellMeasure([pm]);
    const block = makeCellBlock([makeParaBlock()]);
    const blocks = describeCellRenderBlocks(measure, block, NO_PADDING);

    expect(blocks[0].totalHeight).toBe(25);
  });

  it('degrades to zero spacing when block data is missing', () => {
    const measure = makeCellMeasure([makeParaMeasure([10, 12])]);
    // No block data at all
    const blocks = describeCellRenderBlocks(measure, undefined, NO_PADDING);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].spacingBefore).toBe(0);
    expect(blocks[0].spacingAfter).toBe(0);
  });

  it('handles measured blocks longer than block data', () => {
    const m1 = makeParaMeasure([10]);
    const m2 = makeParaMeasure([12]);
    const measure = makeCellMeasure([m1, m2]);
    // Only one block data entry
    const block = makeCellBlock([makeParaBlock(5, 3)]);
    const blocks = describeCellRenderBlocks(measure, block, NO_PADDING);

    expect(blocks).toHaveLength(2);
    // First block has spacing from block data
    expect(blocks[0].spacingAfter).toBe(3);
    // Second block has no block data → zero spacing
    expect(blocks[1].spacingBefore).toBe(0);
    expect(blocks[1].spacingAfter).toBe(0); // also last block
  });

  it('handles inline image block with positive height', () => {
    const imgMeasure = { kind: 'image' as const, width: 50, height: 30 };
    const measure: TableCellMeasure = { blocks: [imgMeasure], width: 100, height: 100 };
    const imgBlock = { kind: 'image' as const, id: 'img' as BlockId, src: 'test.png' };
    const cellBlock: TableCell = { id: 'cell' as BlockId, blocks: [imgBlock] };
    const blocks = describeCellRenderBlocks(measure, cellBlock, NO_PADDING);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('other');
    expect(blocks[0].lineHeights).toEqual([30]);
    expect(blocks[0].visibleHeight).toBe(30);
    expect(blocks[0].totalHeight).toBe(30);
  });

  it('handles anchored out-of-flow image (visibleHeight = 0)', () => {
    const imgMeasure = { kind: 'image' as const, width: 50, height: 30 };
    const measure: TableCellMeasure = { blocks: [imgMeasure], width: 100, height: 100 };
    const imgBlock = {
      kind: 'image' as const,
      id: 'img' as BlockId,
      src: 'test.png',
      anchor: { isAnchored: true },
      wrap: { type: 'square' },
    };
    const cellBlock: TableCell = { id: 'cell' as BlockId, blocks: [imgBlock as any] };
    const blocks = describeCellRenderBlocks(measure, cellBlock, NO_PADDING);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('other');
    expect(blocks[0].lineHeights).toEqual([30]); // still 1 segment for index alignment
    expect(blocks[0].visibleHeight).toBe(0);
    expect(blocks[0].totalHeight).toBe(0);
  });

  it('degrades to inline behavior when block data is missing for image', () => {
    const imgMeasure = { kind: 'image' as const, width: 50, height: 30 };
    const measure: TableCellMeasure = { blocks: [imgMeasure], width: 100, height: 100 };
    // No block data → can't determine anchored status → inline behavior
    const blocks = describeCellRenderBlocks(measure, undefined, NO_PADDING);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].visibleHeight).toBe(30); // inline: includes height
  });

  it('uses single-paragraph fallback for backward-compat cells', () => {
    const pm = makeParaMeasure([10, 12]);
    const cellMeasure: TableCellMeasure = { paragraph: pm, width: 100, height: 100 };
    const cellBlock: TableCell = {
      id: 'cell' as BlockId,
      paragraph: makeParaBlock(6, 4),
    };
    const blocks = describeCellRenderBlocks(cellMeasure, cellBlock, { top: 2, bottom: 0 });

    expect(blocks).toHaveLength(1);
    // First+last block, spacing.before = max(0, 6 - 2) = 4
    expect(blocks[0].spacingBefore).toBe(4);
    expect(blocks[0].spacingAfter).toBe(0); // last block
  });

  it('handles embedded table block', () => {
    const tableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        { cells: [], height: 20 },
        { cells: [], height: 15 },
      ],
      columnWidths: [],
      totalWidth: 100,
      totalHeight: 35,
    };
    const measure: TableCellMeasure = { blocks: [tableMeasure], width: 100, height: 100 };
    const blocks = describeCellRenderBlocks(measure, undefined, NO_PADDING);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('table');
    // Each simple row expands to 1 segment
    expect(blocks[0].lineHeights).toEqual([20, 15]);
    expect(blocks[0].spacingBefore).toBe(0);
    expect(blocks[0].spacingAfter).toBe(0);
  });
});

// ─── computeCellSliceContentHeight ───────────────────────────────────────────

describe('computeCellSliceContentHeight', () => {
  it('returns full height for a single paragraph full slice', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 3,
        lineHeights: [10, 10, 10],
        totalHeight: 40,
        visibleHeight: 30,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 5,
        spacingAfter: 0,
      },
    ];

    // Full slice: spacingBefore(5) + max(30, 40) + spacingAfter(0) = 45
    expect(computeCellSliceContentHeight(blocks, 0, 3)).toBe(45);
  });

  it('returns only line heights for partial slice', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 3,
        lineHeights: [10, 12, 14],
        totalHeight: 36,
        visibleHeight: 36,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 5,
        spacingAfter: 0,
      },
    ];

    // Partial from middle: just lines[1..3) = 12 + 14 = 26
    expect(computeCellSliceContentHeight(blocks, 1, 3)).toBe(26);
  });

  it('includes spacing.before for partial slice starting at line 0', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 3,
        lineHeights: [10, 12, 14],
        totalHeight: 36,
        visibleHeight: 36,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 5,
        spacingAfter: 0,
      },
    ];

    // Partial from start: spacingBefore(5) + lines[0..2) = 5 + 10 + 12 = 27
    expect(computeCellSliceContentHeight(blocks, 0, 2)).toBe(27);
  });

  it('includes spacing at block boundaries for multi-paragraph cells', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [10, 10],
        totalHeight: 20,
        visibleHeight: 20,
        isFirstBlock: true,
        isLastBlock: false,
        spacingBefore: 3,
        spacingAfter: 6,
      },
      {
        kind: 'paragraph',
        globalStartLine: 2,
        globalEndLine: 4,
        lineHeights: [10, 10],
        totalHeight: 20,
        visibleHeight: 20,
        isFirstBlock: false,
        isLastBlock: true,
        spacingBefore: 4,
        spacingAfter: 0,
      },
    ];

    // Full slice: (3 + max(20,20) + 6) + (4 + max(20,20) + 0) = 29 + 24 = 53
    expect(computeCellSliceContentHeight(blocks, 0, 4)).toBe(53);
  });

  it('skips spacing.after for last block', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [10, 10],
        totalHeight: 20,
        visibleHeight: 20,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 0,
        spacingAfter: 0, // already 0 for last block
      },
    ];

    // spacingAfter is always 0 for last block
    expect(computeCellSliceContentHeight(blocks, 0, 2)).toBe(20);
  });

  it('promotes totalHeight for fully rendered paragraph', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [10, 10],
        totalHeight: 30, // 10 more than sum
        visibleHeight: 20,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 0,
        spacingAfter: 0,
      },
    ];

    // max(20, 30) = 30
    expect(computeCellSliceContentHeight(blocks, 0, 2)).toBe(30);
  });

  it('does not promote totalHeight for partial slice', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 3,
        lineHeights: [10, 10, 10],
        totalHeight: 50,
        visibleHeight: 30,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 0,
        spacingAfter: 0,
      },
    ];

    // Partial: just line heights, no promotion
    expect(computeCellSliceContentHeight(blocks, 0, 2)).toBe(20);
  });

  it('contributes zero for anchored out-of-flow blocks', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [10, 10],
        totalHeight: 20,
        visibleHeight: 20,
        isFirstBlock: true,
        isLastBlock: false,
        spacingBefore: 0,
        spacingAfter: 5,
      },
      {
        kind: 'other',
        globalStartLine: 2,
        globalEndLine: 3,
        lineHeights: [30],
        totalHeight: 0,
        visibleHeight: 0,
        isFirstBlock: false,
        isLastBlock: false,
        spacingBefore: 0,
        spacingAfter: 0,
      },
      {
        kind: 'paragraph',
        globalStartLine: 3,
        globalEndLine: 5,
        lineHeights: [10, 10],
        totalHeight: 20,
        visibleHeight: 20,
        isFirstBlock: false,
        isLastBlock: true,
        spacingBefore: 4,
        spacingAfter: 0,
      },
    ];

    // Block 0: 0 + 20 + 5 = 25
    // Block 1: anchored, skipped (visibleHeight=0)
    // Block 2: 4 + 20 + 0 = 24
    // Total: 49
    expect(computeCellSliceContentHeight(blocks, 0, 5)).toBe(49);
  });

  it('handles embedded table segments', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'table',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [20, 15],
        totalHeight: 35,
        visibleHeight: 35,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 0,
        spacingAfter: 0,
      },
    ];

    expect(computeCellSliceContentHeight(blocks, 0, 2)).toBe(35);
    expect(computeCellSliceContentHeight(blocks, 0, 1)).toBe(20);
  });
});

// ─── createCellSliceCursor ───────────────────────────────────────────────────

describe('createCellSliceCursor', () => {
  it('returns line cost including spacing.before at block start', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [10, 12],
        totalHeight: 22,
        visibleHeight: 22,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 5,
        spacingAfter: 0,
      },
    ];

    const cursor = createCellSliceCursor(blocks, 0);
    // First line: spacingBefore(5) + lineHeight(10) = 15
    expect(cursor.advanceLine(0)).toBe(15);
    // Second line: just lineHeight(12) = 12
    expect(cursor.advanceLine(1)).toBe(12);
  });

  it('includes totalHeight promotion on block completion', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [10, 10],
        totalHeight: 30,
        visibleHeight: 20,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 0,
        spacingAfter: 0,
      },
    ];

    const cursor = createCellSliceCursor(blocks, 0);
    expect(cursor.advanceLine(0)).toBe(10);
    // Last line: 10 + promotion max(0, 30 - 20) = 20
    expect(cursor.advanceLine(1)).toBe(20);
  });

  it('includes spacingAfter on block completion for non-last blocks', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 1,
        lineHeights: [10],
        totalHeight: 10,
        visibleHeight: 10,
        isFirstBlock: true,
        isLastBlock: false,
        spacingBefore: 0,
        spacingAfter: 6,
      },
      {
        kind: 'paragraph',
        globalStartLine: 1,
        globalEndLine: 2,
        lineHeights: [10],
        totalHeight: 10,
        visibleHeight: 10,
        isFirstBlock: false,
        isLastBlock: true,
        spacingBefore: 4,
        spacingAfter: 0,
      },
    ];

    const cursor = createCellSliceCursor(blocks, 0);
    // Line 0: block 0 complete → 10 + spacingAfter(6) = 16
    expect(cursor.advanceLine(0)).toBe(16);
    // Line 1: block 1 enters with spacingBefore(4) → 4 + 10 = 14
    expect(cursor.advanceLine(1)).toBe(14);
  });

  it('skips spacing.before when starting mid-block (continuation)', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 3,
        lineHeights: [10, 10, 10],
        totalHeight: 30,
        visibleHeight: 30,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 8,
        spacingAfter: 0,
      },
    ];

    // Start from line 1 (mid-block continuation)
    const cursor = createCellSliceCursor(blocks, 1);
    // No spacing.before because we didn't start from line 0
    expect(cursor.advanceLine(1)).toBe(10);
    // No promotion because we didn't start from line 0
    expect(cursor.advanceLine(2)).toBe(10);
  });

  it('skips totalHeight promotion when not starting from line 0', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 3,
        lineHeights: [10, 10, 10],
        totalHeight: 50,
        visibleHeight: 30,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 0,
        spacingAfter: 0,
      },
    ];

    const cursor = createCellSliceCursor(blocks, 1);
    expect(cursor.advanceLine(1)).toBe(10);
    // No promotion: block started mid-way
    expect(cursor.advanceLine(2)).toBe(10);
  });

  it('handles transition across block boundaries', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'paragraph',
        globalStartLine: 0,
        globalEndLine: 2,
        lineHeights: [10, 10],
        totalHeight: 20,
        visibleHeight: 20,
        isFirstBlock: true,
        isLastBlock: false,
        spacingBefore: 0,
        spacingAfter: 5,
      },
      {
        kind: 'paragraph',
        globalStartLine: 2,
        globalEndLine: 4,
        lineHeights: [12, 12],
        totalHeight: 24,
        visibleHeight: 24,
        isFirstBlock: false,
        isLastBlock: true,
        spacingBefore: 3,
        spacingAfter: 0,
      },
    ];

    const cursor = createCellSliceCursor(blocks, 0);
    expect(cursor.advanceLine(0)).toBe(10);
    // Line 1 completes block 0: 10 + spacingAfter(5) = 15
    expect(cursor.advanceLine(1)).toBe(15);
    // Line 2 enters block 1: spacingBefore(3) + 12 = 15
    expect(cursor.advanceLine(2)).toBe(15);
    expect(cursor.advanceLine(3)).toBe(12);
  });

  it('contributes 0 for anchored out-of-flow blocks', () => {
    const blocks: CellRenderBlock[] = [
      {
        kind: 'other',
        globalStartLine: 0,
        globalEndLine: 1,
        lineHeights: [30],
        totalHeight: 0,
        visibleHeight: 0,
        isFirstBlock: true,
        isLastBlock: true,
        spacingBefore: 0,
        spacingAfter: 0,
      },
    ];

    const cursor = createCellSliceCursor(blocks, 0);
    expect(cursor.advanceLine(0)).toBe(0);
  });

  describe('minSegmentCost', () => {
    it('returns spacingBefore + lineHeight for first line of paragraph', () => {
      const blocks: CellRenderBlock[] = [
        {
          kind: 'paragraph',
          globalStartLine: 0,
          globalEndLine: 3,
          lineHeights: [10, 10, 10],
          totalHeight: 30,
          visibleHeight: 30,
          isFirstBlock: true,
          isLastBlock: true,
          spacingBefore: 8,
          spacingAfter: 0,
        },
      ];

      const cursor = createCellSliceCursor(blocks, 0);
      // spacingBefore(8) + lineHeight(10) = 18
      expect(cursor.minSegmentCost(0)).toBe(18);
    });

    it('includes completion costs for single-line blocks', () => {
      const blocks: CellRenderBlock[] = [
        {
          kind: 'paragraph',
          globalStartLine: 0,
          globalEndLine: 1,
          lineHeights: [10],
          totalHeight: 20,
          visibleHeight: 10,
          isFirstBlock: true,
          isLastBlock: false,
          spacingBefore: 5,
          spacingAfter: 3,
        },
      ];

      const cursor = createCellSliceCursor(blocks, 0);
      // spacingBefore(5) + lineHeight(10) + promotion(10) + spacingAfter(3) = 28
      expect(cursor.minSegmentCost(0)).toBe(28);
    });

    it('returns just lineHeight for mid-block lines', () => {
      const blocks: CellRenderBlock[] = [
        {
          kind: 'paragraph',
          globalStartLine: 0,
          globalEndLine: 3,
          lineHeights: [10, 12, 14],
          totalHeight: 36,
          visibleHeight: 36,
          isFirstBlock: true,
          isLastBlock: true,
          spacingBefore: 5,
          spacingAfter: 0,
        },
      ];

      const cursor = createCellSliceCursor(blocks, 0);
      expect(cursor.minSegmentCost(1)).toBe(12); // mid-block: just line height
    });

    it('does not mutate cursor state', () => {
      const blocks: CellRenderBlock[] = [
        {
          kind: 'paragraph',
          globalStartLine: 0,
          globalEndLine: 2,
          lineHeights: [10, 10],
          totalHeight: 20,
          visibleHeight: 20,
          isFirstBlock: true,
          isLastBlock: true,
          spacingBefore: 5,
          spacingAfter: 0,
        },
      ];

      const cursor = createCellSliceCursor(blocks, 0);
      cursor.minSegmentCost(0); // Should not affect state
      cursor.minSegmentCost(0); // Should return same result
      // advanceLine should still work from line 0
      expect(cursor.advanceLine(0)).toBe(15); // spacingBefore(5) + 10
    });
  });
});

// ─── computeFullCellContentHeight ────────────────────────────────────────────

describe('computeFullCellContentHeight', () => {
  it('uses measurement semantics: includes last-block spacing.after', () => {
    // computeFullCellContentHeight uses measurement semantics (includes
    // last-block spacing.after) while computeCellSliceContentHeight uses
    // renderer semantics (skips it). This keeps getRowContentHeight aligned
    // with rowMeasure.height for hasExplicitRowHeightSlack comparisons.
    const m1 = makeParaMeasure([10, 12], 25);
    const m2 = makeParaMeasure([8, 8]);
    const b1 = makeParaBlock(6, 5);
    const b2 = makeParaBlock(3, 10); // last block, spacing.after = 10
    const measure = makeCellMeasure([m1, m2]);
    const block = makeCellBlock([b1, b2]);
    const padding = { top: 2, bottom: 0 };

    const rendererHeight = computeCellSliceContentHeight(describeCellRenderBlocks(measure, block, padding), 0, 4);
    const measurementHeight = computeFullCellContentHeight(measure, block, padding);

    // Measurement height includes last-block spacing.after (10px excess over 0 bottom padding)
    expect(measurementHeight).toBe(rendererHeight + 10);
  });

  it('absorbs last-block spacing.after into bottom padding', () => {
    const pm = makeParaMeasure([10, 12]);
    const cellMeasure: TableCellMeasure = { paragraph: pm, width: 100, height: 100 };
    const cellBlock: TableCell = { id: 'cell' as BlockId, paragraph: makeParaBlock(6, 4) };
    // spacing.after=4, paddingBottom=5 → absorbed (4 < 5 → excess = 0)
    const padding = { top: 2, bottom: 5 };

    const actual = computeFullCellContentHeight(cellMeasure, cellBlock, padding);
    // spacingBefore = max(0, 6-2) = 4
    // max(sum(10,12), 22) = 22
    // spacingAfter = effectiveTableCellSpacing(4, true, 5) = max(0, 4-5) = 0
    // Total: 4 + 22 + 0 = 26
    expect(actual).toBe(26);
  });

  it('matches renderer path for non-last blocks and inline images', () => {
    // Non-last blocks and inline images behave identically in both semantics
    const m1 = makeParaMeasure([10]);
    const imgMeasure = { kind: 'image' as const, width: 50, height: 30 };
    const m2 = makeParaMeasure([10]);
    const measure: TableCellMeasure = { blocks: [m1, imgMeasure, m2], width: 100, height: 100 };

    const b1 = makeParaBlock(0, 5);
    const imgBlock = { kind: 'image' as const, id: 'img' as BlockId, src: 'test.png' };
    const b2 = makeParaBlock(3, 0); // last block, spacing.after = 0
    const block: TableCell = { id: 'cell' as BlockId, blocks: [b1, imgBlock as any, b2] };

    const rendererHeight = computeCellSliceContentHeight(describeCellRenderBlocks(measure, block, NO_PADDING), 0, 3);
    const measurementHeight = computeFullCellContentHeight(measure, block, NO_PADDING);

    // Last block has spacing.after = 0, so no difference between semantics
    expect(measurementHeight).toBe(rendererHeight);
  });
});
