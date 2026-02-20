import type { FlowBlock, Line, Run, TabRun } from '@superdoc/contracts';
import { shouldApplyJustify, calculateJustifySpacing, SPACE_CHARS as SHARED_SPACE_CHARS } from '@superdoc/contracts';

/**
 * Shared text measurement utility for accurate character positioning.
 * Uses a stateful Canvas context to avoid repeated allocation.
 *
 * This module provides the single source of truth for converting between:
 * - ProseMirror positions and X coordinates
 * - X coordinates and character offsets
 *
 * Used by both:
 * - Click-to-position mapping (layout-bridge)
 * - Caret rendering (demo-app selection-overlay)
 */

// Stateful canvas for text measurement
let measurementCanvas: HTMLCanvasElement | null = null;
let measurementCtx: CanvasRenderingContext2D | null = null;

const TAB_CHAR_LENGTH = 1;

/**
 * Characters considered as spaces for justify alignment calculations.
 * Only includes regular space (U+0020) and non-breaking space (U+00A0).
 *
 * Rationale: These are the only space characters that participate in CSS word-spacing
 * behavior, which is what the painter uses for justify alignment. Other Unicode spaces
 * (em space, en space, thin space, etc.) are not affected by word-spacing and should
 * not contribute to justify distribution calculations.
 *
 * NOTE: Using shared constant from contracts to ensure consistency with painter.
 */
const SPACE_CHARS = SHARED_SPACE_CHARS;

const isTabRun = (run: Run): run is TabRun => run?.kind === 'tab';

const isWordChar = (char: string): boolean => {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === "'";
};

const capitalizeText = (text: string): string => {
  if (!text) return text;
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const prevChar = i > 0 ? text[i - 1] : '';
    const ch = text[i];
    result += isWordChar(ch) && !isWordChar(prevChar) ? ch.toUpperCase() : ch;
  }
  return result;
};

const applyTextTransform = (
  text: string,
  transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none' | undefined,
): string => {
  if (!text || !transform || transform === 'none') return text;
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return capitalizeText(text);
  return text;
};

/**
 * Get or create the measurement canvas context.
 * Lazy initialization to avoid creating canvas in non-browser environments.
 */
function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (measurementCtx) return measurementCtx;

  if (typeof document === 'undefined') {
    // Only warn in non-test environments - Canvas fallback is expected in tests
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[text-measurement] Canvas not available (non-browser environment)');
    }
    return null;
  }

  measurementCanvas = document.createElement('canvas');
  try {
    measurementCtx = measurementCanvas.getContext('2d');
  } catch {
    measurementCtx = null;
  }

  if (!measurementCtx && process.env.NODE_ENV !== 'test') {
    console.warn('[text-measurement] Failed to create 2D context');
  }

  return measurementCtx;
}

/**
 * Represents the justify alignment adjustment applied to a line.
 *
 * When text is justified, the layout engine distributes extra space (slack) evenly
 * across all space characters in the line. This type captures both the per-space
 * adjustment amount and the total number of spaces, which are used by text measurement
 * functions to accurately calculate character positions in justified text.
 *
 * @property extraPerSpace - Additional pixels to add after each space character (can be 0 for non-justified text)
 * @property totalSpaces - Total count of space characters in the line (used for validation and debugging)
 */
type JustifyAdjustment = {
  extraPerSpace: number;
  totalSpaces: number;
};

/**
 * Counts the number of space characters in a text string.
 *
 * Only counts spaces that participate in CSS word-spacing behavior (regular space
 * and non-breaking space). This is used for justify alignment calculations where
 * extra width needs to be distributed proportionally across spaces.
 *
 * @param text - The text string to analyze
 * @returns The count of space characters (regular space U+0020 and non-breaking space U+00A0)
 *
 * @example
 * ```typescript
 * countSpaces("Hello World");  // Returns: 1
 * countSpaces("A B C");        // Returns: 2
 * countSpaces("No-spaces");    // Returns: 0
 * ```
 */
