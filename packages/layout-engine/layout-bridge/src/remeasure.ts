import type {
  ParagraphBlock,
  ParagraphMeasure,
  Line,
  Run,
  TextRun,
  TabStop,
  ParagraphIndent,
} from '@superdoc/contracts';
import { Engines } from '@superdoc/contracts';
import type { WordParagraphLayoutOutput } from '@superdoc/word-layout';
import {
  LIST_MARKER_GAP as _LIST_MARKER_GAP,
  SPACE_SUFFIX_GAP_PX as _SPACE_SUFFIX_GAP_PX,
  DEFAULT_TAB_INTERVAL_PX as _DEFAULT_TAB_INTERVAL_PX,
} from '@superdoc/common/layout-constants';
import { resolveListTextStartPx } from '@superdoc/common/list-marker-utils';

/**
 * Type definition for paragraph block attributes that include indentation and tab stops.
 * Extracted for cleaner type safety when accessing block.attrs.
 */
type ParagraphBlockAttrs = {
  indent?: { left?: number; right?: number; firstLine?: number; hanging?: number };
  tabs?: TabStop[];
  tabIntervalTwips?: number;
  wordLayout?: WordParagraphLayoutOutput;
  numberingProperties?: unknown;
};

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

/**
 * Retrieves or creates a canvas rendering context for text measurement.
 *
 * This function manages a singleton canvas context used across all text measurements.
 * The canvas context provides the measureText API which is essential for accurate
 * text width calculations that match browser rendering.
 *
 * @returns Canvas 2D rendering context if available in browser environment, null otherwise.
 *   Returns null in server-side rendering contexts where document is undefined.
 */
function getCtx(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  canvas = document.createElement('canvas');
  ctx = canvas.getContext('2d');
  return ctx;
}

/**
 * Type guard to determine if a run is a TextRun (has text content and formatting).
 *
 * In the SuperDoc run model, runs can be various types (text, tab, image, break, etc.).
 * TextRuns are the only runs that have text content and typography properties
 * (fontSize, fontFamily, bold, italic). This type guard enables safe access to
 * these properties by narrowing the Run union type to TextRun.
 *
 * Run types that are NOT TextRuns:
 * - tab: Represents horizontal tab character (no text content)
 * - lineBreak: Represents soft line break
 * - break: Represents page/column break
 * - fieldAnnotation: Represents field metadata
 * - image/drawing runs with 'src' property
 *
 * @param run - The run to check (can be any Run type from the union).
 * @returns True if the run is a TextRun with text content and formatting properties,
 *   false for tabs, breaks, images, and other non-text run types.
 */
function isTextRun(run: Run): run is TextRun {
  // Explicitly check for non-text run types
  if (run.kind === 'tab' || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation') {
    return false;
  }
  // Check for image/drawing runs which have 'src' property
  if ('src' in run) {
    return false;
  }
  // All other runs are text runs
  return true;
}

/**
 * Generates a CSS font string for canvas text measurement from a run's formatting.
 *
 * The canvas measureText API requires a CSS font string (e.g., "italic bold 16px Arial")
 * to accurately measure text width. This function converts SuperDoc run formatting
 * properties (fontSize, fontFamily, bold, italic) into the CSS font string format.
 *
 * CSS font string format: [style] [weight] <size> <family>
 * - style: "italic" or omitted
 * - weight: "bold" or omitted
 * - size: font size in pixels (required)
 * - family: font family name (required)
 *
 * @param run - The run containing formatting properties (fontSize, fontFamily, bold, italic).
 *   For non-text runs (tabs, breaks), uses default formatting values.
 * @returns CSS font string suitable for CanvasRenderingContext2D.font property.
 *   Example outputs: "16px Arial", "italic bold 24px Times New Roman"
 */
function fontString(run: Run): string {
  const textRun = isTextRun(run) ? run : null;
  const size = textRun?.fontSize ?? 16;
  const family = textRun?.fontFamily ?? 'Arial';
  const italic = textRun?.italic ? 'italic ' : '';
  const bold = textRun?.bold ? 'bold ' : '';
  return `${italic}${bold}${size}px ${family}`.trim();
}

