import {
  computeFragmentPmRange as computeFragmentPmRangeUnified,
  computeLinePmRange as computeLinePmRangeUnified,
} from '@superdoc/contracts';
import type { Line, ParagraphBlock, ParagraphMeasure, LinePmRange, Run, TextRun } from '@superdoc/contracts';

// ============================================================================
// Empty Paragraph Detection Types & Utilities
// ============================================================================

/**
 * Tracks which paragraph spacing properties were explicitly set.
 *
 * Used to distinguish between explicit spacing values and those inherited
 * from docDefaults/styles. This affects empty paragraph rendering because
 * Word suppresses inherited spacing on empty paragraphs but honors explicit spacing.
 */
export type SpacingExplicit = {
  /** Whether 'before' spacing was explicitly set */
  before?: boolean;
  /** Whether 'after' spacing was explicitly set */
  after?: boolean;
  /** Whether 'line' spacing was explicitly set */
  line?: boolean;
};

/**
 * Type guard to check if a run is a text run.
 *
 * @param run - The run to check
 * @returns True if the run is a text run (no kind or kind === 'text')
 */
const isTextRun = (run: Run): run is TextRun => {
  const runWithKind = run as { kind?: string };
  return !runWithKind.kind || runWithKind.kind === 'text';
};

/**
 * Checks if a paragraph block is an empty text paragraph.
 *
 * An empty text paragraph is defined as:
 * - No runs at all, OR
 * - Exactly one text run with an empty string
 *
 * This is used to determine if special empty paragraph handling
 * should apply (e.g., suppressing inherited spacing).
 *
 * @param block - The paragraph block to check
 * @returns True if the paragraph is empty text
 *
 * @example
 * ```typescript
 * isEmptyTextParagraph({ kind: 'paragraph', runs: [] }); // true
 * isEmptyTextParagraph({ kind: 'paragraph', runs: [{ text: '' }] }); // true
 * isEmptyTextParagraph({ kind: 'paragraph', runs: [{ text: 'Hi' }] }); // false
 * isEmptyTextParagraph({ kind: 'paragraph', runs: [{ kind: 'image', src: '...' }] }); // false
 * ```
 */
export const isEmptyTextParagraph = (block: ParagraphBlock): boolean => {
  const runs = block.runs;
  if (!runs || runs.length === 0) return true;
  if (runs.length !== 1) return false;
  const run = runs[0];
  if (!isTextRun(run)) return false;
  return typeof run.text === 'string' && run.text.length === 0;
};

/**
 * Determines if spacing should be suppressed for an empty paragraph.
 *
 * In Microsoft Word, empty paragraphs only show spacing if it was explicitly
 * set on the paragraph. Spacing inherited from docDefaults or styles is
 * suppressed for empty paragraphs.
 *
 * @param block - The paragraph block to check
 * @param side - Which spacing side to check ('before' or 'after')
 * @returns True if spacing should be suppressed (paragraph is empty and spacing is not explicit)
 *
 * @example
 * ```typescript
 * // Empty paragraph with inherited spacing - suppress
 * shouldSuppressSpacingForEmpty(emptyBlock, 'before'); // true
 *
 * // Empty paragraph with explicit spacing - don't suppress
 * shouldSuppressSpacingForEmpty(emptyBlockWithExplicit, 'before'); // false
 *
 * // Non-empty paragraph - don't suppress
 * shouldSuppressSpacingForEmpty(nonEmptyBlock, 'before'); // false
 * ```
 */
export const shouldSuppressSpacingForEmpty = (block: ParagraphBlock, side: 'before' | 'after'): boolean => {
  if (!isEmptyTextParagraph(block)) return false;
  const attrs = block.attrs as { spacingExplicit?: SpacingExplicit } | undefined;
  const spacingExplicit = attrs?.spacingExplicit;
  if (!spacingExplicit) return false;
  if (side === 'before') {
    return !spacingExplicit.before;
  }
  return !spacingExplicit.after;
};

export function normalizeLines(measure: ParagraphMeasure): ParagraphMeasure['lines'] {
  if (measure.lines.length > 0) {
    return measure.lines;
  }
  return [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 0,
      ascent: 0,
      descent: 0,
      lineHeight: measure.totalHeight || 0,
    },
  ];
}

export function sliceLines(
  lines: ParagraphMeasure['lines'],
  startIndex: number,
  availableHeight: number,
): { toLine: number; height: number } {
  let height = 0;
  let index = startIndex;

  while (index < lines.length) {
    const lineHeight = lines[index].lineHeight || 0;
    if (height > 0 && height + lineHeight > availableHeight) {
      break;
    }
    height += lineHeight;
    index += 1;
  }

  if (index === startIndex) {
    height = lines[startIndex].lineHeight || 0;
    index += 1;
  }

  return {
    toLine: index,
    height,
  };
}

export type { LinePmRange };

export const computeFragmentPmRange = (
  block: ParagraphBlock,
  lines: ParagraphMeasure['lines'],
  fromLine: number,
  toLine: number,
): LinePmRange => computeFragmentPmRangeUnified(block, lines, fromLine, toLine);

export const computeLinePmRange = (block: ParagraphBlock, line: Line): LinePmRange =>
  computeLinePmRangeUnified(block, line);

export const extractBlockPmRange = (block: { attrs?: Record<string, unknown> } | null | undefined): LinePmRange => {
  if (!block || !block.attrs) {
    return {};
  }
  const attrs = block.attrs as Record<string, unknown>;
  const start = typeof attrs.pmStart === 'number' ? attrs.pmStart : undefined;
  const end = typeof attrs.pmEnd === 'number' ? attrs.pmEnd : undefined;
  return {
    pmStart: start,
    pmEnd: end ?? (start != null ? start + 1 : undefined),
  };
};
