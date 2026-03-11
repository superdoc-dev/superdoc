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
 * Resolved list prefix geometry for a single numbered or bulleted paragraph line.
 *
 * All coordinates are measured from the left edge of the paragraph content area.
 */
export type ResolvedListMarkerGeometry = {
  /** Left edge where the visible marker glyph should be painted. */
  markerStartPx: number;
  /** Visible marker glyph width in pixels. */
  markerTextWidthPx: number;
  /** Horizontal position where paragraph text begins after marker + suffix. */
  textStartPx: number;
  /** Width contributed by the suffix separator (tab, space, or nothing). */
  suffixWidthPx: number;
};

const getFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
};

const getNonNegativeFiniteNumber = (value: unknown): number | undefined => {
  const numericValue = getFiniteNumber(value);
  if (numericValue == null || numericValue < 0) {
    return undefined;
  }
  return numericValue;
};

const getMarkerTextWidthPx = (marker: MinimalMarker, measureMarkerText: MarkerTextMeasurer): number => {
  const glyphWidthPx = getNonNegativeFiniteNumber(marker.glyphWidthPx);
  if (glyphWidthPx != null) {
    return glyphWidthPx;
  }

  if (marker.markerText) {
    const measuredWidthPx = measureMarkerText(marker.markerText, marker);
    const safeMeasuredWidthPx = getNonNegativeFiniteNumber(measuredWidthPx);
    if (safeMeasuredWidthPx != null) {
      return safeMeasuredWidthPx;
    }
  }

  return getNonNegativeFiniteNumber(marker.markerBoxWidthPx) ?? 0;
};

const getMarkerBoxWidthPx = (marker: MinimalMarker, markerTextWidthPx: number): number =>
  Math.max(getNonNegativeFiniteNumber(marker.markerBoxWidthPx) ?? 0, markerTextWidthPx);

const getExplicitFirstLineMarkerStartPx = (
  wordLayout: MinimalWordLayout | undefined,
  marker: MinimalMarker,
): number | undefined => {
  if (wordLayout?.firstLineIndentMode !== true) {
    return undefined;
  }

  return getFiniteNumber(marker.markerX);
};

const getMarkerAnchorPx = (indentLeft: number, firstLine: number, hanging: number): number =>
  indentLeft - hanging + firstLine;

const getMarkerStartPx = (anchorPx: number, justification: string, markerTextWidthPx: number): number => {
  if (justification === 'right') {
    return anchorPx - markerTextWidthPx;
  }
  if (justification === 'center') {
    return anchorPx - markerTextWidthPx / 2;
  }
  return anchorPx;
};

const getNextExplicitTabStopPx = (tabsPx: number[] | undefined, currentPosPx: number): number | undefined => {
  if (!Array.isArray(tabsPx)) {
    return undefined;
  }

  for (const tabPx of tabsPx) {
    if (typeof tabPx === 'number' && Number.isFinite(tabPx) && tabPx > currentPosPx) {
      return tabPx;
    }
  }

  return undefined;
};

const getFirstLineTextStartTargetPx = (
  wordLayout: MinimalWordLayout | undefined,
  marker: MinimalMarker,
): number | undefined => {
  return getFiniteNumber(marker.textStartX) ?? getFiniteNumber(wordLayout?.textStartPx);
};

const getNextDefaultTabStopPx = (currentPosPx: number): number => {
  const remainderPx = currentPosPx % DEFAULT_TAB_INTERVAL_PX;
  if (remainderPx === 0) {
    return currentPosPx + DEFAULT_TAB_INTERVAL_PX;
  }
  return currentPosPx + DEFAULT_TAB_INTERVAL_PX - remainderPx;
};

const getMinimumReadableTextStartPx = (markerContentEndPx: number, gutterWidthPx: number): number =>
  markerContentEndPx + gutterWidthPx;

const resolveExplicitStandardTextStartPx = (
  explicitTextStartPx: number | undefined,
  markerContentEndPx: number,
  gutterWidthPx: number,
): number | undefined => {
  if (explicitTextStartPx == null) {
    return undefined;
  }

  if (explicitTextStartPx > markerContentEndPx) {
    return explicitTextStartPx;
  }

  if (explicitTextStartPx > 0) {
    return getMinimumReadableTextStartPx(markerContentEndPx, gutterWidthPx);
  }

  return undefined;
};

/**
 * Resolves full marker geometry for a list prefix on a paragraph line.
 *
 * This is the canonical geometry source for marker start, suffix width, and
 * paragraph text start. Measurement and painting should both use this helper
 * so they stay aligned on numbered-list first lines.
 *
 * @param wordLayout - Word list layout metadata for the paragraph
 * @param indentLeft - Paragraph left indent in pixels
 * @param firstLine - Paragraph first-line indent in pixels
 * @param hanging - Paragraph hanging indent in pixels
 * @param measureMarkerText - Callback used when marker glyph width is not precomputed
 * @returns Resolved list prefix geometry, or undefined when the paragraph has no marker
 */