const countSpaces = (text: string): number => {
  let spaces = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (SPACE_CHARS.has(text[i])) {
      spaces += 1;
    }
  }
  return spaces;
};

/**
 * Computes the per-space expansion applied when a line is justified.
 *
 * This function uses shared justify utilities to ensure consistency with the painter's
 * justify logic, which distributes slack (extra horizontal space) evenly across all
 * space characters using CSS word-spacing. The calculation is critical for accurate
 * text measurement in justified paragraphs.
 *
 * Algorithm:
 * 1. Use shouldApplyJustify() to determine if justify should be applied (including last-line detection)
 * 2. Count all space characters (or use pre-computed line.spaceCount)
 * 3. Use calculateJustifySpacing() to compute per-space adjustment
 * 4. Support negative slack for compressed lines (naturalWidth > availableWidth)
 *
 * Edge Cases:
 * - Non-justify alignment: Returns zero adjustment
 * - Last line of paragraph: Returns zero adjustment (unless paragraph ends with soft break)
 * - No spaces: Returns zero adjustment (prevents division by zero)
 * - Lines with explicit segment positioning: Returns zero adjustment
 * - Compressed lines: Returns negative adjustment (naturalWidth used for slack calculation)
 * - Empty runs array: Returns zero adjustment
 *
 * @param block - The paragraph block containing the line
 * @param line - The line to compute justify adjustment for
 * @param availableWidthOverride - The available width for content (fragment width minus paragraph indents).
 *   Must match what the painter uses to ensure consistent justify spacing. If not provided,
 *   falls back to line.maxWidth or line.width.
 * @param alignmentOverride - Optional alignment override (defaults to block.attrs.alignment)
 * @param isLastLineOfParagraph - Whether this is the last line of the paragraph.
 *   If not provided, auto-derived from block/line: `line.toRun >= block.runs.length - 1`.
 *   Auto-derivation ensures measurement matches rendering. Returns false for empty runs arrays.
 * @param paragraphEndsWithLineBreak - Whether the paragraph ends with a soft break (Shift+Enter).
 *   If not provided, auto-derived: `lastRun?.kind === 'lineBreak'`.
 *   Auto-derivation ensures measurement matches rendering. Returns false for empty runs arrays.
 * @param skipJustifyOverride - Explicit override to skip justify
 * @returns Object containing extraPerSpace (pixels to add after each space) and totalSpaces
 *
 * @example
 * ```typescript
 * // Line with 200px width in 250px available space, 5 spaces
 * const adj = getJustifyAdjustment(block, line, 250, undefined, false, false);
 * // Returns: { extraPerSpace: 10, totalSpaces: 5 }  (50px slack / 5 spaces)
 *
 * // Last line of paragraph (no soft break)
 * const adj = getJustifyAdjustment(block, line, 250, undefined, true, false);
 * // Returns: { extraPerSpace: 0, totalSpaces: 5 }  (last line not justified)
 * ```
 */
