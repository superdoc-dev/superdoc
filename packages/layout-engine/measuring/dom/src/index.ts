/**
 * DOM-based text measurer for layout engine
 *
 * Uses HTML5 Canvas API to measure text runs and calculate line breaks.
 *
 * Responsibilities:
 * - Measure text width using actual font rendering
 * - Perform greedy line breaking based on maxWidth constraint
 * - Calculate typography metrics (ascent, descent, lineHeight)
 * - Return Measure with positioned line boundaries
 *
 * Typography Approximations (v0.1.0):
 * - ascent ≈ fontSize * 0.8 (baseline to top)
 * - descent ≈ fontSize * 0.2 (baseline to bottom)
 * - lineHeight = fontSize * 1.15 (Word 2007+ "single" line spacing)
 * - empty paragraphs use fontSize as the base line height
 *
 * These are documented heuristics; we can swap in precise font metrics later
 * if needed via libraries like opentype.js.
 *
 * Line Breaking Strategy:
 * - Greedy algorithm: accumulate words until exceeding maxWidth
 * - Breaks on word boundaries (spaces)
 * - Single words wider than maxWidth are kept on their own line
 *
 * Future improvements:
 * - Hyphenation support
 * - Justification and word spacing
 * - Precise font metrics from font files
 * - Kerning and ligature support
 */

import {
  Engines,
  OOXML_PCT_DIVISOR,
  type FlowBlock,
  type ParagraphBlock,
  type ParagraphSpacing,
  type ParagraphIndent,
  type ImageBlock,
  type ListBlock,
  type Measure,
  type Line,
  type ParagraphMeasure,
  type ImageMeasure,
  type TableBlock,
  type TableMeasure,
  type TableRowMeasure,
  type TableCellMeasure,
  type ListMeasure,
  type Run,
  type TextRun,
  type TabRun,
  type ImageRun,
  type LineBreakRun,
  type FieldAnnotationRun,
  type TabStop,
  type DrawingBlock,
  type DrawingMeasure,
  type DrawingGeometry,
  type DropCapDescriptor,
  type TableWidthAttr,
} from '@superdoc/contracts';
import type { WordParagraphLayoutOutput } from '@superdoc/word-layout';
import {
  LIST_MARKER_GAP,
  MIN_MARKER_GUTTER,
  DEFAULT_LIST_INDENT_BASE_PX as DEFAULT_LIST_INDENT_BASE,
  DEFAULT_LIST_INDENT_STEP_PX as DEFAULT_LIST_INDENT_STEP,
  DEFAULT_LIST_HANGING_PX as DEFAULT_LIST_HANGING,
  SPACE_SUFFIX_GAP_PX,
} from '@superdoc/common/layout-constants';
import { resolveListTextStartPx, type MinimalMarker } from '@superdoc/common/list-marker-utils';
import { calculateRotatedBounds, normalizeRotation } from '@superdoc/geometry-utils';
import { toCssFontFamily } from '@superdoc/font-utils';
export { installNodeCanvasPolyfill } from './setup.js';
import { clearMeasurementCache, getMeasuredTextWidth, setCacheSize } from './measurementCache.js';
import { getFontMetrics, clearFontMetricsCache, type FontInfo } from './fontMetricsCache.js';

export { clearFontMetricsCache };

const { computeTabStops } = Engines;

type MeasurementMode = 'browser' | 'deterministic';

type MeasurementConfig = {
  mode: MeasurementMode;
  fonts: {
    deterministicFamily: string;
    fallbackStack: string[];
  };
  cacheSize: number;
};

const measurementConfig: MeasurementConfig = {
  mode: 'browser',
  fonts: {
    deterministicFamily: 'Noto Sans',
    fallbackStack: ['Noto Sans', 'Arial', 'sans-serif'],
  },
  cacheSize: 5000,
};

export function configureMeasurement(options: Partial<MeasurementConfig>): void {
  if (options.mode) {
    measurementConfig.mode = options.mode;
  }
  if (options.fonts) {
    measurementConfig.fonts = {
      ...measurementConfig.fonts,
      ...options.fonts,
    };
  }
  if (typeof options.cacheSize === 'number' && Number.isFinite(options.cacheSize) && options.cacheSize > 0) {
    measurementConfig.cacheSize = options.cacheSize;
    setCacheSize(options.cacheSize);
  }
}

export { clearMeasurementCache };

/**
 * Future: Font-specific calibration factors could be added here if Canvas measurements
 * consistently diverge from MS Word after all precision fixes (bounding box, fractional pt→px, etc.)
 * are applied. Currently not needed.
 */

/**
 * Global canvas context cache for text measurement
 * Reused across calls to avoid repeated canvas creation
 */
let canvasContext: CanvasRenderingContext2D | null = null;

type MeasureConstraints = {
  maxWidth: number;
  maxHeight?: number;
};

// List constants centralized in @superdoc/common/layout-constants

// Tab constants (OOXML alignment: twips → pixels)
const DEFAULT_TAB_INTERVAL_TWIPS = 720; // 0.5 inch in twips
const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96; // Standard CSS/DOM DPI
const TWIPS_PER_PX = TWIPS_PER_INCH / PX_PER_INCH; // 15 twips per pixel
const _PX_PER_PT = 96 / 72; // Reserved for future pt↔px conversions
const twipsToPx = (twips: number): number => twips / TWIPS_PER_PX;
const pxToTwips = (px: number): number => Math.round(px * TWIPS_PER_PX);

const DEFAULT_TAB_INTERVAL_PX = twipsToPx(DEFAULT_TAB_INTERVAL_TWIPS);
const TAB_EPSILON = 0.1;
const DEFAULT_DECIMAL_SEPARATOR = '.';
const ALLOWED_TAB_VALS = new Set<TabStop['val']>(['start', 'center', 'end', 'decimal', 'bar', 'clear']);

// Field annotation pill styling constants
const FIELD_ANNOTATION_PILL_PADDING = 8; // Border (2px each side) + padding (2px each side)
const FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER = 1.2; // Line height multiplier for pill height
const FIELD_ANNOTATION_VERTICAL_PADDING = 6; // Vertical padding/border for pill height
const DEFAULT_FIELD_ANNOTATION_FONT_SIZE = 16; // Default font size for field annotations
const DEFAULT_PARAGRAPH_FONT_SIZE = 12;
const DEFAULT_PARAGRAPH_FONT_FAMILY = 'Arial';

const isValidFontSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizeFontSize = (value: unknown, fallback = DEFAULT_PARAGRAPH_FONT_SIZE): number => {
  if (isValidFontSize(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (isValidFontSize(parsed)) return parsed;
  }
  return fallback;
};

const normalizeFontFamily = (value: unknown, fallback = DEFAULT_PARAGRAPH_FONT_FAMILY): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

/**
 * Tab stop in pixel coordinates for measurement.
 * Converted from OOXML twips at measurement boundary.
 */
type TabStopPx = {
  pos: number; // px
  val: TabStop['val'];
  leader?: TabStop['leader'];
};

// Unused type - may be needed for future decimal tab implementation
// type _PendingDecimalStop = {
//   target: number;
//   consumed: number;
// };

const roundValue = (value: number): number =>
  measurementConfig.mode === 'deterministic' ? Math.round(value * 10) / 10 : value;

// Utility functions for future unit conversion needs
// function _ptToPx(pt: number): number {
//   return pt * PX_PER_PT;
// }

// function _pxToPt(px: number): number {
//   return px / PX_PER_PT;
// }

/**
 * Get or create a canvas 2D context for text measurement.
 *
 * Lazily creates and caches a canvas 2D context for efficient text measurement.
 * The context is reused across multiple measurements to avoid the overhead of
 * repeated canvas creation.
 *
 * @returns A cached CanvasRenderingContext2D instance
 * @throws {Error} If canvas is not available (non-DOM environment without polyfill)
 * @throws {Error} If 2D context creation fails
 */
function getCanvasContext(): CanvasRenderingContext2D {
  if (!canvasContext) {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

    if (!canvas) {
      throw new Error('Canvas not available. Ensure this runs in a DOM environment (browser or jsdom).');
    }

    canvasContext = canvas.getContext('2d');
    if (!canvasContext) {
      throw new Error('Failed to get 2D context from canvas');
    }
  }

  return canvasContext;
}

/**
 * Build a CSS font string from Run styling properties
 *
 * @example
 * ```
 * buildFontString({ fontFamily: "Arial", fontSize: 16, bold: true, italic: true })
 * // Returns: { font: "italic bold 16px Arial", fontFamily: "Arial" }
 * ```
 */
function buildFontString(run: { fontFamily: string; fontSize: number; bold?: boolean; italic?: boolean }): {
  font: string;
  fontFamily: string;
} {
  const parts: string[] = [];

  if (run.italic) parts.push('italic');
  if (run.bold) parts.push('bold');
  parts.push(`${run.fontSize}px`);

  if (measurementConfig.mode === 'deterministic') {
    parts.push(
      measurementConfig.fonts.fallbackStack.length > 0
        ? measurementConfig.fonts.fallbackStack.join(', ')
        : measurementConfig.fonts.deterministicFamily,
    );
  } else {
    parts.push(run.fontFamily);
  }

  return {
    font: parts.join(' '),
    fontFamily: run.fontFamily,
  };
}

/**
 * Measure the width of a text string with specific styling, including letter spacing
 *
 * @param text - The text to measure
 * @param font - CSS font string (e.g., "16px Arial")
 * @param ctx - Canvas 2D context
 * @param fontFamily - Font family name for calibration
 * @param letterSpacing - Optional letter spacing in pixels
 * @returns Total width including letter spacing, calibration, and glyph overhang
 */
function measureText(
  text: string,
  font: string,
  ctx: CanvasRenderingContext2D,
  _fontFamily?: string,
  _letterSpacing?: number,
): number {
  // Deprecated direct measurement; kept for backward compatibility in case of direct calls.
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const advanceWidth = metrics.width;
  const paintedWidth = (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0);
  return Math.max(advanceWidth, paintedWidth);
}

/**
 * Calculate typography metrics for a given font size
 *
 * When fontInfo is provided, uses actual Canvas TextMetrics API to get precise
 * ascent/descent values from actualBoundingBoxAscent/Descent. This prevents
 * text clipping that occurs when using hardcoded approximations (0.8/0.2 ratios)
 * which don't account for font-specific glyph heights.
 *
 * Falls back to approximations (0.8/0.2) only when:
 * - fontInfo is not provided (empty paragraphs)
 * - Browser doesn't support actualBoundingBox* metrics (legacy browsers)
 */

/**
 * Word 2007+ default line spacing multiplier for "single" line spacing.
 *
 * Microsoft Word changed its line spacing algorithm in Word 2007 to use 1.15× font size
 * as the baseline for "single" line spacing, rather than just using ascent + descent.
 * This provides more breathing room and matches the industry standard for readability.
 *
 * For example, 12pt (16px) font: 16 × 1.15 = 18.4px line height.
 *
 * Reference: Word 2007+ line spacing behavior
 */
const WORD_SINGLE_LINE_SPACING_MULTIPLIER = 1.15;

/**
 * Calculate typography metrics for a given font size.
 *
 * This function computes the ascent, descent, and line height values needed for text layout.
 *
 * **Ascent/Descent Calculation:**
 * When fontInfo is provided, uses actual Canvas TextMetrics API to get precise
 * ascent/descent values from actualBoundingBoxAscent/Descent. This prevents
 * text clipping that occurs when using hardcoded approximations (0.8/0.2 ratios)
 * which don't account for font-specific glyph heights.
 *
 * Falls back to approximations (0.8/0.2) only when:
 * - fontInfo is not provided (empty paragraphs)
 * - Browser doesn't support actualBoundingBox* metrics (legacy browsers)
 *
 * **Line Height Calculation:**
 * Uses Word 2007+'s default "single" line spacing of fontSize × 1.15 as the base.
 * This base is then modified by paragraph spacing rules (lineRule: auto/exact/atLeast).
 * A minimum line height clamp is intentionally NOT enforced to match Word's behavior
 * for small font sizes and empty paragraphs.
 *
 * The 1.15 multiplier provides consistent spacing that matches Word's behavior and
 * accounts for the line gap that Canvas TextMetrics doesn't expose directly.
 *
 * @param fontSize - The font size in pixels
 * @param spacing - Optional paragraph spacing configuration (lineRule, line value)
 * @param fontInfo - Optional font information for precise Canvas-based measurements
 * @returns Object containing ascent, descent, and lineHeight in pixels
 *
 * @example
 * // Basic usage with 16px font
 * const metrics = calculateTypographyMetrics(16);
 * // Returns: { ascent: ~12.8, descent: ~3.2, lineHeight: 18.4 }
 *
 * @example
 * // With 1.5 line spacing multiplier
 * const metrics = calculateTypographyMetrics(16, { line: 1.5, lineRule: 'auto' });
 * // Returns: { ascent: ~12.8, descent: ~3.2, lineHeight: 27.6 } // 16 × 1.15 × 1.5
 *
 * @example
 * // With exact line height override
 * const metrics = calculateTypographyMetrics(16, { line: 24, lineRule: 'exact' });
 * // Returns: { ascent: ~12.8, descent: ~3.2, lineHeight: 24 }
 */
function calculateTypographyMetrics(
  fontSize: number,
  spacing?: ParagraphSpacing,
  fontInfo?: FontInfo,
): {
  ascent: number;
  descent: number;
  lineHeight: number;
} {
  const resolvedFontSize = normalizeFontSize(fontSize);
  let ascent: number;
  let descent: number;

  if (
    fontInfo &&
    isValidFontSize(fontInfo.fontSize) &&
    typeof fontInfo.fontFamily === 'string' &&
    fontInfo.fontFamily.trim().length > 0
  ) {
    // Use actual font metrics from Canvas API for accurate measurements
    const ctx = getCanvasContext();
    const metrics = getFontMetrics(ctx, fontInfo, measurementConfig.mode, measurementConfig.fonts);
    ascent = roundValue(metrics.ascent);
    descent = roundValue(metrics.descent);
  } else {
    // Fallback approximations for empty paragraphs or missing font info
    ascent = roundValue(resolvedFontSize * 0.8);
    descent = roundValue(resolvedFontSize * 0.2);
  }

  const lineHeight = resolveLineHeight(spacing, fontSize, ascent + descent);

  return {
    ascent,
    descent,
    lineHeight,
  };
}

/**
 * Calculates typography metrics for empty paragraphs.
 *
 * Empty paragraphs in Word use the font size as the base line height rather than
 * the standard 1.15x multiplier used for paragraphs with content. This matches
 * Word's behavior where empty paragraphs appear shorter than their populated counterparts.
 *
 * @param fontSize - The font size in pixels
 * @param spacing - Optional paragraph spacing configuration (may override line height)
 * @param fontInfo - Optional font information for precise metric calculation
 * @returns Object containing ascent, descent, and lineHeight in pixels
 *
 * @example
 * ```typescript
 * // Empty paragraph with 12pt font
 * calculateEmptyParagraphMetrics(16); // { ascent: 12.8, descent: 3.2, lineHeight: 16 }
 *
 * // Compare to regular text which would use 16 * 1.15 = 18.4 for lineHeight
 * ```
 */
function calculateEmptyParagraphMetrics(
  fontSize: number,
  spacing?: ParagraphSpacing,
  fontInfo?: FontInfo,
): {
  ascent: number;
  descent: number;
  lineHeight: number;
} {
  const resolvedFontSize = normalizeFontSize(fontSize);
  let ascent: number;
  let descent: number;

  if (
    fontInfo &&
    isValidFontSize(fontInfo.fontSize) &&
    typeof fontInfo.fontFamily === 'string' &&
    fontInfo.fontFamily.trim().length > 0
  ) {
    const ctx = getCanvasContext();
    const metrics = getFontMetrics(ctx, fontInfo, measurementConfig.mode, measurementConfig.fonts);
    ascent = roundValue(metrics.ascent);
    descent = roundValue(metrics.descent);
  } else {
    ascent = roundValue(resolvedFontSize * 0.8);
    descent = roundValue(resolvedFontSize * 0.2);
  }

  // Word treats empty paragraphs as a single font-sized line unless line spacing is explicitly set.
  const maxLineHeight = Math.max(resolvedFontSize, ascent + descent);
  const lineHeight = roundValue(resolveLineHeight(spacing, resolvedFontSize, maxLineHeight));

  return {
    ascent,
    descent,
    lineHeight,
  };
}

/**
 * Extract FontInfo from a TextRun for typography metrics calculation.
 */
function getFontInfoFromRun(run: TextRun): FontInfo {
  return {
    fontFamily: normalizeFontFamily(run.fontFamily),
    fontSize: normalizeFontSize(run.fontSize),
    bold: run.bold,
    italic: run.italic,
  };
}

/**
 * Update maxFontInfo when a new run has a larger font size.
 * Returns the updated FontInfo if this run has the max font size, otherwise returns the existing info.
 */
function updateMaxFontInfo(
  currentMaxSize: number,
  currentMaxInfo: FontInfo | undefined,
  newRun: TextRun,
): FontInfo | undefined {
  if (newRun.fontSize >= currentMaxSize) {
    return getFontInfoFromRun(newRun);
  }
  return currentMaxInfo;
}

/**
 * Type guard to check if a run is a text run (kind is optional and defaults to 'text').
 */
function isTextRun(run: Run): run is TextRun {
  return run.kind === 'text' || run.kind === undefined;
}

/**
 * Type guard to check if a run is a tab run
 */
function isTabRun(run: Run): run is TabRun {
  return run.kind === 'tab';
}

/**
 * Type guard to check if a run is an image run
 */
function isImageRun(run: Run): run is ImageRun {
  return run.kind === 'image';
}

/**
 * Type guard to check if a run is an explicit line break run
 */
function isLineBreakRun(run: Run): run is LineBreakRun {
  return run.kind === 'lineBreak';
}

/**
 * Type guard to check if a run is an empty text run.
 *
 * An empty text run is a text run (no kind or kind === 'text') with an empty string.
 * This is used to identify empty paragraph placeholders that need special handling
 * for line height calculations.
 *
 * @param run - The run to check
 * @returns True if the run is a text run with empty text
 */
const isEmptyTextRun = (run: Run): run is TextRun => {
  if (run.kind && run.kind !== 'text') return false;
  return typeof (run as TextRun).text === 'string' && (run as TextRun).text.length === 0;
};

/**
 * Type guard to check if a run is a field annotation run
 */
function isFieldAnnotationRun(run: Run): run is FieldAnnotationRun {
  return run.kind === 'fieldAnnotation';
}

const normalizeRunsForMeasurement = (runs: Run[], fallbackFontSize: number, fallbackFontFamily: string): Run[] =>
  runs.map((run) => {
    if (run.kind && run.kind !== 'text') return run;
    if (!('text' in run)) return run;
    const textRun = run as TextRun;
    const fontSize = normalizeFontSize(textRun.fontSize, fallbackFontSize);
    const fontFamily = normalizeFontFamily(textRun.fontFamily, fallbackFontFamily);
    if (fontSize === textRun.fontSize && fontFamily === textRun.fontFamily) return run;
    return { ...textRun, fontSize, fontFamily };
  });

/**
 * Information about a single run in a tab alignment group.
 * Used for positioning content after right/center/decimal aligned tabs.
 */
type TabAlignmentGroupRun = {
  runIndex: number;
  width: number;
  /** For text runs, the full text content */
  text?: string;
  /** For decimal alignment, width of text before the decimal separator */
  beforeDecimalWidth?: number;
};

/**
 * Result of measuring content following a tab stop for alignment purposes.
 */
type TabAlignmentGroupMeasure = {
  /** Total width of all content in the group */
  totalWidth: number;
  /** Individual run measurements */
  runs: TabAlignmentGroupRun[];
  /** Index of the last run in the group (exclusive - next run to process after group) */
  endRunIndex: number;
  /** For decimal alignment, the width before the decimal point (from first run containing decimal) */
  beforeDecimalWidth?: number;
};

/**
 * Measures all content following a tab stop until the next tab or end of paragraph.
 *
 * This function implements "look-ahead" measurement for non-start tab alignments (end, center, decimal).
 * Microsoft Word treats all content from a tab to the next tab/EOL as a single unit for alignment:
 * - End (right) tabs: position the group so its right edge aligns at the tab stop
 * - Center tabs: position the group so its center aligns at the tab stop
 * - Decimal tabs: position the group so the decimal point aligns at the tab stop
 *
 * @param startRunIndex - Index of the first run after the tab (where content begins)
 * @param runs - Array of all runs in the paragraph
 * @param ctx - Canvas 2D context for text measurement
 * @param decimalSeparator - Character used as decimal point (for decimal tab alignment)
 * @returns Measurement info including total width and per-run widths
 */
function measureTabAlignmentGroup(
  startRunIndex: number,
  runs: Run[],
  ctx: CanvasRenderingContext2D,
  decimalSeparator: string = '.',
): TabAlignmentGroupMeasure {
  const result: TabAlignmentGroupMeasure = {
    totalWidth: 0,
    runs: [],
    endRunIndex: runs.length,
  };

  let foundDecimal = false;

  for (let i = startRunIndex; i < runs.length; i++) {
    const run = runs[i];

    // Stop at the next tab - it marks the end of this alignment group
    if (isTabRun(run)) {
      result.endRunIndex = i;
      break;
    }

    // Stop at line breaks - they end the alignment group
    if (isLineBreakRun(run) || (run.kind === 'break' && (run as { breakType?: string }).breakType === 'line')) {
      result.endRunIndex = i;
      break;
    }

    // Measure text runs
    if (run.kind === 'text' || run.kind === undefined) {
      const textRun = run as TextRun;
      const text = textRun.text || '';

      if (text.length > 0) {
        const { font } = buildFontString(textRun);
        const width = measureRunWidth(text, font, ctx, textRun, 0);

        // For decimal alignment, find the decimal position
        let beforeDecimalWidth: number | undefined;
        if (!foundDecimal) {
          const decimalIdx = text.indexOf(decimalSeparator);
          if (decimalIdx >= 0) {
            foundDecimal = true;
            const beforeText = text.slice(0, decimalIdx);
            beforeDecimalWidth = beforeText.length > 0 ? measureRunWidth(beforeText, font, ctx, textRun, 0) : 0;
            // Store the cumulative width before decimal (including previous runs)
            result.beforeDecimalWidth = result.totalWidth + beforeDecimalWidth;
          }
        }

        result.runs.push({
          runIndex: i,
          width,
          text,
          beforeDecimalWidth,
        });
        result.totalWidth += width;
      } else {
        // Empty text run - still track it but with zero width
        result.runs.push({ runIndex: i, width: 0, text: '' });
      }
      continue;
    }

    // Measure image runs
    if (isImageRun(run)) {
      const leftSpace = run.distLeft ?? 0;
      const rightSpace = run.distRight ?? 0;
      const imageWidth = run.width + leftSpace + rightSpace;

      result.runs.push({ runIndex: i, width: imageWidth });
      result.totalWidth += imageWidth;
      continue;
    }

    // Measure field annotation runs
    if (isFieldAnnotationRun(run)) {
      const fontSize = (run as { fontSize?: number }).fontSize ?? DEFAULT_FIELD_ANNOTATION_FONT_SIZE;
      const { font } = buildFontString({
        fontFamily: (run as { fontFamily?: string }).fontFamily ?? 'Arial',
        fontSize,
        bold: (run as { bold?: boolean }).bold,
        italic: (run as { italic?: boolean }).italic,
      });
      const textWidth = run.displayLabel ? measureRunWidth(run.displayLabel, font, ctx, run, 0) : 0;
      const pillWidth = textWidth + FIELD_ANNOTATION_PILL_PADDING;

      result.runs.push({ runIndex: i, width: pillWidth });
      result.totalWidth += pillWidth;
      continue;
    }

    // For other run types (break types we didn't catch, etc.), include with zero width
    // but they likely shouldn't appear in the middle of alignment groups
    result.runs.push({ runIndex: i, width: 0 });
  }

  return result;
}

/**
 * Measure a single FlowBlock and calculate line breaks.
 *
 * Performs greedy line breaking: accumulates text width until exceeding maxWidth,
 * then starts a new line. Breaks on word boundaries when possible.
 *
 * @param block - The FlowBlock to measure (contains runs with text and styling)
 * @param maxWidth - Maximum width for each line in pixels
 * @returns Measure with lines array and total height
 *
 * @example
 * ```typescript
 * const block: FlowBlock = {
 *   id: "0-paragraph",
 *   runs: [
 *     { text: "Hello world", fontFamily: "Arial", fontSize: 16 }
 *   ],
 *   attrs: {}
 * };
 *
 * const measure = await measureBlock(block, 200);
 * // Result: { lines: [...], totalHeight: 19.2 }
 * ```
 */
export async function measureBlock(block: FlowBlock, constraints: number | MeasureConstraints): Promise<Measure> {
  const normalized = normalizeConstraints(constraints);

  if (block.kind === 'drawing') {
    return measureDrawingBlock(block as DrawingBlock, normalized);
  }

  if (block.kind === 'image') {
    return measureImageBlock(block, normalized);
  }

  if (block.kind === 'list') {
    return measureListBlock(block, normalized);
  }

  if (block.kind === 'table') {
    return measureTableBlock(block, normalized);
  }

  // Break blocks (sectionBreak, pageBreak, columnBreak) are pass-through measures
  // with no dimensions - they only signal layout control flow
  if (block.kind === 'sectionBreak') {
    return { kind: 'sectionBreak' };
  }
  if (block.kind === 'pageBreak') {
    return { kind: 'pageBreak' };
  }
  if (block.kind === 'columnBreak') {
    return { kind: 'columnBreak' };
  }

  // Paragraph/default
  return measureParagraphBlock(block as ParagraphBlock, normalized.maxWidth);
}

async function measureParagraphBlock(block: ParagraphBlock, maxWidth: number): Promise<ParagraphMeasure> {
  const ctx = getCanvasContext();
  const wordLayout: WordParagraphLayoutOutput | undefined = block.attrs?.wordLayout as
    | WordParagraphLayoutOutput
    | undefined;

  // Compute fallback font size from the first text run BEFORE marker measurement.
  // This ensures the marker uses the paragraph's actual font context when its own fontSize is missing.
  const firstTextRunWithSize = block.runs.find(
    (run): run is TextRun => isTextRun(run) && 'fontSize' in run && run.fontSize != null,
  );
  const fallbackFontSize = normalizeFontSize(firstTextRunWithSize?.fontSize, DEFAULT_PARAGRAPH_FONT_SIZE);
  const firstTextRunWithFont = block.runs.find(
    (run): run is TextRun => isTextRun(run) && typeof run.fontFamily === 'string' && run.fontFamily.trim().length > 0,
  );
  const fallbackFontFamily = firstTextRunWithFont?.fontFamily ?? DEFAULT_PARAGRAPH_FONT_FAMILY;
  const normalizedRuns = normalizeRunsForMeasurement(block.runs as Run[], fallbackFontSize, fallbackFontFamily);

  const markerInfo: ParagraphMeasure['marker'] | undefined = wordLayout?.marker
    ? (() => {
        const markerRun = {
          fontFamily: toCssFontFamily(wordLayout.marker.run.fontFamily) ?? wordLayout.marker.run.fontFamily,
          fontSize: wordLayout.marker.run.fontSize ?? fallbackFontSize,
          bold: wordLayout.marker.run.bold,
          italic: wordLayout.marker.run.italic,
        };
        const { font: markerFont } = buildFontString(markerRun);
        const markerText = wordLayout.marker.markerText ?? '';
        const glyphWidth = markerText ? measureText(markerText, markerFont, ctx) : 0;
        const gutter =
          typeof wordLayout.marker.gutterWidthPx === 'number' &&
          isFinite(wordLayout.marker.gutterWidthPx) &&
          wordLayout.marker.gutterWidthPx >= 0
            ? wordLayout.marker.gutterWidthPx
            : LIST_MARKER_GAP;

        // Marker box should match Word's box width when provided; otherwise fall back to glyph + gap.
        const markerBoxWidth = Math.max(0, glyphWidth + LIST_MARKER_GAP);

        return {
          markerWidth: markerBoxWidth,
          markerTextWidth: glyphWidth,
          indentLeft: wordLayout.indentLeftPx ?? 0,
          // For tab sizing in the renderer: expose gutter for word-layout lists
          gutterWidth: gutter,
        } as ParagraphMeasure['marker'];
      })()
    : undefined;

  /**
   * Floating-point tolerance for line breaking decisions (0.5px).
   *
   * Why this constant exists:
   * - Canvas text measurement can have minor floating-point precision differences
   *   between measurement and rendering contexts
   * - Different browsers may round sub-pixel measurements slightly differently
   * - Without a tolerance, lines might break prematurely when text is *almost*
   *   but not quite at maxWidth
   *
   * Why 0.5px was chosen:
   * - Large enough to absorb typical floating-point rounding errors (0.1-0.3px)
   * - Small enough to be visually imperceptible at standard screen resolutions
   * - Conservative value that prevents premature breaking without allowing
   *   significant overflow
   *
   * How it's used in line breaking:
   * - When checking if a word fits: `width + wordWidth <= maxWidth - WIDTH_FUDGE_PX`
   * - This gives the layout a 0.5px safety margin before triggering a line break
   * - Prevents edge cases where measured text at 199.7px breaks on a 200px line
   *   due to rounding, when it would actually render fine
   */
  const WIDTH_FUDGE_PX = 0.5;
  const lines: Line[] = [];
  const indent = block.attrs?.indent;
  const spacing = block.attrs?.spacing;
  // Use sanitizeIndent (not sanitizePositive) to allow negative values.
  // Negative indents extend text into the page margin area (OOXML spec).
  const indentLeft = sanitizeIndent(indent?.left);
  const indentRight = sanitizeIndent(indent?.right);
  const firstLine = indent?.firstLine ?? 0;
  const hanging = indent?.hanging ?? 0;
  const isWordLayoutList = Boolean(wordLayout?.marker);
  // Word quirk: justified paragraphs ignore first-line indent. The pm-adapter sets
  // suppressFirstLineIndent=true for these cases.
  const suppressFirstLine = (block.attrs as Record<string, unknown>)?.suppressFirstLineIndent === true;
  const rawFirstLineOffset = suppressFirstLine ? 0 : firstLine - hanging;
  // When wordLayout is present, the hanging region is occupied by the list marker/tab,
  // so keep the same available width as body lines. For normal paragraphs we must honor
  // negative offsets (hanging indent) so the first line can extend into the hanging region.
  const clampedFirstLineOffset = Math.max(0, rawFirstLineOffset);
  const hasNegativeIndent = indentLeft < 0 || indentRight < 0;
  // Avoid widening the first line when negative indents already expand fragment width.
  const allowNegativeFirstLineOffset = !isWordLayoutList && !hasNegativeIndent && rawFirstLineOffset < 0;
  const firstLineOffset = isWordLayoutList
    ? 0
    : allowNegativeFirstLineOffset
      ? rawFirstLineOffset
      : clampedFirstLineOffset;
  const contentWidth = Math.max(1, maxWidth - indentLeft - indentRight);
  // Body lines use contentWidth (same as first line for most cases).
  // The hanging indent affects WHERE body lines start (indentLeft), not their available width.
  // Since indentLeft already accounts for the body line position, no additional offset is needed.
  const bodyContentWidth = contentWidth;

  // Calculate available width for the first line.
  // There are two list marker layout patterns in OOXML:
  //
  // 1. firstLineIndentMode (marker inline with text):
  //    - Uses indent.firstLine > 0 with no hanging
  //    - Marker is rendered in-flow, occupying horizontal space
  //    - Text starts at textStartPx from the left edge
  //    - Available width = maxWidth - textStartPx - indentRight
  //
  // 2. Standard hanging indent (marker in hanging area):
  //    - Uses indent.left with indent.hanging
  //    - Marker is positioned absolutely in the hanging region (left of text start)
  //    - Text starts at indent.left on ALL lines (first and subsequent)
  //    - Available width = maxWidth - indentLeft - indentRight (same as subsequent lines)
  //
  // Note: wordLayout.marker.justification (from lvlJc) describes text alignment WITHIN
  // the marker box (left/center/right), NOT whether the marker takes in-flow space.
  let initialAvailableWidth: number;
  // Shared helper is the canonical source for list text-start geometry.
  // Keep an explicit top-level fallback for producers that only provide textStartPx.
  const rawTextStartPx = (wordLayout as { textStartPx?: unknown } | undefined)?.textStartPx;
  const textStartPx =
    typeof rawTextStartPx === 'number' && Number.isFinite(rawTextStartPx) ? rawTextStartPx : undefined;
  const resolvedTextStartPx = resolveListTextStartPx(
    wordLayout,
    indentLeft,
    firstLine,
    hanging,
    (markerText: string, marker: MinimalMarker) => {
      const markerRun = {
        fontFamily: toCssFontFamily(marker.run?.fontFamily) ?? marker.run?.fontFamily ?? 'Arial',
        fontSize: marker.run?.fontSize ?? fallbackFontSize,
        bold: marker.run?.bold ?? false,
        italic: marker.run?.italic ?? false,
      };
      const { font: markerFont } = buildFontString(markerRun);
      return measureText(markerText, markerFont, ctx);
    },
  );
  const effectiveTextStartPx = resolvedTextStartPx ?? textStartPx;

  if (typeof effectiveTextStartPx === 'number' && effectiveTextStartPx > indentLeft) {
    // textStartPx indicates where text actually starts on the first line (after marker + tab/space).
    // Available width = from textStartPx to right margin.
    initialAvailableWidth = Math.max(1, maxWidth - effectiveTextStartPx - indentRight);
  } else {
    // No textStartPx: text starts at the normal indent position.
    initialAvailableWidth = Math.max(1, contentWidth - firstLineOffset);
  }

  const tabStops = buildTabStopsPx(
    indent,
    block.attrs?.tabs as TabStop[],
    block.attrs?.tabIntervalTwips as number | undefined,
  );
  const decimalSeparator = sanitizeDecimalSeparator(block.attrs?.decimalSeparator);

  // Extract bar tab stops for paragraph-level rendering (OOXML: bars on all lines)
  const barTabStops = tabStops.filter((stop) => stop.val === 'bar');

  // Helper to add bar tabs to a line (paragraph-level decoration)
  const addBarTabsToLine = (line: Line): void => {
    if (barTabStops.length > 0) {
      line.bars = barTabStops.map((stop) => ({ x: stop.pos }));
    }
  };

  // Drop cap handling: measure drop cap and calculate reserved space
  const dropCapDescriptor = block.attrs?.dropCapDescriptor;
  let dropCapMeasure: {
    width: number;
    height: number;
    lines: number;
    mode: 'drop' | 'margin';
  } | null = null;

  if (dropCapDescriptor) {
    // Validate required fields before measuring
    if (!dropCapDescriptor.run || !dropCapDescriptor.run.text || !dropCapDescriptor.lines) {
      console.warn('Invalid drop cap descriptor - missing required fields:', dropCapDescriptor);
    } else {
      const dropCapMeasured = measureDropCap(ctx, dropCapDescriptor, spacing);
      dropCapMeasure = dropCapMeasured;

      // Update the descriptor with measured dimensions
      (dropCapDescriptor as DropCapDescriptor).measuredWidth = dropCapMeasured.width;
      (dropCapDescriptor as DropCapDescriptor).measuredHeight = dropCapMeasured.height;
    }
  }

  const emptyParagraphRun =
    normalizedRuns.length === 1 && isEmptyTextRun(normalizedRuns[0] as Run) ? (normalizedRuns[0] as TextRun) : null;
  if (emptyParagraphRun) {
    const fontSize = emptyParagraphRun.fontSize ?? DEFAULT_PARAGRAPH_FONT_SIZE;
    const metrics = calculateEmptyParagraphMetrics(fontSize, spacing, getFontInfoFromRun(emptyParagraphRun));
    const emptyLine: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 0,
      ...metrics,
    };
    addBarTabsToLine(emptyLine);
    lines.push(emptyLine);

    return {
      kind: 'paragraph',
      lines,
      totalHeight: metrics.lineHeight,
      ...(markerInfo ? { marker: markerInfo } : {}),
    };
  }

  if (normalizedRuns.length === 0) {
    const metrics = calculateEmptyParagraphMetrics(DEFAULT_PARAGRAPH_FONT_SIZE, spacing);
    const emptyLine: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 0,
      ...metrics,
    };
    addBarTabsToLine(emptyLine);
    lines.push(emptyLine);

    return {
      kind: 'paragraph',
      lines,
      totalHeight: metrics.lineHeight,
      ...(markerInfo ? { marker: markerInfo } : {}),
    };
  }

  /** Fallback font info for accurate typography metrics on leading line breaks. */
  const fallbackFontInfo = firstTextRunWithSize ? getFontInfoFromRun(firstTextRunWithSize) : undefined;

  let currentLine: {
    fromRun: number;
    fromChar: number;
    toRun: number;
    toChar: number;
    width: number;
    maxFontSize: number;
    /** Font info for the run with maxFontSize, used for accurate typography metrics */
    maxFontInfo?: FontInfo;
    maxWidth: number;
    segments: Line['segments'];
    leaders?: Line['leaders'];
    /** Count of breakable spaces already included on this line (for justify-aware fitting) */
    spaceCount: number;
  } | null = null;

  // Helper to calculate effective available width based on current line count.
  // When drop cap is present in 'drop' mode, reduce width for the first N lines.
  const getEffectiveWidth = (baseWidth: number): number => {
    if (dropCapMeasure && lines.length < dropCapMeasure.lines && dropCapMeasure.mode === 'drop') {
      return Math.max(1, baseWidth - dropCapMeasure.width);
    }
    return baseWidth;
  };

  let lastFontSize = fallbackFontSize;
  /** Tracks whether we've encountered a text run yet; used to apply fallback font info to leading line breaks. */
  let hasSeenTextRun = false;
  let tabStopCursor = 0;
  let pendingTabAlignment: { target: number; val: TabStop['val'] } | null = null;
  let pendingRunSpacing = 0;
  // Remember the last applied tab alignment so we can clamp end-aligned
  // segments to the exact target after measuring to avoid 1px drift.
  let lastAppliedTabAlign: { target: number; val: TabStop['val'] } | null = null;
  const warnedTabVals = new Set<string>();

  /**
   * Active tab alignment group state.
   *
   * When processing content after a non-start-aligned tab (end, center, decimal),
   * we use look-ahead measurement to determine the total width of all content
   * until the next tab or end of line. This state tracks:
   * - The pre-measured group information
   * - The starting X position for the aligned content
   * - The current X position as we process runs within the group
   *
   * This enables proper right/center/decimal alignment where ALL content after
   * the tab is treated as a unit, matching Microsoft Word's behavior.
   */
  let activeTabGroup: {
    /** The measurement result from measureTabAlignmentGroup */
    measure: TabAlignmentGroupMeasure;
    /** The X position where the aligned group starts */
    startX: number;
    /** Current X position within the group (cumulative as we process runs) */
    currentX: number;
    /** The tab stop target position */
    target: number;
    /** The tab alignment type */
    val: TabStop['val'];
  } | null = null;

  /**
   * Validate and track tab stop val to ensure it's normalized.
   * Returns true if validation passed, false if val is invalid (treated as 'start').
   */
  const validateTabStopVal = (stop: TabStopPx): boolean => {
    if (!ALLOWED_TAB_VALS.has(stop.val) && !warnedTabVals.has(stop.val)) {
      warnedTabVals.add(stop.val);
      return false;
    }
    return true;
  };

  const resolveBoundarySpacing = (lineWidth: number, isRunStart: boolean, run: TextRun): number => {
    if (lineWidth <= 0) return 0;
    return isRunStart ? pendingRunSpacing : (run.letterSpacing ?? 0);
  };

  /**
   * Apply a pending tab alignment to the next segment/run given its width.
   * Returns the aligned starting X position when applied.
   */
  const alignPendingTabForWidth = (segmentWidth: number, beforeDecimalWidth?: number): number | undefined => {
    if (!pendingTabAlignment || !currentLine) return undefined;

    // Guard against negative segment width
    if (segmentWidth < 0) {
      segmentWidth = 0;
    }

    const { target, val } = pendingTabAlignment;
    let startX = currentLine.width;

    if (val === 'decimal') {
      const beforeWidth = beforeDecimalWidth ?? 0;
      startX = Math.max(0, target - beforeWidth);
    } else if (val === 'end') {
      startX = Math.max(0, target - segmentWidth);
    } else if (val === 'center') {
      startX = Math.max(0, target - segmentWidth / 2);
    } else {
      startX = Math.max(0, target);
    }

    currentLine.width = roundValue(startX);
    // Track alignment used for post-segment clamping
    lastAppliedTabAlign = { target, val };
    pendingTabAlignment = null;
    return startX;
  };

  /**
   * Aligns a text segment at a pending tab stop by measuring its width and applying the appropriate alignment.
   *
   * This function handles different tab alignment types:
   * - 'decimal': Aligns text based on the decimal separator position
   * - 'end': Right-aligns text at the tab stop
   * - 'center': Centers text at the tab stop
   * - 'start': Left-aligns text at the tab stop (default)
   *
   * @param segmentText - The text content of the segment to align
   * @param font - CSS font string for measuring text width (e.g., "16px Arial")
   * @param runContext - The Run object containing styling properties (letterSpacing, etc.)
   * @returns The aligned starting X position for the segment, or undefined if no tab alignment is pending
   */
  const alignSegmentAtTab = (
    segmentText: string,
    font: string,
    runContext: Run,
    segmentStartChar: number,
  ): number | undefined => {
    if (!pendingTabAlignment || !currentLine) return undefined;
    const { val } = pendingTabAlignment;

    let segmentWidth = 0;
    let beforeDecimalWidth: number | undefined;

    if (val === 'decimal') {
      const idx = segmentText.indexOf(decimalSeparator);
      if (idx >= 0) {
        const beforeText = segmentText.slice(0, idx);
        beforeDecimalWidth =
          beforeText.length > 0 ? measureRunWidth(beforeText, font, ctx, runContext, segmentStartChar) : 0;
      }
      segmentWidth = segmentText.length > 0 ? measureRunWidth(segmentText, font, ctx, runContext, segmentStartChar) : 0;
    } else if (val === 'end' || val === 'center') {
      segmentWidth = segmentText.length > 0 ? measureRunWidth(segmentText, font, ctx, runContext, segmentStartChar) : 0;
    }

    return alignPendingTabForWidth(segmentWidth, beforeDecimalWidth);
  };

  // Expand runs to handle inline newlines as explicit break runs
  const runsToProcess: Run[] = [];
  for (const run of normalizedRuns as Run[]) {
    if ((run as TextRun).text && typeof (run as TextRun).text === 'string' && (run as TextRun).text.includes('\n')) {
      const textRun = run as TextRun;
      const segments = textRun.text.split('\n');
      let cursor = textRun.pmStart ?? 0;
      segments.forEach((seg, idx) => {
        runsToProcess.push({
          ...textRun,
          text: seg,
          pmStart: cursor,
          pmEnd: cursor + seg.length,
        });
        cursor += seg.length;
        if (idx !== segments.length - 1) {
          runsToProcess.push({
            kind: 'break',
            breakType: 'line',
            pmStart: cursor,
            pmEnd: cursor + 1,
            sdt: (run as TextRun).sdt,
          });
          cursor += 1;
        }
      });
    } else {
      runsToProcess.push(run as Run);
    }
  }

  /**
   * Trims trailing regular spaces from a line when it is finalized.
   *
   * Our renderer uses `white-space: pre`, so trailing wrap-point spaces would otherwise occupy
   * width and make the visible right edge look ragged (and would be incorrectly stretched by
   * word-spacing justify).
   *
   * This matches typical word-processor behavior: spaces that exist only because of wrapping at
   * a word boundary do not render at line ends.
   */
  const trimTrailingWrapSpaces = (lineToTrim: NonNullable<typeof currentLine>): void => {
    const lastRun = runsToProcess[lineToTrim.toRun];
    if (!lastRun || !('text' in lastRun) || typeof lastRun.text !== 'string') return;

    const sliceStart = lineToTrim.toRun === lineToTrim.fromRun ? lineToTrim.fromChar : 0;
    const sliceEnd = lineToTrim.toChar;
    if (sliceEnd <= sliceStart) return;

    const sliceText = lastRun.text.slice(sliceStart, sliceEnd);
    let trimCount = 0;
    for (let i = sliceText.length - 1; i >= 0 && sliceText[i] === ' '; i -= 1) {
      trimCount += 1;
    }
    if (trimCount === 0) return;

    // Preserve intentionally space-only lines (used in tests and in some documents).
    if (lineToTrim.fromRun === lineToTrim.toRun && sliceText.trim().length === 0) {
      return;
    }

    const keptText = sliceText.slice(0, Math.max(0, sliceText.length - trimCount));
    const { font } = buildFontString(
      lastRun as { fontFamily: string; fontSize: number; bold?: boolean; italic?: boolean },
    );
    const fullWidth = measureRunWidth(sliceText, font, ctx, lastRun, sliceStart);
    const keptWidth = keptText.length > 0 ? measureRunWidth(keptText, font, ctx, lastRun, sliceStart) : 0;
    const delta = Math.max(0, fullWidth - keptWidth);

    lineToTrim.width = roundValue(Math.max(0, lineToTrim.width - delta));
    lineToTrim.spaceCount = Math.max(0, lineToTrim.spaceCount - trimCount);

    if ((lineToTrim as any).naturalWidth != null && typeof (lineToTrim as any).naturalWidth === 'number') {
      (lineToTrim as any).naturalWidth = roundValue(Math.max(0, (lineToTrim as any).naturalWidth - delta));
    }
  };

  // Process each run
  for (let runIndex = 0; runIndex < runsToProcess.length; runIndex++) {
    const run = runsToProcess[runIndex];

    if ((run as Run).kind === 'break') {
      if (currentLine) {
        const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
        const lineBase = currentLine;
        const completedLine: Line = { ...lineBase, ...metrics };
        addBarTabsToLine(completedLine);
        lines.push(completedLine);
        currentLine = null;
      } else {
        const metrics = calculateTypographyMetrics(fallbackFontSize, spacing, fallbackFontInfo);
        const emptyLine: Line = {
          fromRun: runIndex,
          fromChar: 0,
          toRun: runIndex,
          toChar: 0,
          width: 0,
          segments: [],
          ...metrics,
        };
        addBarTabsToLine(emptyLine);
        lines.push(emptyLine);
      }
      tabStopCursor = 0;
      pendingTabAlignment = null;
      lastAppliedTabAlign = null;
      pendingRunSpacing = 0;
      continue;
    }

    // Handle explicit line breaks (e.g., DOCX <w:br/>)
    if (isLineBreakRun(run)) {
      // For leading line breaks (before any text), use fallback font info for accurate height calculation
      const lineBreakFontInfo = hasSeenTextRun ? undefined : fallbackFontInfo;
      if (currentLine) {
        const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
        const completedLine: Line = {
          ...currentLine,
          ...metrics,
        };
        addBarTabsToLine(completedLine);
        lines.push(completedLine);
      } else {
        // Line break at the start of paragraph (no currentLine yet):
        // Create an empty line to represent the leading line break
        const metrics = calculateTypographyMetrics(lastFontSize, spacing, lineBreakFontInfo);
        const emptyLine: Line = {
          fromRun: runIndex,
          fromChar: 0,
          toRun: runIndex,
          toChar: 0,
          width: 0,
          maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
          segments: [],
          ...metrics,
        };
        addBarTabsToLine(emptyLine);
        lines.push(emptyLine);
      }

      // Start a fresh (currently empty) line after the break. If no further content
      // is added, this placeholder will become a blank line with the appropriate height.
      const hadPreviousLine = lines.length > 0;
      // Body lines (line 2+) use bodyContentWidth which accounts for hanging indent.
      const nextLineMaxWidth: number = hadPreviousLine
        ? getEffectiveWidth(bodyContentWidth)
        : getEffectiveWidth(initialAvailableWidth);
      currentLine = {
        fromRun: runIndex,
        fromChar: 0,
        toRun: runIndex,
        toChar: 0,
        width: 0,
        maxFontSize: lastFontSize,
        maxFontInfo: lineBreakFontInfo,
        maxWidth: nextLineMaxWidth,
        segments: [],
        spaceCount: 0,
      };
      tabStopCursor = 0;
      pendingTabAlignment = null;
      lastAppliedTabAlign = null;
      pendingRunSpacing = 0;
      continue;
    }

    // Handle tab runs specially
    if (isTabRun(run)) {
      // Clear any previous tab group when we encounter a new tab
      activeTabGroup = null;

      // Initialize line if needed
      if (!currentLine) {
        currentLine = {
          fromRun: runIndex,
          fromChar: 0,
          toRun: runIndex,
          toChar: 1,
          width: 0,
          maxFontSize: 12, // Default font size for tabs
          maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
          segments: [],
          spaceCount: 0,
        };
      }

      // Advance to next tab stop using the same logic as inline "\t" handling
      const originX = currentLine.width;
      // Use first-line effective indent (accounts for hanging) on first line, body indent otherwise
      const effectiveIndent = lines.length === 0 ? indentLeft + rawFirstLineOffset : indentLeft;
      const absCurrentX = currentLine.width + effectiveIndent;
      const { target, nextIndex, stop } = getNextTabStopPx(absCurrentX, tabStops, tabStopCursor);
      tabStopCursor = nextIndex;
      const maxAbsWidth = currentLine.maxWidth + effectiveIndent;
      const clampedTarget = Math.min(target, maxAbsWidth);
      const tabAdvance = Math.max(0, clampedTarget - absCurrentX);
      currentLine.width = roundValue(currentLine.width + tabAdvance);
      // Persist measured tab width on the TabRun for downstream consumers/tests
      (run as TabRun & { width?: number }).width = tabAdvance;

      currentLine.maxFontSize = Math.max(currentLine.maxFontSize, 12);
      currentLine.toRun = runIndex;
      currentLine.toChar = 1; // tab is a single character

      // Emit leader decoration if requested
      if (stop && stop.leader && stop.leader !== 'none') {
        const leaderStyle: 'heavy' | 'dot' | 'hyphen' | 'underscore' | 'middleDot' = stop.leader;
        const relativeTarget = clampedTarget - effectiveIndent;
        const from = Math.min(originX, relativeTarget);
        const to = Math.max(originX, relativeTarget);
        if (!currentLine.leaders) currentLine.leaders = [];
        currentLine.leaders.push({ from, to, style: leaderStyle });
      }

      if (stop) {
        validateTabStopVal(stop);

        // For non-start alignments (end, center, decimal), use look-ahead measurement
        // to properly align ALL content until the next tab or end of line
        if (stop.val === 'end' || stop.val === 'center' || stop.val === 'decimal') {
          // Measure all content from the next run until the next tab or end of paragraph
          const groupMeasure = measureTabAlignmentGroup(runIndex + 1, runsToProcess, ctx, decimalSeparator);

          if (groupMeasure.totalWidth > 0) {
            // Calculate the aligned starting X position based on total group width
            const relativeTarget = clampedTarget - effectiveIndent;
            let groupStartX: number;
            if (stop.val === 'end') {
              // Right-align: position so right edge of group is at tab stop
              groupStartX = Math.max(0, relativeTarget - groupMeasure.totalWidth);
            } else if (stop.val === 'center') {
              // Center-align: position so center of group is at tab stop
              groupStartX = Math.max(0, relativeTarget - groupMeasure.totalWidth / 2);
            } else {
              // Decimal-align: position so decimal point is at tab stop
              const beforeDecimal = groupMeasure.beforeDecimalWidth ?? groupMeasure.totalWidth;
              groupStartX = Math.max(0, relativeTarget - beforeDecimal);
            }

            // Set up active tab group for subsequent run processing
            activeTabGroup = {
              measure: groupMeasure,
              startX: groupStartX,
              currentX: groupStartX,
              target: relativeTarget,
              val: stop.val,
            };

            // Update line width to start of aligned group
            // (the actual content will extend from groupStartX to groupStartX + totalWidth)
            currentLine.width = roundValue(groupStartX);
          }

          // Don't set pendingTabAlignment - we're using activeTabGroup instead
          pendingTabAlignment = null;
        } else {
          // For start-aligned tabs, use the existing pendingTabAlignment mechanism
          pendingTabAlignment = { target: clampedTarget - effectiveIndent, val: stop.val };
        }
      } else {
        pendingTabAlignment = null;
      }
      pendingRunSpacing = 0;
      continue;
    }

    // Handle image runs
    if (isImageRun(run)) {
      // Calculate image width including spacing
      const leftSpace = run.distLeft ?? 0;
      const rightSpace = run.distRight ?? 0;
      const imageWidth = run.width + leftSpace + rightSpace;

      // Calculate image height including spacing (for line height)
      const topSpace = run.distTop ?? 0;
      const bottomSpace = run.distBottom ?? 0;
      const imageHeight = run.height + topSpace + bottomSpace;

      // Determine image position - check active tab group first, then pending alignment
      let imageStartX: number | undefined;
      if (activeTabGroup && currentLine) {
        // Part of an active tab alignment group - use pre-calculated position
        imageStartX = activeTabGroup.currentX;
        activeTabGroup.currentX = roundValue(activeTabGroup.currentX + imageWidth);
      } else if (pendingTabAlignment && currentLine) {
        // Legacy: single-segment tab alignment (for start-aligned tabs)
        imageStartX = alignPendingTabForWidth(imageWidth);
      }

      // Initialize line if needed
      if (!currentLine) {
        currentLine = {
          fromRun: runIndex,
          fromChar: 0,
          toRun: runIndex,
          toChar: 1, // Images are treated as single atomic units
          width: imageWidth,
          maxFontSize: imageHeight, // Use image height for line height calculation
          maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
          spaceCount: 0,
          segments: [
            {
              runIndex,
              fromChar: 0,
              toChar: 1,
              width: imageWidth,
              ...(imageStartX !== undefined ? { x: imageStartX } : {}),
            },
          ],
        };
        pendingRunSpacing = 0;
        // Check if we've reached the end of the tab group
        if (activeTabGroup && runIndex + 1 >= activeTabGroup.measure.endRunIndex) {
          activeTabGroup = null;
        }
        continue;
      }

      // Preserve the tab alignment before the if-else block to avoid TypeScript narrowing issues
      const appliedTabAlign: { target: number; val: TabStop['val'] } | null = lastAppliedTabAlign;

      // Check if image fits on current line (skip fit check if part of tab group - already measured)
      const skipFitCheck = activeTabGroup !== null;
      if (!skipFitCheck && currentLine.width + imageWidth > currentLine.maxWidth && currentLine.width > 0) {
        // Image doesn't fit - finish current line and start new line with image
        trimTrailingWrapSpaces(currentLine);
        const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
        const lineBase = currentLine;
        const completedLine: Line = {
          ...lineBase,
          ...metrics,
        };
        addBarTabsToLine(completedLine);
        lines.push(completedLine);
        tabStopCursor = 0;
        pendingTabAlignment = null;
        lastAppliedTabAlign = null;
        activeTabGroup = null;

        // Start new line with the image (body line, so use bodyContentWidth for hanging indent)
        currentLine = {
          fromRun: runIndex,
          fromChar: 0,
          toRun: runIndex,
          toChar: 1,
          width: imageWidth,
          maxFontSize: imageHeight,
          maxWidth: getEffectiveWidth(bodyContentWidth),
          spaceCount: 0,
          segments: [
            {
              runIndex,
              fromChar: 0,
              toChar: 1,
              width: imageWidth,
            },
          ],
        };
      } else {
        // Image fits on current line - append it
        currentLine.toRun = runIndex;
        currentLine.toChar = 1;
        currentLine.width = roundValue(currentLine.width + imageWidth);
        currentLine.maxFontSize = Math.max(currentLine.maxFontSize, imageHeight);
        if (!currentLine.segments) currentLine.segments = [];
        currentLine.segments.push({
          runIndex,
          fromChar: 0,
          toChar: 1,
          width: imageWidth,
          ...(imageStartX !== undefined ? { x: imageStartX } : {}),
        });
      }

      // Check if we've reached the end of the tab group
      if (activeTabGroup && runIndex + 1 >= activeTabGroup.measure.endRunIndex) {
        activeTabGroup = null;
      }

      // Clamp width if aligned to an end tab to avoid rounding drift
      // Note: Using type assertion to work around TypeScript control flow narrowing issue
      // where TS incorrectly infers `never` type after the if-else block above.
      const tabAlign = appliedTabAlign as { target: number; val: TabStop['val'] } | null;
      if (tabAlign && currentLine && tabAlign.val === 'end') {
        currentLine.width = roundValue(tabAlign.target);
      }
      lastAppliedTabAlign = null;
      pendingRunSpacing = 0;

      continue;
    }

    // Handle field annotation runs (pill-styled form fields)
    if (isFieldAnnotationRun(run)) {
      // Use displayLabel for text measurement, with fallback defaults
      const rawDisplayText = run.displayLabel || '';
      const displayText = applyTextTransform(rawDisplayText, run);

      // Use annotation's typography or fallback to defaults (16px Arial is standard)
      const annotationFontSize =
        typeof run.fontSize === 'number'
          ? run.fontSize
          : typeof run.fontSize === 'string'
            ? parseFloat(run.fontSize) || DEFAULT_FIELD_ANNOTATION_FONT_SIZE
            : DEFAULT_FIELD_ANNOTATION_FONT_SIZE;
      const annotationFontFamily = run.fontFamily || 'Arial, sans-serif';

      // Build font string for measurement
      const fontWeight = run.bold ? 'bold' : 'normal';
      const fontStyle = run.italic ? 'italic' : 'normal';
      const annotationFont = `${fontStyle} ${fontWeight} ${annotationFontSize}px ${annotationFontFamily}`;
      ctx.font = annotationFont;

      // Measure text width
      const textWidth = displayText ? ctx.measureText(displayText).width : 0;

      const annotationHorizontalPadding = run.highlighted === false ? 0 : FIELD_ANNOTATION_PILL_PADDING;
      const annotationVerticalPadding = run.highlighted === false ? 0 : FIELD_ANNOTATION_VERTICAL_PADDING;

      // Add pill styling overhead: border (2px each side) + padding (2px each side) = 8px total
      const annotationWidth = textWidth + annotationHorizontalPadding;

      // Calculate height including pill styling
      let annotationHeight = annotationFontSize * FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER + annotationVerticalPadding;

      // Signature images are capped to 28px in the renderer; reflect that in measurement.
      if (run.variant === 'signature' && run.imageSrc) {
        const signatureHeight = 28 + annotationVerticalPadding;
        annotationHeight = Math.max(annotationHeight, signatureHeight);
      }

      // Image annotations use explicit size when provided.
      if (run.variant === 'image' && run.imageSrc && run.size?.height) {
        const imageHeight = run.size.height + annotationVerticalPadding;
        annotationHeight = Math.max(annotationHeight, imageHeight);
      }

      if (run.variant === 'html' && run.size?.height) {
        annotationHeight = Math.max(annotationHeight, run.size.height);
      }

      // If a tab alignment is pending, apply it
      let annotationStartX: number | undefined;
      if (pendingTabAlignment && currentLine) {
        annotationStartX = alignPendingTabForWidth(annotationWidth);
      }

      // Initialize line if needed
      if (!currentLine) {
        currentLine = {
          fromRun: runIndex,
          fromChar: 0,
          toRun: runIndex,
          toChar: 1, // Field annotations are atomic units
          width: annotationWidth,
          maxFontSize: annotationHeight,
          maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
          spaceCount: 0,
          segments: [
            {
              runIndex,
              fromChar: 0,
              toChar: 1,
              width: annotationWidth,
              ...(annotationStartX !== undefined ? { x: annotationStartX } : {}),
            },
          ],
        };
        pendingRunSpacing = 0;
        continue;
      }

      // Check if annotation fits on current line
      if (currentLine.width + annotationWidth > currentLine.maxWidth && currentLine.width > 0) {
        // Doesn't fit - finish current line and start new one
        trimTrailingWrapSpaces(currentLine);
        const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
        const lineBase = currentLine;
        const completedLine: Line = {
          ...lineBase,
          ...metrics,
        };
        addBarTabsToLine(completedLine);
        lines.push(completedLine);
        tabStopCursor = 0;
        pendingTabAlignment = null;
        lastAppliedTabAlign = null;

        // Start new line with the annotation (body line, so use bodyContentWidth for hanging indent)
        currentLine = {
          fromRun: runIndex,
          fromChar: 0,
          toRun: runIndex,
          toChar: 1,
          width: annotationWidth,
          maxFontSize: annotationHeight,
          maxWidth: getEffectiveWidth(bodyContentWidth),
          spaceCount: 0,
          segments: [
            {
              runIndex,
              fromChar: 0,
              toChar: 1,
              width: annotationWidth,
            },
          ],
        };
      } else {
        // Fits on current line - append it
        currentLine.toRun = runIndex;
        currentLine.toChar = 1;
        currentLine.width = roundValue(currentLine.width + annotationWidth);
        currentLine.maxFontSize = Math.max(currentLine.maxFontSize, annotationHeight);
        if (!currentLine.segments) currentLine.segments = [];
        currentLine.segments.push({
          runIndex,
          fromChar: 0,
          toChar: 1,
          width: annotationWidth,
          ...(annotationStartX !== undefined ? { x: annotationStartX } : {}),
        });
      }

      // Handle end tab alignment
      const tabAlign = lastAppliedTabAlign as { target: number; val: TabStop['val'] } | null;
      if (tabAlign && currentLine && tabAlign.val === 'end') {
        currentLine.width = roundValue(tabAlign.target);
      }
      lastAppliedTabAlign = null;
      pendingRunSpacing = 0;

      continue;
    }

    // At this point, we've filtered out break, lineBreak, tab, image, and fieldAnnotation runs.
    // The remaining run must be TextRun (which has text, fontSize, etc.)
    if (!('text' in run) || !('fontSize' in run)) {
      // Safety check - skip if this isn't a TextRun
      pendingRunSpacing = 0;
      continue;
    }

    // Handle text runs
    lastFontSize = run.fontSize;
    hasSeenTextRun = true;
    const { font } = buildFontString(run);
    const tabSegments = run.text.split('\t');

    let charPosInRun = 0;

    for (let segmentIndex = 0; segmentIndex < tabSegments.length; segmentIndex++) {
      const segment = tabSegments[segmentIndex];
      const isLastSegment = segmentIndex === tabSegments.length - 1;
      if (/^[ ]+$/.test(segment)) {
        const isRunStart = charPosInRun === 0 && segmentIndex === 0;
        const spacesLength = segment.length;
        const spacesStartChar = charPosInRun;
        const spacesEndChar = charPosInRun + spacesLength;
        const spacesWidth = measureRunWidth(segment, font, ctx, run, spacesStartChar);

        if (!currentLine) {
          currentLine = {
            fromRun: runIndex,
            fromChar: spacesStartChar,
            toRun: runIndex,
            toChar: spacesEndChar,
            width: spacesWidth,
            maxFontSize: run.fontSize,
            maxFontInfo: getFontInfoFromRun(run),
            maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
            segments: [{ runIndex, fromChar: spacesStartChar, toChar: spacesEndChar, width: spacesWidth }],
            spaceCount: spacesLength,
          };
        } else {
          const boundarySpacing = resolveBoundarySpacing(currentLine.width, isRunStart, run as TextRun);
          if (
            currentLine.width + boundarySpacing + spacesWidth > currentLine.maxWidth - WIDTH_FUDGE_PX &&
            currentLine.width > 0
          ) {
            trimTrailingWrapSpaces(currentLine);
            const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
            const lineBase = currentLine;
            const completedLine: Line = {
              ...lineBase,
              ...metrics,
            };
            addBarTabsToLine(completedLine);
            lines.push(completedLine);
            tabStopCursor = 0;
            pendingTabAlignment = null;
            lastAppliedTabAlign = null;

            // Body line, so use bodyContentWidth for hanging indent
            currentLine = {
              fromRun: runIndex,
              fromChar: spacesStartChar,
              toRun: runIndex,
              toChar: spacesEndChar,
              width: spacesWidth,
              maxFontSize: run.fontSize,
              maxFontInfo: getFontInfoFromRun(run),
              maxWidth: getEffectiveWidth(bodyContentWidth),
              segments: [{ runIndex, fromChar: spacesStartChar, toChar: spacesEndChar, width: spacesWidth }],
              spaceCount: spacesLength,
            };
          } else {
            currentLine.toRun = runIndex;
            currentLine.toChar = spacesEndChar;
            currentLine.width = roundValue(currentLine.width + boundarySpacing + spacesWidth);
            currentLine.maxFontInfo = updateMaxFontInfo(currentLine.maxFontSize, currentLine.maxFontInfo, run);
            currentLine.maxFontSize = Math.max(currentLine.maxFontSize, run.fontSize);
            appendSegment(currentLine.segments, runIndex, spacesStartChar, spacesEndChar, spacesWidth);
            currentLine.spaceCount += spacesLength;
          }
        }

        charPosInRun = spacesEndChar;
        continue;
      }

      const words = segment.split(' ');
      // `split(' ')` produces empty strings for leading, consecutive, AND trailing spaces.
      // We need to know the last non-empty word index so we don't double-count a trailing space:
      //   "Por " → ["Por", ""]  (one trailing space)
      // If we treated "Por" as "not last", we'd append a space AND also process the "" token.
      let lastNonEmptyWordIndex = -1;
      for (let i = words.length - 1; i >= 0; i -= 1) {
        if (words[i] !== '') {
          lastNonEmptyWordIndex = i;
          break;
        }
      }

      // Determine segment position - check active tab group first, then pending alignment
      let segmentStartX: number | undefined;
      let inActiveTabGroup = false;
      if (activeTabGroup && currentLine) {
        // Part of an active tab alignment group - use pre-calculated position
        segmentStartX = activeTabGroup.currentX;
        inActiveTabGroup = true;
        // Note: activeTabGroup.currentX will be updated as we process words in this segment
      } else if (currentLine && pendingTabAlignment) {
        // Legacy: single-segment tab alignment (for start-aligned tabs)
        segmentStartX = alignSegmentAtTab(segment, font, run, charPosInRun);
        // After alignment, currentLine.width is the X position where this segment starts
        if (segmentStartX == null) {
          segmentStartX = currentLine.width;
        }
      }

      for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
        const word = words[wordIndex];
        /**
         * Handle empty strings from split(' ') representing space characters.
         *
         * Background: segment.split(' ') produces empty strings for leading/consecutive spaces:
         *   " Hello" → ['', 'Hello']  (leading space)
         *   "A  B"   → ['A', '', 'B'] (consecutive spaces)
         *
         * Previously these were skipped (just incremented charPosInRun), causing spaces
         * to be dropped from measurements and rendering.
         */
        if (word === '') {
          // Empty string from split(' ') indicates a space character (leading or consecutive spaces).
          // We must add the space width to the line, not just skip it.
          const spaceStartChar = charPosInRun;
          const spaceEndChar = charPosInRun + 1;
          const singleSpaceWidth = measureRunWidth(' ', font, ctx, run, spaceStartChar);
          const isRunStart = charPosInRun === 0 && segmentIndex === 0 && wordIndex === 0;

          if (!currentLine) {
            // Start a new line with just the space
            currentLine = {
              fromRun: runIndex,
              fromChar: spaceStartChar,
              toRun: runIndex,
              toChar: spaceEndChar,
              width: singleSpaceWidth,
              maxFontSize: run.fontSize,
              maxFontInfo: getFontInfoFromRun(run),
              maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
              segments: [{ runIndex, fromChar: spaceStartChar, toChar: spaceEndChar, width: singleSpaceWidth }],
              spaceCount: 1,
            };
          } else {
            // Add space to existing line
            // Safe cast: only TextRuns produce word segments from split(), other run types are handled earlier
            const boundarySpacing = resolveBoundarySpacing(currentLine.width, isRunStart, run as TextRun);
            if (
              currentLine.width + boundarySpacing + singleSpaceWidth > currentLine.maxWidth - WIDTH_FUDGE_PX &&
              currentLine.width > 0
            ) {
              // Space doesn't fit - finish current line and start new one with the space
              trimTrailingWrapSpaces(currentLine);
              const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
              const lineBase = currentLine;
              const completedLine: Line = {
                ...lineBase,
                ...metrics,
              };
              addBarTabsToLine(completedLine);
              lines.push(completedLine);
              tabStopCursor = 0;
              pendingTabAlignment = null;
              lastAppliedTabAlign = null;
              activeTabGroup = null;

              // Body line, so use bodyContentWidth for hanging indent
              currentLine = {
                fromRun: runIndex,
                fromChar: spaceStartChar,
                toRun: runIndex,
                toChar: spaceEndChar,
                width: singleSpaceWidth,
                maxFontSize: run.fontSize,
                maxFontInfo: getFontInfoFromRun(run),
                maxWidth: getEffectiveWidth(bodyContentWidth),
                segments: [{ runIndex, fromChar: spaceStartChar, toChar: spaceEndChar, width: singleSpaceWidth }],
                spaceCount: 1,
              };
            } else {
              // Space fits - add it to current line
              currentLine.toRun = runIndex;
              currentLine.toChar = spaceEndChar;
              currentLine.width = roundValue(currentLine.width + boundarySpacing + singleSpaceWidth);
              currentLine.maxFontInfo = updateMaxFontInfo(currentLine.maxFontSize, currentLine.maxFontInfo, run);
              currentLine.maxFontSize = Math.max(currentLine.maxFontSize, run.fontSize);
              // If in an active tab alignment group, use explicit X positioning
              let spaceExplicitX: number | undefined;
              if (inActiveTabGroup && activeTabGroup) {
                spaceExplicitX = activeTabGroup.currentX;
                activeTabGroup.currentX = roundValue(activeTabGroup.currentX + singleSpaceWidth);
              }
              appendSegment(
                currentLine.segments,
                runIndex,
                spaceStartChar,
                spaceEndChar,
                singleSpaceWidth,
                spaceExplicitX,
              );
              currentLine.spaceCount += 1;
            }
          }

          charPosInRun = spaceEndChar;
          continue;
        }
        const wordStartChar = charPosInRun;
        const wordOnlyWidth = measureRunWidth(word, font, ctx, run, wordStartChar);
        // Only include the implicit single delimiter space when there is a later non-empty word
        // in this same segment (i.e., before the next word). Do NOT include one before tabs or
        // at the end of the segment; those spaces are represented explicitly by "" tokens.
        const shouldIncludeDelimiterSpace = wordIndex < lastNonEmptyWordIndex;
        const wordEndNoSpace = charPosInRun + word.length;
        const spaceWidth = shouldIncludeDelimiterSpace ? measureRunWidth(' ', font, ctx, run, wordEndNoSpace) : 0;
        const wordCommitWidth = wordOnlyWidth + spaceWidth;
        const wordEndWithSpace = wordEndNoSpace + (shouldIncludeDelimiterSpace ? 1 : 0);

        // Determine the effective maxWidth for character-level breaking
        const effectiveMaxWidth = currentLine
          ? currentLine.maxWidth
          : getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : contentWidth);

        // Character-level word breaking: if a single word exceeds maxWidth, break it into chunks
        // This handles narrow table cells where long words would otherwise overflow and be clipped
        // Note: We use effectiveMaxWidth without WIDTH_FUDGE_PX here because:
        // - WIDTH_FUDGE_PX is meant to give leeway for fitting text that's very close
        // - We only want to break mid-word when the word truly exceeds available width
        // - Breaking words that exactly fit would cause unnecessary fragmentation
        if (wordOnlyWidth > effectiveMaxWidth && word.length > 1) {
          // First, finish any existing currentLine before processing the long word
          // Only push the line if it has actual text content (segments), not just tab positioning.
          // If the line only has width from tab advances but no text, we should keep it so the
          // long word can use the pending tab alignment.
          if (currentLine && currentLine.width > 0 && currentLine.segments && currentLine.segments.length > 0) {
            trimTrailingWrapSpaces(currentLine);
            const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
            const lineBase = currentLine;
            const completedLine: Line = {
              ...lineBase,
              ...metrics,
            };
            addBarTabsToLine(completedLine);
            lines.push(completedLine);
            tabStopCursor = 0;
            pendingTabAlignment = null;
            currentLine = null;
          }

          // Break the word into chunks that fit within maxWidth
          const lineMaxWidth = getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : contentWidth);

          // If currentLine exists with tab positioning but no text segments, we need to handle
          // the first chunk specially to preserve the tab alignment
          const hasTabOnlyLine =
            currentLine && currentLine.segments && currentLine.segments.length === 0 && currentLine.width > 0;
          const remainingWidthAfterTab = hasTabOnlyLine ? currentLine!.maxWidth - currentLine!.width : lineMaxWidth;

          // Use remaining width for chunking if we have a tab-only line, otherwise use full line width
          const chunkWidth = hasTabOnlyLine ? Math.max(remainingWidthAfterTab, lineMaxWidth * 0.25) : lineMaxWidth;
          const chunks = breakWordIntoChunks(word, chunkWidth - WIDTH_FUDGE_PX, font, ctx, run, wordStartChar);

          // Process all chunks except the last one as complete lines
          let chunkCharOffset = wordStartChar;
          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            const chunkStartChar = chunkCharOffset;
            const chunkEndChar = chunkCharOffset + chunk.text.length;
            const isLastChunk = chunkIndex === chunks.length - 1;
            const isFirstChunk = chunkIndex === 0;

            // First chunk: if we have a tab-only line, add to it; otherwise create new line
            if (isFirstChunk && hasTabOnlyLine && currentLine && currentLine.segments) {
              // Add first chunk to the existing line with tab positioning
              currentLine.toRun = runIndex;
              currentLine.toChar = chunkEndChar;
              currentLine.width = roundValue(currentLine.width + chunk.width);
              currentLine.maxFontSize = Math.max(currentLine.maxFontSize, run.fontSize);
              currentLine.maxFontInfo = getFontInfoFromRun(run);
              currentLine.segments.push({
                runIndex,
                fromChar: chunkStartChar,
                toChar: chunkEndChar,
                width: chunk.width,
              });

              if (isLastChunk) {
                // If this is also the last chunk, keep currentLine open for more content
                const ls = (run as TextRun).letterSpacing ?? 0;
                if (
                  shouldIncludeDelimiterSpace &&
                  currentLine.width + spaceWidth <= currentLine.maxWidth - WIDTH_FUDGE_PX
                ) {
                  currentLine.toChar = wordEndWithSpace;
                  currentLine.width = roundValue(currentLine.width + spaceWidth + ls);
                  charPosInRun = wordEndWithSpace;
                  currentLine.spaceCount += 1;
                } else {
                  charPosInRun = wordEndWithSpace;
                }
              } else {
                // More chunks to come - finish this line and push it
                trimTrailingWrapSpaces(currentLine);
                const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
                const lineBase = currentLine;
                const completedLine: Line = {
                  ...lineBase,
                  ...metrics,
                };
                addBarTabsToLine(completedLine);
                lines.push(completedLine);
                tabStopCursor = 0;
                pendingTabAlignment = null;
                currentLine = null;
              }
            } else if (isLastChunk) {
              // Last chunk becomes the start of a new line (will be continued with next word)
              currentLine = {
                fromRun: runIndex,
                fromChar: chunkStartChar,
                toRun: runIndex,
                toChar: chunkEndChar,
                width: chunk.width,
                maxFontSize: run.fontSize,
                maxFontInfo: getFontInfoFromRun(run),
                maxWidth: getEffectiveWidth(contentWidth),
                segments: [{ runIndex, fromChar: chunkStartChar, toChar: chunkEndChar, width: chunk.width }],
                spaceCount: 0,
              };
              // If trailing space fits, include it
              const ls = (run as TextRun).letterSpacing ?? 0;
              if (
                shouldIncludeDelimiterSpace &&
                currentLine.width + spaceWidth <= currentLine.maxWidth - WIDTH_FUDGE_PX
              ) {
                currentLine.toChar = wordEndWithSpace;
                currentLine.width = roundValue(currentLine.width + spaceWidth + ls);
                charPosInRun = wordEndWithSpace;
                currentLine.spaceCount += 1;
              } else {
                charPosInRun = wordEndWithSpace;
              }
            } else {
              // Not the last chunk - create a complete line
              const chunkLineMaxWidth = getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : contentWidth);
              const metrics = calculateTypographyMetrics(run.fontSize, spacing, getFontInfoFromRun(run));
              const chunkLine: Line = {
                fromRun: runIndex,
                fromChar: chunkStartChar,
                toRun: runIndex,
                toChar: chunkEndChar,
                width: chunk.width,
                maxWidth: chunkLineMaxWidth,
                segments: [{ runIndex, fromChar: chunkStartChar, toChar: chunkEndChar, width: chunk.width }],
                ...metrics,
              };
              addBarTabsToLine(chunkLine);
              lines.push(chunkLine);
            }
            chunkCharOffset = chunkEndChar;
          }
          continue;
        }

        if (!currentLine) {
          currentLine = {
            fromRun: runIndex,
            fromChar: wordStartChar,
            toRun: runIndex,
            toChar: wordEndNoSpace,
            width: wordOnlyWidth,
            maxFontSize: run.fontSize,
            maxFontInfo: getFontInfoFromRun(run),
            maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
            segments: [{ runIndex, fromChar: wordStartChar, toChar: wordEndNoSpace, width: wordOnlyWidth }],
            spaceCount: 0,
          };
          // If a trailing space exists and fits safely, include it on this line
          // Safe cast: only TextRuns produce word segments from split(), other run types are handled earlier
          const ls = (run as TextRun).letterSpacing ?? 0;
          if (shouldIncludeDelimiterSpace && currentLine.width + spaceWidth <= currentLine.maxWidth - WIDTH_FUDGE_PX) {
            currentLine.toChar = wordEndWithSpace;
            currentLine.width = roundValue(currentLine.width + spaceWidth + ls);
            charPosInRun = wordEndWithSpace;
            currentLine.spaceCount += 1;
            // Fix: Also update the segment to include the trailing space character.
            // Without this, the segment excludes the space even though the line includes it,
            // causing the space to not be rendered.
            if (currentLine.segments?.[0]) {
              currentLine.segments[0].toChar = wordEndWithSpace;
              currentLine.segments[0].width += spaceWidth;
            }
          } else {
            // Do not count trailing space at line end
            // but still advance char index to skip over the space for subsequent words
            charPosInRun = wordEndWithSpace;
          }
          continue;
        }

        // For TOC entries, never break lines - allow them to extend beyond maxWidth
        const isTocEntry = block.attrs?.isTocEntry;
        // Fit check uses word-only width and includes boundary letterSpacing when line is non-empty
        // Safe cast: only TextRuns produce word segments from split(), other run types are handled earlier
        const isRunStart = charPosInRun === 0 && segmentIndex === 0 && wordIndex === 0;
        const boundarySpacing = resolveBoundarySpacing(currentLine.width, isRunStart, run as TextRun);
        // Check if paragraph has justified alignment
        const justifyAlignment = block.attrs?.alignment === 'justify';
        const totalWidthWithWord =
          currentLine.width +
          boundarySpacing +
          wordCommitWidth +
          // Safe cast: only TextRuns produce word segments from split(), other run types are handled earlier
          (shouldIncludeDelimiterSpace ? ((run as TextRun).letterSpacing ?? 0) : 0);
        const availableWidth = currentLine.maxWidth - WIDTH_FUDGE_PX;
        // Skip line break check if we're in an active tab alignment group - content was pre-measured
        let shouldBreak =
          !inActiveTabGroup &&
          currentLine.width + boundarySpacing + wordOnlyWidth > availableWidth &&
          currentLine.width > 0 &&
          !isTocEntry;
        let compressedWidth: number | null = null;

        // Justify-aware fit: allow minor per-space compression (non-last paragraph line) to keep the word.
        if (shouldBreak && justifyAlignment) {
          const isLastNonEmptyWordInSegment = wordIndex === lastNonEmptyWordIndex;
          const isParagraphLastWord =
            isLastSegment && isLastNonEmptyWordInSegment && runIndex === runsToProcess.length - 1;
          if (!isParagraphLastWord) {
            const existingSpaces = currentLine.spaceCount ?? 0;
            const candidateSpaces = existingSpaces + (shouldIncludeDelimiterSpace ? 1 : 0);
            if (candidateSpaces > 0) {
              const overflow = totalWidthWithWord - availableWidth;
              if (overflow > 0) {
                const baseSpaceWidth =
                  spaceWidth || measureRunWidth(' ', font, ctx, run, wordEndNoSpace) || Math.max(1, boundarySpacing);
                const perSpaceCompression = overflow / candidateSpaces;
                const maxPerSpaceCompression = baseSpaceWidth * 0.25; // ~25% squeeze permitted
                if (perSpaceCompression <= maxPerSpaceCompression) {
                  shouldBreak = false;
                  compressedWidth = availableWidth;
                }
              }
            }
          }
        }

        if (shouldBreak) {
          trimTrailingWrapSpaces(currentLine);
          const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
          const lineBase = currentLine;
          const completedLine: Line = {
            ...lineBase,
            ...metrics,
          };
          addBarTabsToLine(completedLine);
          lines.push(completedLine);
          tabStopCursor = 0;
          pendingTabAlignment = null;

          // Body line, so use bodyContentWidth for hanging indent
          currentLine = {
            fromRun: runIndex,
            fromChar: wordStartChar,
            toRun: runIndex,
            toChar: wordEndNoSpace,
            width: wordOnlyWidth,
            maxFontSize: run.fontSize,
            maxFontInfo: getFontInfoFromRun(run),
            maxWidth: getEffectiveWidth(bodyContentWidth),
            segments: [{ runIndex, fromChar: wordStartChar, toChar: wordEndNoSpace, width: wordOnlyWidth }],
            spaceCount: 0,
          };
          // If trailing space would fit on the new line, consume it here; otherwise skip it
          if (shouldIncludeDelimiterSpace && currentLine.width + spaceWidth <= currentLine.maxWidth - WIDTH_FUDGE_PX) {
            currentLine.toChar = wordEndWithSpace;
            currentLine.width = roundValue(currentLine.width + spaceWidth + ((run as TextRun).letterSpacing ?? 0));
            charPosInRun = wordEndWithSpace;
            currentLine.spaceCount += 1;
            // Fix: Also update the segment to include the trailing space character.
            // Without this, the segment excludes the space even though the line includes it,
            // causing the space to not be rendered.
            if (currentLine.segments?.[0]) {
              currentLine.segments[0].toChar = wordEndWithSpace;
              currentLine.segments[0].width += spaceWidth;
            }
          } else {
            // Skip the space in character indexing even if we don't render it
            charPosInRun = wordEndWithSpace;
          }
        } else {
          currentLine.toRun = runIndex;
          // If adding the trailing space would exceed, commit only the word and finalize line
          if (
            shouldIncludeDelimiterSpace &&
            currentLine.width + boundarySpacing + wordOnlyWidth + spaceWidth > currentLine.maxWidth - WIDTH_FUDGE_PX
          ) {
            currentLine.toChar = wordEndNoSpace;
            currentLine.width = roundValue(currentLine.width + boundarySpacing + wordOnlyWidth);
            currentLine.maxFontInfo = updateMaxFontInfo(currentLine.maxFontSize, currentLine.maxFontInfo, run);
            currentLine.maxFontSize = Math.max(currentLine.maxFontSize, run.fontSize);
            // Determine explicit X position:
            // - If in active tab group, use currentX from the group (for ALL words in group)
            // - Otherwise, only use segmentStartX for first word after a tab
            let explicitXHere: number | undefined;
            if (inActiveTabGroup && activeTabGroup) {
              explicitXHere = activeTabGroup.currentX;
              activeTabGroup.currentX = roundValue(activeTabGroup.currentX + wordOnlyWidth);
            } else if (wordIndex === 0 && segmentStartX !== undefined) {
              explicitXHere = segmentStartX;
            }
            appendSegment(currentLine.segments, runIndex, wordStartChar, wordEndNoSpace, wordOnlyWidth, explicitXHere);
            // finish current line and start a new one on next iteration
            trimTrailingWrapSpaces(currentLine);
            const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
            const lineBase = currentLine;
            const completedLine: Line = { ...lineBase, ...metrics };
            addBarTabsToLine(completedLine);
            lines.push(completedLine);
            tabStopCursor = 0;
            pendingTabAlignment = null;
            currentLine = null;
            // advance past space
            charPosInRun = wordEndNoSpace + 1;
            continue;
          }
          const newToChar = shouldIncludeDelimiterSpace ? wordEndWithSpace : wordEndNoSpace;
          currentLine.toChar = newToChar;
          // Determine explicit X position:
          // - If in active tab group, use currentX from the group (for ALL words in group)
          // - Otherwise, only use segmentStartX for first word after a tab
          let explicitX: number | undefined;
          if (inActiveTabGroup && activeTabGroup) {
            explicitX = activeTabGroup.currentX;
            activeTabGroup.currentX = roundValue(activeTabGroup.currentX + wordCommitWidth);
          } else if (wordIndex === 0 && segmentStartX !== undefined) {
            explicitX = segmentStartX;
          }
          const targetWidth =
            compressedWidth != null
              ? compressedWidth
              : currentLine.width +
                boundarySpacing +
                wordCommitWidth +
                (shouldIncludeDelimiterSpace ? ((run as TextRun).letterSpacing ?? 0) : 0);
          // Preserve natural width when compression is applied for justify calculations
          if (compressedWidth != null) {
            (currentLine as any).naturalWidth = roundValue(totalWidthWithWord);
          }
          currentLine.width = roundValue(targetWidth);
          currentLine.maxFontInfo = updateMaxFontInfo(currentLine.maxFontSize, currentLine.maxFontInfo, run);
          currentLine.maxFontSize = Math.max(currentLine.maxFontSize, run.fontSize);
          appendSegment(currentLine.segments, runIndex, wordStartChar, newToChar, wordCommitWidth, explicitX);
          if (shouldIncludeDelimiterSpace) {
            currentLine.spaceCount += 1;
          }
        }

        charPosInRun = shouldIncludeDelimiterSpace ? wordEndWithSpace : wordEndNoSpace;
      }

      // If this segment was positioned by a right-aligned tab, clamp the
      // final width to the tab target to avoid rounding drift.
      if (lastAppliedTabAlign && currentLine) {
        const appliedTab = lastAppliedTabAlign as { target: number; val: TabStop['val'] };
        if (appliedTab.val === 'end') {
          currentLine.width = roundValue(appliedTab.target);
        }
      }
      lastAppliedTabAlign = null;

      // Check if we've reached the end of the active tab alignment group
      if (activeTabGroup && runIndex + 1 >= activeTabGroup.measure.endRunIndex) {
        // Clamp line width to the tab target to ensure proper alignment
        if (currentLine && activeTabGroup.val === 'end') {
          currentLine.width = roundValue(activeTabGroup.target);
        }
        activeTabGroup = null;
      }

      if (!isLastSegment) {
        pendingTabAlignment = null;
        if (!currentLine) {
          currentLine = {
            fromRun: runIndex,
            fromChar: charPosInRun,
            toRun: runIndex,
            toChar: charPosInRun,
            width: 0,
            maxFontSize: run.fontSize,
            maxFontInfo: getFontInfoFromRun(run),
            maxWidth: getEffectiveWidth(lines.length === 0 ? initialAvailableWidth : bodyContentWidth),
            segments: [],
            spaceCount: 0,
          };
        }
        const originX = currentLine.width;
        // Use first-line effective indent (accounts for hanging) on first line, body indent otherwise
        const effectiveIndent = lines.length === 0 ? indentLeft + rawFirstLineOffset : indentLeft;
        const absCurrentX = currentLine.width + effectiveIndent;
        const { target, nextIndex, stop } = getNextTabStopPx(absCurrentX, tabStops, tabStopCursor);
        tabStopCursor = nextIndex;
        const maxAbsWidth = currentLine.maxWidth + effectiveIndent;
        const clampedTarget = Math.min(target, maxAbsWidth);
        const tabAdvance = Math.max(0, clampedTarget - absCurrentX);
        currentLine.width = roundValue(currentLine.width + tabAdvance);

        currentLine.maxFontInfo = updateMaxFontInfo(currentLine.maxFontSize, currentLine.maxFontInfo, run);
        currentLine.maxFontSize = Math.max(currentLine.maxFontSize, run.fontSize);
        currentLine.toRun = runIndex;
        currentLine.toChar = charPosInRun;
        charPosInRun += 1;
        if (stop) {
          validateTabStopVal(stop);
          pendingTabAlignment = { target: clampedTarget - effectiveIndent, val: stop.val };
        } else {
          pendingTabAlignment = null;
        }

        // Emit leader decoration if requested
        if (stop && stop.leader && stop.leader !== 'none' && stop.leader !== 'middleDot') {
          const leaderStyle: 'heavy' | 'dot' | 'hyphen' | 'underscore' = stop.leader;
          const relativeTarget = clampedTarget - effectiveIndent;
          const from = Math.min(originX, relativeTarget);
          const to = Math.max(originX, relativeTarget);
          if (!currentLine.leaders) currentLine.leaders = [];
          currentLine.leaders.push({ from, to, style: leaderStyle });
        }
      }
    }

    pendingRunSpacing = (run as TextRun).letterSpacing ?? 0;
  }

  if (!currentLine && lines.length === 0) {
    const uiDisplayFallbackFontSize =
      (normalizedRuns[0]?.kind === 'text' ? (normalizedRuns[0] as TextRun).fontSize : undefined) ??
      DEFAULT_PARAGRAPH_FONT_SIZE;
    const metrics = calculateTypographyMetrics(uiDisplayFallbackFontSize, spacing);
    const fallbackLine: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 0,
      segments: [],
      ...metrics,
    };
    addBarTabsToLine(fallbackLine);
    lines.push(fallbackLine);
  }

  if (currentLine) {
    const metrics = calculateTypographyMetrics(currentLine.maxFontSize, spacing, currentLine.maxFontInfo);
    const lineBase = currentLine;
    const finalLine: Line = {
      ...lineBase,
      ...metrics,
    };
    addBarTabsToLine(finalLine);
    lines.push(finalLine);
  }

  const totalHeight = lines.reduce((sum, line) => sum + line.lineHeight, 0);

  return {
    kind: 'paragraph',
    lines,
    totalHeight,
    ...(markerInfo ? { marker: markerInfo } : {}),
    ...(dropCapMeasure ? { dropCap: dropCapMeasure } : {}),
  };
}

