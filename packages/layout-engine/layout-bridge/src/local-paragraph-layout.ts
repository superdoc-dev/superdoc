/**
 * Local Paragraph Layout
 *
 * Provides synchronous, fast paragraph layout using cached font metrics.
 * This is the P0 (sync, <5ms) layout path for instant cursor positioning.
 *
 * Uses simple greedy line breaking algorithm with font metrics cache
 * to avoid expensive DOM measurements.
 *
 * @module local-paragraph-layout
 */

import type { FontMetricsCache } from './font-metrics-cache';
import type { LineInfo } from './paragraph-line-cache';

/**
 * Result of local paragraph layout calculation.
 */
export interface LocalLayoutResult {
  /** Array of lines with local offsets */
  lines: LineInfo[];
  /** Total height of all lines in pixels */
  totalHeight: number;
  /** Maximum line width in pixels */
  width: number;
}

/**
 * A text run with formatting information.
 */
export interface TextRun {
  /** Text content of the run */
  text: string;
  /** Font key for this run */
  fontKey: string;
}

/**
 * LocalParagraphLayout calculates line breaks for paragraphs using
 * cached font metrics in a synchronous, fast manner.
 *
 * This is the P0 layout path used when:
 * - Full layout is stale
 * - Need immediate cursor positioning
 * - Progressive enhancement before full layout completes
 *
 * Performance target: <5ms for typical paragraphs
 *
 * Usage:
 * ```typescript
 * const layoutEngine = new LocalParagraphLayout(fontMetricsCache);
 *
 * // Single-format paragraph
 * const result = layoutEngine.layout(text, fontKey, maxWidth);
 *
 * // Multi-format paragraph
 * const runs = [
 *   { text: 'Bold', fontKey: 'Arial|16|bold|normal' },
 *   { text: ' normal', fontKey: 'Arial|16|normal|normal' }
 * ];
 * const result = layoutEngine.layoutRuns(runs, maxWidth);
 * ```
 */
export class LocalParagraphLayout {
  private fontMetricsCache: FontMetricsCache;

  /**
   * Creates a new LocalParagraphLayout instance.
   *
   * @param fontMetricsCache - Font metrics cache for character width lookup
   */
  constructor(fontMetricsCache: FontMetricsCache) {
    this.fontMetricsCache = fontMetricsCache;
  }

  /**
   * Calculate line breaks for a paragraph using cached font metrics.
   * This is the P0 (sync, <5ms) layout path.
   *
   * Uses greedy line breaking: add words until line width exceeds maxWidth,
   * then break to next line.
   *
   * @param text - Paragraph text content
   * @param fontKey - Font key for the entire paragraph
   * @param maxWidth - Maximum line width in pixels
   * @returns Layout result with line information
   */
  layout(text: string, fontKey: string, maxWidth: number): LocalLayoutResult {
    if (!text || maxWidth <= 0) {
      return { lines: [], totalHeight: 0, width: 0 };
    }

    // Ensure font is measured (this will happen automatically on first measureChar call)
    let metrics = this.fontMetricsCache.getMetrics(fontKey);
    if (!metrics) {
      // Trigger font measurement by measuring a single character
      this.fontMetricsCache.measureChar(fontKey, 'M');
      metrics = this.fontMetricsCache.getMetrics(fontKey);
    }

    if (!metrics) {
      // Still no metrics - return empty result
      return { lines: [], totalHeight: 0, width: 0 };
    }

    const lines: LineInfo[] = [];
    const lineHeight = metrics.lineHeight;
    let currentLineStart = 0;
    let currentLineWidth = 0;
    let maxLineWidth = 0;
    let i = 0;

    while (i < text.length) {
      const char = text[i];

      // Get character width
      const charWidth = this.fontMetricsCache.measureChar(fontKey, char);

      // Check if adding this character would exceed max width
      if (currentLineWidth + charWidth > maxWidth && currentLineWidth > 0) {
        // Line break needed - backtrack to last word boundary if possible
        let breakPoint = i;

        // Look backwards for a good break point (space, punctuation)
        for (let j = i - 1; j >= currentLineStart; j--) {
          const c = text[j];
          if (c === ' ' || c === '\t' || c === '-') {
            breakPoint = j + 1;
            break;
          }
        }

        // If no good break point found and line is not empty, break at current position
        if (breakPoint === i && currentLineStart < i) {
          breakPoint = i;
        }

        // Create line
        lines.push({
          localStart: currentLineStart,
          localEnd: breakPoint,
          width: currentLineWidth,
          height: lineHeight,
        });

        maxLineWidth = Math.max(maxLineWidth, currentLineWidth);

        // Start new line
        currentLineStart = breakPoint;
        currentLineWidth = 0;

        // Skip leading spaces on new line
        while (currentLineStart < text.length && text[currentLineStart] === ' ') {
          currentLineStart++;
        }

        i = currentLineStart;
        continue;
      }

      // Add character to current line
      currentLineWidth += charWidth;
      i++;

      // Handle explicit line breaks
      if (char === '\n') {
        lines.push({
          localStart: currentLineStart,
          localEnd: i,
          width: currentLineWidth - charWidth, // Don't include newline width
          height: lineHeight,
        });

        maxLineWidth = Math.max(maxLineWidth, currentLineWidth - charWidth);
        currentLineStart = i;
        currentLineWidth = 0;
      }
    }

    // Add final line if there's remaining content
    if (currentLineStart < text.length) {
      lines.push({
        localStart: currentLineStart,
        localEnd: text.length,
        width: currentLineWidth,
        height: lineHeight,
      });

      maxLineWidth = Math.max(maxLineWidth, currentLineWidth);
    }

    // Handle empty paragraph
    if (lines.length === 0) {
      lines.push({
        localStart: 0,
        localEnd: 0,
        width: 0,
        height: lineHeight,
      });
    }

    const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);