/**
 * Extracts text content from a run.
 *
 * Different run types have different text content:
 * - Text runs: Have text property with string content
 * - Image/drawing runs: Have 'src' property, no text content
 * - Line breaks, breaks, field annotations: Special kinds with no text content
 *
 * @param run - The run to extract text from
 * @returns Text content of the run, or empty string for non-text runs
 */
function runText(run: Run): string {
  return 'src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation'
    ? ''
    : (run.text ?? '');
}

/**
 * Determines if a character is considered a "word character" for capitalization.
 *
 * Word characters are defined as:
 * - Digits: 0-9 (ASCII 48-57)
 * - Uppercase letters: A-Z (ASCII 65-90)
 * - Lowercase letters: a-z (ASCII 97-122)
 * - Apostrophe: ' (for contractions like "don't", "it's")
 *
 * Used by capitalizeText to determine word boundaries. A capital letter is
 * applied when a word character follows a non-word character.
 *
 * @param char - The character to check (single character string)
 * @returns True if the character is a word character, false otherwise
 *
 * @example
 * ```typescript
 * isWordChar('a');  // true
 * isWordChar('Z');  // true
 * isWordChar('5');  // true
 * isWordChar("'");  // true (for contractions)
 * isWordChar(' ');  // false
 * isWordChar('-');  // false
 * ```
 */
const isWordChar = (char: string): boolean => {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === "'";
};

/**
 * Capitalizes the first letter of each word in text.
 *
 * Implements CSS text-transform: capitalize by uppercasing the first character
 * of each word. A word is defined as any sequence of word characters (letters,
 * digits, apostrophes) preceded by a non-word character or the start of text.
 *
 * This function handles proper word boundary detection even when operating on
 * a slice of text within a larger string (via fullText and startOffset parameters),
 * ensuring correct capitalization at slice boundaries.
 *
 * @param text - The text to capitalize
 * @param fullText - Optional full text context (for proper boundary detection when text is a slice)
 * @param startOffset - Optional offset of text within fullText (required if fullText provided)
 * @returns Text with first letter of each word capitalized
 *
 * @example
 * ```typescript
 * capitalizeText("hello world");
 * // Returns: "Hello World"
 *
 * capitalizeText("don't stop");
 * // Returns: "Don't Stop"
 *
 * // With full text context for slice
 * capitalizeText("world", "hello world", 6);
 * // Returns: "world" (not "World" because 'w' is mid-word in full context)
 * ```
 */
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

/**
 * Applies CSS text-transform to text.
 *
 * Implements the CSS text-transform property values:
 * - 'uppercase': Convert all characters to uppercase
 * - 'lowercase': Convert all characters to lowercase
 * - 'capitalize': Capitalize first letter of each word (via capitalizeText)
 * - 'none': No transformation (return original text)
 *
 * Used during text measurement to apply visual transformations without mutating
 * the underlying document model. The transform is applied during rendering and
 * measurement but does not affect the stored text content.
 *
 * @param text - The text to transform
 * @param transform - CSS text-transform value ('uppercase', 'lowercase', 'capitalize', 'none', undefined)
 * @param fullText - Optional full text context (passed to capitalizeText for proper word boundaries)
 * @param startOffset - Optional offset within fullText (passed to capitalizeText)
 * @returns Transformed text, or original text if transform is 'none' or undefined
 *
 * @example
 * ```typescript
 * applyTextTransform("Hello World", "uppercase");
 * // Returns: "HELLO WORLD"
 *
 * applyTextTransform("Hello World", "lowercase");
 * // Returns: "hello world"
 *
 * applyTextTransform("hello world", "capitalize");
 * // Returns: "Hello World"
 *
 * applyTextTransform("hello", undefined);
 * // Returns: "hello" (no transformation)
 * ```
 */
const applyTextTransform = (
  text: string,
  transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none' | undefined,
  fullText?: string,
  startOffset?: number,
): string => {
  if (!text || !transform || transform === 'none') return text;
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return capitalizeText(text, fullText, startOffset);
  return text;
};

// --- Tab helpers (aligned with measuring/dom defaults) ---
const DEFAULT_TAB_INTERVAL_TWIPS = 720; // 0.5in
const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96;
const TWIPS_PER_PX = TWIPS_PER_INCH / PX_PER_INCH; // 15 twips per px