/**
 * Validates and extracts a numeric value from a table width attribute.
 *
 * Performs runtime validation to ensure the value is a valid, finite number
 * that can be used in calculations. This guards against NaN, Infinity, and
 * invalid numeric values that could break layout calculations.
 *
 * @param attr - Table width attribute object (potentially unsafe)
 * @returns Valid numeric value or undefined if validation fails
 *
 * @example
 * ```typescript
 * validateTableWidthValue({ width: 2500, type: 'pct' }) // Returns: 2500
 * validateTableWidthValue({ value: 300, type: 'px' }) // Returns: 300
 * validateTableWidthValue({ width: NaN, type: 'pct' }) // Returns: undefined
 * validateTableWidthValue({ width: -100, type: 'pct' }) // Returns: undefined
 * validateTableWidthValue({}) // Returns: undefined
 * ```
 */
function validateTableWidthValue(attr: TableWidthAttr): number | undefined {
  const value = attr.width ?? attr.value;

  // Must be a number, finite (not NaN/Infinity), and positive
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  return undefined;
}

/**
 * Resolves table width from OOXML attributes to actual pixel width.
 *
 * Handles two types of width specifications:
 * 1. Percentage width (type: 'pct'): OOXML stores percentages as 1/50ths of a percent
 *    - 5000 = 100% (full width)
 *    - 2500 = 50% (half width)
 *    - 1000 = 20% (one-fifth width)
 *    The percentage is applied to the available maxWidth to get pixel width.
 *
 * 2. Explicit pixel width (type: 'px' or 'pixel'): Direct pixel value used as-is.
 *
 * Includes runtime validation to guard against invalid values (NaN, Infinity, negative).
 *
 * @param attrs - Table block attributes (may be undefined)
 * @param maxWidth - Available width in pixels for percentage calculations
 * @returns Resolved pixel width or undefined if no valid width specified
 *
 * @example
 * ```typescript
 * // 50% of 600px = 300px
 * resolveTableWidth({ tableWidth: { value: 2500, type: 'pct' } }, 600) // Returns: 300
 *
 * // Explicit 400px
 * resolveTableWidth({ tableWidth: { width: 400, type: 'px' } }, 600) // Returns: 400
 *
 * // Invalid: NaN value
 * resolveTableWidth({ tableWidth: { value: NaN, type: 'pct' } }, 600) // Returns: undefined
 * ```
 */