    return {
      lines,
      totalHeight,
      width: maxLineWidth,
    };
  }

  /**
   * Layout a paragraph with mixed formatting (multiple text runs).
   *
   * Each run can have different font properties. Line breaks are calculated
   * considering the varying character widths across runs.
   *
   * @param runs - Array of text runs with formatting
   * @param maxWidth - Maximum line width in pixels
   * @returns Layout result with line information
   */
  layoutRuns(runs: TextRun[], maxWidth: number): LocalLayoutResult {
    if (!runs.length || maxWidth <= 0) {
      return { lines: [], totalHeight: 0, width: 0 };
    }

    // Flatten runs into characters with their font keys
    const chars: Array<{ char: string; fontKey: string; globalIndex: number }> = [];
    let globalIndex = 0;

    for (const run of runs) {
      for (let i = 0; i < run.text.length; i++) {
        chars.push({
          char: run.text[i],
          fontKey: run.fontKey,
          globalIndex,
        });
        globalIndex++;
      }
    }

    if (chars.length === 0) {
      // Get font key from first run for empty paragraph height
      const fontKey = runs[0]?.fontKey ?? 'Arial|16|normal|normal';
      const metrics = this.fontMetricsCache.getMetrics(fontKey);
      const lineHeight = metrics?.lineHeight ?? 20;

      return {
        lines: [{ localStart: 0, localEnd: 0, width: 0, height: lineHeight }],
        totalHeight: lineHeight,
        width: 0,
      };
    }

    const lines: LineInfo[] = [];
    const firstFontKey = chars[0].fontKey;
    const metrics = this.fontMetricsCache.getMetrics(firstFontKey);
    const lineHeight = metrics?.lineHeight ?? 20;

    let currentLineStart = 0;
    let currentLineWidth = 0;
    let maxLineWidth = 0;
    let i = 0;

    while (i < chars.length) {
      const { char, fontKey } = chars[i];

      // Get character width from appropriate font
      const charWidth = this.fontMetricsCache.measureChar(fontKey, char);

      // Check if adding this character would exceed max width
      if (currentLineWidth + charWidth > maxWidth && currentLineWidth > 0) {
        // Line break needed - backtrack to last word boundary if possible
        let breakPoint = i;

        // Look backwards for a good break point
        for (let j = i - 1; j >= currentLineStart; j--) {
          const c = chars[j].char;
          if (c === ' ' || c === '\t' || c === '-') {
            breakPoint = j + 1;
            break;
          }
        }

        // Create line
        lines.push({
          localStart: chars[currentLineStart].globalIndex,
          localEnd: chars[breakPoint]?.globalIndex ?? chars[i].globalIndex,
          width: currentLineWidth,
          height: lineHeight,
        });

        maxLineWidth = Math.max(maxLineWidth, currentLineWidth);

        // Start new line
        currentLineStart = breakPoint;
        currentLineWidth = 0;

        // Skip leading spaces on new line
        while (currentLineStart < chars.length && chars[currentLineStart].char === ' ') {
          currentLineStart++;
        }

        i = currentLineStart;
        continue;
      }

      // Add character to current line
      currentLineWidth += charWidth;
      i++;

      // Handle explicit line breaks
      if (char === '\n') {
        lines.push({
          localStart: chars[currentLineStart].globalIndex,
          localEnd: chars[i]?.globalIndex ?? globalIndex,
          width: currentLineWidth - charWidth,
          height: lineHeight,
        });

        maxLineWidth = Math.max(maxLineWidth, currentLineWidth - charWidth);
        currentLineStart = i;
        currentLineWidth = 0;
      }
    }

    // Add final line if there's remaining content
    if (currentLineStart < chars.length) {
      lines.push({
        localStart: chars[currentLineStart].globalIndex,
        localEnd: globalIndex,
        width: currentLineWidth,
        height: lineHeight,
      });

      maxLineWidth = Math.max(maxLineWidth, currentLineWidth);
    }

    const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);

    return {
      lines,
      totalHeight,
      width: maxLineWidth,
    };
  }

  /**
   * Estimate paragraph height without full layout.
   *
   * Uses average character width and line height to quickly estimate
   * how tall a paragraph will be. Useful for scroll calculations.
   *
   * @param textLength - Number of characters in paragraph
   * @param fontKey - Font key for the paragraph
   * @param maxWidth - Maximum line width in pixels
   * @returns Estimated height in pixels
   */
  estimateHeight(textLength: number, fontKey: string, maxWidth: number): number {
    const metrics = this.fontMetricsCache.getMetrics(fontKey);
    if (!metrics) {
      return 20; // Default fallback
    }

    const avgCharWidth = metrics.avgCharWidth;
    const lineHeight = metrics.lineHeight;

    // Estimate characters per line
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));

    // Estimate line count
    const lineCount = Math.max(1, Math.ceil(textLength / charsPerLine));

    return lineCount * lineHeight;
  }
}
