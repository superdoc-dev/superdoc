import type {
  DropCapDescriptor,
  Line,
  ParagraphBlock,
  ParagraphMeasure,
  ResolvedParagraphContent,
  Run,
  SdtMetadata,
  SourceAnchor,
} from '@superdoc/contracts';
import {
  effectiveTableCellSpacing,
  expandRunsForInlineNewlines,
  getParagraphInlineDirection,
} from '@superdoc/contracts';
import { resolveMarkerIndent, type MinimalWordLayout } from '@superdoc/common/list-marker-utils';
import {
  applySdtContainerChrome,
  shouldRenderSdtContainerChrome,
  type SdtAncestorOptions,
  type SdtBoundaryOptions,
} from '../sdt/container.js';
import { createParagraphDecorationLayers, stampBetweenBorderDataset, type BetweenBorderInfo } from './borders/index.js';
import {
  applyParagraphLineIndentation,
  hasExplicitSegmentPositioning,
  resolveAvailableWidthForLine,
} from './indentation.js';
import { renderLegacyListMarker, renderResolvedListMarker, resolvePainterListTextStartPx } from './list-marker.js';
import { applyParagraphBlockStyles, clearParagraphFrameIndentStyles } from './styles.js';

export type RenderedParagraphLineInfo = {
  el: HTMLElement;
  top: number;
  height: number;
};

export type ParagraphRenderLineInput = {
  block: ParagraphBlock;
  line: Line;
  lineIndex: number;
  isLastLine: boolean;
  availableWidth?: number;
  skipJustify?: boolean;
  preExpandedRuns?: Run[];
  resolvedListTextStartPx?: number;
  indentOffsetOverride?: number;
  paragraphMarkLeftOffsetOverride?: number;
};

export type ParagraphRenderLine = (input: ParagraphRenderLineInput) => HTMLElement;

export type ParagraphRenderDropCap = (
  descriptor: DropCapDescriptor,
  measure?: { width: number; height: number; lines: number; mode: 'drop' | 'margin' },
) => HTMLElement;

export type ParagraphContainerKind = 'body-fragment' | 'table-cell';

type ParagraphSpacingPolicy = {
  isFirstBlock: boolean;
  isLastBlock: boolean;
  paddingTop: number;
};

export type RenderParagraphContentParams = {
  doc: Document;
  frameEl: HTMLElement;
  block: ParagraphBlock;
  measure: ParagraphMeasure;
  containerKind: ParagraphContainerKind;
  width: number;
  localStartLine: number;
  localEndLine: number;
  linesOverride?: Line[];
  lineIndexOffset?: number;
  continuesFromPrev?: boolean;
  continuesOnNext?: boolean;
  markerWidth?: number;
  markerTextWidth?: number;
  wordLayout?: MinimalWordLayout;
  resolvedContent?: ResolvedParagraphContent;
  betweenInfo?: BetweenBorderInfo;
  sdtBoundary?: SdtBoundaryOptions;
  spacingPolicy?: ParagraphSpacingPolicy;
  ancestorContainerKey?: string | null;
  ancestorContainerSdt?: SdtMetadata | null;
  ancestorContainerKeys?: SdtAncestorOptions['ancestorContainerKeys'];
  ancestorContainerSdts?: SdtAncestorOptions['ancestorContainerSdts'];
  onSdtContainerChrome?: () => void;
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  applyContainerSdtDataset?: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  renderLine: ParagraphRenderLine;
  renderDropCap?: ParagraphRenderDropCap;
  captureLineSnapshot?: (
    lineEl: HTMLElement,
    options?: { inTableParagraph?: boolean; wrapperEl?: HTMLElement; sourceAnchor?: SourceAnchor },
  ) => void;
  convertFinalParagraphMark?: boolean;
  lineTopOffset?: number;
  sourceAnchor?: SourceAnchor;
};

export type RenderParagraphContentResult = {
  renderedHeight: number;
  totalHeight: number;
  renderedLines: RenderedParagraphLineInfo[];
};

