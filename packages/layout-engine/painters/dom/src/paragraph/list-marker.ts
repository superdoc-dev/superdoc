import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { toCssFontFamily } from '@superdoc/font-utils';
import { resolvePhysicalFamily, type ResolvePhysicalFamily } from '@superdoc/font-system';
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
import { allowFontSynthesis } from '../runs/font-synthesis.js';

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
  // SD-2656: caps marks from the level rPr. allCaps -> "FIRST" (uppercase);
  // smallCaps -> small-caps. Without these the legal list markers render as
  // plain "First" / "Second" / "Third" instead of Word's "FIRST" / "SECOND".
  allCaps?: boolean | null;
  smallCaps?: boolean | null;
};

const isMarkerSuffix = (suffix: unknown): suffix is 'tab' | 'space' | 'nothing' =>
  suffix === 'tab' || suffix === 'space' || suffix === 'nothing';

export const createListMarkerElement = (
  doc: Document,
  markerText: string,
  run: MarkerRunStyle,
  sourceAnchor?: SourceAnchor,
  resolvePhysical: ResolvePhysicalFamily = (css) => resolvePhysicalFamily(css),
): HTMLElement => {
  const markerContainer = doc.createElement('span');
  markerContainer.classList.add(DOM_CLASS_NAMES.LIST_MARKER);
  markerContainer.style.display = 'inline-block';
  markerContainer.style.wordSpacing = '0px';

  const markerEl = doc.createElement('span');
  markerEl.classList.add('superdoc-paragraph-marker');
  markerEl.textContent = markerText;
  markerEl.style.pointerEvents = 'none';
  // Compose the Word fallback stack first, then let the resolver swap only the primary family.
  // This keeps Times New Roman -> Liberation Serif on a serif fallback instead of inventing sans-serif.
  const cssFontFamily = toCssFontFamily(run.fontFamily) ?? run.fontFamily ?? '';
  // Resolve for the marker's ACTUAL face so a single-face substitute is not mis-mapped
  // (e.g. a Bold marker on a Regular-only fallback) - matching how the marker text is measured.
  markerEl.style.fontFamily = resolvePhysical(cssFontFamily, {
    weight: run.bold ? '700' : '400',
    style: run.italic ? 'italic' : 'normal',
  });

  if (run.fontSize != null) {
    markerEl.style.fontSize = `${run.fontSize}px`;
  }
  allowFontSynthesis(markerEl);
  markerEl.style.fontWeight = run.bold ? 'bold' : '';
  markerEl.style.fontStyle = run.italic ? 'italic' : '';

  if (run.color) {
    markerEl.style.color = run.color;
  }
  if (run.letterSpacing != null) {
    markerEl.style.letterSpacing = `${run.letterSpacing}px`;
  }
  // SD-2656: caps marks on the level rPr — uppercase for w:caps,
  // small-caps for w:smallCaps. Without these legal/contract markers
  // ("FIRST:", "SECOND:") would render verbatim as "First", "Second".
  if (run.allCaps) {
    markerEl.style.textTransform = 'uppercase';
  } else if (run.smallCaps) {
    markerEl.style.fontVariant = 'small-caps';
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
  resolvePhysical?: ResolvePhysicalFamily;
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
    resolvePhysical = (css) => resolvePhysicalFamily(css),
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

  if ((markerLayout?.run as MarkerRunStyle | undefined)?.vanish) {
    return;
  }

  const markerContainer = createListMarkerElement(
    doc,
    markerLayout?.markerText ?? '',
    markerLayout?.run ?? {},
    sourceAnchor,
    resolvePhysical,
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

  prependMarkerSuffix(
    doc,
    lineEl,
    isMarkerSuffix(suffix) ? suffix : undefined,
    suffixWidthPx,
    markerLayout?.run?.fontSize,
  );
  lineEl.prepend(markerContainer);
};

export const renderResolvedListMarker = (params: {
  doc: Document;
  lineEl: HTMLElement;
  marker: ResolvedListMarkerItem;
  isRtl?: boolean;
  sourceAnchor?: SourceAnchor;
  resolvePhysical?: ResolvePhysicalFamily;
}): void => {
  const { doc, lineEl, marker, isRtl, sourceAnchor, resolvePhysical } = params;
  if (isRtl) {
    lineEl.style.paddingRight = `${marker.firstLinePaddingLeftPx}px`;
  } else {
    lineEl.style.paddingLeft = `${marker.firstLinePaddingLeftPx}px`;
  }

  if (marker.vanish) {
    return;
  }

  const markerContainer = createListMarkerElement(
    doc,
    marker.text,
    marker.run,
    marker.sourceAnchor ?? sourceAnchor,
    resolvePhysical,
  );
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
