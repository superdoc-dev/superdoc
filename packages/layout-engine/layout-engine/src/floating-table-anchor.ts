import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  Run,
  TableBlock,
  TableMeasure,
  TableWrap,
} from '@superdoc/contracts';
import { OOXML_PCT_DIVISOR, resolveTableWidthAttr } from '@superdoc/contracts';

export type FloatingTableAnchorResolution = {
  paragraphIndex: number;
  offsetV: number;
  /**
   * True when w:tblpY applies directly on the anchor paragraph's first line (Word line-scoped).
   * Tall wrap-none form fields vertically center on that line; forward-walk remainders do not.
   */
  lineScopedOnAnchor?: boolean;
};

/** Width ratio for inline (paginated) layout vs single float fragment. */
export const ANCHORED_TABLE_FULL_WIDTH_RATIO = 0.99;

/**
 * Floating tables in FlowBlock order do not carry Word's anchor-paragraph pointer.
 * When {@link TableBlock.attrs.anchorParagraphId} is set at import time, that wins.
 * Otherwise this module applies OOXML tblpPr semantics using measured paragraph heights.
 */

function runText(run: Run): string {
  if (run.kind != null && run.kind !== 'text') return '';
  return 'text' in run && typeof run.text === 'string' ? run.text : '';
}

function paragraphText(block: ParagraphBlock): string {
  return block.runs?.map(runText).join('') ?? '';
}

function paragraphMeasureAt(blocks: FlowBlock[], measures: Measure[], index: number): ParagraphMeasure | null {
  const block = blocks[index];
  const measure = measures[index];
  if (block?.kind !== 'paragraph' || measure?.kind !== 'paragraph') return null;
  return measure;
}

function paragraphFirstLineHeight(blocks: FlowBlock[], measures: Measure[], index: number): number {
  const measure = paragraphMeasureAt(blocks, measures, index);
  if (!measure) return 0;
  const firstLine = measure.lines?.[0];
  if (firstLine?.lineHeight != null && firstLine.lineHeight > 0) {
    return firstLine.lineHeight;
  }
  return measure.totalHeight ?? 0;
}

function isSingleLineParagraph(blocks: FlowBlock[], measures: Measure[], index: number): boolean {
  const measure = paragraphMeasureAt(blocks, measures, index);
  if (!measure) return false;
  const lineCount = measure.lines?.length ?? 0;
  if (lineCount === 1) return true;
  return lineCount === 0 && (measure.totalHeight ?? 0) > 0;
}

function isTextEmptyParagraph(blocks: FlowBlock[], index: number): boolean {
  const block = blocks[index];
  if (block.kind !== 'paragraph') return false;
  return paragraphText(block as ParagraphBlock).trim().length === 0;
}

function findPreviousParagraphIndex(blocks: FlowBlock[], fromIndex: number): number | null {
  for (let i = fromIndex - 1; i >= 0; i -= 1) {
    if (blocks[i].kind === 'paragraph') return i;
  }
  return null;
}

function findNextParagraphIndex(blocks: FlowBlock[], fromIndex: number, len: number): number | null {
  for (let i = fromIndex + 1; i < len; i += 1) {
    if (blocks[i].kind === 'paragraph') return i;
  }
  return null;
}

function findNearestParagraphIndex(blocks: FlowBlock[], len: number, fromIndex: number): number | null {
  return findPreviousParagraphIndex(blocks, fromIndex) ?? findNextParagraphIndex(blocks, fromIndex, len);
}

function paragraphMeasureHeight(measures: Measure[], index: number): number {
  const measure = measures[index];
  if (measure?.kind !== 'paragraph') return 0;
  return measure.totalHeight ?? 0;
}

/** True when offsetV is line-scoped (w:tblpY in the first-line range, not a multi-paragraph skip). */
function isLineScopedTblpY(blocks: FlowBlock[], measures: Measure[], paragraphIndex: number, offsetV: number): boolean {
  const lineHeight = paragraphFirstLineHeight(blocks, measures, paragraphIndex);
  if (lineHeight <= 0) return offsetV <= 1;
  return offsetV <= lineHeight * 1.5;
}

function isMultiLineParagraph(blocks: FlowBlock[], measures: Measure[], index: number): boolean {
  const measure = paragraphMeasureAt(blocks, measures, index);
  if (!measure) return false;
  return (measure.lines?.length ?? 0) > 1;
}

/**
 * First single-line option row after a multi-line heading/body (Form F3 checkbox groups).
 */
function findForwardCompactOptionLine(
  blocks: FlowBlock[],
  measures: Measure[],
  len: number,
  tableIndex: number,
): number | null {
  for (let i = tableIndex + 1; i < len; i += 1) {
    if (blocks[i].kind !== 'paragraph') continue;
    if (isTextEmptyParagraph(blocks, i)) continue;
    if (!isSingleLineParagraph(blocks, measures, i)) continue;

    const height = paragraphMeasureHeight(measures, i);
    const lineH = paragraphFirstLineHeight(blocks, measures, i);
    if (height <= 0 || lineH <= 0 || height > lineH * 1.25) continue;

    const prevIndex = findPreviousParagraphIndex(blocks, i);
    if (prevIndex == null) continue;

    if (isMultiLineParagraph(blocks, measures, prevIndex)) {
      return i;
    }

    if (isCompactOptionLineAfterBody(blocks, measures, i, prevIndex)) {
      return i;
    }
  }

  return null;
}