const getJustifyAdjustment = (
  block: FlowBlock,
  line: Line,
  availableWidthOverride?: number,
  alignmentOverride?: string,
  isLastLineOfParagraph?: boolean,
  paragraphEndsWithLineBreak?: boolean,
  skipJustifyOverride?: boolean,
): JustifyAdjustment => {
  if (block.kind !== 'paragraph') {
    return { extraPerSpace: 0, totalSpaces: 0 };
  }

  // Guard against empty runs array
  if (block.runs.length === 0) {
    return { extraPerSpace: 0, totalSpaces: 0 };
  }

  const alignment = alignmentOverride ?? block.attrs?.alignment;
  const hasExplicitPositioning = line.segments?.some((seg) => seg.x !== undefined) ?? false;

  // Derive last-line info from block/line when not explicitly provided.
  // This ensures measurement matches rendering even when callers don't pass these flags.
  const lastRunIndex = block.runs.length - 1;
  const lastRun = block.runs[lastRunIndex];
  const derivedIsLastLine = line.toRun >= lastRunIndex;
  const derivedEndsWithLineBreak = lastRun ? lastRun.kind === 'lineBreak' : false;
  // Determine if justify should be applied using shared logic
  const shouldJustify = shouldApplyJustify({
    alignment,
    hasExplicitPositioning,
    isLastLineOfParagraph: isLastLineOfParagraph ?? derivedIsLastLine,
    paragraphEndsWithLineBreak: paragraphEndsWithLineBreak ?? derivedEndsWithLineBreak,
    skipJustifyOverride,
  });

  if (!shouldJustify) {
    return { extraPerSpace: 0, totalSpaces: 0 };
  }

  // Use pre-computed spaceCount if available, otherwise count manually
  let totalSpaces = line.spaceCount ?? 0;
  if (totalSpaces === 0) {
    const runs = sliceRunsForLine(block, line);
    totalSpaces = runs.reduce((sum, run) => {
      if (
        isTabRun(run) ||
        'src' in run ||
        run.kind === 'lineBreak' ||
        run.kind === 'break' ||
        run.kind === 'fieldAnnotation'
      ) {
        return sum;
      }
      return sum + countSpaces(run.text ?? '');
    }, 0);
  }

  // Use the same available width as the painter: override > maxWidth > width
  const availableWidth = availableWidthOverride ?? line.maxWidth ?? line.width;

  // Use naturalWidth if available (for compressed lines), otherwise use width
  const lineWidth = line.naturalWidth ?? line.width;

  // Calculate justify spacing using shared utility
  const extraPerSpace = calculateJustifySpacing({
    lineWidth,
    availableWidth,
    spaceCount: totalSpaces,
    shouldJustify: true, // Already checked above
  });

  return {
    extraPerSpace,
    totalSpaces,
  };
};

/**
 * Generates a CSS font string from a run's formatting properties.
 *
 * @param run - The text or tab run to generate font string for
 * @returns CSS font string (e.g., "italic bold 16px Arial")
 */
export function getRunFontString(run: Run): string {
  // TabRun, ImageRun, LineBreakRun, BreakRun, and FieldAnnotationRun don't have full styling properties, use defaults
  if (
    run.kind === 'tab' ||
    run.kind === 'lineBreak' ||
    run.kind === 'break' ||
    run.kind === 'fieldAnnotation' ||
    'src' in run
  ) {
    return 'normal normal 16px Arial';
  }

  const style = run.italic ? 'italic' : 'normal';
  const weight = run.bold ? 'bold' : 'normal';
  const fontSize = run.fontSize ?? 16;
  const fontFamily = run.fontFamily ?? 'Arial';
  return `${style} ${weight} ${fontSize}px ${fontFamily}`;
}

/**
 * Extracts the subset of runs that appear in a specific line.
 * Handles partial runs that span multiple lines.
 *
 * @param block - The paragraph block containing the runs
 * @param line - The line to extract runs for
 * @returns Array of runs present in the line
 */