export const renderParagraphContent = (params: RenderParagraphContentParams): RenderParagraphContentResult => {
  const {
    doc,
    frameEl,
    block,
    measure,
    linesOverride,
    width,
    localStartLine,
    localEndLine,
    lineIndexOffset = 0,
    continuesFromPrev,
    continuesOnNext,
    resolvedContent,
    betweenInfo,
    sdtBoundary,
    spacingPolicy,
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome,
    applySdtDataset,
    applyContainerSdtDataset,
    renderDropCap,
    lineTopOffset = 0,
  } = params;

  applyParagraphBlockStyles(frameEl, block.attrs);
  const { shadingLayer, borderLayer } = createParagraphDecorationLayers(doc, width, block.attrs, betweenInfo);
  if (shadingLayer) frameEl.appendChild(shadingLayer);
  if (borderLayer) frameEl.appendChild(borderLayer);
  stampBetweenBorderDataset(frameEl, betweenInfo);

  if (block.attrs?.styleId) {
    frameEl.dataset.styleId = block.attrs.styleId;
    frameEl.setAttribute('styleid', block.attrs.styleId);
  }
  applySdtDataset(frameEl, block.attrs?.sdt);
  applyContainerSdtDataset?.(frameEl, block.attrs?.containerSdt);

  const applySdtChrome = shouldRenderSdtContainerChrome(block.attrs?.sdt, block.attrs?.containerSdt, {
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
  });
  if (applySdtChrome) {
    if (applySdtContainerChrome(doc, frameEl, block.attrs?.sdt, block.attrs?.containerSdt, sdtBoundary)) {
      onSdtContainerChrome?.();
    }
  }

  renderParagraphDropCap({
    frameEl,
    block,
    measure,
    resolvedContent,
    continuesFromPrev,
    renderDropCap,
  });

  clearParagraphFrameIndentStyles(frameEl);

  const spacingBefore = block.attrs?.spacing?.before;
  let beforeHeight = 0;
  if (spacingPolicy && localStartLine === 0) {
    beforeHeight = effectiveTableCellSpacing(spacingBefore, spacingPolicy.isFirstBlock, spacingPolicy.paddingTop);
    if (beforeHeight > 0) {
      frameEl.style.marginTop = `${beforeHeight}px`;
    }
  }

  const renderResult =
    resolvedContent != null
      ? renderResolvedLines({
          ...params,
          resolvedContent,
          lineTopOffset: lineTopOffset + beforeHeight,
        })
      : renderMeasuredLines({
          ...params,
          lineTopOffset: lineTopOffset + beforeHeight,
        });

  let renderedHeight = renderResult.renderedHeight;
  const originalLineCount = measure.lines?.length ?? linesOverride?.length ?? 0;
  const renderedStartLine = lineIndexOffset + localStartLine;
  const renderedEndLine = lineIndexOffset + localEndLine;
  const renderedEntireBlock =
    !continuesFromPrev && !continuesOnNext && renderedStartLine === 0 && renderedEndLine >= originalLineCount;
  if (renderedEntireBlock && measure.totalHeight && measure.totalHeight > renderedHeight) {
    renderedHeight = measure.totalHeight;
  }

  let afterHeight = 0;
  if (spacingPolicy && renderedEntireBlock && !spacingPolicy.isLastBlock) {
    const spacingAfter = block.attrs?.spacing?.after;
    if (typeof spacingAfter === 'number' && spacingAfter > 0) {
      frameEl.style.marginBottom = `${spacingAfter}px`;
      afterHeight = spacingAfter;
    }
  }

  if (renderedHeight > 0) {
    frameEl.style.height = `${renderedHeight}px`;
  }

  return {
    renderedHeight,
    totalHeight: beforeHeight + renderedHeight + afterHeight,
    renderedLines: renderResult.renderedLines,
  };
};

