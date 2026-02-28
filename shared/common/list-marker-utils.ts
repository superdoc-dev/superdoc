/**
 * Shared utilities for list marker positioning and text start calculation.
 *
 * This module provides a unified implementation of list marker text positioning logic
 * that is used consistently across the measuring and layout subsystems. The core
 * function `resolveListTextStartPx` determines where paragraph text begins after
 * accounting for list markers, tabs, and various justification modes.
 *
 * This module is extracted to ensure consistency across:
 * - remeasure.ts (fast canvas-based remeasurement)
 * - list-indent-utils.ts (layout bridge utilities)
 * - measuring/dom/src/index.ts (full typography measurement)
 */

import { LIST_MARKER_GAP, SPACE_SUFFIX_GAP_PX, DEFAULT_TAB_INTERVAL_PX } from './layout-constants.js';

/**
 * Minimal marker run formatting information for text measurement.
 */
export type MinimalMarkerRun = {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
};

/**
 * Minimal marker information required for text start calculation.
 *
 * This type represents the essential properties needed from a marker object
 * to calculate where text should start after the marker. It's designed to be
 * compatible with various marker representations across different subsystems.
 */
export type MinimalMarker = {
  /** Pre-measured width of the entire marker box in pixels */
  markerBoxWidthPx?: number;
  /** Pre-measured width of the marker glyph/text in pixels */
  glyphWidthPx?: number;
  /** Horizontal position where marker is drawn (used in firstLineIndentMode) */
  markerX?: number;
  /** Horizontal position where text should start (used in firstLineIndentMode) */
  textStartX?: number;
  /** Width of the gutter between marker and text (used for center/right justification) */
  gutterWidthPx?: number;
  /** Marker justification: 'left', 'center', or 'right' */
  justification?: string;
  /** What follows the marker: 'tab', 'space', or 'nothing' */
  suffix?: string;
  /** The text content of the marker (for measurement if glyphWidthPx not available) */
  markerText?: string;
  /** Formatting information for the marker (for measurement if needed) */
  run?: MinimalMarkerRun;
};

/**
 * Minimal word layout configuration for text start calculation.
 *
 * Contains the subset of word layout properties needed to determine text positioning.
 */
export type MinimalWordLayout = {
  /** Whether this list uses first-line indent mode (input-rule created lists) */
  firstLineIndentMode?: boolean;
  /** Pre-calculated horizontal position where text should start */
  textStartPx?: number;
  /** Array of tab stop positions in pixels (for firstLineIndentMode) */
  tabsPx?: number[];
  /** Marker information */
  marker?: MinimalMarker;
};

/**
 * Function type for measuring marker text width.
 *
 * Different subsystems use different text measurement approaches:
 * - remeasure.ts: Canvas-based measurement with getCtx()
 * - measuring/dom: Canvas-based measurement with cached context
 * - list-indent-utils: May not have access to canvas, provides markerWidth parameter
 */
export type MarkerTextMeasurer = (markerText: string, marker: MinimalMarker) => number;