export function sliceRunsForLine(block: FlowBlock, line: Line): Run[] {
  const result: Run[] = [];
  if (block.kind !== 'paragraph') return result;

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const run = block.runs[runIndex];
    if (!run) continue;

    if (isTabRun(run)) {
      result.push(run);
      continue;
    }

    // FIXED: ImageRun handling - images are atomic units, no slicing needed
    if ('src' in run) {
      result.push(run);
      continue;
    }

    // LineBreakRun handling - line breaks are atomic units, no slicing needed
    if (run.kind === 'lineBreak') {
      result.push(run);
      continue;
    }

    // BreakRun handling - breaks are atomic units, no slicing needed
    if (run.kind === 'break') {
      result.push(run);
      continue;
    }

    // FieldAnnotationRun handling - field annotations are atomic units, no slicing needed
    if (run.kind === 'fieldAnnotation') {
      result.push(run);
      continue;
    }

    const text = run.text ?? '';
    const isFirstRun = runIndex === line.fromRun;
    const isLastRun = runIndex === line.toRun;

    if (isFirstRun || isLastRun) {
      const start = isFirstRun ? line.fromChar : 0;
      const end = isLastRun ? line.toChar : text.length;
      const slice = text.slice(start, end);
      const pmStart =
        run.pmStart != null ? run.pmStart + start : run.pmEnd != null ? run.pmEnd - (text.length - start) : undefined;
      const pmEnd =
        run.pmStart != null ? run.pmStart + end : run.pmEnd != null ? run.pmEnd - (text.length - end) : undefined;
      result.push({
        ...run,
        text: slice,
        pmStart,
        pmEnd,
      });
    } else {
      result.push(run);
    }
  }

  return result;
}

/**
 * Measure the X position for a specific character offset within a line.
 * Uses Canvas measureText for pixel-perfect accuracy.
 *
 * @param block - The paragraph block containing the line
 * @param line - The line to measure within
 * @param charOffset - Character offset from the start of the line (0-based)
 * @param availableWidthOverride - Optional override for available width
 * @param alignmentOverride - Optional override for text alignment (e.g., 'left' for list items
 *   which are always rendered left-aligned in the DOM regardless of paragraph alignment)
 * @returns The X coordinate (in pixels) from the start of the line
 */
export function measureCharacterX(
  block: FlowBlock,
  line: Line,
  charOffset: number,
  availableWidthOverride?: number,
  alignmentOverride?: string,
): number {
  const ctx = getMeasurementContext();
  const availableWidth =
    availableWidthOverride ??
    line.maxWidth ??
    // Fallback: if no maxWidth, approximate available width as line width (no slack)
    line.width;
  // Pass availableWidth to justify calculation to match painter's word-spacing
  const justify = getJustifyAdjustment(block, line, availableWidth, alignmentOverride);
  const alignment = alignmentOverride ?? (block.kind === 'paragraph' ? block.attrs?.alignment : undefined);
  // For justify alignment, the line is stretched to fill available width (slack distributed across spaces)
  // For center/right alignment, the line keeps its natural width and is positioned within the available space
  const renderedLineWidth = alignment === 'justify' && justify.extraPerSpace !== 0 ? availableWidth : line.width;
  const hasExplicitPositioning = line.segments?.some((seg) => seg.x !== undefined);
  const alignmentOffset =
    !hasExplicitPositioning && alignment === 'center'
      ? Math.max(0, (availableWidth - renderedLineWidth) / 2)
      : !hasExplicitPositioning && alignment === 'right'
        ? Math.max(0, availableWidth - renderedLineWidth)
        : 0;

  // Check if line has segment-based positioning (used for tab-aligned text)
  // When segments have explicit X positions, we must use segment-based calculation
  // to match the actual DOM positioning
  if (hasExplicitPositioning && line.segments && ctx) {
    return measureCharacterXSegmentBased(block, line, charOffset, ctx);
  }

  if (!ctx) {
    // Fallback to ratio-based calculation if Canvas unavailable
    const runs = sliceRunsForLine(block, line);
    const charsInLine = Math.max(
      1,
      runs.reduce((sum, run) => {
        if (isTabRun(run)) return sum + TAB_CHAR_LENGTH;
        if ('src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation')
          return sum;
        return sum + (run.text ?? '').length;
      }, 0),
    );
    return (charOffset / charsInLine) * renderedLineWidth;
  }

  const runs = sliceRunsForLine(block, line);
  let currentX = 0;
  let currentCharOffset = 0;
  let spaceTally = 0;

  for (const run of runs) {
    if (isTabRun(run)) {
      const runLength = TAB_CHAR_LENGTH;
      const tabWidth = run.width ?? 0;
      if (currentCharOffset + runLength >= charOffset) {
        const offsetInRun = charOffset - currentCharOffset;
        return currentX + (offsetInRun <= 0 ? 0 : tabWidth);
      }
      currentX += tabWidth;
      currentCharOffset += runLength;
      continue;
    }

    const text =
      'src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation'
        ? ''
        : (run.text ?? '');
    const runLength = text.length;
    // Only TextRun and TabRun have textTransform (via RunMarks)
    const transform =
      isTabRun(run) ||
      'src' in run ||
      run.kind === 'lineBreak' ||
      run.kind === 'break' ||
      run.kind === 'fieldAnnotation'
        ? undefined
        : run.textTransform;
    const displayText = applyTextTransform(text, transform);

    // If target character is within this run
    if (currentCharOffset + runLength >= charOffset) {
      const offsetInRun = charOffset - currentCharOffset;
      ctx.font = getRunFontString(run);

      // Measure text up to the target character
      const textUpToTarget = displayText.slice(0, offsetInRun);

      const measured = ctx.measureText(textUpToTarget);
      const spacingWidth = computeLetterSpacingWidth(run, offsetInRun, runLength);
      const spacesInPortion = justify.extraPerSpace !== 0 ? countSpaces(text.slice(0, offsetInRun)) : 0;
      return (
        alignmentOffset +
        currentX +
        measured.width +
        spacingWidth +
        justify.extraPerSpace * (spaceTally + spacesInPortion)
      );
    }

    // Measure entire run and advance
    ctx.font = getRunFontString(run);
    const measured = ctx.measureText(displayText);
    const runLetterSpacing = computeLetterSpacingWidth(run, runLength, runLength);
    const spacesInRun = justify.extraPerSpace !== 0 ? countSpaces(text) : 0;
    currentX += measured.width + runLetterSpacing + justify.extraPerSpace * spacesInRun;
    spaceTally += spacesInRun;

    currentCharOffset += runLength;
  }

  // If we're past the end, return the total width
  return alignmentOffset + currentX;
}