const renderResolvedLines = (
  params: RenderParagraphContentParams & { resolvedContent: ResolvedParagraphContent },
): { renderedHeight: number; renderedLines: RenderedParagraphLineInfo[] } => {
  const {
    frameEl,
    block,
    resolvedContent: content,
    markerTextWidth,
    renderLine,
    captureLineSnapshot,
    convertFinalParagraphMark,
    lineTopOffset = 0,
    sourceAnchor,
  } = params;
  const renderedLines: RenderedParagraphLineInfo[] = [];
  const resolvedMarker = content.marker;
  const expandedRunsForBlock = expandRunsForInlineNewlines(block.runs);
  const isRtl = getParagraphInlineDirection(block.attrs) === 'rtl';
  let renderedHeight = 0;

  content.lines.forEach((resolvedLine, index) => {
    const paragraphMarkLeftOffset = resolveResolvedListParagraphMarkOffset(
      resolvedLine.isListFirstLine ? resolvedMarker : undefined,
      markerTextWidth,
      resolvedLine.indentOffset,
    );
    const lineEl = renderLine({
      block,
      line: resolvedLine.line,
      lineIndex: resolvedLine.lineIndex,
      isLastLine: index === content.lines.length - 1 && !content.continuesOnNext,
      availableWidth: resolvedLine.availableWidth,
      skipJustify: resolvedLine.skipJustify,
      preExpandedRuns: expandedRunsForBlock,
      resolvedListTextStartPx: resolvedLine.resolvedListTextStartPx,
      indentOffsetOverride: resolvedLine.indentOffset,
      paragraphMarkLeftOffsetOverride: paragraphMarkLeftOffset,
    });

    if (!resolvedLine.isListFirstLine) {
      applyResolvedLineIndentation(lineEl, block, content, resolvedLine);
    }
    if (resolvedLine.paddingRightPx > 0) {
      lineEl.style.paddingRight = `${resolvedLine.paddingRightPx}px`;
    }
    if (resolvedLine.isListFirstLine && resolvedMarker) {
      renderResolvedListMarker({ doc: params.doc, lineEl, marker: resolvedMarker, isRtl, sourceAnchor });
    }
    if (convertFinalParagraphMark && index === content.lines.length - 1 && !content.continuesOnNext) {
      convertParagraphMarkToCellMark(lineEl);
    }
    captureLineSnapshot?.(lineEl, {
      inTableParagraph: params.containerKind === 'table-cell',
      wrapperEl: frameEl,
      sourceAnchor,
    });
    frameEl.appendChild(lineEl);
    const height = resolvedLine.line.lineHeight;
    renderedLines.push({ el: lineEl, top: lineTopOffset + renderedHeight, height });
    renderedHeight += height;
  });

  return { renderedHeight, renderedLines };
};

