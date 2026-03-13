import {
  resolveListMarkerGeometry,
  resolveListTextStartPx,
  type MinimalMarker,
  type MinimalWordLayout,
  type ResolvedListMarkerGeometry,
} from '@superdoc/common/list-marker-utils';

/**
 * Default tab interval in pixels (0.5 inch at 96 DPI).
 * Used by the legacy painter path for marker suffix tabs that do not yet route
 * through the shared list geometry helper.
 */
const DEFAULT_TAB_INTERVAL_PX = 48;

type PainterListTextStartParams = {
  wordLayout: MinimalWordLayout | undefined;
  indentLeftPx: number;
  hangingIndentPx: number;
  firstLineIndentPx: number;
  markerTextWidthPx?: number;
};

const getFiniteNonNegativeNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
};

/**
 * Resolves marker width using the already-measured glyph width from layout whenever possible.
 */
const resolvePainterMarkerTextWidth = (
  markerTextWidthPx: number | undefined,
  marker: { glyphWidthPx?: number; markerBoxWidthPx?: number },
): number =>
  getFiniteNonNegativeNumber(markerTextWidthPx) ??
  getFiniteNonNegativeNumber(marker.glyphWidthPx) ??
  getFiniteNonNegativeNumber(marker.markerBoxWidthPx) ??
  0;

/**
 * Resolves the canonical marker geometry for a list first line while letting the
 * painter reuse the measured marker glyph width instead of remeasuring text.
 */
export const resolvePainterListMarkerGeometry = ({
  wordLayout,
  indentLeftPx,
  hangingIndentPx,
  firstLineIndentPx,
  markerTextWidthPx,
}: PainterListTextStartParams): ResolvedListMarkerGeometry | undefined =>
  resolveListMarkerGeometry(
    wordLayout,
    indentLeftPx,
    firstLineIndentPx,
    hangingIndentPx,
    (_markerText: string, marker: MinimalMarker) => resolvePainterMarkerTextWidth(markerTextWidthPx, marker),
  );

/**
 * Resolves the canonical text-start position for a list first line while letting
 * the painter reuse the measured marker glyph width instead of remeasuring text.
 */
export const resolvePainterListTextStartPx = ({
  wordLayout,
  indentLeftPx,
  hangingIndentPx,
  firstLineIndentPx,
  markerTextWidthPx,
}: PainterListTextStartParams): number | undefined =>
  resolveListTextStartPx(
    wordLayout,
    indentLeftPx,
    firstLineIndentPx,
    hangingIndentPx,
    (_markerText: string, marker: MinimalMarker) => resolvePainterMarkerTextWidth(markerTextWidthPx, marker),
  );

/**
 * Compute the width of the tab separator between a list marker and its text content.
 *
 * This legacy painter path is still used for marker modes whose rendering contract
 * differs from the shared geometry helper today, such as right/center-justified
 * markers and firstLineIndentMode paragraphs.
 */
export const computeTabWidth = (
  currentPos: number,
  justification: string,
  tabs: number[] | undefined,
  hangingIndent: number | undefined,
  firstLineIndent: number | undefined,
  leftIndent: number,
): number => {
  const nextDefaultTabStop = currentPos + DEFAULT_TAB_INTERVAL_PX - (currentPos % DEFAULT_TAB_INTERVAL_PX);
  let tabWidth: number;
  if (justification === 'left') {
    const explicitTabs = [...(tabs ?? [])];
    if (hangingIndent && hangingIndent > 0) {
      explicitTabs.push(leftIndent);
      explicitTabs.sort((a, b) => a - b);
    }
    let targetTabStop: number | undefined;

    for (const tab of explicitTabs) {
      if (tab > currentPos) {
        targetTabStop = tab;
        break;
      }
    }

    if (targetTabStop === undefined) {
      targetTabStop = nextDefaultTabStop;
    }
    tabWidth = targetTabStop - currentPos;
  } else if (justification === 'right') {
    if (firstLineIndent != null && firstLineIndent > 0) {
      tabWidth = nextDefaultTabStop - currentPos;
    } else {
      tabWidth = hangingIndent ?? 0;
    }
  } else {
    tabWidth = nextDefaultTabStop - currentPos;
  }
  return tabWidth;
};