/**
 * Resolves the horizontal pixel position where list item text should start.
 *
 * This is the authoritative implementation of list marker text positioning logic,
 * used across all measurement and layout subsystems. It handles multiple rendering modes:
 *
 * **Standard Hanging Indent Mode:**
 * - Marker positioned in hanging indent area (absolute positioning)
 * - Text starts at paraIndentLeft
 * - Tab after marker advances to next tab stop or firstLine indent position
 *
 * **First-Line Indent Mode (input-rule created lists):**
 * - Marker positioned at paraIndentLeft + firstLine (inline with text flow)
 * - Tab after marker advances to first available tab stop or textStartPx
 * - Matches Word's rendering behavior for auto-numbered lists
 *
 * **Suffix Handling:**
 * - 'space': Add SPACE_SUFFIX_GAP_PX (4px) gap after marker
 * - 'nothing': Text immediately follows marker with no gap
 * - 'tab': Advance to next tab stop or calculated position
 *
 * **Justification Modes:**
 * - 'left': Standard tab-based spacing
 * - 'center'/'right': Use gutterWidthPx with minimum of LIST_MARKER_GAP
 *
 * Algorithm:
 * 1. Determine marker text width (use glyphWidthPx if available, otherwise measure or use markerBoxWidth)
 * 2. Calculate marker start position (markerX for firstLineIndentMode, else paraIndentLeft - hanging + firstLine)
 * 3. Apply suffix-specific spacing:
 *    - 'space': markerStart + markerWidth + SPACE_SUFFIX_GAP_PX
 *    - 'nothing': markerStart + markerWidth
 *    - 'tab': Calculate tab width based on mode and justification
 * 4. For 'tab' suffix with center/right justification: use gutterWidth
 * 5. For 'tab' suffix with left justification in firstLineIndentMode: find next tab stop or use textStartX
 * 6. For 'tab' suffix with left justification in standard mode: calculate tab to firstLine indent
 *
 * @param wordLayout - Word layout configuration containing marker info and positioning mode
 * @param indentLeft - Left paragraph indent in pixels (base position for standard mode)
 * @param firstLine - First-line indent in pixels (offset from left indent)
 * @param hanging - Hanging indent in pixels (creates space for marker in standard mode)
 * @param measureMarkerText - Function to measure marker text width if glyphWidthPx not available.
 *   Should return width in pixels. For list-indent-utils, can return provided markerWidth fallback.
 * @returns Horizontal pixel position where text content should begin, or undefined if no marker present.
 *   This value represents the X coordinate from the left edge of the paragraph content area.
 *
 * @example
 * ```typescript
 * // Standard hanging indent list (marker in margin)
 * const textStart = resolveListTextStartPx(
 *   {
 *     marker: {
 *       glyphWidthPx: 20,
 *       suffix: 'tab',
 *       justification: 'left'
 *     }
 *   },
 *   36,  // indentLeft
 *   0,   // firstLine
 *   18,  // hanging
 *   () => 20  // measureMarkerText (not called since glyphWidthPx provided)
 * );
 * // Returns: ~36 (text starts at indentLeft after tab)
 * ```
 *
 * @example
 * ```typescript
 * // First-line indent mode list (input-rule created)
 * const textStart = resolveListTextStartPx(
 *   {
 *     firstLineIndentMode: true,
 *     marker: {
 *       markerX: 0,
 *       glyphWidthPx: 18,
 *       textStartX: 48,
 *       suffix: 'tab',
 *       justification: 'left'
 *     }
 *   },
 *   0,   // indentLeft
 *   0,   // firstLine
 *   0,   // hanging
 *   () => 18
 * );
 * // Returns: 48 (from textStartX)
 * ```
 *
 * @example
 * ```typescript
 * // Space suffix (rare but valid)
 * const textStart = resolveListTextStartPx(
 *   {
 *     marker: {
 *       glyphWidthPx: 15,
 *       suffix: 'space',
 *       markerX: 0
 *     },
 *     firstLineIndentMode: true
 *   },
 *   0, 0, 0,
 *   () => 15
 * );
 * // Returns: 19 (markerX:0 + glyphWidth:15 + SPACE_SUFFIX_GAP_PX:4)
 * ```
 */