export function resolveListMarkerGeometry(
  wordLayout: MinimalWordLayout | undefined,
  indentLeft: number,
  firstLine: number,
  hanging: number,
  measureMarkerText: MarkerTextMeasurer,
): ResolvedListMarkerGeometry | undefined {
  const marker = wordLayout?.marker;
  if (!marker) {
    return undefined;
  }

  const markerTextWidthPx = getMarkerTextWidthPx(marker, measureMarkerText);
  const markerBoxWidthPx = getMarkerBoxWidthPx(marker, markerTextWidthPx);
  const justification = marker.justification ?? 'left';
  const explicitFirstLineMarkerStartPx = getExplicitFirstLineMarkerStartPx(wordLayout, marker);
  const anchorPx = getMarkerAnchorPx(indentLeft, firstLine, hanging);
  const markerStartPx = explicitFirstLineMarkerStartPx ?? getMarkerStartPx(anchorPx, justification, markerTextWidthPx);
  const markerContentEndPx = markerStartPx + markerTextWidthPx;
  const suffix = marker.suffix ?? 'tab';

  if (suffix === 'nothing') {
    return {
      markerStartPx,
      markerTextWidthPx,
      textStartPx: markerContentEndPx,
      suffixWidthPx: 0,
    };
  }

  if (suffix === 'space') {
    return {
      markerStartPx,
      markerTextWidthPx,
      textStartPx: markerContentEndPx + SPACE_SUFFIX_GAP_PX,
      suffixWidthPx: SPACE_SUFFIX_GAP_PX,
    };
  }

  if (justification !== 'left') {
    const gutterWidthPx = Math.max(getNonNegativeFiniteNumber(marker.gutterWidthPx) ?? 0, LIST_MARKER_GAP);
    return {
      markerStartPx,
      markerTextWidthPx,
      textStartPx: markerContentEndPx + gutterWidthPx,
      suffixWidthPx: gutterWidthPx,
    };
  }

  if (wordLayout?.firstLineIndentMode === true) {
    const explicitTabStopPx = getNextExplicitTabStopPx(wordLayout.tabsPx, markerContentEndPx);
    const textStartTargetPx = getFirstLineTextStartTargetPx(wordLayout, marker);

    let textStartPx: number;
    if (explicitTabStopPx != null) {
      textStartPx = explicitTabStopPx;
    } else if (textStartTargetPx != null && textStartTargetPx > markerContentEndPx) {
      textStartPx = textStartTargetPx;
    } else {
      textStartPx = markerContentEndPx + LIST_MARKER_GAP;
    }

    if (textStartPx - markerContentEndPx < LIST_MARKER_GAP) {
      textStartPx = markerContentEndPx + LIST_MARKER_GAP;
    }

    return {
      markerStartPx,
      markerTextWidthPx,
      textStartPx,
      suffixWidthPx: textStartPx - markerContentEndPx,
    };
  }

  // Standard hanging-indent: text lands at the hanging-indent text start (indent.left),
  // NOT at the next paragraph tab stop. Paragraph tab stops in tabsPx are for inline
  // w:tab characters later in the run — they must not be consumed here.
  //
  // Gap: w:doNotUseIndentAsNumberingTabStop and w:noTabHangInd can opt out of this
  // behavior, but those compat flags are not yet plumbed through the word-layout
  // contract. Until they are, this unconditionally assumes the default Word mode.
  // That is correct for the vast majority of documents.
  const gutterWidthPx = Math.max(getNonNegativeFiniteNumber(marker.gutterWidthPx) ?? 0, LIST_MARKER_GAP);
  const explicitTextStartPx = resolveExplicitStandardTextStartPx(
    getFiniteNumber(wordLayout?.textStartPx),
    markerContentEndPx,
    gutterWidthPx,
  );
  if (explicitTextStartPx != null) {
    return {
      markerStartPx,
      markerTextWidthPx,
      textStartPx: explicitTextStartPx,
      suffixWidthPx: explicitTextStartPx - markerContentEndPx,
    };
  }

  const markerBoxEndPx = markerStartPx + markerBoxWidthPx;
  const implicitTextStartPx = indentLeft + firstLine;
  let textStartPx = implicitTextStartPx;
  if (textStartPx <= markerBoxEndPx) {
    textStartPx = getNextDefaultTabStopPx(markerBoxEndPx);
  }

  return {
    markerStartPx,
    markerTextWidthPx,
    textStartPx,
    suffixWidthPx: textStartPx - markerContentEndPx,
  };
}

/**
 * Convenience wrapper that returns only the text-start X coordinate from
 * {@link resolveListMarkerGeometry}. Falls back to `wordLayout.textStartPx`
 * for firstLineIndentMode paragraphs that have no marker.
 *
 * @param wordLayout - Word list layout metadata for the paragraph
 * @param indentLeft - Paragraph left indent in pixels
 * @param firstLine - Paragraph first-line indent in pixels
 * @param hanging - Paragraph hanging indent in pixels
 * @param measureMarkerText - Callback used when marker glyph width is not precomputed
 * @returns Horizontal pixel position where text content should begin, or undefined if no marker present
 */
export function resolveListTextStartPx(
  wordLayout: MinimalWordLayout | undefined,
  indentLeft: number,
  firstLine: number,
  hanging: number,
  measureMarkerText: MarkerTextMeasurer,
): number | undefined {
  const geometry = resolveListMarkerGeometry(wordLayout, indentLeft, firstLine, hanging, measureMarkerText);
  if (geometry) {
    return geometry.textStartPx;
  }

  if (wordLayout?.firstLineIndentMode === true) {
    return getFiniteNumber(wordLayout.textStartPx);
  }

  return undefined;
}