/**
 * Measure character X position using segment-based calculation.
 * This is used when lines have tab-aligned segments with explicit X positions.
 * Must match the DOM positioning used in segment-based rendering.
 *
 * @param block - The paragraph block containing runs
 * @param line - The line with segments
 * @param charOffset - Character offset from start of line
 * @param ctx - Canvas rendering context for text measurement
 * @returns X coordinate for the character
 */
function measureCharacterXSegmentBased(
  block: FlowBlock,
  line: Line,
  charOffset: number,
  ctx: CanvasRenderingContext2D,
): number {
  if (block.kind !== 'paragraph' || !line.segments) return 0;

  // Build a map of cumulative character offsets per run
  // to translate line-relative charOffset to run-relative offsets
  let lineCharCount = 0;

  for (const segment of line.segments) {
    const run = block.runs[segment.runIndex];
    if (!run) continue;

    const segmentChars = segment.toChar - segment.fromChar;

    // Check if target character is within this segment
    if (lineCharCount + segmentChars >= charOffset) {
      const offsetInSegment = charOffset - lineCharCount;

      // Get the base X position for this segment
      // If segment has explicit X (tab-aligned), use it
      // Otherwise, we'd need to calculate cumulative width up to this point
      let segmentBaseX = segment.x;

      if (segmentBaseX === undefined) {
        // Calculate cumulative X by measuring previous segments
        segmentBaseX = 0;
        for (const prevSeg of line.segments) {
          if (prevSeg === segment) break;
          const prevRun = block.runs[prevSeg.runIndex];
          if (!prevRun) continue;

          if (prevSeg.x !== undefined) {
            // If previous segment has explicit X, use its X + width as base
            segmentBaseX = prevSeg.x + (prevSeg.width ?? 0);
          } else {
            segmentBaseX += prevSeg.width ?? 0;
          }
        }
      }

      // Handle tab runs
      if (isTabRun(run)) {
        // Tab counts as 1 character, position is at segment start or end
        return segmentBaseX + (offsetInSegment > 0 ? (segment.width ?? 0) : 0);
      }

      // Handle ImageRun, LineBreakRun, BreakRun, and FieldAnnotationRun - these are atomic, use segment width
      if ('src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation') {
        return segmentBaseX + (offsetInSegment >= segmentChars ? (segment.width ?? 0) : 0);
      }

      // For text runs, measure up to the target character
      const text = run.text ?? '';
      // Only TextRun and TabRun have textTransform (via RunMarks)
      // At this point, we've already filtered out TabRun, ImageRun, etc., so run must be TextRun
      const transform = 'textTransform' in run ? run.textTransform : undefined;
      const displayText = applyTextTransform(text, transform);
      const displaySegmentText = displayText.slice(segment.fromChar, segment.toChar);
      const textUpToTarget = displaySegmentText.slice(0, offsetInSegment);

      ctx.font = getRunFontString(run);
      const measured = ctx.measureText(textUpToTarget);
      const spacingWidth = computeLetterSpacingWidth(run, offsetInSegment, segmentChars);

      return segmentBaseX + measured.width + spacingWidth;
    }

    lineCharCount += segmentChars;
  }

  // Past end of line, return total width
  return line.width;
}