export function resolveListTextStartPx(
  wordLayout: MinimalWordLayout | undefined,
  indentLeft: number,
  firstLine: number,
  hanging: number,
  measureMarkerText: MarkerTextMeasurer,
): number | undefined {
  const marker = wordLayout?.marker;
  if (!marker) {
    const textStartPx =
      wordLayout?.firstLineIndentMode === true &&
      typeof wordLayout.textStartPx === 'number' &&
      Number.isFinite(wordLayout.textStartPx)
        ? wordLayout.textStartPx
        : undefined;
    return textStartPx;
  }

  // Step 1: Determine marker box width (fallback for text width if needed)
  const markerBoxWidth =
    typeof marker.markerBoxWidthPx === 'number' && Number.isFinite(marker.markerBoxWidthPx)
      ? marker.markerBoxWidthPx
      : 0;

  // Step 2: Determine marker text width
  let markerTextWidth =
    typeof marker.glyphWidthPx === 'number' && Number.isFinite(marker.glyphWidthPx) ? marker.glyphWidthPx : undefined;

  // If glyphWidthPx not available and marker has text, measure it
  if (markerTextWidth == null && marker.markerText) {
    markerTextWidth = measureMarkerText(marker.markerText, marker);
  }

  // Fallback to marker box width if measurement failed or unavailable
  if (!Number.isFinite(markerTextWidth) || (markerTextWidth !== undefined && markerTextWidth < 0)) {
    markerTextWidth = markerBoxWidth;
  }

  // Ensure non-negative width (markerTextWidth is guaranteed to be a number here)
  const finalMarkerTextWidth = Math.max(0, markerTextWidth ?? 0);

  // Step 3: Determine marker start position
  let markerStartPos: number;
  if (
    wordLayout?.firstLineIndentMode === true &&
    typeof marker.markerX === 'number' &&
    Number.isFinite(marker.markerX)
  ) {
    // First-line indent mode: marker positioned at markerX
    markerStartPos = marker.markerX;
  } else {
    // Standard mode: marker in hanging indent area
    markerStartPos = indentLeft - hanging + firstLine;
  }

  // Validate marker start position
  if (!Number.isFinite(markerStartPos)) {
    markerStartPos = 0;
  }

  // Current horizontal position after marker
  const currentPos = markerStartPos + finalMarkerTextWidth;
  const suffix = marker.suffix ?? 'tab';

  // Step 4: Handle 'space' suffix
  if (suffix === 'space') {
    return markerStartPos + finalMarkerTextWidth + SPACE_SUFFIX_GAP_PX;
  }

  // Step 5: Handle 'nothing' suffix
  if (suffix === 'nothing') {
    return markerStartPos + finalMarkerTextWidth;
  }

  // Step 6: Handle 'tab' suffix with justification
  const markerJustification = marker.justification ?? 'left';
  // Use the larger of box vs glyph as the effective marker width to ensure we clear the rendered box
  const markerWidthEffective = Math.max(
    typeof marker.markerBoxWidthPx === 'number' && Number.isFinite(marker.markerBoxWidthPx)
      ? marker.markerBoxWidthPx
      : 0,
    finalMarkerTextWidth,
  );

  // Center/right justification: use gutter width
  if (markerJustification !== 'left') {
    const gutterWidth =
      typeof marker.gutterWidthPx === 'number' && Number.isFinite(marker.gutterWidthPx) && marker.gutterWidthPx > 0
        ? marker.gutterWidthPx
        : LIST_MARKER_GAP;
    return markerStartPos + finalMarkerTextWidth + Math.max(gutterWidth, LIST_MARKER_GAP);
  }

  // Step 7: Left justification with 'tab' suffix in first-line indent mode
  if (wordLayout?.firstLineIndentMode === true) {
    // Find next tab stop after marker
    let targetTabStop: number | undefined;
    if (Array.isArray(wordLayout.tabsPx)) {
      for (const tab of wordLayout.tabsPx) {
        if (typeof tab === 'number' && tab > currentPos) {
          targetTabStop = tab;
          break;
        }
      }
    }

    // Determine text start target (prefer textStartX over textStartPx)
    const textStartTarget =
      typeof marker.textStartX === 'number' && Number.isFinite(marker.textStartX)
        ? marker.textStartX
        : wordLayout.textStartPx;

    // Calculate tab width
    let tabWidth: number;
    if (targetTabStop !== undefined) {
      // Use explicit tab stop
      tabWidth = targetTabStop - currentPos;
    } else if (textStartTarget !== undefined && Number.isFinite(textStartTarget) && textStartTarget > currentPos) {
      // Use pre-calculated text start position
      tabWidth = textStartTarget - currentPos;
    } else {
      // Fallback to minimum gap
      tabWidth = LIST_MARKER_GAP;
    }

    // Enforce minimum tab width
    if (tabWidth < LIST_MARKER_GAP) {
      tabWidth = LIST_MARKER_GAP;
    }

    return markerStartPos + finalMarkerTextWidth + tabWidth;
  }

  // Step 8: Left justification with 'tab' suffix in standard mode
  const textStartTarget =
    typeof wordLayout?.textStartPx === 'number' && Number.isFinite(wordLayout.textStartPx)
      ? wordLayout.textStartPx
      : undefined;
  const gutterWidth =
    typeof marker.gutterWidthPx === 'number' && Number.isFinite(marker.gutterWidthPx) && marker.gutterWidthPx > 0
      ? marker.gutterWidthPx
      : LIST_MARKER_GAP;
  const currentPosStandard = markerStartPos + markerWidthEffective;

  // Check for explicit tab stops past the marker position.
  // The renderer uses these to position the tab after the list marker, so the measurer
  // must also account for them to avoid a width mismatch that causes extreme negative word-spacing.
  let explicitTabStop: number | undefined;
  if (Array.isArray(wordLayout?.tabsPx)) {
    for (const tab of wordLayout.tabsPx) {
      if (typeof tab === 'number' && tab > currentPosStandard) {
        explicitTabStop = tab;
        break;
      }
    }
  }

  if (explicitTabStop !== undefined) {
    // Use the explicit tab stop — this matches the renderer's computeTabWidth() behavior
    return explicitTabStop;
  }

  if (textStartTarget !== undefined) {
    const gap = Math.max(textStartTarget - currentPosStandard, gutterWidth);
    return currentPosStandard + gap;
  }

  const textStart = indentLeft + firstLine;
  let tabWidth = textStart - currentPosStandard;

  // Hanging-overflow safeguard: marker overruns the hanging space.
  // Advance to the next default tab stop, matching the renderer's computeTabWidth() behavior.
  // The renderer advances to the next 48px-aligned position when no explicit tab stop
  // is found past the marker. Using LIST_MARKER_GAP instead would create a measurer/renderer
  // width mismatch that causes incorrect negative word-spacing on justified lines.
  if (tabWidth <= 0) {
    const nextDefaultTab =
      currentPosStandard + DEFAULT_TAB_INTERVAL_PX - (currentPosStandard % DEFAULT_TAB_INTERVAL_PX);
    tabWidth = nextDefaultTab - currentPosStandard;
  }

  return currentPosStandard + tabWidth;
}