/**
 * Short option line after taller body copy (form yes/no rows).
 * Uses measured line count and height — not content pattern matching.
 */
function isCompactOptionLineAfterBody(
  blocks: FlowBlock[],
  measures: Measure[],
  optionIndex: number,
  bodyIndex: number | null,
): boolean {
  if (bodyIndex == null) return false;
  if (!isSingleLineParagraph(blocks, measures, optionIndex)) return false;

  const optionHeight = paragraphMeasureHeight(measures, optionIndex);
  const optionLine = paragraphFirstLineHeight(blocks, measures, optionIndex);
  if (optionHeight <= 0 || optionLine <= 0 || optionHeight > optionLine * 1.25) return false;

  const bodyHeight = paragraphMeasureHeight(measures, bodyIndex);
  return bodyHeight > optionHeight * 1.5;
}

function resolutionWithLineScopedFlag(
  blocks: FlowBlock[],
  measures: Measure[],
  paragraphIndex: number,
  offsetV: number,
  rawOffsetV: number,
  forwardResolved = false,
): FloatingTableAnchorResolution {
  return {
    paragraphIndex,
    offsetV,
    lineScopedOnAnchor:
      !forwardResolved &&
      offsetV === rawOffsetV &&
      isLineScopedTblpY(blocks, measures, paragraphIndex, offsetV) &&
      !isTextEmptyParagraph(blocks, paragraphIndex),
  };
}

/**
 * Word tblpY paint offset after anchoring to a forward checkbox row: subtract measured
 * heights of every paragraph from the first follower through the anchor (inclusive).
 */
function paintOffsetThroughAnchorParagraphs(
  blocks: FlowBlock[],
  measures: Measure[],
  len: number,
  tableIndex: number,
  anchorParagraphIndex: number,
  rawOffsetV: number,
): number {
  let consumed = 0;
  let index = findNextParagraphIndex(blocks, tableIndex, len);
  while (index != null && index <= anchorParagraphIndex) {
    consumed += paragraphMeasureHeight(measures, index);
    if (index === anchorParagraphIndex) break;
    index = findNextParagraphIndex(blocks, index, len);
  }
  return Math.max(0, rawOffsetV - consumed);
}

/**
 * Walk forward through paragraphs, consuming tblpY until the remainder fits in one paragraph.
 * Mirrors Word skipping intervening paragraph boxes for large w:tblpY values.
 */
function resolveForwardParagraphByTblpY(
  blocks: FlowBlock[],
  measures: Measure[],
  len: number,
  tableIndex: number,
  offsetV: number,
): FloatingTableAnchorResolution | null {
  if (offsetV <= 0) return null;

  let remaining = offsetV;
  let index = findNextParagraphIndex(blocks, tableIndex, len);
  while (index != null) {
    if (blocks[index].kind !== 'paragraph') {
      index = findNextParagraphIndex(blocks, index, len);
      continue;
    }

    const height = paragraphMeasureHeight(measures, index);
    if (height <= 0) {
      index = findNextParagraphIndex(blocks, index, len);
      continue;
    }

    const lineHeight = paragraphFirstLineHeight(blocks, measures, index);
    if (remaining <= height + 1) {
      const effectiveOffsetV = lineHeight > 0 ? Math.min(remaining, lineHeight) : remaining;
      return {
        paragraphIndex: index,
        offsetV: effectiveOffsetV,
        lineScopedOnAnchor: false,
      };
    }

    remaining -= height;
    const nextIndex = findNextParagraphIndex(blocks, index, len);
    if (nextIndex == null && remaining > 0) {
      const effectiveOffsetV = lineHeight > 0 ? Math.min(remaining, lineHeight) : remaining;
      return {
        paragraphIndex: index,
        offsetV: effectiveOffsetV,
        lineScopedOnAnchor: false,
      };
    }

    index = nextIndex;
  }

  return null;
}

/**
 * Walk backward through paragraphs while tblpY exceeds each paragraph's measured height.
 * offsetV stays absolute from the chosen anchor paragraph's top (Word tblpPr semantics).
 */
function walkBackTblpYAnchor(
  blocks: FlowBlock[],
  measures: Measure[],
  startIndex: number,
  offsetV: number,
): FloatingTableAnchorResolution {
  let candidate = startIndex;

  while (offsetV > 0) {
    const candidateHeight = paragraphMeasureHeight(measures, candidate);
    if (offsetV <= candidateHeight + 1) break;
    const earlierIndex = findPreviousParagraphIndex(blocks, candidate);
    if (earlierIndex == null) break;
    candidate = earlierIndex;
  }

  return resolutionWithLineScopedFlag(blocks, measures, candidate, offsetV, offsetV);
}

