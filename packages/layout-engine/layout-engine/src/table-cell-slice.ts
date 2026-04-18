/**
 * Shared cell-slice-height module for table pagination.
 *
 * Provides a single source of truth for computing rendered cell-slice heights
 * that match the DOM painter's actual rendering semantics (spacing.before,
 * totalHeight promotion, spacing.after). Used by:
 *
 * - `computePartialRow()` — fitting loop via incremental cursor (Layer 2)
 * - `getRowContentHeight()` — one-shot full-row height (Layer 1)
 * - `layout-bridge` — selection-rect vertical positioning (Layer 1)
 *
 * Lives in `@superdoc/layout-engine` because it depends on layout-engine
 * internals (`getEmbeddedRowLines`) that are not part of the contract surface.
 */

import type { TableCellMeasure, TableCell, ParagraphMeasure, TableMeasure, TableRowMeasure } from '@superdoc/contracts';
import { effectiveTableCellSpacing } from '@superdoc/contracts';
import { getEmbeddedRowLines } from './layout-table.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Describes one block in a table cell with renderer-semantic height values.
 *
 * Maps each measured block to its global line index range and the spacing /
 * height values the DOM painter actually applies. Layout decisions that use
 * these descriptors stay synchronized with `renderTableCell.ts`.
 */
export type CellRenderBlock = {
  kind: 'paragraph' | 'table' | 'other';
  /** First global line index (inclusive). */
  globalStartLine: number;
  /** Past-the-end global line index (exclusive). */
  globalEndLine: number;
  /** Per-segment heights matching `getCellLines()` output. */
  lineHeights: number[];
  /** `ParagraphMeasure.totalHeight ?? sum(lineHeights)`. */
  totalHeight: number;
  /** Height contributing to content flow. 0 for anchored out-of-flow blocks. */
  visibleHeight: number;
  isFirstBlock: boolean;
  isLastBlock: boolean;
  /** Effective spacing.before (first block: excess over padding.top; others: full). */
  spacingBefore: number;
  /** Raw spacing.after; always 0 for last block (renderer skips it). */
  spacingAfter: number;
};

/**
 * Stateful cursor for the `computePartialRow()` fitting loop.
 *
 * Advances one line at a time and reports the rendered cost of each line
 * including block-boundary spacing and totalHeight promotion. O(1) per step.
 */
export interface CellSliceCursor {
  /**
   * Compute the rendered cost of including the line at `globalLineIndex`.
   * Advances internal state — call exactly once per line, in ascending order.
   * After calling, if the line doesn't fit, break; the cursor state no longer
   * matters since it won't be used again for this cell.
   */
  advanceLine(globalLineIndex: number): number;