/**
 * Floating-point tolerance for tab stop comparison (0.1 pixels).
 *
 * Why this constant exists:
 * - Canvas text measurement produces floating-point widths with minor precision variations
 * - When checking if current position has passed a tab stop, exact equality is unreliable
 * - Without tolerance, tab stops at position X might be skipped when current position is X - 0.0001
 *
 * Why 0.1px was chosen:
 * - Large enough to absorb floating-point rounding errors (typically < 0.05px)
 * - Small enough to avoid incorrectly skipping legitimate tab stops
 * - Visually imperceptible at standard screen resolutions (< 1/10th of a pixel)
 *
 * Usage:
 * - When finding next tab stop: `tabStops[i].pos <= currentX + TAB_EPSILON`
 * - Ensures tab stops within 0.1px of current position are considered "reached"
 */
const TAB_EPSILON = 0.1;

/**
 * Floating-point tolerance for line breaking decisions (0.5 pixels).
 *
 * Why this constant exists:
 * - Canvas text measurement can vary slightly between measurement and rendering contexts
 * - Different browsers may round sub-pixel measurements differently
 * - Without tolerance, lines might break prematurely when text is *almost* at maxWidth
 *
 * Why 0.5px was chosen:
 * - Large enough to absorb typical floating-point rounding errors (0.1-0.3px)
 * - Small enough to be visually imperceptible at standard screen resolutions
 * - Conservative value that prevents premature line breaks without allowing significant overflow
 *
 * Usage:
 * - When checking if word fits: `width + wordWidth > effectiveMaxWidth - WIDTH_FUDGE_PX`
 * - Gives layout a 0.5px safety margin before triggering a line break
 * - Prevents edge cases where measured text at 199.7px breaks on a 200px line
 */
const WIDTH_FUDGE_PX = 0.5;
const twipsToPx = (twips: number): number => twips / TWIPS_PER_PX;
const pxToTwips = (px: number): number => Math.round(px * TWIPS_PER_PX);

type TabStopPx = { pos: number; val: TabStop['val']; leader?: TabStop['leader'] };

/**
 * Type definition for minimal marker run formatting properties.
 *
 * Used to generate font strings for marker text measurement. Contains only
 * the essential typography properties needed for canvas measurement.
 */
type MarkerRun = {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
};

/**
 * Generates a CSS font string for measuring list marker text.
 *
 * Similar to the main fontString() function but specialized for marker runs
 * which may have incomplete formatting information. Provides sensible defaults
 * for missing properties (16px Arial) to ensure measurement always succeeds.
 *
 * The CSS font string format is required by canvas.measureText() API:
 * [style] [weight] <size> <family>
 *
 * @param run - Marker run with optional formatting properties (fontFamily, fontSize, bold, italic)
 * @returns CSS font string suitable for CanvasRenderingContext2D.font property
 *
 * @example
 * ```typescript
 * markerFontString({ fontFamily: 'Arial', fontSize: 14, bold: true });
 * // Returns: "bold 14px Arial"
 *
 * markerFontString({ fontSize: 18, italic: true });
 * // Returns: "italic 18px Arial" (defaults to Arial)
 *
 * markerFontString();
 * // Returns: "16px Arial" (all defaults)
 * ```
 */
const markerFontString = (run?: MarkerRun): string => {
  const size = run?.fontSize ?? 16;
  const family = run?.fontFamily ?? 'Arial';
  const italic = run?.italic ? 'italic ' : '';
  const bold = run?.bold ? 'bold ' : '';
  return `${italic}${bold}${size}px ${family}`.trim();
};

