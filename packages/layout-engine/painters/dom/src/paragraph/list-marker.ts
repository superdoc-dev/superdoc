import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { toCssFontFamily } from '@superdoc/font-utils';
import type { ParagraphMeasure, ResolvedListMarkerItem, SourceAnchor } from '@superdoc/contracts';
import {
  computeTabWidth,
  resolveListMarkerGeometry,
  resolveListTextStartPx,
  type MinimalMarker,
  type MinimalWordLayout,
  type ResolvedListMarkerGeometry,
} from '@superdoc/common/list-marker-utils';
import { applySourceAnchorDataset } from '../utils/source-anchor.js';

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

const resolvePainterMarkerTextWidth = (
  markerTextWidthPx: number | undefined,
  marker: { glyphWidthPx?: number; markerBoxWidthPx?: number },
): number =>
  getFiniteNonNegativeNumber(markerTextWidthPx) ??
  getFiniteNonNegativeNumber(marker.glyphWidthPx) ??
  getFiniteNonNegativeNumber(marker.markerBoxWidthPx) ??
  0;

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

type MarkerRunStyle = {
  fontFamily?: string | null;
  fontSize?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  color?: string | null;
  letterSpacing?: number | null;
  vanish?: boolean | null;
};

const isMarkerSuffix = (suffix: unknown): suffix is 'tab' | 'space' | 'nothing' =>
  suffix === 'tab' || suffix === 'space' || suffix === 'nothing';

const isMarkerJustification = (value: unknown): value is 'left' | 'center' | 'right' =>
  value === 'left' || value === 'center' || value === 'right';

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

export const renderLegacyListMarker = (params: {
  doc: Document;
  lineEl: HTMLElement;
  wordLayout?: MinimalWordLayout;
  markerLayout: MinimalMarker;
  markerMeasure: ParagraphMeasure['marker'];
  markerTextWidthPx?: number;
  indentLeftPx: number;
  hangingIndentPx: number;
  firstLineIndentPx: number;
  isRtl?: boolean;
  sourceAnchor?: SourceAnchor;
}): void => {
  const {
    doc,
    lineEl,
    wordLayout,
    markerLayout,
    markerMeasure,
    markerTextWidthPx,
    indentLeftPx,
    hangingIndentPx,
    firstLineIndentPx,
    isRtl,
    sourceAnchor,
  } = params;
  const markerTextWidth = markerTextWidthPx ?? markerMeasure?.markerTextWidth ?? 0;
  const shouldUseSharedInlinePrefixGeometry =
    markerLayout?.justification === 'left' &&
    wordLayout?.firstLineIndentMode !== true &&
    typeof markerTextWidth === 'number' &&
    Number.isFinite(markerTextWidth) &&
    markerTextWidth >= 0;
  const markerGeometry = shouldUseSharedInlinePrefixGeometry
    ? resolvePainterListMarkerGeometry({
        wordLayout,
        indentLeftPx,
        hangingIndentPx,
        firstLineIndentPx,
        markerTextWidthPx: markerTextWidth,
      })
    : undefined;

  const anchorPoint = indentLeftPx - hangingIndentPx + firstLineIndentPx;
  const markerJustification = isMarkerJustification(markerLayout?.justification) ? markerLayout.justification : 'left';
  let markerStartPos: number;
  let currentPos: number;
  if (markerJustification === 'left') {
    markerStartPos = anchorPoint;
    currentPos = markerStartPos + markerTextWidth;
  } else if (markerJustification === 'right') {
    markerStartPos = anchorPoint - markerTextWidth;
    currentPos = anchorPoint;
  } else {
    markerStartPos = anchorPoint - markerTextWidth / 2;
    currentPos = markerStartPos + markerTextWidth;
  }

  const suffix = markerLayout?.suffix ?? 'tab';
  let suffixWidthPx = 0;
  if (markerGeometry && (suffix === 'tab' || suffix === 'space')) {
    suffixWidthPx = markerGeometry.suffixWidthPx;
  } else if (suffix === 'tab') {
    suffixWidthPx = computeTabWidth(
      currentPos,
      markerJustification,
      wordLayout?.tabsPx,
      hangingIndentPx,
      firstLineIndentPx,
      indentLeftPx,
    );
  } else if (suffix === 'space') {
    suffixWidthPx = 4;
  }

  renderListMarkerFrame({
    doc,
    lineEl,
    markerText: markerLayout?.markerText ?? '',
    run: markerLayout?.run ?? {},
    sourceAnchor,
    firstLinePaddingPx: anchorPoint,
    markerStartPx: markerJustification === 'center' ? markerStartPos - markerTextWidth / 2 : markerStartPos,
    justification: markerJustification,
    centerPaddingAdjustPx: markerJustification === 'center' ? markerTextWidth / 2 : 0,
    suffix: isMarkerSuffix(suffix) ? suffix : undefined,
    suffixWidthPx,
    isRtl,
    vanish: (markerLayout?.run as MarkerRunStyle | undefined)?.vanish,
  });
};