  /**
   * Minimum rendered cost of the segment at `globalLineIndex`, for
   * force-progress checks. Pure peek — does not modify cursor state.
   */
  minSegmentCost(globalLineIndex: number): number;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build an ordered array of block descriptors from a cell's measurement and
 * block data. Descriptors carry all renderer-semantic information needed by
 * `computeCellSliceContentHeight` and the fitting cursor.
 *
 * **Iteration rule**: driven by measured blocks (source of truth for line
 * counts). Block data is attached by index when available; missing data
 * degrades to zero spacing and `totalHeight = sum(lineHeights)`.
 */
export function describeCellRenderBlocks(
  cellMeasure: TableCellMeasure,
  cellBlock: TableCell | undefined,
  cellPadding: { top: number; bottom: number },
): CellRenderBlock[] {
  const measuredBlocks = cellMeasure.blocks;
  const blockDataArray = cellBlock?.blocks;

  // Backward-compat: single-paragraph cells
  if (!measuredBlocks || measuredBlocks.length === 0) {
    if (cellMeasure.paragraph) {
      return buildSingleParagraphBlock(cellMeasure.paragraph, cellBlock?.paragraph, cellPadding);
    }
    return [];
  }

  const result: CellRenderBlock[] = [];
  let globalLine = 0;
  const blockCount = measuredBlocks.length;

  for (let i = 0; i < blockCount; i++) {
    const measure = measuredBlocks[i];
    const data = i < (blockDataArray?.length ?? 0) ? blockDataArray![i] : undefined;
    const isFirstBlock = i === 0;
    const isLastBlock = i === blockCount - 1;

    if (measure.kind === 'paragraph') {
      const paraMeasure = measure as ParagraphMeasure;
      const paraData = data?.kind === 'paragraph' ? data : undefined;

      const lines = paraMeasure.lines ?? [];
      const lineHeights = lines.map((l) => l.lineHeight);
      const sumLines = sumArray(lineHeights);

      const spacingBefore = effectiveTableCellSpacing(paraData?.attrs?.spacing?.before, isFirstBlock, cellPadding.top);
      const rawAfter = paraData?.attrs?.spacing?.after;
      const spacingAfter = isLastBlock ? 0 : typeof rawAfter === 'number' && rawAfter > 0 ? rawAfter : 0;

      const startLine = globalLine;
      globalLine += lines.length;

      result.push({
        kind: 'paragraph',
        globalStartLine: startLine,
        globalEndLine: globalLine,
        lineHeights,
        totalHeight: paraMeasure.totalHeight ?? sumLines,
        visibleHeight: sumLines,
        isFirstBlock,
        isLastBlock,
        spacingBefore,
        spacingAfter,
      });
    } else if (measure.kind === 'table') {
      // Embedded table — expand rows the same way getCellLines() does
      const tableMeasure = measure as TableMeasure;
      const lineHeights: number[] = [];
      for (const row of tableMeasure.rows) {
        for (const seg of getEmbeddedRowLines(row)) {
          lineHeights.push(seg.lineHeight);
        }
      }

      const startLine = globalLine;
      globalLine += lineHeights.length;
      const sumLines = sumArray(lineHeights);

      result.push({
        kind: 'table',
        globalStartLine: startLine,
        globalEndLine: globalLine,
        lineHeights,
        totalHeight: sumLines,
        visibleHeight: sumLines,
        isFirstBlock,
        isLastBlock,
        spacingBefore: 0,
        spacingAfter: 0,
      });
    } else {
      // Image, drawing, or other non-paragraph block.
      // getCellLines() only adds a segment when height > 0.
      const blockHeight = 'height' in measure ? (measure as { height: number }).height : 0;
      if (blockHeight > 0) {
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
      // height === 0 → getCellLines() skips it, no line index consumed
    }
  }

  return result;
}

// ─── Layer 1: Pure full-slice function ───────────────────────────────────────

/**
 * Content-area height of a cell slice `[fromLine, toLine)`.
 *
 * Matches the DOM painter's rendering semantics:
 * - `spacing.before` when rendering from the start of a block
 * - `totalHeight` promotion for fully rendered paragraphs
 * - `spacing.after` for fully rendered non-last paragraphs
 *
 * Returns content height only — cell padding is NOT included.
 * O(blocks) per call.
 */
export function computeCellSliceContentHeight(blocks: CellRenderBlock[], fromLine: number, toLine: number): number {
  let height = 0;

  for (const block of blocks) {
    if (block.globalEndLine <= fromLine || block.globalStartLine >= toLine) continue;

    const localStart = Math.max(0, fromLine - block.globalStartLine);
    const localEnd = Math.min(block.lineHeights.length, toLine - block.globalStartLine);
    const rendersEntireBlock = localStart === 0 && localEnd >= block.lineHeights.length;

    if (block.kind === 'paragraph') {
      // spacing.before when rendering from line 0 — matches renderTableCell.ts:1386-1394
      if (localStart === 0) {
        height += block.spacingBefore;
      }

      let sliceLineSum = 0;
      for (let i = localStart; i < localEnd; i++) {
        sliceLineSum += block.lineHeights[i];
      }

      if (rendersEntireBlock) {
        // Promote to totalHeight — matches renderTableCell.ts:1478-1482
        height += Math.max(sliceLineSum, block.totalHeight);
        // spacing.after for non-last blocks — matches renderTableCell.ts:1492-1500
        // (block.spacingAfter is already 0 for the last block)
        height += block.spacingAfter;
      } else {
        height += sliceLineSum;
      }
    } else {
      // Table / other blocks — contribute overlapped visible heights
      if (block.visibleHeight === 0) continue; // anchored out-of-flow
      for (let i = localStart; i < localEnd; i++) {
        height += block.lineHeights[i];
      }
    }
  }

  return height;
}

// ─── Layer 2: Incremental cursor ─────────────────────────────────────────────

/**
 * Create a stateful cursor for the `computePartialRow()` fitting loop.
 *
 * The cursor tracks block boundaries and accumulates spacing / promotion costs
 * so that each `advanceLine()` call is O(1). If the fitting loop starts from a
 * continuation (mid-block), the cursor correctly skips spacing.before and
 * totalHeight promotion for the partially consumed block.
 */
export function createCellSliceCursor(blocks: CellRenderBlock[], startLine: number): CellSliceCursor {
  let blockIdx = 0;
  let startedFromLine0 = false;
  let blockLineSum = 0;

  // Advance to the block containing startLine
  while (blockIdx < blocks.length && blocks[blockIdx].globalEndLine <= startLine) {
    blockIdx++;
  }
  if (blockIdx < blocks.length) {
    const block = blocks[blockIdx];
    startedFromLine0 = startLine <= block.globalStartLine;
    // Pre-accumulate line heights for lines already consumed in this block
    if (!startedFromLine0) {
      for (let li = 0; li < startLine - block.globalStartLine; li++) {
        blockLineSum += block.lineHeights[li] ?? 0;
      }
    }
  }

  return {
    advanceLine(globalLineIndex: number): number {
      // Handle block transitions
      while (blockIdx < blocks.length && blocks[blockIdx].globalEndLine <= globalLineIndex) {
        blockIdx++;
        startedFromLine0 = true;
        blockLineSum = 0;
      }
      if (blockIdx >= blocks.length) return 0;

      const block = blocks[blockIdx];
      const localLine = globalLineIndex - block.globalStartLine;
      const lineHeight = block.lineHeights[localLine] ?? 0;
      let cost = 0;

      // spacing.before when entering a paragraph block at its first line
      if (localLine === 0 && startedFromLine0 && block.kind === 'paragraph') {
        cost += block.spacingBefore;
      }

      // Line's visible contribution
      if (block.kind === 'paragraph' || block.visibleHeight > 0) {
        cost += lineHeight;
      }

      // Track line height within the block (before block-completion check)
      blockLineSum += lineHeight;

      // Block completion: totalHeight promotion + spacingAfter
      const isBlockComplete = localLine === block.lineHeights.length - 1;
      if (isBlockComplete && startedFromLine0 && block.kind === 'paragraph') {
        cost += Math.max(0, block.totalHeight - blockLineSum);
        cost += block.spacingAfter;
      }

      // Advance to next block if this one is complete
      if (isBlockComplete) {
        blockIdx++;
        startedFromLine0 = true;
        blockLineSum = 0;
      }

      return cost;
    },

    minSegmentCost(globalLineIndex: number): number {
      // Pure peek — does not modify cursor state
      const block = findBlockForLine(blocks, globalLineIndex);
      if (!block) return 0;

      const localLine = globalLineIndex - block.globalStartLine;
      const lineHeight = block.lineHeights[localLine] ?? 0;
      let cost = 0;

      // Include spacing.before if this is the first line of a paragraph block
      if (localLine === 0 && block.kind === 'paragraph') {
        cost += block.spacingBefore;
      }

      // Include visible line height
      if (block.kind === 'paragraph' || block.visibleHeight > 0) {
        cost += lineHeight;
      }

      // For single-line blocks, include completion costs
      if (block.lineHeights.length === 1 && block.kind === 'paragraph') {
        cost += Math.max(0, block.totalHeight - lineHeight);
        cost += block.spacingAfter;
      }

      return cost;
    },
  };
}

// ─── Hot-path: allocation-free full-cell height ──────────────────────────────

/**
 * Content height of a fully rendered cell, using **measurement** semantics.
 *
 * Unlike `describeCellRenderBlocks` + `computeCellSliceContentHeight` (which
 * use renderer semantics and skip last-block spacing.after), this function
 * includes last-block spacing.after via `effectiveTableCellSpacing` to match
 * how `rowMeasure.height` was computed by the measurer. This keeps
 * `getRowContentHeight()` aligned with `rowMeasure.height` so that
 * `hasExplicitRowHeightSlack()` compares like-for-like.
 *
 * Computes in a single pass without allocating intermediate arrays.
 * Returns content height only — cell padding is NOT included.
 */
export function computeFullCellContentHeight(
  cellMeasure: TableCellMeasure,
  cellBlock: TableCell | undefined,
  cellPadding: { top: number; bottom: number },
): number {
  const measuredBlocks = cellMeasure.blocks;
  const blockDataArray = cellBlock?.blocks;

  // Single paragraph fallback (first + last block)
  if (!measuredBlocks || measuredBlocks.length === 0) {
    if (cellMeasure.paragraph) {
      const pm = cellMeasure.paragraph;
      let sumLines = 0;
      for (const l of pm.lines) sumLines += l.lineHeight;
      const paraData = cellBlock?.paragraph;
      const spacingBefore = effectiveTableCellSpacing(paraData?.attrs?.spacing?.before, true, cellPadding.top);
      // Measurement semantics: last-block spacing.after is absorbed into
      // paddingBottom, but excess still contributes to measured height.
      const spacingAfter = effectiveTableCellSpacing(paraData?.attrs?.spacing?.after, true, cellPadding.bottom);
      return spacingBefore + Math.max(sumLines, pm.totalHeight ?? sumLines) + spacingAfter;
    }
    return 0;
  }

  let height = 0;
  const blockCount = measuredBlocks.length;

  for (let i = 0; i < blockCount; i++) {
    const measure = measuredBlocks[i];
    const data = i < (blockDataArray?.length ?? 0) ? blockDataArray![i] : undefined;
    const isFirstBlock = i === 0;
    const isLastBlock = i === blockCount - 1;

    if (measure.kind === 'paragraph') {
      const pm = measure as ParagraphMeasure;
      const paraData = data?.kind === 'paragraph' ? data : undefined;
      let sumLines = 0;
      for (const l of pm.lines ?? []) sumLines += l.lineHeight;

      height += effectiveTableCellSpacing(paraData?.attrs?.spacing?.before, isFirstBlock, cellPadding.top);
      height += Math.max(sumLines, pm.totalHeight ?? sumLines);
      if (!isLastBlock) {
        const rawAfter = paraData?.attrs?.spacing?.after;
        if (typeof rawAfter === 'number' && rawAfter > 0) height += rawAfter;
      } else {
        // Measurement semantics: last-block spacing.after is absorbed into
        // paddingBottom, but excess still contributes to measured height.
        // This keeps getRowContentHeight aligned with rowMeasure.height.
        height += effectiveTableCellSpacing(paraData?.attrs?.spacing?.after, true, cellPadding.bottom);
      }
    } else if (measure.kind === 'table') {
      // Sum row heights directly — avoids getEmbeddedRowLines() expansion.
      // For a fully rendered table this equals the sum of all segments.
      const tm = measure as TableMeasure;
      for (const row of tm.rows) height += row.height;
    } else {
      // Image, drawing: contribute height only when inline (not anchored out-of-flow)
      const blockHeight = 'height' in measure ? (measure as { height: number }).height : 0;
      if (blockHeight > 0 && !isAnchoredOutOfFlow(data)) {
        height += blockHeight;
      }
    }
  }

  return height;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function buildSingleParagraphBlock(
  paraMeasure: ParagraphMeasure,
  paraData: { attrs?: { spacing?: { before?: number; after?: number } } } | undefined,
  cellPadding: { top: number; bottom: number },
): CellRenderBlock[] {
  const lines = paraMeasure.lines ?? [];
  if (lines.length === 0) return [];

  const lineHeights = lines.map((l) => l.lineHeight);
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
      spacingAfter: 0, // Last block → renderer skips spacing.after
    },
  ];
}

/**
 * Detect anchored out-of-flow blocks (images/drawings positioned outside
 * the normal content flow). These consume a line index in `getCellLines()`
 * but contribute zero visible height in the renderer.
 */
function isAnchoredOutOfFlow(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  const anchor = b.anchor as Record<string, unknown> | undefined;
  if (!anchor?.isAnchored) return false;
  const wrap = b.wrap as Record<string, string> | undefined;
  return (wrap?.type ?? 'Inline') !== 'Inline';
}

function findBlockForLine(blocks: CellRenderBlock[], globalLineIndex: number): CellRenderBlock | undefined {
  for (const block of blocks) {
    if (globalLineIndex >= block.globalStartLine && globalLineIndex < block.globalEndLine) {
      return block;
    }
  }
  return undefined;
}

function sumArray(arr: number[]): number {
  let total = 0;
  for (const v of arr) total += v;
  return total;
}