/**
 * Build tab stop positions in pixels from OOXML tab stop specifications.
 *
 * Converts tab stops from TWIPS (the unit used in OOXML) to pixels and applies
 * paragraph indentation rules to compute the effective tab stop positions. This
 * function delegates the complex tab stop computation logic to the Engines module
 * which implements the full OOXML specification including default tab intervals,
 * explicit tab stops, and indent adjustments.
 *
 * OOXML tab stop behavior:
 * - Explicit tab stops override default tab intervals
 * - Default tab interval creates infinite grid of implicit tab stops
 * - Paragraph indents can shift or mask tab stops in the indented region
 * - Tab stops are measured from the left edge of the paragraph content area
 *
 * @param indent - Paragraph indentation settings (left, right, firstLine, hanging) in pixels.
 *   These values affect where tab stops are positioned relative to the paragraph text.
 * @param tabs - Array of explicit tab stop definitions from OOXML (position in TWIPS, alignment, leader).
 *   Each tab stop specifies a position and optional formatting (left/right/center/decimal alignment, leader dots/dashes).
 * @param tabIntervalTwips - Default tab interval in TWIPS. If not specified, uses the OOXML default of 720 TWIPS (0.5 inches).
 *   This creates a regular grid of implicit tab stops at this interval.
 * @returns Array of tab stops with positions converted to pixels, preserving alignment and leader information.
 *   Each tab stop includes: pos (position in pixels), val (alignment type), and optional leader (visual character).
 *
 * @example
 * ```typescript
 * // Create tab stops with default interval and one explicit tab at 1 inch
 * const tabStops = buildTabStopsPx(
 *   { left: 0, right: 0, firstLine: 0, hanging: 0 },
 *   [{ pos: 1440, val: 'left' }], // 1440 TWIPS = 1 inch
 *   720 // Default interval = 0.5 inch
 * );
 * // Returns: [{ pos: 96, val: 'left' }, { pos: 48, val: 'left' }, ...]
 * // (96px = 1 inch at 96dpi, 48px = 0.5 inch default interval)
 * ```
 */
const sanitizeIndentValue = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const buildTabStopsPx = (indent?: ParagraphIndent, tabs?: TabStop[], tabIntervalTwips?: number): TabStopPx[] => {
  const indentLeftPx = sanitizeIndentValue(indent?.left);
  const paragraphIndentTwips = {
    left: pxToTwips(indentLeftPx),
    right: pxToTwips(Math.max(0, indent?.right ?? 0)),
    firstLine: pxToTwips(Math.max(0, indent?.firstLine ?? 0)),
    hanging: pxToTwips(Math.max(0, indent?.hanging ?? 0)),
  };

  const stops = Engines.computeTabStops({
    explicitStops: tabs ?? [],
    defaultTabInterval: tabIntervalTwips ?? DEFAULT_TAB_INTERVAL_TWIPS,
    paragraphIndent: paragraphIndentTwips,
  });

  const leftShiftTwips = paragraphIndentTwips.left ?? 0;

  return stops.map((stop: TabStop) => ({
    pos: twipsToPx(Math.max(0, stop.pos - leftShiftTwips)),
    val: stop.val,
    leader: stop.leader,
  }));
};

/**
 * Find the next tab stop position after the current cursor position.
 *
 * Implements the OOXML tab stop resolution algorithm: searches through explicit
 * tab stops to find the first one that is strictly after the current X position,
 * accounting for floating-point precision with a small epsilon tolerance. If all
 * explicit tab stops have been exhausted, falls back to the default tab interval
 * to compute an implicit tab stop position.
 *
 * Algorithm:
 * 1. Starting from `startIndex`, iterate through `tabStops` array
 * 2. Skip any tab stops that are at or before `currentX` (within epsilon tolerance)
 * 3. Return the first tab stop position strictly after `currentX`
 * 4. If no explicit tab stop found, add default tab interval to `currentX`
 *
 * The epsilon tolerance (TAB_EPSILON = 0.1px) handles floating-point rounding
 * errors from text measurement and ensures consistent tab stop snapping behavior.
 *
 * IMPORTANT: The tabStops array must be sorted in ascending order by position.
 * This requirement is enforced by buildTabStopsPx which relies on Engines.computeTabStops
 * to produce correctly ordered tab stops. The algorithm assumes sorted order for
 * correct tab stop selection and index advancement.
 *
 * @param currentX - Current horizontal cursor position in pixels (where text currently ends).
 *   This is the reference point from which to find the next tab stop.
 * @param tabStops - Array of explicit tab stops sorted by position in ascending order.
 *   Pre-computed by buildTabStopsPx with positions in pixels.
 * @param startIndex - Index in tabStops array to begin searching from (optimization to avoid
 *   re-scanning earlier tab stops). Typically incremented as tabs are consumed.
 * @returns Object containing:
 *   - target: The X position in pixels where the tab should advance to
 *   - nextIndex: The array index to start searching from for the next tab (startIndex + consumed stops)
 *
 * @example
 * ```typescript
 * const tabStops = [{ pos: 48, val: 'left' }, { pos: 96, val: 'left' }];
 * const result = getNextTabStopPx(30, tabStops, 0);
 * // Returns: { target: 48, nextIndex: 1 }
 * // (next tab stop after position 30 is at 48px, search index advances to 1)
 *
 * const result2 = getNextTabStopPx(100, tabStops, 0);
 * // Returns: { target: 148, nextIndex: 2 }
 * // (no explicit tab after 100, falls back to 100 + default interval 48px)
 * ```
 */
