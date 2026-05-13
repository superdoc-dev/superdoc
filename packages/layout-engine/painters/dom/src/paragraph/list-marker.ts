import type { ParagraphMeasure, ResolvedListMarkerItem, SourceAnchor } from '@superdoc/contracts';
import { createListMarkerElement, computeTabWidth, resolvePainterListMarkerGeometry } from '../utils/marker-helpers.js';

export type WordLayoutMarker = {
  markerText?: string;
  justification?: 'left' | 'right' | 'center';
  gutterWidthPx?: number;
  markerBoxWidthPx?: number;
  suffix?: 'tab' | 'space' | 'nothing';
  markerX?: number;
  textStartX?: number;
  run: {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    letterSpacing?: number;
    vanish?: boolean;
  };
};

export type MinimalWordLayout = {
  marker?: WordLayoutMarker;
  indentLeftPx?: number;
  firstLineIndentMode?: boolean;
  textStartPx?: number;
  tabsPx?: number[];
};

export const renderLegacyListMarker = (params: {
  doc: Document;
  lineEl: HTMLElement;
  wordLayout?: MinimalWordLayout;
  markerLayout: WordLayoutMarker;
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
  const markerJustification = markerLayout?.justification ?? 'left';
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

  if (isRtl) {
    lineEl.style.paddingRight = `${anchorPoint}px`;
  } else {
    lineEl.style.paddingLeft = `${anchorPoint}px`;
  }

  if (markerLayout?.run?.vanish) {
    return;
  }

  const markerContainer = createListMarkerElement(
    doc,
    markerLayout?.markerText ?? '',
    markerLayout?.run ?? {},
    sourceAnchor,
  );
  markerContainer.style.position = 'relative';
  if (markerJustification === 'right') {
    markerContainer.style.position = 'absolute';
    if (isRtl) {
      markerContainer.style.right = `${markerStartPos}px`;
    } else {
      markerContainer.style.left = `${markerStartPos}px`;
    }
  } else if (markerJustification === 'center') {
    markerContainer.style.position = 'absolute';
    if (isRtl) {
      markerContainer.style.right = `${markerStartPos - markerTextWidth / 2}px`;
      lineEl.style.paddingRight = `${parseFloat(lineEl.style.paddingRight || '0') + markerTextWidth / 2}px`;
    } else {
      markerContainer.style.left = `${markerStartPos - markerTextWidth / 2}px`;
      lineEl.style.paddingLeft = `${parseFloat(lineEl.style.paddingLeft || '0') + markerTextWidth / 2}px`;
    }
  }

  prependMarkerSuffix(doc, lineEl, suffix, suffixWidthPx, markerLayout?.run?.fontSize);
  lineEl.prepend(markerContainer);
};

export const renderResolvedListMarker = (params: {
  doc: Document;
  lineEl: HTMLElement;
  marker: ResolvedListMarkerItem;
  isRtl?: boolean;
  sourceAnchor?: SourceAnchor;
}): void => {
  const { doc, lineEl, marker, isRtl, sourceAnchor } = params;
  if (isRtl) {
    lineEl.style.paddingRight = `${marker.firstLinePaddingLeftPx}px`;
  } else {
    lineEl.style.paddingLeft = `${marker.firstLinePaddingLeftPx}px`;
  }

  if (marker.vanish) {
    return;
  }

  const markerContainer = createListMarkerElement(doc, marker.text, marker.run, marker.sourceAnchor ?? sourceAnchor);
  markerContainer.style.position = 'relative';
  if (marker.justification === 'right') {
    markerContainer.style.position = 'absolute';
    if (isRtl) {
      markerContainer.style.right = `${marker.markerStartPx}px`;
    } else {
      markerContainer.style.left = `${marker.markerStartPx}px`;
    }
  } else if (marker.justification === 'center') {
    markerContainer.style.position = 'absolute';
    const paddingAdjust = marker.centerPaddingAdjustPx ?? 0;
    if (isRtl) {
      markerContainer.style.right = `${marker.markerStartPx - paddingAdjust}px`;
      lineEl.style.paddingRight = `${parseFloat(lineEl.style.paddingRight || '0') + paddingAdjust}px`;
    } else {
      markerContainer.style.left = `${marker.markerStartPx - paddingAdjust}px`;
      lineEl.style.paddingLeft = `${parseFloat(lineEl.style.paddingLeft || '0') + paddingAdjust}px`;
    }
  }

  prependMarkerSuffix(doc, lineEl, marker.suffix, marker.suffixWidthPx, marker.run.fontSize);
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