/**
 * Convert a character offset within a line back to a ProseMirror position.
 *
 * This function is the inverse of finding a character offset from a PM position.
 * It accounts for PM position gaps that can occur between runs due to wrapper nodes
 * (e.g., inline formatting marks, link nodes) that don't correspond to visible characters.
 *
 * Algorithm:
 * 1. Iterate through runs in the line, tracking cumulative character offset
 * 2. For each run, determine its character length (accounting for tabs as 1 character)
 * 3. When the target charOffset falls within a run:
 *    - Calculate the offset within that run
 *    - Add to the run's pmStart to get the final PM position
 * 4. If charOffset exceeds all runs, return the last known PM position
 *
 * Edge Cases:
 * - **Character offset beyond line bounds**: Returns the last PM position in the line (clamped to end)
 * - **Negative character offset**: Clamped to 0, returns fallbackPmStart
 * - **Runs with missing PM data**: Falls back to fallbackPmStart + charOffset calculation
 * - **Non-paragraph blocks**: Returns fallbackPmStart + charOffset (simple arithmetic fallback)
 * - **Empty runs**: Skipped during iteration, don't contribute to character count
 * - **Tab runs**: Counted as 1 character regardless of visual width
 *
 * @param block - The paragraph block containing the line
 * @param line - The line to map within
 * @param charOffset - Character offset from start of line (0-based)
 * @param fallbackPmStart - PM position to use when run PM data is missing or invalid
 * @returns ProseMirror position corresponding to the character offset
 *
 * @example
 * ```typescript
 * // Line with runs: "Hello" (PM 0-5) + "World" (PM 7-12), gap at 5-7
 * const block = { kind: 'paragraph', runs: [...] };
 * const line = { fromRun: 0, toRun: 1, ... };
 *
 * // Character 3 maps to PM position 3 (within "Hello")
 * charOffsetToPm(block, line, 3, 0); // returns 3
 *
 * // Character 7 maps to PM position 9 (within "World", accounting for gap)
 * charOffsetToPm(block, line, 7, 0); // returns 9
 * ```
 */