const renderMeasuredLines = (
  params: RenderParagraphContentParams,
): { renderedHeight: number; renderedLines: RenderedParagraphLineInfo[] } => {
  const {
    doc,
    frameEl,
    block,
    measure,
    containerKind,
    width,
    localStartLine,
    localEndLine,
    linesOverride,
    lineIndexOffset = 0,
    continuesFromPrev,
    continuesOnNext,
    markerWidth,
    markerTextWidth,
    wordLayout,
    renderLine,
    captureLineSnapshot,
    convertFinalParagraphMark,
    lineTopOffset = 0,
    sourceAnchor,
  } = params;
  const lines = linesOverride ?? measure.lines ?? [];
  const paraIndent = block.attrs?.indent;
  const paraIndentLeft = paraIndent?.left ?? 0;
  const paraIndentRight = paraIndent?.right ?? 0;
  const isRtl = getParagraphInlineDirection(block.attrs) === 'rtl';
  const {
    anchorIndentPx: paraMarkerAnchorIndent,
    firstLinePx: markerFirstLine,
    hangingPx: markerHanging,
  } = resolveMarkerIndent(paraIndent, isRtl);
  const wordLayoutIndentLeft = (wordLayout as { indentLeftPx?: number } | undefined)?.indentLeftPx;
  const tableMarkerIndentLeft =
    measure.marker?.indentLeft ??
    wordLayoutIndentLeft ??
    (typeof paraIndent?.left === 'number' ? paraIndent.left : 0);
  const suppressFirstLineIndent = block.attrs?.suppressFirstLineIndent === true;
  const firstLineOffset = suppressFirstLineIndent ? 0 : (paraIndent?.firstLine ?? 0) - (paraIndent?.hanging ?? 0);
  const expandedRunsForBlock = containerKind === 'body-fragment' ? expandRunsForInlineNewlines(block.runs) : undefined;
  const lastRun = block.runs.length > 0 ? block.runs[block.runs.length - 1] : null;
  const paragraphEndsWithLineBreak = lastRun?.kind === 'lineBreak';
  const markerLayout = wordLayout?.marker;
  const markerMeasure = measure.marker;

  const legacyMarkerWidth = markerWidth ?? markerMeasure?.markerWidth;
  const legacyMarkerTextWidth = markerTextWidth ?? markerMeasure?.markerTextWidth;
  const listFirstLineTextStartPx =
    !continuesFromPrev && legacyMarkerWidth && markerLayout && markerMeasure
      ? resolvePainterListTextStartPx({
          wordLayout,
          indentLeftPx: containerKind === 'table-cell' ? tableMarkerIndentLeft : paraMarkerAnchorIndent,
          hangingIndentPx: markerHanging,
          firstLineIndentPx: markerFirstLine,
          markerTextWidthPx: legacyMarkerTextWidth,
        })
      : undefined;

  let renderedHeight = 0;
  const renderedLines: RenderedParagraphLineInfo[] = [];
  const renderedLocalEndLine = Math.min(localEndLine, lines.length);

  for (let lineIdx = localStartLine; lineIdx < localEndLine && lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const explicitSegmentPositioning = hasExplicitSegmentPositioning(line);
    const isFirstLine = lineIdx === 0 && !continuesFromPrev;
    const isListFirstLine = Boolean(lineIdx === 0 && !continuesFromPrev && legacyMarkerWidth && markerLayout);
    const shouldUseResolvedListTextStart =
      isListFirstLine && explicitSegmentPositioning && listFirstLineTextStartPx != null;
    const globalLineIndex = lineIndexOffset + lineIdx;
    const isLastLineOfParagraph =
      (linesOverride
        ? lineIdx === renderedLocalEndLine - 1
        : globalLineIndex === (measure.lines?.length ?? lines.length) - 1) && !continuesOnNext;
    const shouldSkipJustifyForLastLine = isLastLineOfParagraph && !paragraphEndsWithLineBreak;
    const availableWidth =
      containerKind === 'body-fragment'
        ? resolveAvailableWidthForLine({
            containerWidth: width,
            line,
            indentLeftPx: paraIndentLeft,
            indentRightPx: paraIndentRight,
            firstLineOffset,
            isFirstLine,
            isListFirstLine,
            resolvedListTextStartPx: shouldUseResolvedListTextStart ? listFirstLineTextStartPx : undefined,
          })
        : undefined;
    const lineEl = renderLine({
      block,
      line,
      lineIndex: globalLineIndex,
      isLastLine: isLastLineOfParagraph,
      availableWidth,
      skipJustify: shouldSkipJustifyForLastLine,
      preExpandedRuns: expandedRunsForBlock,
      resolvedListTextStartPx: shouldUseResolvedListTextStart ? listFirstLineTextStartPx : undefined,
    });
    lineEl.style.paddingLeft = '';
    lineEl.style.paddingRight = '';
    lineEl.style.textIndent = '';

    if (convertFinalParagraphMark && isLastLineOfParagraph) {
      convertParagraphMarkToCellMark(lineEl);
    }

    if (isListFirstLine && markerLayout && markerMeasure) {
      if (paraIndentRight > 0) {
        lineEl.style.paddingRight = `${paraIndentRight}px`;
      }
      renderLegacyListMarker({
        doc,
        lineEl,
        wordLayout,
        markerLayout,
        markerMeasure,
        markerTextWidthPx: legacyMarkerTextWidth,
        indentLeftPx: containerKind === 'table-cell' ? tableMarkerIndentLeft : paraMarkerAnchorIndent,
        hangingIndentPx: markerHanging,
        firstLineIndentPx: markerFirstLine,
        isRtl,
        sourceAnchor,
      });
    } else {
      applyParagraphLineIndentation({
        lineEl,
        line,
        indent: paraIndent,
        indentLeftPx: containerKind === 'table-cell' ? tableMarkerIndentLeft : paraMarkerAnchorIndent,
        hasListMarkerLayout: Boolean(markerLayout),
        lineIndex: lineIdx,
        localStartLine,
        continuesFromPrev,
        suppressFirstLineIndent,
        resetContinuationTextIndent: containerKind === 'body-fragment',
      });
    }

    captureLineSnapshot?.(lineEl, {
      inTableParagraph: containerKind === 'table-cell',
      wrapperEl: frameEl,
      sourceAnchor,
    });
    frameEl.appendChild(lineEl);
    const height = line.lineHeight;
    renderedLines.push({ el: lineEl, top: lineTopOffset + renderedHeight, height });
    renderedHeight += height;
  }

  return { renderedHeight, renderedLines };
};