function getTableIndentPx(attrs: TableBlock['attrs']): number {
  const tableIndent = attrs?.tableIndent as { width?: unknown } | undefined;
  return typeof tableIndent?.width === 'number' && Number.isFinite(tableIndent.width) ? tableIndent.width : 0;
}

function horizontalWrapMargin(wrap?: TableWrap): number {
  return (wrap?.distLeft ?? 0) + (wrap?.distRight ?? 0);
}

/** Sub-pixel slack from column-width rescaling during measure. */
function measureRoundingSlack(columnCount: number): number {
  return Math.max(1, columnCount) * 0.5;
}

/**
 * True when an anchored table should paginate inline instead of as one float fragment.
 * Uses tbl width, wrap distances from w:tblpPr, and table indent — not a fixed px fudge factor.
 */
export function isAnchoredTableFullWidth(block: TableBlock, measure: TableMeasure, columnWidth: number): boolean {
  if (columnWidth <= 0) return false;

  const totalWidth = measure.totalWidth ?? 0;
  const indent = getTableIndentPx(block.attrs);
  const effectiveWidth = totalWidth + horizontalWrapMargin(block.wrap) + Math.max(0, -indent);
  const slack = measureRoundingSlack(measure.columnWidths?.length ?? 1);

  const tblWidth = resolveTableWidthAttr(block.attrs?.tableWidth);
  if (tblWidth?.type === 'pct' && tblWidth.width >= OOXML_PCT_DIVISOR * ANCHORED_TABLE_FULL_WIDTH_RATIO) {
    return true;
  }

  return effectiveWidth + slack >= columnWidth * ANCHORED_TABLE_FULL_WIDTH_RATIO;
}

/**
 * Resolve anchor paragraph + vertical offset for a block-level floating table.
 */
export function resolveFloatingTableAnchorResolution(
  blocks: FlowBlock[],
  measures: Measure[],
  len: number,
  tableIndex: number,
  tableBlock: TableBlock,
  paragraphIndexById: Map<string, number>,
): FloatingTableAnchorResolution | null {
  const anchorParagraphId =
    typeof tableBlock.attrs === 'object' && tableBlock.attrs
      ? (tableBlock.attrs as { anchorParagraphId?: unknown }).anchorParagraphId
      : undefined;
  if (typeof anchorParagraphId === 'string') {
    const explicitIndex = paragraphIndexById.get(anchorParagraphId);
    if (typeof explicitIndex === 'number') {
      const offsetV = tableBlock.anchor?.offsetV ?? 0;
      const vRelativeFrom = tableBlock.anchor?.vRelativeFrom ?? 'paragraph';
      if (vRelativeFrom !== 'paragraph') {
        return { paragraphIndex: explicitIndex, offsetV, lineScopedOnAnchor: false };
      }
      return resolutionWithLineScopedFlag(blocks, measures, explicitIndex, offsetV, offsetV);
    }
  }

  const vRelativeFrom = tableBlock.anchor?.vRelativeFrom ?? 'paragraph';
  if (vRelativeFrom !== 'paragraph') {
    const fallback = findNearestParagraphIndex(blocks, len, tableIndex);
    if (fallback == null) return null;
    const offsetV = tableBlock.anchor?.offsetV ?? 0;
    return { paragraphIndex: fallback, offsetV, lineScopedOnAnchor: false };
  }

  const offsetV = tableBlock.anchor?.offsetV ?? 0;
  const prevIndex = findPreviousParagraphIndex(blocks, tableIndex);
  const nextIndex = findNextParagraphIndex(blocks, tableIndex, len);

  if (nextIndex != null && isLineScopedTblpY(blocks, measures, nextIndex, offsetV)) {
    // Spacer + wrapping text: empty predecessor, non-empty follower (notification AUD$ field).
    if (!isTextEmptyParagraph(blocks, nextIndex) && (prevIndex == null || isTextEmptyParagraph(blocks, prevIndex))) {
      return resolutionWithLineScopedFlag(blocks, measures, nextIndex, offsetV, offsetV);
    }

    if (isCompactOptionLineAfterBody(blocks, measures, nextIndex, prevIndex)) {
      return resolutionWithLineScopedFlag(blocks, measures, nextIndex, offsetV, offsetV);
    }
  }

  if (!isLineScopedTblpY(blocks, measures, prevIndex ?? nextIndex ?? tableIndex, offsetV)) {
    const forwardCompact = findForwardCompactOptionLine(blocks, measures, len, tableIndex);
    if (forwardCompact != null) {
      const paintOffsetV = paintOffsetThroughAnchorParagraphs(
        blocks,
        measures,
        len,
        tableIndex,
        forwardCompact,
        offsetV,
      );
      return {
        paragraphIndex: forwardCompact,
        offsetV: paintOffsetV,
        lineScopedOnAnchor: false,
      };
    }

    const forward = resolveForwardParagraphByTblpY(blocks, measures, len, tableIndex, offsetV);
    if (forward != null) {
      return forward;
    }
  }

  const startIndex = prevIndex ?? nextIndex;
  if (startIndex == null) return null;

  return walkBackTblpYAnchor(blocks, measures, startIndex, offsetV);
}