function resolveTableWidth(attrs: TableBlock['attrs'], maxWidth: number): number | undefined {
  // Type guard: validate attrs.tableWidth matches TableWidthAttr structure
  const tableWidthAttr = attrs?.tableWidth;
  if (!tableWidthAttr || typeof tableWidthAttr !== 'object') {
    return undefined;
  }

  const typedAttr = tableWidthAttr as TableWidthAttr;
  const validValue = validateTableWidthValue(typedAttr);

  if (validValue === undefined) {
    return undefined;
  }

  if (typedAttr.type === 'pct') {
    // Convert OOXML percentage to pixels
    // OOXML_PCT_DIVISOR (5000) = 100%
    return Math.round(maxWidth * (validValue / OOXML_PCT_DIVISOR));
  } else if (typedAttr.type === 'px' || typedAttr.type === 'pixel') {
    // Explicit pixel width - use directly
    return validValue;
  }

  return undefined;
}

async function measureTableBlock(block: TableBlock, constraints: MeasureConstraints): Promise<TableMeasure> {
  const maxWidth = typeof constraints === 'number' ? constraints : constraints.maxWidth;
  // Resolve percentage or explicit pixel table width
  const resolvedTableWidth = resolveTableWidth(block.attrs, maxWidth);

  let columnWidths: number[];

  /**
   * Scales column widths proportionally to fit within a target width.
   *
   * This function is used when table column widths exceed the available page width.
   * It proportionally reduces all columns to fit the constraint while maintaining
   * their relative proportions.
   *
   * Rounding Adjustment Logic:
   * - Initial scaling uses Math.round() for each column, which can cause the sum
   *   to deviate from the target due to accumulated rounding errors
   * - After scaling, the function adjusts columns one-by-one to reach the exact target
   * - For excess width (sum > target): decrements columns starting from index 0
   * - For deficit width (sum < target): increments columns starting from index 0
   * - Ensures no column goes below 1px minimum width
   * - Distributes adjustments cyclically to avoid bias toward any single column
   *
   * @param widths - Array of column widths in pixels
   * @param targetWidth - Maximum total width in pixels
   * @returns Scaled column widths that sum exactly to targetWidth (or original widths if already fit)
   *
   * @example
   * ```typescript
   * scaleColumnWidths([100, 200, 100], 300)
   * // Returns: [75, 150, 75] (scaled from 400px down to 300px, maintaining 1:2:1 ratio)
   *
   * scaleColumnWidths([50, 50], 200)
   * // Returns: [50, 50] (already within target, no scaling needed)
   *
   * scaleColumnWidths([33, 33, 33], 100)
   * // Returns: [34, 33, 33] (sum adjusted from 99 to exactly 100)
   * ```
   */
  const scaleColumnWidths = (widths: number[], targetWidth: number): number[] => {
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    if (totalWidth <= targetWidth || widths.length === 0) return widths;

    const scale = targetWidth / totalWidth;
    const scaled = widths.map((w) => Math.max(1, Math.round(w * scale)));
    const sum = scaled.reduce((a, b) => a + b, 0);

    // Normalize to the exact target to avoid overflows from rounding.
    if (sum !== targetWidth) {
      const adjust = (delta: number): void => {
        let idx = 0;
        const direction = delta > 0 ? 1 : -1;
        delta = Math.abs(delta);
        while (delta > 0 && scaled.length > 0) {
          const i = idx % scaled.length;
          if (direction > 0) {
            scaled[i] += 1;
            delta -= 1;
          } else if (scaled[i] > 1) {
            scaled[i] -= 1;
            delta -= 1;
          }
          idx += 1;
          if (idx > scaled.length * 2 && delta > 0) break;
        }
      };
      adjust(targetWidth - sum);
    }

    return scaled;
  };
  // Determine actual column count from table structure (accounting for colspan)
  const maxCellCount = Math.max(
    1,
    Math.max(...block.rows.map((r) => r.cells.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0))),
  );

  // Effective target width: use resolvedTableWidth if set (from percentage or explicit px),
  // but never exceed maxWidth (available column space)
  const effectiveTargetWidth = resolvedTableWidth != null ? Math.min(resolvedTableWidth, maxWidth) : maxWidth;

  // Use provided column widths from OOXML w:tblGrid if available
  if (block.columnWidths && block.columnWidths.length > 0) {
    columnWidths = [...block.columnWidths];

    // Check if table has fixed layout (preserves exact widths)
    // Use resolvedTableWidth to check for valid explicit width (validated and non-undefined)
    const hasExplicitWidth = resolvedTableWidth != null;
    const hasFixedLayout = block.attrs?.tableLayout === 'fixed';

    // For tables with explicit/percentage width or fixed layout, scale to target width
    if (hasExplicitWidth || hasFixedLayout) {
      const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
      const tableWidthType = (block.attrs?.tableWidth as TableWidthAttr | undefined)?.type;
      const shouldScaleDown = totalWidth > effectiveTargetWidth;
      const shouldScaleUp =
        totalWidth < effectiveTargetWidth &&
        effectiveTargetWidth > 0 &&
        (tableWidthType === 'pct' || (hasExplicitWidth && !hasFixedLayout));

      // Scale to effectiveTargetWidth (resolved percentage or explicit width)
      // - Always scale down if too wide
      // - Only scale up for percentage widths or auto-layout tables
      if ((shouldScaleDown || shouldScaleUp) && effectiveTargetWidth > 0 && totalWidth > 0) {
        const scale = effectiveTargetWidth / totalWidth;
        columnWidths = columnWidths.map((w) => Math.max(1, Math.round(w * scale)));
        // Normalize to exact target width (handle rounding errors)
        const scaledSum = columnWidths.reduce((a, b) => a + b, 0);
        if (scaledSum !== effectiveTargetWidth && columnWidths.length > 0) {
          const diff = effectiveTargetWidth - scaledSum;
          columnWidths[columnWidths.length - 1] = Math.max(1, columnWidths[columnWidths.length - 1] + diff);
        }
      }
    } else {
      // For auto-layout tables, adjust column widths to match actual column count
      if (columnWidths.length < maxCellCount) {
        // Pad missing columns with equal distribution of remaining space
        const usedWidth = columnWidths.reduce((a, b) => a + b, 0);
        const remainingWidth = Math.max(0, effectiveTargetWidth - usedWidth);
        const missingColumns = maxCellCount - columnWidths.length;
        const paddingWidth = Math.max(1, Math.floor(remainingWidth / missingColumns));
        columnWidths.push(...Array.from({ length: missingColumns }, () => paddingWidth));
      } else if (columnWidths.length > maxCellCount) {
        // Truncate extra column widths
        columnWidths = columnWidths.slice(0, maxCellCount);
      }

      // Scale down if total width exceeds available space (prevent overflow).
      // Auto-width tables (w:tblW type="auto") size to their grid/content in Word.
      // Do NOT scale up — tables that fill the page do so because their grid columns
      // already sum to the page width, not because of scaling.
      const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
      if (totalWidth > effectiveTargetWidth) {
        columnWidths = scaleColumnWidths(columnWidths, effectiveTargetWidth);
      }
    }
  } else {
    // Fallback: Equal distribution based on max cells in any row
    const columnWidth = Math.max(1, Math.floor(effectiveTargetWidth / maxCellCount));
    columnWidths = Array.from({ length: maxCellCount }, () => columnWidth);
  }

  // Derive grid column count from computed columnWidths (handles both explicit tblGrid and fallback cases)
  const gridColumnCount = columnWidths.length;

  /**
   * Calculate the width for a cell by summing the grid column widths it spans.
   * @param startCol - The starting grid column index
   * @param colspan - Number of grid columns this cell spans
   */
  const calculateCellWidth = (startCol: number, colspan: number): number => {
    let width = 0;
    for (let i = 0; i < colspan && startCol + i < columnWidths.length; i++) {
      width += columnWidths[startCol + i];
    }
    // Ensure minimum width of 1px
    return Math.max(1, width);
  };

  // Track which grid columns are "occupied" by rowspans from previous rows
  // Each element contains the number of remaining rows the cell spans into
  const rowspanTracker: number[] = new Array(gridColumnCount).fill(0);

  // Measure each cell paragraph with appropriate column width based on colspan
  const rows: TableRowMeasure[] = [];
  const rowBaseHeights: number[] = new Array(block.rows.length).fill(0);
  const spanConstraints: Array<{ startRow: number; rowSpan: number; requiredHeight: number }> = [];
  for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
    const row = block.rows[rowIndex];
    const cellMeasures: TableCellMeasure[] = [];
    let gridColIndex = 0; // Track position in the grid

    for (const cell of row.cells) {
      const colspan = cell.colSpan ?? 1;
      const rowspan = cell.rowSpan ?? 1;

      // Skip grid columns that are occupied by rowspans from previous rows
      // before processing this cell
      while (gridColIndex < gridColumnCount && rowspanTracker[gridColIndex] > 0) {
        rowspanTracker[gridColIndex]--;
        gridColIndex++;
      }

      // If we've exhausted the grid, stop processing cells
      if (gridColIndex >= gridColumnCount) {
        break;
      }

      const cellWidth = calculateCellWidth(gridColIndex, colspan);

      // Mark grid columns as occupied for future rows if rowspan > 1
      if (rowspan > 1) {
        for (let c = 0; c < colspan && gridColIndex + c < gridColumnCount; c++) {
          rowspanTracker[gridColIndex + c] = rowspan - 1;
        }
      }

      // Get cell padding for height calculation
      const cellPadding = cell.attrs?.padding ?? { top: 0, left: 4, right: 4, bottom: 0 };
      const paddingTop = cellPadding.top ?? 0;
      const paddingBottom = cellPadding.bottom ?? 0;
      const paddingLeft = cellPadding.left ?? 4;
      const paddingRight = cellPadding.right ?? 4;

      // Content width accounts for horizontal padding
      const contentWidth = Math.max(1, cellWidth - paddingLeft - paddingRight);

      /**
       * Measure all blocks in the cell and accumulate total content height.
       *
       * Multi-Block Cell Support:
       * - Cells can contain multiple blocks (paragraphs, lists, images, etc.)
       * - Each block is measured independently with the cell's content width
       * - Block heights are accumulated to calculate total content height
       * - Vertical padding is applied to the total accumulated height
       *
       * Backward Compatibility:
       * - If cell.blocks is not present, falls back to cell.paragraph (legacy format)
       * - Empty blocks arrays are handled gracefully (no content)
       *
       * Height Calculation:
       * - contentHeight = sum of all block.totalHeight values
       * - totalCellHeight = contentHeight + paddingTop + paddingBottom
       *
       * Example:
       * ```
       * cell.blocks = [paragraph1, paragraph2, paragraph3]
       * contentHeight = para1.height + para2.height + para3.height
       * totalCellHeight = contentHeight;
       * ```
       */
      const blockMeasures: Measure[] = [];
      let contentHeight = 0;

      const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);

      for (let blockIndex = 0; blockIndex < cellBlocks.length; blockIndex++) {
        const block = cellBlocks[blockIndex];
        const measure = await measureBlock(block, { maxWidth: contentWidth, maxHeight: Infinity });
        blockMeasures.push(measure);
        // Get height from different measure types
        const blockHeight = 'totalHeight' in measure ? measure.totalHeight : 'height' in measure ? measure.height : 0;
        const isAnchoredOutOfFlow =
          (block.kind === 'image' || block.kind === 'drawing') &&
          (block as ImageBlock | DrawingBlock).anchor?.isAnchored === true &&
          ((block as ImageBlock | DrawingBlock).wrap?.type ?? 'Inline') !== 'Inline';

        // Anchored/floating objects inside table cells do not contribute to cell height.
        if (isAnchoredOutOfFlow) {
          continue;
        }

        contentHeight += blockHeight;

        // Add paragraph spacing.after to content height.
        // For the last paragraph, Word absorbs spacing.after into cell bottom padding —
        // so only add the excess beyond what the padding already provides.
        const isLastBlock = blockIndex === cellBlocks.length - 1;
        if (block.kind === 'paragraph') {
          const spacingAfter = (block as ParagraphBlock).attrs?.spacing?.after;
          if (typeof spacingAfter === 'number' && spacingAfter > 0) {
            if (isLastBlock) {
              // Only add the portion not absorbed by cell bottom padding
              const excess = Math.max(0, spacingAfter - paddingBottom);
              contentHeight += excess;
            } else {
              contentHeight += spacingAfter;
            }
          }
        }
      }

      // Total cell height includes vertical padding
      const totalCellHeight = contentHeight + paddingTop + paddingBottom;

      cellMeasures.push({
        blocks: blockMeasures,
        // Backward compatibility
        paragraph: blockMeasures[0]?.kind === 'paragraph' ? (blockMeasures[0] as ParagraphMeasure) : undefined,
        width: cellWidth,
        height: totalCellHeight,
        gridColumnStart: gridColIndex,
        colSpan: colspan,
        rowSpan: rowspan,
      });

      if (rowspan === 1) {
        rowBaseHeights[rowIndex] = Math.max(rowBaseHeights[rowIndex], totalCellHeight);
      } else {
        spanConstraints.push({ startRow: rowIndex, rowSpan: rowspan, requiredHeight: totalCellHeight });
      }

      // Advance grid column position by colspan
      gridColIndex += colspan;
    }

    // Decrement any remaining rowspan trackers that weren't handled
    for (let col = gridColIndex; col < gridColumnCount; col++) {
      if (rowspanTracker[col] > 0) {
        rowspanTracker[col]--;
      }
    }

    rows.push({ cells: cellMeasures, height: 0 });
  }

  const rowHeights = [...rowBaseHeights];
  for (const constraint of spanConstraints) {
    const { startRow, rowSpan, requiredHeight } = constraint;
    if (rowSpan <= 0) continue;

    let currentHeight = 0;
    for (let i = 0; i < rowSpan && startRow + i < rowHeights.length; i++) {
      currentHeight += rowHeights[startRow + i];
    }

    if (currentHeight < requiredHeight) {
      const spanLength = Math.min(rowSpan, rowHeights.length - startRow);
      const increment = spanLength > 0 ? (requiredHeight - currentHeight) / spanLength : 0;
      for (let i = 0; i < spanLength; i++) {
        rowHeights[startRow + i] += increment;
      }
    }
  }

  // Apply explicit row heights (exact / atLeast) from row attributes
  block.rows.forEach((row, index) => {
    const spec = row.attrs?.rowHeight as { value?: number; rule?: string } | undefined;
    if (spec?.value != null && Number.isFinite(spec.value)) {
      const rule = spec.rule ?? 'atLeast';
      if (rule === 'exact') {
        rowHeights[index] = spec.value;
      } else {
        rowHeights[index] = Math.max(rowHeights[index], spec.value);
      }
    }
  });

  for (let i = 0; i < rows.length; i++) {
    rows[i].height = Math.max(0, rowHeights[i]);
  }

  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
  return {
    kind: 'table',
    rows,
    columnWidths,
    totalWidth,
    totalHeight,
  };
}