const renderParagraphDropCap = (params: {
  frameEl: HTMLElement;
  block: ParagraphBlock;
  measure: ParagraphMeasure;
  resolvedContent?: ResolvedParagraphContent;
  continuesFromPrev?: boolean;
  renderDropCap?: ParagraphRenderDropCap;
}): void => {
  const { frameEl, block, measure, resolvedContent, continuesFromPrev, renderDropCap } = params;
  if (!renderDropCap) return;
  if (resolvedContent?.dropCap) {
    const dc = resolvedContent.dropCap;
    const dropCapEl = renderDropCap(
      {
        mode: dc.mode,
        run: {
          text: dc.text,
          fontFamily: dc.fontFamily,
          fontSize: dc.fontSize,
          bold: dc.bold,
          italic: dc.italic,
          color: dc.color,
          position: dc.position,
        },
        lines: 0,
      },
      dc.width != null && dc.height != null
        ? { width: dc.width, height: dc.height, lines: 0, mode: dc.mode }
        : undefined,
    );
    frameEl.appendChild(dropCapEl);
    return;
  }
  const dropCapDescriptor = block.attrs?.dropCapDescriptor;
  const dropCapMeasure = measure.dropCap;
  if (dropCapDescriptor && dropCapMeasure && !continuesFromPrev) {
    frameEl.appendChild(renderDropCap(dropCapDescriptor, dropCapMeasure));
  }
};

const applyResolvedLineIndentation = (
  lineEl: HTMLElement,
  block: ParagraphBlock,
  content: ResolvedParagraphContent,
  resolvedLine: ResolvedParagraphContent['lines'][number],
): void => {
  if (resolvedLine.paddingLeftPx > 0) {
    lineEl.style.paddingLeft = `${resolvedLine.paddingLeftPx}px`;
  }
  if (resolvedLine.textIndentPx !== 0) {
    lineEl.style.textIndent = `${resolvedLine.textIndentPx}px`;
  } else if (resolvedLine.lineIndex > 0 || content.continuesFromPrev) {
    const paraIndent = block.attrs?.indent;
    const suppressFirstLineIndent = block.attrs?.suppressFirstLineIndent === true;
    const firstLineOffset = suppressFirstLineIndent ? 0 : (paraIndent?.firstLine ?? 0) - (paraIndent?.hanging ?? 0);
    if (firstLineOffset && !resolvedLine.isListFirstLine) {
      lineEl.style.textIndent = '0px';
    }
  }
};

const resolveResolvedListParagraphMarkOffset = (
  marker: ResolvedParagraphContent['marker'] | undefined,
  markerTextWidth: number | undefined,
  indentOffset: number,
): number | undefined => {
  if (!marker) return undefined;
  if (typeof indentOffset === 'number' && Number.isFinite(indentOffset) && indentOffset > 0) {
    return indentOffset;
  }
  if (marker.vanish) {
    return indentOffset;
  }

  const paddingLeft = Number.isFinite(marker.firstLinePaddingLeftPx) ? marker.firstLinePaddingLeftPx : 0;
  const suffixWidth = marker.suffix !== 'nothing' && Number.isFinite(marker.suffixWidthPx) ? marker.suffixWidthPx : 0;

  if (marker.justification === 'left') {
    const markerWidth =
      typeof markerTextWidth === 'number' && Number.isFinite(markerTextWidth) && markerTextWidth > 0
        ? markerTextWidth
        : 0;
    return paddingLeft + markerWidth + suffixWidth;
  }

  const centerPadding =
    marker.justification === 'center' && Number.isFinite(marker.centerPaddingAdjustPx)
      ? (marker.centerPaddingAdjustPx ?? 0)
      : 0;
  return paddingLeft + centerPadding + suffixWidth;
};

const convertParagraphMarkToCellMark = (lineEl: HTMLElement): void => {
  const mark = lineEl.querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark');
  if (!mark) return;

  mark.classList.add('superdoc-formatting-cell-mark');
  mark.textContent = '¤';
};