export const renderResolvedListMarker = (params: {
  doc: Document;
  lineEl: HTMLElement;
  marker: ResolvedListMarkerItem;
  isRtl?: boolean;
  sourceAnchor?: SourceAnchor;
}): void => {
  const { doc, lineEl, marker, isRtl, sourceAnchor } = params;
  renderListMarkerFrame({
    doc,
    lineEl,
    markerText: marker.text,
    run: marker.run,
    sourceAnchor: marker.sourceAnchor ?? sourceAnchor,
    firstLinePaddingPx: marker.firstLinePaddingLeftPx,
    markerStartPx:
      marker.justification === 'center'
        ? marker.markerStartPx - (marker.centerPaddingAdjustPx ?? 0)
        : marker.markerStartPx,
    justification: marker.justification,
    centerPaddingAdjustPx: marker.justification === 'center' ? (marker.centerPaddingAdjustPx ?? 0) : 0,
    suffix: marker.suffix,
    suffixWidthPx: marker.suffixWidthPx,
    isRtl,
    vanish: marker.vanish,
  });
};

const renderListMarkerFrame = (params: {
  doc: Document;
  lineEl: HTMLElement;
  markerText: string;
  run: MarkerRunStyle;
  sourceAnchor?: SourceAnchor;
  firstLinePaddingPx: number;
  markerStartPx: number;
  justification: 'left' | 'center' | 'right';
  centerPaddingAdjustPx: number;
  suffix: 'tab' | 'space' | 'nothing' | undefined;
  suffixWidthPx: number;
  isRtl?: boolean;
  vanish?: boolean | null;
}): void => {
  const {
    doc,
    lineEl,
    markerText,
    run,
    sourceAnchor,
    firstLinePaddingPx,
    markerStartPx,
    justification,
    centerPaddingAdjustPx,
    suffix,
    suffixWidthPx,
    isRtl,
    vanish,
  } = params;
  if (isRtl) {
    lineEl.style.paddingRight = `${firstLinePaddingPx}px`;
  } else {
    lineEl.style.paddingLeft = `${firstLinePaddingPx}px`;
  }

  if (vanish) {
    return;
  }

  const markerContainer = createListMarkerElement(doc, markerText, run, sourceAnchor);
  markerContainer.style.position = 'relative';
  if (justification === 'right') {
    markerContainer.style.position = 'absolute';
    if (isRtl) {
      markerContainer.style.right = `${markerStartPx}px`;
    } else {
      markerContainer.style.left = `${markerStartPx}px`;
    }
  } else if (justification === 'center') {
    markerContainer.style.position = 'absolute';
    if (isRtl) {
      markerContainer.style.right = `${markerStartPx}px`;
      lineEl.style.paddingRight = `${parseFloat(lineEl.style.paddingRight || '0') + centerPaddingAdjustPx}px`;
    } else {
      markerContainer.style.left = `${markerStartPx}px`;
      lineEl.style.paddingLeft = `${parseFloat(lineEl.style.paddingLeft || '0') + centerPaddingAdjustPx}px`;
    }
  }

  prependMarkerSuffix(doc, lineEl, suffix, suffixWidthPx, run.fontSize ?? undefined);
  lineEl.prepend(markerContainer);
};

const prependMarkerSuffix = (
  doc: Document,
  lineEl: HTMLElement,
  suffix: 'tab' | 'space' | 'nothing' | undefined,
  suffixWidthPx: number,
  fontSize?: number,
): void => {
  if (suffix === 'tab') {
    const tabEl = doc.createElement('span');
    tabEl.classList.add('superdoc-tab', 'superdoc-marker-suffix-tab');
    tabEl.innerHTML = '&nbsp;';
    tabEl.style.display = 'inline-block';
    if (fontSize != null) {
      tabEl.style.fontSize = `${fontSize}px`;
    }
    tabEl.style.wordSpacing = '0px';
    tabEl.style.width = `${suffixWidthPx}px`;
    lineEl.prepend(tabEl);
  } else if (suffix === 'space') {
    const spaceEl = doc.createElement('span');
    spaceEl.classList.add('superdoc-marker-suffix-space');
    if (fontSize != null) {
      spaceEl.style.fontSize = `${fontSize}px`;
    }
    spaceEl.style.wordSpacing = '0px';
    spaceEl.textContent = '\u00A0';
    lineEl.prepend(spaceEl);
  }
};