async function measureImageBlock(block: ImageBlock, constraints: MeasureConstraints): Promise<ImageMeasure> {
  const intrinsic = getIntrinsicImageSize(block, constraints.maxWidth);

  const isBlockBehindDoc = block.anchor?.behindDoc;
  const isBlockWrapBehindDoc = block.wrap?.type === 'None' && block.wrap?.behindDoc;
  const isPageRelativeAnchor =
    block.anchor?.isAnchored && (block.anchor?.hRelativeFrom === 'page' || block.anchor?.hRelativeFrom === 'margin');
  const bypassWidthConstraint = isBlockBehindDoc || isBlockWrapBehindDoc || isPageRelativeAnchor;
  const isWidthConstraintBypassed = bypassWidthConstraint || constraints.maxWidth <= 0;

  const maxWidth = isWidthConstraintBypassed ? intrinsic.width : constraints.maxWidth;

  // For anchored images with negative vertical positioning (designed to overflow their container),
  // bypass the height constraint. This matches MS Word behavior where images in headers/footers
  // with negative offsets are rendered at their full size regardless of region constraints.
  const hasNegativeVerticalPosition =
    block.anchor?.isAnchored &&
    ((typeof block.anchor?.offsetV === 'number' && block.anchor.offsetV < 0) ||
      (typeof block.margin?.top === 'number' && block.margin.top < 0));

  // Bypass height constraint when:
  // - Image has negative vertical positioning (designed to overflow container)
  // - objectFit is 'cover' (image should render at exact extent dimensions, CSS handles content scaling/clipping)
  const shouldBypassHeightConstraint = hasNegativeVerticalPosition || block.objectFit === 'cover';

  const maxHeight =
    shouldBypassHeightConstraint || !constraints.maxHeight || constraints.maxHeight <= 0
      ? Infinity
      : constraints.maxHeight;

  const widthScale = maxWidth / intrinsic.width;
  const heightScale = maxHeight / intrinsic.height;
  const scale = Math.min(1, widthScale, heightScale);

  const width = Number.isFinite(scale) ? intrinsic.width * scale : intrinsic.width;
  const height = Number.isFinite(scale) ? intrinsic.height * scale : intrinsic.height;

  return {
    kind: 'image',
    width,
    height,
  };
}