const getNextTabStopPx = (
  currentX: number,
  tabStops: TabStopPx[],
  startIndex: number,
): { target: number; nextIndex: number } => {
  let index = startIndex;
  while (index < tabStops.length && tabStops[index].pos <= currentX + TAB_EPSILON) {
    index += 1;
  }
  if (index < tabStops.length) {
    return { target: tabStops[index].pos, nextIndex: index + 1 };
  }
  // default tab advance if we've exhausted explicit stops
  return { target: currentX + twipsToPx(DEFAULT_TAB_INTERVAL_TWIPS), nextIndex: index };
};

/**
 * Measures the pixel width of a slice of text within a run.
 *
 * Uses the HTML5 Canvas API to measure text width with the same precision as browser
 * text rendering. This is essential for accurate line breaking and layout calculations.
 * The measurement respects all text formatting properties (font family, size, bold, italic)
 * to produce pixel-accurate widths.
 *
 * Measurement approach:
 * - Primary: Uses canvas.measureText() for browser-accurate text measurement
 * - Fallback: Uses character count * 60% of font size for server-side rendering
 *
 * The fallback heuristic (0.6 * fontSize per character) is approximate and intended
 * only for non-browser environments where canvas is unavailable. It works reasonably
 * for Latin text in proportional fonts but will be less accurate for:
 * - Monospace fonts (should use 1.0 * fontSize)
 * - Wide characters (CJK scripts, emoji)
 * - Condensed/extended font variants
 *
 * @param run - The run containing text and formatting properties.
 * @param fromChar - Start character index (inclusive) within the run's text.
 * @param toChar - End character index (exclusive) within the run's text.
 * @returns Width of the text slice in pixels (floating-point precision for sub-pixel accuracy).
 */
function measureRunSliceWidth(run: Run, fromChar: number, toChar: number): number {
  const context = getCtx();
  const fullText = runText(run);
  // Only TextRun and TabRun have textTransform property (via RunMarks)
  const transform = isTextRun(run) ? run.textTransform : undefined;
  const text = applyTextTransform(fullText.slice(fromChar, toChar), transform, fullText, fromChar);
  if (!context) {
    // Fallback: simple proportional width (approximate)
    // When canvas context is unavailable (e.g., server-side rendering),
    // estimate character width as 60% of font size (size * 0.6).
    // This is a rough approximation based on typical proportional fonts like Arial:
    // - Average character width is ~0.5-0.7x the font size
    // - 0.6 is a middle ground that works reasonably for most Latin text
    // - For 16px font: estimated ~9.6px per character
    const textRun = isTextRun(run) ? run : null;
    const size = textRun?.fontSize ?? 16;
    return Math.max(1, text.length * (size * 0.6));
  }
  context.font = fontString(run);
  const metrics = context.measureText(text);
  return metrics.width;
}

/**
 * Calculates the line height for a range of runs based on maximum font size.
 *
 * Line height must accommodate the tallest text in the line to prevent visual overlap
 * between lines. This function scans all runs in the specified range to find the
 * maximum font size, then applies a 1.2x multiplier to provide adequate spacing for
 * ascenders and descenders.
 *
 * Why 1.2x multiplier:
 * - Provides 20% extra space above and below the font size
 * - Accommodates ascenders (h, k, l) and descenders (g, y, p) without crowding
 * - Standard CSS line-height values range from 1.2 to 1.5
 * - 1.2 is the minimum recommended for readable body text
 *
 * Limitations:
 * - This is a simplified calculation suitable for fast remeasurement
 * - Does NOT use actual font metrics (ascent, descent, lineGap)
 * - Full typography measurement (in measuring/dom) uses precise font metrics
 * - Mixed font sizes on one line: uses maximum size, may be slightly generous
 *
 * @param runs - Array of all runs in the paragraph.
 * @param fromRun - Starting run index (inclusive) for the line.
 * @param toRun - Ending run index (inclusive) for the line.
 * @returns Line height in pixels (fontSize * 1.2 of the largest font in the range).
 *   For example: 16px font returns 19.2px line height, 24px font returns 28.8px.
 */
