import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { toCssFontFamily } from '@superdoc/font-utils';
import {
  resolveListMarkerGeometry,
  resolveListTextStartPx,
  computeTabWidth,
  type MinimalMarker,
  type MinimalWordLayout,
  type ResolvedListMarkerGeometry,
} from '@superdoc/common/list-marker-utils';
import { applySourceAnchorDataset } from '../renderer';
import { SourceAnchor } from '@superdoc/contracts';

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

// Re-export computeTabWidth from shared module
export { computeTabWidth };

type MarkerRunStyle = {
  fontFamily?: string | null;
  fontSize?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  color?: string | null;
  letterSpacing?: number | null;
};

/**
 * Build the marker container `<span class="superdoc-list-marker">` with the inner
 * `<span class="superdoc-paragraph-marker">` already appended and styled from the
 * given run. Callers handle positioning, suffix separators, and the final prepend.
 */
export const createListMarkerElement = (
  doc: Document,
  markerText: string,
  run: MarkerRunStyle,
  sourceAnchor?: SourceAnchor,
): HTMLElement => {
  const markerContainer = doc.createElement('span');
  markerContainer.classList.add(DOM_CLASS_NAMES.LIST_MARKER);
  markerContainer.style.display = 'inline-block';
  markerContainer.style.wordSpacing = '0px';

  const markerEl = doc.createElement('span');
  markerEl.classList.add('superdoc-paragraph-marker');
  markerEl.textContent = markerText;
  markerEl.style.pointerEvents = 'none';
  markerEl.style.fontFamily = toCssFontFamily(run.fontFamily) ?? run.fontFamily ?? '';

  if (run.fontSize != null) {
    markerEl.style.fontSize = `${run.fontSize}px`;
  }
  markerEl.style.fontWeight = run.bold ? 'bold' : '';
  markerEl.style.fontStyle = run.italic ? 'italic' : '';

  if (run.color) {
    markerEl.style.color = run.color;
  }
  if (run.letterSpacing != null) {
    markerEl.style.letterSpacing = `${run.letterSpacing}px`;
  }

  markerContainer.appendChild(markerEl);
  if (sourceAnchor) {
    applySourceAnchorDataset(markerEl, sourceAnchor);
  }
  return markerContainer;
};