/**
 * Measures a drawing block (vector shapes, shape groups, embedded images) and calculates
 * its rendered dimensions within the given constraints.
 *
 * This function handles:
 * - Rotation transformations and their effect on bounding box dimensions
 * - Proportional scaling to fit within maxWidth/maxHeight constraints
 * - Special case: negative vertical positioning bypass for anchored drawings
 *
 * Negative Positioning Bypass:
 * For anchored drawings with negative vertical positioning (offsetV < 0 or margin.top < 0),
 * the maxHeight constraint is bypassed. This is intentional for footer/header graphics
 * that are designed to overflow their nominal container region (e.g., decorative elements
 * positioned above a footer's top edge). The bypass only applies when the drawing is
 * anchored AND has at least one negative vertical offset value.
 *
 * @param block - The drawing block to measure, containing geometry, anchor, and margin data
 * @param constraints - Measurement constraints with maxWidth and optional maxHeight
 * @returns A DrawingMeasure containing final dimensions, scale factor, and geometry
 *
 * @example
 * ```typescript
 * const block: DrawingBlock = {
 *   kind: 'drawing',
 *   drawingKind: 'vectorShape',
 *   geometry: { width: 200, height: 100, rotation: 0 },
 *   anchor: { isAnchored: true, offsetV: -20 },
 * };
 *
 * const measure = await measureDrawingBlock(block, { maxWidth: 500, maxHeight: 80 });
 * // Result: { width: 200, height: 100, scale: 1 }
 * // (maxHeight bypassed due to negative offsetV)
 * ```
 */