function lineHeightForRuns(runs: Run[], fromRun: number, toRun: number): number {
  let maxSize = 0;
  for (let i = fromRun; i <= toRun; i += 1) {
    const run = runs[i];
    const textRun = run && isTextRun(run) ? run : null;
    const size = textRun?.fontSize ?? 16;
    if (size > maxSize) maxSize = size;
  }
  // Calculate line height as 120% of the maximum font size (maxSize * 1.2).
  // This multiplier provides reasonable line spacing for most text:
  // - The extra 20% accommodates descenders (g, y, p) and ascenders (h, k, l)
  //   without lines appearing cramped
  // - Standard CSS line-height values typically range from 1.2 to 1.5
  // - 1.2 is the minimum recommended for readable body text
  // - For 16px font: 16 * 1.2 = 19.2px line height
  // - For 24px heading: 24 * 1.2 = 28.8px line height
  //
  // Note: This is a simplified calculation. Full typography measurement
  // (in measuring/dom) uses actual font metrics (ascent, descent, lineGap)
  // for more accurate line heights.
  return maxSize * 1.2;
}

/**
 * Re-measure a paragraph block to fit within a specified maximum width.
 *
 * This function performs fast, canvas-based text measurement and line breaking for
 * paragraphs that need to be reflowed due to column width changes (e.g., when a
 * document transitions from single-column to multi-column layout, or when floating
 * images reduce available width). It implements a greedy line-breaking algorithm
 * with support for tab stops, indentation, and word wrapping.
 *
 * Why remeasurement is needed:
 * - Paragraphs are initially measured at document load for the widest column width
 * - When placed in narrower columns, text must reflow to fit the reduced width
 * - Floating images can further reduce available width, requiring dynamic remeasurement
 * - Remeasurement is expensive, so it's only performed when necessary (width changes)
 *
 * Measurement approach:
 * - Uses HTML5 Canvas API for accurate text width measurement (same as initial measurement)
 * - Performs greedy word-based line breaking (breaks at whitespace when text exceeds maxWidth)
 * - Respects paragraph indents (left, right, firstLine, hanging)
 * - Processes tab stops using OOXML tab stop resolution algorithm
 * - Falls back to estimated widths if canvas context is unavailable (server-side rendering)
 *
 * Limitations:
 * - Does NOT perform full typography measurement (ascent, descent, font metrics)
 * - Line height is estimated based on max font size (fontSize * 1.2)
 * - Does NOT handle complex features like drop caps, justified alignment compression, or bidirectional text
 * - Intended as a fast path for width-constrained remeasurement, not full initial measurement
 *
 * @param block - The paragraph block to measure, containing runs of text/tabs/images and formatting attributes.
 *   Must have a valid runs array with text runs that have fontSize and fontFamily properties.
 * @param maxWidth - Maximum available width in pixels for the paragraph content.
 *   This should be the column width minus left and right indents, adjusted for any floating images.
 *   Must be a positive number for meaningful line breaking.
 * @param firstLineIndent - Additional indent to apply to the first line in pixels (default: 0).
 *   Used for in-flow list markers in firstLineIndentMode where the marker consumes horizontal space
 *   on the first line. For standard hanging indent lists, this should be 0 as the marker is positioned
 *   absolutely outside the text flow.
 * @returns A ParagraphMeasure object containing:
 *   - kind: 'paragraph' (discriminator for measure type)
 *   - lines: Array of Line objects with fromRun/toRun/fromChar/toChar boundaries, width, and lineHeight
 *   - totalHeight: Sum of all line heights in pixels
 *   Note: Does NOT include full typography metrics (ascent, descent) - these are computed by the full measurer
 *
 * @throws Does not throw exceptions, but will produce degraded output if:
 *   - maxWidth is zero or negative (lines will be very narrow or degenerate)
 *   - block.runs is empty or invalid (will produce empty or minimal measure)
 *   - Canvas context is unavailable (will use fallback width estimation)
 *
 * @example
 * ```typescript
 * const block: ParagraphBlock = {
 *   kind: 'paragraph',
 *   id: 'p1',
 *   runs: [
 *     { text: 'Hello world', fontFamily: 'Arial', fontSize: 16 }
 *   ],
 *   attrs: {
 *     indent: { left: 20, right: 20, firstLine: 0, hanging: 0 }
 *   }
 * };
 *
 * // Remeasure for a narrower column width
 * const measure = remeasureParagraph(block, 200);
 * // Returns: { kind: 'paragraph', lines: [...], totalHeight: 38.4 }
 * // (text breaks into 2 lines of ~19.2px each)
 *
 * // Remeasure with first line indent for list marker
 * const measureWithIndent = remeasureParagraph(block, 200, 30);
 * // First line has only 170px available (200 - 30), subsequent lines have full 200px
 * ```
 */