export function charOffsetToPm(block: FlowBlock, line: Line, charOffset: number, fallbackPmStart: number): number {
  // Validate inputs
  if (!Number.isFinite(charOffset) || !Number.isFinite(fallbackPmStart)) {
    console.warn('[charOffsetToPm] Invalid input:', { charOffset, fallbackPmStart });
    return fallbackPmStart;
  }

  // Clamp charOffset to non-negative
  const safeCharOffset = Math.max(0, charOffset);

  if (block.kind !== 'paragraph') {
    return fallbackPmStart + safeCharOffset;
  }

  const runs = sliceRunsForLine(block, line);
  let cursor = 0;
  let lastPm = fallbackPmStart;

  for (const run of runs) {
    const isTab = isTabRun(run);
    const text =
      'src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation'
        ? ''
        : (run.text ?? '');
    const runLength = isTab ? TAB_CHAR_LENGTH : text.length;

    const runPmStart = typeof run.pmStart === 'number' ? run.pmStart : null;
    const runPmEnd = typeof run.pmEnd === 'number' ? run.pmEnd : runPmStart != null ? runPmStart + runLength : null;

    if (runPmStart != null) {
      lastPm = runPmStart;
    }

    if (safeCharOffset <= cursor + runLength) {
      const offsetInRun = Math.max(0, safeCharOffset - cursor);
      return runPmStart != null ? runPmStart + Math.min(offsetInRun, runLength) : fallbackPmStart + safeCharOffset;
    }

    if (runPmEnd != null) {
      lastPm = runPmEnd;
    }

    cursor += runLength;
  }

  return lastPm;
}

/**
 * Find the character offset and PM position at a given X coordinate within a line.
 * This is the inverse of measureCharacterX.
 *
 * @param block - The paragraph block containing the line
 * @param line - The line to search within
 * @param x - The X coordinate (in pixels) from the start of the line
 * @param pmStart - The ProseMirror position at the start of the line
 * @param availableWidthOverride - Optional override for available width
 * @param alignmentOverride - Optional override for text alignment (e.g., 'left' for list items)
 * @returns Object with charOffset (0-based from line start) and pmPosition
 */