async function measureDrawingBlock(block: DrawingBlock, constraints: MeasureConstraints): Promise<DrawingMeasure> {
  if (block.drawingKind === 'image') {
    const intrinsic = getIntrinsicSizeFromDims(block.width, block.height, constraints.maxWidth);

    const maxWidth = constraints.maxWidth > 0 ? constraints.maxWidth : intrinsic.width;
    const maxHeight = constraints.maxHeight && constraints.maxHeight > 0 ? constraints.maxHeight : Infinity;

    const widthScale = maxWidth / intrinsic.width;
    const heightScale = maxHeight / intrinsic.height;
    const scale = Math.min(1, widthScale, heightScale);

    const width = Number.isFinite(scale) ? intrinsic.width * scale : intrinsic.width;
    const height = Number.isFinite(scale) ? intrinsic.height * scale : intrinsic.height;

    return {
      kind: 'drawing',
      drawingKind: 'image',
      width,
      height,
      scale: Number.isFinite(scale) ? scale : 1,
      naturalWidth: intrinsic.width,
      naturalHeight: intrinsic.height,
      geometry: {
        width: intrinsic.width,
        height: intrinsic.height,
        rotation: 0,
        flipH: false,
        flipV: false,
      },
    };
  }

  const geometry = ensureDrawingGeometry(block.geometry);
  const attrs = block.attrs as Record<string, unknown> | undefined;
  const indentLeft = typeof attrs?.hrIndentLeft === 'number' ? attrs.hrIndentLeft : 0;
  const indentRight = typeof attrs?.hrIndentRight === 'number' ? attrs.hrIndentRight : 0;
  const hasFullWidth = attrs?.isFullWidth === true && constraints.maxWidth > 0;
  const fullWidthMax = hasFullWidth ? Math.max(1, constraints.maxWidth - indentLeft - indentRight) : undefined;
  if (fullWidthMax != null) {
    geometry.width = fullWidthMax;
  }
  const rotatedBounds = calculateRotatedBounds(geometry);
  const naturalWidth = Math.max(1, rotatedBounds.width);
  const naturalHeight = Math.max(1, rotatedBounds.height);

  const maxWidth = fullWidthMax ?? (constraints.maxWidth > 0 ? constraints.maxWidth : naturalWidth);

  // For anchored drawings with negative vertical positioning (designed to overflow their container),
  // bypass the height constraint. This is common for footer/header graphics that extend beyond
  // their nominal region (e.g., decorative elements with marginOffset.top < 0).
  const hasNegativeVerticalPosition =
    block.anchor?.isAnchored &&
    ((typeof block.anchor?.offsetV === 'number' && block.anchor.offsetV < 0) ||
      (typeof block.margin?.top === 'number' && block.margin.top < 0));

  const maxHeight =
    hasNegativeVerticalPosition || !constraints.maxHeight || constraints.maxHeight <= 0
      ? Infinity
      : constraints.maxHeight;

  const widthScale = maxWidth / naturalWidth;
  const heightScale = maxHeight / naturalHeight;
  const normalizedScale = Math.min(1, widthScale, heightScale);
  const scale = Number.isFinite(normalizedScale) ? normalizedScale : 1;

  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    kind: 'drawing',
    drawingKind: block.drawingKind,
    width,
    height,
    scale,
    naturalWidth,
    naturalHeight,
    geometry: { ...geometry },
    ...(block.drawingKind === 'shapeGroup' && block.groupTransform
      ? { groupTransform: { ...block.groupTransform } }
      : {}),
  };
}