export function remeasureParagraph(
  block: ParagraphBlock,
  maxWidth: number,
  firstLineIndent: number = 0,
): ParagraphMeasure {
  // Input validation: maxWidth must be positive
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    throw new Error(`remeasureParagraph: maxWidth must be a positive number, got ${maxWidth}`);
  }

  // Input validation: firstLineIndent must be a finite number
  if (!Number.isFinite(firstLineIndent)) {
    throw new Error(`remeasureParagraph: firstLineIndent must be a finite number, got ${firstLineIndent}`);
  }

  // Input validation: block must be defined
  if (!block) {
    throw new Error('remeasureParagraph: block must be defined');
  }

  // Input validation: block.runs must be an array
  if (!Array.isArray(block.runs)) {
    throw new Error(`remeasureParagraph: block.runs must be an array, got ${typeof block.runs}`);
  }

  const runs = block.runs ?? [];
  const lines: Line[] = [];
  const attrs = block.attrs as ParagraphBlockAttrs | undefined;
  const indent = attrs?.indent;
  const wordLayout = attrs?.wordLayout;
  const rawIndentLeft = indent?.left ?? 0;
  const rawIndentRight = indent?.right ?? 0;
  const indentLeft = Math.max(0, rawIndentLeft);
  const indentRight = Math.max(0, rawIndentRight);
  const indentFirstLine = Math.max(0, indent?.firstLine ?? 0);
  const indentHanging = Math.max(0, indent?.hanging ?? 0);
  const baseFirstLineOffset = firstLineIndent || indentFirstLine - indentHanging;
  const clampedFirstLineOffset = Math.max(0, baseFirstLineOffset);
  const hasNegativeIndent = rawIndentLeft < 0 || rawIndentRight < 0;
  const allowNegativeFirstLineOffset = !wordLayout?.marker && !hasNegativeIndent && baseFirstLineOffset < 0;
  const effectiveFirstLineOffset = allowNegativeFirstLineOffset ? baseFirstLineOffset : clampedFirstLineOffset;
  const contentWidth = Math.max(1, maxWidth - indentLeft - indentRight);
  // Some producers provide `marker.textStartX` without setting top-level `textStartPx`.
  // Both values represent the same concept: where the first-line text begins after the marker/tab.
  // IMPORTANT: Priority must match the painter (renderer.ts) which prefers marker.textStartX
  // because it's consistent with marker.markerX positioning. Mismatched priority causes justify overflow.
  const markerTextStartX = wordLayout?.marker?.textStartX;
  const textStartPx =
    typeof markerTextStartX === 'number' && Number.isFinite(markerTextStartX)
      ? markerTextStartX
      : typeof wordLayout?.textStartPx === 'number' && Number.isFinite(wordLayout.textStartPx)
        ? wordLayout.textStartPx
        : undefined;
  // Track measured marker text width for returning in measure.marker
  let measuredMarkerTextWidth: number | undefined;
  const resolvedTextStartPx = resolveListTextStartPx(
    wordLayout,
    indentLeft,
    indentFirstLine,
    indentHanging,
    (markerText, marker) => {
      const context = getCtx();
      if (!context) return 0;
      context.font = markerFontString(marker.run);
      const width = context.measureText(markerText).width;
      measuredMarkerTextWidth = width;
      return width;
    },
  );
  const effectiveTextStartPx = resolvedTextStartPx ?? textStartPx;
  // If numbering defines only a firstLine indent with no left/hanging, treat it as a hanging-style layout:
  // don't shrink available width in columns (matches Word which positions marker + tab but leaves normal text width).
  // IMPORTANT: If a list marker is present, the marker+tab are rendered inline, so we MUST
  // shrink the first-line width to match the painter's availableWidth.
  const treatAsHanging = !wordLayout?.marker && effectiveTextStartPx && indentLeft === 0 && indentHanging === 0;
  const firstLineWidth =
    typeof effectiveTextStartPx === 'number' && effectiveTextStartPx > indentLeft && !treatAsHanging
      ? Math.max(1, maxWidth - effectiveTextStartPx - indentRight)
      : Math.max(1, contentWidth - effectiveFirstLineOffset);
  const tabStops = buildTabStopsPx(indent as ParagraphIndent | undefined, attrs?.tabs, attrs?.tabIntervalTwips);

  let currentRun = 0;
  let currentChar = 0;

  while (currentRun < runs.length) {
    const isFirstLine = lines.length === 0;
    // For first line, reduce available width by textStart/first-line offset (e.g., for in-flow list markers)
    const effectiveMaxWidth = Math.max(1, isFirstLine ? firstLineWidth : contentWidth);
    const startRun = currentRun;
    const startChar = currentChar;
    let width = 0;
    // Track the measured width at the last valid break point (space/tab/hyphen).
    // When we wrap back to that break point, we must rewind width to avoid
    // counting overflow content in the stored line width (which would zero-out justify slack).
    let widthAtLastBreak = -1;
    let lastBreakRun = -1;
    let lastBreakChar = -1;
    let endRun = currentRun;
    let endChar = currentChar;
    let tabStopCursor = 0;
    let didBreakInThisLine = false;

    for (let r = currentRun; r < runs.length; r += 1) {
      const run = runs[r];
      if (run.kind === 'tab') {
        const { target, nextIndex } = getNextTabStopPx(width, tabStops, tabStopCursor);
        const tabAdvance = Math.max(0, target - width);
        width += tabAdvance;
        tabStopCursor = nextIndex;
        endRun = r;
        endChar = 1; // tab is treated as a single character
        lastBreakRun = r;
        lastBreakChar = 1;
        widthAtLastBreak = width;
        continue;
      }
      const text = runText(run);
      const start = r === currentRun ? currentChar : 0;
      for (let c = start; c < text.length; c += 1) {
        const w = measureRunSliceWidth(run, c, c + 1);
        if (width + w > effectiveMaxWidth - WIDTH_FUDGE_PX && width > 0) {
          // Break line
          if (lastBreakRun >= 0) {
            endRun = lastBreakRun;
            endChar = lastBreakChar;
            width = widthAtLastBreak >= 0 ? widthAtLastBreak : width;
          } else {
            endRun = r;
            endChar = c;
          }
          didBreakInThisLine = true;
          break;
        }
        width += w;
        endRun = r;
        endChar = c + 1;
        const ch = text[c];
        if (ch === ' ' || ch === '\t' || ch === '-') {
          lastBreakRun = r;
          lastBreakChar = c + 1;
          widthAtLastBreak = width;
        }
      }
      if (didBreakInThisLine) break;
    }

    // If we didn't consume any chars (e.g., very long single char), force one char
    if (startRun === endRun && startChar === endChar) {
      endRun = startRun;
      endChar = startChar + 1;
    }

    const line: Line = {
      fromRun: startRun,
      fromChar: startChar,
      toRun: endRun,
      toChar: endChar,
      width,
      ascent: 0,
      descent: 0,
      lineHeight: lineHeightForRuns(runs, startRun, endRun),
      maxWidth: effectiveMaxWidth,
    };
    lines.push(line);

    // Advance to next line start
    currentRun = endRun;
    currentChar = endChar;
    if (currentRun >= runs.length) {
      break;
    }
    if (currentChar >= runText(runs[currentRun]).length) {
      currentRun += 1;
      currentChar = 0;
    }
  }

  const totalHeight = lines.reduce((s, l) => s + l.lineHeight, 0);

  // Build marker info if this is a list paragraph
  const marker = wordLayout?.marker;
  const markerInfo = marker
    ? {
        markerWidth: marker.markerBoxWidthPx ?? indentHanging ?? 0,
        markerTextWidth: measuredMarkerTextWidth ?? 0,
        indentLeft,
        gutterWidth: marker.gutterWidthPx,
      }
    : undefined;

  return { kind: 'paragraph', lines, totalHeight, marker: markerInfo };
}