export function findCharacterAtX(
  block: FlowBlock,
  line: Line,
  x: number,
  pmStart: number,
  availableWidthOverride?: number,
  alignmentOverride?: string,
): { charOffset: number; pmPosition: number } {
  const ctx = getMeasurementContext();
  const availableWidth =
    availableWidthOverride ??
    line.maxWidth ??
    // Fallback: approximate with line width when no maxWidth is present
    line.width;
  // Pass availableWidth to justify calculation to match painter's word-spacing
  const justify = getJustifyAdjustment(block, line, availableWidth, alignmentOverride);
  const alignment = alignmentOverride ?? (block.kind === 'paragraph' ? block.attrs?.alignment : undefined);
  // For justify alignment, the line is stretched to fill available width (slack distributed across spaces)
  // For center/right alignment, the line keeps its natural width and is positioned within the available space
  const renderedLineWidth =
    alignment === 'justify' ? line.width + Math.max(0, availableWidth - line.width) : line.width;
  const hasExplicitPositioning = line.segments?.some((seg) => seg.x !== undefined);
  const alignmentOffset =
    !hasExplicitPositioning && alignment === 'center'
      ? Math.max(0, (availableWidth - renderedLineWidth) / 2)
      : !hasExplicitPositioning && alignment === 'right'
        ? Math.max(0, availableWidth - renderedLineWidth)
        : 0;

  if (!ctx) {
    // Fallback to ratio-based calculation
    const runs = sliceRunsForLine(block, line);
    const charsInLine = Math.max(
      1,
      runs.reduce((sum, run) => {
        if (isTabRun(run)) return sum + TAB_CHAR_LENGTH;
        if ('src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation')
          return sum;
        return sum + (run.text ?? '').length;
      }, 0),
    );
    const ratio = Math.max(0, Math.min(1, (x - alignmentOffset) / renderedLineWidth));
    const charOffset = Math.round(ratio * charsInLine);
    const pmPosition = charOffsetToPm(block, line, charOffset, pmStart);
    return {
      charOffset,
      pmPosition,
    };
  }

  const runs = sliceRunsForLine(block, line);
  const safeX = Math.max(0, Math.min(renderedLineWidth, x - alignmentOffset));

  let currentX = 0;
  let currentCharOffset = 0;
  let spaceTally = 0;

  for (const run of runs) {
    if (isTabRun(run)) {
      const tabWidth = run.width ?? 0;
      const startX = currentX;
      const endX = currentX + tabWidth;
      if (safeX <= endX) {
        const midpoint = startX + tabWidth / 2;
        const offsetInRun = safeX < midpoint ? 0 : TAB_CHAR_LENGTH;
        const charOffset = currentCharOffset + offsetInRun;
        const pmPosition = charOffsetToPm(block, line, charOffset, pmStart);
        return {
          charOffset,
          pmPosition,
        };
      }
      currentX = endX;
      currentCharOffset += TAB_CHAR_LENGTH;
      continue;
    }

    const text =
      'src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation'
        ? ''
        : (run.text ?? '');
    const runLength = text.length;
    // Only TextRun and TabRun have textTransform (via RunMarks)
    const transform =
      isTabRun(run) ||
      'src' in run ||
      run.kind === 'lineBreak' ||
      run.kind === 'break' ||
      run.kind === 'fieldAnnotation'
        ? undefined
        : run.textTransform;
    const displayText = applyTextTransform(text, transform);

    if (runLength === 0) continue;

    ctx.font = getRunFontString(run);

    // Measure each character in the run to find the closest boundary
    for (let i = 0; i <= runLength; i++) {
      const textUpToChar = displayText.slice(0, i);
      const measured = ctx.measureText(textUpToChar);
      const spacesInPortion = justify.extraPerSpace > 0 ? countSpaces(text.slice(0, i)) : 0;
      const charX =
        currentX +
        measured.width +
        computeLetterSpacingWidth(run, i, runLength) +
        justify.extraPerSpace * (spaceTally + spacesInPortion);

      // If we've passed the target X, return the previous character
      // or this one, whichever is closer
      if (charX >= safeX) {
        if (i === 0) {
          // First character, return this position
          const pmPosition = charOffsetToPm(block, line, currentCharOffset, pmStart);
          return {
            charOffset: currentCharOffset,
            pmPosition,
          };
        }

        // Check which boundary is closer
        const prevText = displayText.slice(0, i - 1);
        const prevMeasured = ctx.measureText(prevText);
        const prevX = currentX + prevMeasured.width + computeLetterSpacingWidth(run, i - 1, runLength);

        const distToPrev = Math.abs(safeX - prevX);
        const distToCurrent = Math.abs(safeX - charX);

        const charOffset = distToPrev < distToCurrent ? currentCharOffset + i - 1 : currentCharOffset + i;

        const pmPosition = charOffsetToPm(block, line, charOffset, pmStart);
        return {
          charOffset,
          pmPosition,
        };
      }
    }

    // Advance past this run
    const measured = ctx.measureText(displayText);
    const runLetterSpacing = computeLetterSpacingWidth(run, runLength, runLength);
    const spacesInRun = justify.extraPerSpace > 0 ? countSpaces(text) : 0;
    currentX += measured.width + runLetterSpacing + justify.extraPerSpace * spacesInRun;
    spaceTally += spacesInRun;
    currentCharOffset += runLength;
  }

  // If we're past all characters, return the end of the line
  const pmPosition = charOffsetToPm(block, line, currentCharOffset, pmStart);
  return {
    charOffset: currentCharOffset,
    pmPosition,
  };
}

const computeLetterSpacingWidth = (run: Run, precedingChars: number, runLength: number): number => {
  // Only text runs support letter spacing (older data may omit kind on text runs).
  if (
    isTabRun(run) ||
    'src' in run ||
    run.kind === 'fieldAnnotation' ||
    !('letterSpacing' in run) ||
    !run.letterSpacing
  ) {
    return 0;
  }
  const maxGaps = Math.max(runLength - 1, 0);
  if (maxGaps === 0) {
    return 0;
  }
  const clamped = Math.min(Math.max(precedingChars, 0), maxGaps);
  return clamped * run.letterSpacing;
};