function getIntrinsicImageSize(block: ImageBlock, fallback: number): { width: number; height: number } {
  const safeFallback = fallback > 0 ? fallback : 1;
  const suggestedWidth = typeof block.width === 'number' && block.width > 0 ? block.width : safeFallback;
  const suggestedHeight = typeof block.height === 'number' && block.height > 0 ? block.height : safeFallback * 0.75;

  return {
    width: suggestedWidth,
    height: suggestedHeight,
  };
}

function getIntrinsicSizeFromDims(width?: number, height?: number, fallback = 1): { width: number; height: number } {
  const safeFallback = fallback > 0 ? fallback : 1;
  const intrinsicWidth = typeof width === 'number' && width > 0 ? width : safeFallback;
  const intrinsicHeight = typeof height === 'number' && height > 0 ? height : safeFallback * 0.75;
  return {
    width: intrinsicWidth,
    height: intrinsicHeight,
  };
}

function ensureDrawingGeometry(geometry?: DrawingGeometry): DrawingGeometry {
  if (geometry) {
    return {
      width: Math.max(1, geometry.width),
      height: Math.max(1, geometry.height),
      rotation: normalizeRotation(geometry.rotation ?? 0),
      flipH: Boolean(geometry.flipH),
      flipV: Boolean(geometry.flipV),
    };
  }
  return {
    width: 1,
    height: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
  };
}

function normalizeConstraints(constraints: number | MeasureConstraints): MeasureConstraints {
  if (typeof constraints === 'number') {
    return { maxWidth: constraints };
  }
  return constraints;
}

async function measureListBlock(block: ListBlock, constraints: MeasureConstraints): Promise<ListMeasure> {
  const ctx = getCanvasContext();
  const items = [];
  let totalHeight = 0;

  for (const item of block.items) {
    const wordLayout = item.paragraph.attrs?.wordLayout as
      | { marker?: WordParagraphLayoutOutput['marker']; indentLeftPx?: number }
      | undefined;
    let markerTextWidth: number;
    let markerWidth: number;
    let indentLeft: number;

    if ((wordLayout as WordParagraphLayoutOutput | undefined)?.marker) {
      // Track B: Use wordLayout from @superdoc/word-layout when available
      const marker = (wordLayout as WordParagraphLayoutOutput).marker!;
      // Fall back to paragraph's primary run fontSize if marker fontSize is missing
      const paragraphFallbackFontSize = getPrimaryRun(item.paragraph).fontSize ?? DEFAULT_PARAGRAPH_FONT_SIZE;
      const markerFontRun: TextRun = {
        text: marker.markerText,
        fontFamily: toCssFontFamily(marker.run.fontFamily) ?? marker.run.fontFamily,
        fontSize: marker.run.fontSize ?? paragraphFallbackFontSize,
        bold: marker.run.bold,
        italic: marker.run.italic,
        letterSpacing: marker.run.letterSpacing,
      };
      const { font: markerFont } = buildFontString(markerFontRun);
      markerTextWidth = marker.markerText ? measureText(marker.markerText, markerFont, ctx) : 0;
      markerWidth = 0;
      indentLeft = (wordLayout as WordParagraphLayoutOutput).indentLeftPx ?? 0;
    } else {
      // Fallback: legacy behavior for backwards compatibility
      const markerFontRun = getPrimaryRun(item.paragraph);
      const { font: markerFont } = buildFontString(markerFontRun);
      const markerText = item.marker.text ?? '';
      markerTextWidth = markerText ? measureText(markerText, markerFont, ctx) : 0;
      indentLeft = resolveIndentLeft(item);
      const indentHanging = resolveIndentHanging(item);
      markerWidth = Math.max(MIN_MARKER_GUTTER, markerTextWidth + LIST_MARKER_GAP, indentHanging);
    }

    // Account for both indentLeft and marker width so paragraph text wraps correctly
    const paragraphWidth = Math.max(1, constraints.maxWidth - indentLeft - markerWidth);

    const paragraphMeasure = await measureParagraphBlock(item.paragraph, paragraphWidth);
    totalHeight += paragraphMeasure.totalHeight;

    items.push({
      itemId: item.id,
      markerWidth,
      markerTextWidth,
      indentLeft,
      paragraph: paragraphMeasure,
    });
  }

  return {
    kind: 'list',
    items,
    totalHeight,
  };
}

const getPrimaryRun = (paragraph: ParagraphBlock): TextRun => {
  return (
    paragraph.runs.find((run): run is TextRun => run.kind === 'text' && Boolean(run.fontFamily && run.fontSize)) || {
      text: '',
      fontFamily: 'Arial',
      fontSize: 16,
    }
  );
};

const isWordChar = (char: string): boolean => {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === "'";
};

const capitalizeText = (text: string, fullText?: string, startOffset?: number): string => {
  if (!text) return text;
  const hasFullText = typeof startOffset === 'number' && fullText != null;
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const prevChar = hasFullText
      ? startOffset! + i > 0
        ? fullText![startOffset! + i - 1]
        : ''
      : i > 0
        ? text[i - 1]
        : '';
    const ch = text[i];
    result += isWordChar(ch) && !isWordChar(prevChar) ? ch.toUpperCase() : ch;
  }
  return result;
};

const applyTextTransform = (text: string, run: Run, startOffset?: number): string => {
  // Only TextRun and TabRun have textTransform (via RunMarks)
  const transform = 'textTransform' in run ? run.textTransform : undefined;
  if (!text || !transform || transform === 'none') return text;
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') {
    const fullText = 'text' in run && typeof run.text === 'string' ? run.text : text;
    return capitalizeText(text, fullText, startOffset);
  }
  return text;
};

const measureRunWidth = (
  text: string,
  font: string,
  ctx: CanvasRenderingContext2D,
  run: Run,
  startOffset?: number,
): number => {
  // TextRun.kind is optional and defaults to 'text', so check for undefined or 'text'
  const letterSpacing = run.kind === 'text' || run.kind === undefined ? (run as TextRun).letterSpacing || 0 : 0;
  const displayText = applyTextTransform(text, run, startOffset);
  const width = getMeasuredTextWidth(displayText, font, letterSpacing, ctx);
  return roundValue(width);
};

/**
 * Breaks a word that exceeds maxWidth into character-level chunks that fit within the constraint.
 *
 * This function handles the case where a single word is wider than the available line width,
 * which commonly occurs in table cells with narrow columns. Instead of letting the word overflow
 * and get clipped, this function determines where to break the word across multiple lines.
 *
 * The algorithm uses a greedy approach:
 * 1. Start with an empty chunk
 * 2. Add characters one by one, measuring the accumulated width
 * 3. When adding a character would exceed maxWidth, finalize the current chunk
 * 4. Start a new chunk with the remaining characters
 * 5. Repeat until all characters are processed
 *
 * @param word - The word to break into chunks
 * @param maxWidth - Maximum width in pixels for each chunk
 * @param font - CSS font string for measurement
 * @param ctx - Canvas context for text measurement
 * @param run - The Run object containing styling (for letterSpacing)
 * @returns Array of chunks, each containing the text and its measured width
 *
 * @example
 * // Word "Supercalifragilisticexpialidocious" in a 50px cell
 * breakWordIntoChunks("Supercalifragilisticexpialidocious", 50, "16px Arial", ctx, run)
 * // Returns: [
 * //   { text: "Super", width: 48 },
 * //   { text: "calif", width: 45 },
 * //   { text: "ragil", width: 42 },
 * //   ...
 * // ]
 */
const breakWordIntoChunks = (
  word: string,
  maxWidth: number,
  font: string,
  ctx: CanvasRenderingContext2D,
  run: Run,
  startOffset?: number,
): Array<{ text: string; width: number }> => {
  const chunks: Array<{ text: string; width: number }> = [];
  const baseOffset = typeof startOffset === 'number' ? startOffset : 0;

  // Edge case: maxWidth is too small for even a single character
  // In this case, put one character per line as a fallback
  if (maxWidth <= 0) {
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      const charWidth = measureRunWidth(char, font, ctx, run, baseOffset + i);
      chunks.push({ text: char, width: charWidth });
    }
    return chunks;
  }

  let currentChunk = '';
  let currentWidth = 0;

  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    const testChunk = currentChunk + char;
    const testWidth = measureRunWidth(testChunk, font, ctx, run, baseOffset);

    if (testWidth > maxWidth && currentChunk.length > 0) {
      // Current chunk is full, save it and start a new one
      chunks.push({ text: currentChunk, width: currentWidth });
      currentChunk = char;
      currentWidth = measureRunWidth(char, font, ctx, run, baseOffset + i);
    } else {
      // Character fits (or it's the first character and we must include it)
      currentChunk = testChunk;
      currentWidth = testWidth;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({ text: currentChunk, width: currentWidth });
  }

  return chunks;
};

/**
 * Appends a segment to a line's segments array, with optimization for consecutive segments.
 *
 * Segments represent contiguous ranges of text within a run that may have explicit positioning
 * (e.g., from tab alignment). This function handles two cases:
 * 1. Merging: If the new segment is contiguous with the last segment in the same run and has no
 *    explicit X positioning, it merges them to reduce the number of DOM elements created during rendering.
 * 2. Appending: Otherwise, it adds a new segment to the array.
 *
 * CRITICAL: Explicit X positioning (via the `x` parameter) should only be set for the FIRST word
 * after a tab character. This is enforced by the caller checking `wordIndex === 0`. Setting explicit X
 * on all words after a tab would cause incorrect text positioning, as subsequent words should flow
 * naturally from the first word's position.
 *
 * @param segments - The segments array to append to (from a Line object), or undefined if segments are not being tracked
 * @param runIndex - The index of the run this segment belongs to
 * @param fromChar - The starting character index within the run (inclusive)
 * @param toChar - The ending character index within the run (exclusive)
 * @param width - The measured width of this segment in pixels
 * @param x - Optional explicit X position for this segment. Should only be provided for the first word
 *            after a tab character to enable absolute positioning. Subsequent words should have undefined
 *            X to allow natural text flow.
 *
 * @example
 * // First word after tab - gets explicit X
 * appendSegment(line.segments, 2, 0, 5, 50, 200);
 *
 * @example
 * // Second word after tab - no explicit X (flows from first word)
 * appendSegment(line.segments, 2, 6, 12, 60, undefined);
 *
 * @example
 * // Consecutive segments get merged
 * appendSegment(line.segments, 0, 0, 5, 40, undefined);
 * appendSegment(line.segments, 0, 5, 10, 40, undefined); // Merged with previous
 */
const appendSegment = (
  segments: Line['segments'] | undefined,
  runIndex: number,
  fromChar: number,
  toChar: number,
  width: number,
  x?: number,
): void => {
  if (!segments) return;
  const last = segments[segments.length - 1];
  // Only merge segments if they are contiguous AND have no explicit X positioning
  // (explicit X means tab-aligned, shouldn't merge)
  if (last && last.runIndex === runIndex && last.toChar === fromChar && x === undefined) {
    last.toChar = toChar;
    last.width += width;
    return;
  }
  segments.push({ runIndex, fromChar, toChar, width, x });
};

const resolveLineHeight = (spacing: ParagraphSpacing | undefined, fontSize: number, maxHeight: number = -1): number => {
  let computedHeight = spacing?.line ?? WORD_SINGLE_LINE_SPACING_MULTIPLIER;
  if (spacing?.lineUnit === 'multiplier') {
    computedHeight = computedHeight * fontSize;
  }

  const lineRule = spacing?.lineRule ?? 'auto';
  if (['atLeast', 'auto'].includes(lineRule)) {
    return Math.max(computedHeight, maxHeight, WORD_SINGLE_LINE_SPACING_MULTIPLIER * fontSize);
  }
  return computedHeight;
};

const sanitizePositive = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Sanitizes indent values, preserving negative numbers.
 * Unlike sanitizePositive, this allows negative values which represent
 * text extending into the page margin area (per OOXML specification).
 *
 * @param value - The indent value to sanitize (may be undefined, NaN, or Infinity)
 * @returns The sanitized indent value (0 if invalid, preserves negative if valid)
 */
export const sanitizeIndent = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const sanitizeDecimalSeparator = (value: unknown): string => {
  if (value === ',') return ',';
  return DEFAULT_DECIMAL_SEPARATOR;
};

/**
 * Default padding around drop cap in pixels.
 * Applied to the right side of the drop cap box.
 */
const DROP_CAP_PADDING_PX = 4;

/**
 * Measure the drop cap and calculate its dimensions.
 *
 * Uses the drop cap run's font properties to measure the text width,
 * and calculates the height based on the number of lines it should span.
 *
 * @param ctx - Canvas context for text measurement
 * @param descriptor - Drop cap descriptor with run and metadata
 * @param spacing - Paragraph spacing for line height calculation
 * @returns Measured drop cap dimensions
 */
const measureDropCap = (
  ctx: CanvasRenderingContext2D,
  descriptor: DropCapDescriptor,
  spacing?: ParagraphSpacing,
): { width: number; height: number; lines: number; mode: 'drop' | 'margin' } => {
  const { run, lines, mode } = descriptor;

  // Build font string for the drop cap run
  const { font } = buildFontString({
    fontFamily: run.fontFamily,
    fontSize: run.fontSize,
    bold: run.bold,
    italic: run.italic,
  });

  // Measure the text width
  ctx.font = font;
  const displayText = applyTextTransform(run.text, run);
  const metrics = ctx.measureText(displayText);
  const advanceWidth = metrics.width;
  const paintedWidth = (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0);
  const textWidth = Math.max(advanceWidth, paintedWidth);

  // Add padding for spacing between drop cap and text
  const width = roundValue(textWidth + DROP_CAP_PADDING_PX);

  // Calculate height based on the number of lines the drop cap should span
  // This uses the base line height calculation from the paragraph's spacing
  const lineHeight = resolveLineHeight(spacing, run.fontSize);
  const height = roundValue(lineHeight * lines);

  return {
    width,
    height,
    lines,
    mode,
  };
};

const resolveIndentLeft = (item: ListBlock['items'][number]): number => {
  const indentLeft = sanitizePositive(item.paragraph.attrs?.indent?.left);
  if (indentLeft > 0) {
    return indentLeft;
  }
  return DEFAULT_LIST_INDENT_BASE + item.marker.level * DEFAULT_LIST_INDENT_STEP;
};

const resolveIndentHanging = (item: ListBlock['items'][number]): number => {
  const indentHanging = sanitizePositive(item.paragraph.attrs?.indent?.hanging);
  if (indentHanging > 0) {
    return indentHanging;
  }
  return DEFAULT_LIST_HANGING;
};

/**
 * Build tab stops in pixel coordinates for measurement.
 * Converts indent from px→twips, calls engine with twips, converts result twips→px.
 */
const buildTabStopsPx = (indent?: ParagraphIndent, tabs?: TabStop[], tabIntervalTwips?: number): TabStopPx[] => {
  // Convert indent from pixels to twips for the engine
  const paragraphIndentTwips = {
    left: pxToTwips(sanitizePositive(indent?.left)),
    right: pxToTwips(sanitizePositive(indent?.right)),
    firstLine: pxToTwips(sanitizePositive(indent?.firstLine)),
    hanging: pxToTwips(sanitizePositive(indent?.hanging)),
  };

  // Engine works in twips (tabs already in twips from PM adapter)
  const stops = computeTabStops({
    explicitStops: tabs ?? [],
    defaultTabInterval: tabIntervalTwips ?? DEFAULT_TAB_INTERVAL_TWIPS,
    paragraphIndent: paragraphIndentTwips,
  });

  // Convert resulting tab stops from twips to pixels for measurement
  return stops.map((stop) => ({
    pos: twipsToPx(stop.pos),
    val: stop.val,
    leader: stop.leader,
  }));
};

const getNextTabStopPx = (
  currentX: number,
  tabStops: TabStopPx[],
  startIndex: number,
): { target: number; nextIndex: number; stop?: TabStopPx } => {
  let index = startIndex;
  while (index < tabStops.length && tabStops[index].pos <= currentX + TAB_EPSILON) {
    index++;
  }
  if (index < tabStops.length) {
    return { target: tabStops[index].pos, nextIndex: index + 1, stop: tabStops[index] };
  }
  return { target: currentX + DEFAULT_TAB_INTERVAL_PX, nextIndex: index };
};
