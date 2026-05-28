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
  isEmptySdtPlaceholderRun,
  shouldApplyJustify,
  sliceRunsForLine,
} from '@superdoc/contracts';
import { resolveMarkerIndent, type MinimalWordLayout } from '@superdoc/common/list-marker-utils';
import {
  applySdtContainerChrome,
  getSdtContainerMetadata,
  isStructuredContentMetadata,
  shouldRenderSdtContainerChrome,
  type SdtAncestorOptions,
  type SdtBoundaryOptions,
} from '../sdt/container.js';
import { createParagraphDecorationLayers, stampBetweenBorderDataset, type BetweenBorderInfo } from './borders/index.js';
import { resolveTextAlign } from '../features/inline-direction/index.js';
import {
  applyParagraphLineIndentation,
  hasExplicitSegmentPositioning,
  resolveAvailableWidthForLine,
} from './indentation.js';
import { renderLegacyListMarker, renderResolvedListMarker, resolvePainterListTextStartPx } from './list-marker.js';
import { applyParagraphBlockStyles, clearParagraphFrameIndentStyles } from './styles.js';

const INLINE_SDT_CHROME_EXTRA_WIDTH_PX = 4;

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
  if (applySdtChrome) {
    applyBlockSdtChromeBounds(
      frameEl,
      block,
      measure,
      getRenderedContentLines(params),
      width,
      lineIndexOffset + localStartLine,
      continuesFromPrev,
      continuesOnNext,
      sdtBoundary,
      resolvedContent,
    );
  }

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

const getRenderedContentLines = (params: RenderParagraphContentParams): Line[] => {
  if (params.resolvedContent) {
    return params.resolvedContent.lines.map((line) => line.line);
  }

  const lines = params.linesOverride ?? params.measure.lines ?? [];
  return lines.slice(params.localStartLine, Math.min(params.localEndLine, lines.length));
};

const applyBlockSdtChromeBounds = (
  element: HTMLElement,
  block: ParagraphBlock,
  measure: ParagraphMeasure,
  lines: Line[],
  fragmentWidth: number,
  lineIndexBase: number,
  fragmentContinuesFromPrev: boolean | undefined,
  fragmentContinuesOnNext: boolean | undefined,
  sdtBoundary: SdtBoundaryOptions | undefined,
  content?: ResolvedParagraphContent,
): void => {
  const sdt = getSdtContainerMetadata(block.attrs?.sdt, block.attrs?.containerSdt);
  if (!isStructuredContentMetadata(sdt) || sdt.scope !== 'block') return;
  if (fragmentContinuesFromPrev || fragmentContinuesOnNext) return;
  if (sdtBoundary && ((sdtBoundary.isStart ?? true) === false || (sdtBoundary.isEnd ?? true) === false)) return;

  const sourceLineCount = Math.max(measure.lines?.length ?? 0, content?.lines.length ?? 0, lines.length);
  if (sourceLineCount > 1) return;

  const expandedBlock = { ...block, runs: expandRunsForInlineNewlines(block.runs) };
  let contentLeft = Number.POSITIVE_INFINITY;
  let contentRight = Number.NEGATIVE_INFINITY;

  for (const [index, line] of lines.entries()) {
    const runsForLine = sliceRunsForLine(expandedBlock, line);
    if (runsForLine.length === 0) continue;

    let hasVisibleContent = false;
    for (const run of runsForLine) {
      if (run.kind === 'lineBreak' || run.kind === 'break') continue;
      if (isEmptySdtPlaceholderRun(run)) {
        hasVisibleContent = true;
        break;
      }
      if ((run.kind === 'text' || run.kind === undefined) && 'text' in run) {
        if ((run.text ?? '').trim().length === 0) continue;
      }
      hasVisibleContent = true;
      break;
    }

    if (!hasVisibleContent) continue;

    const lineWidth = Math.max(0, line.naturalWidth ?? line.width ?? 0);
    if (lineWidth <= 0) continue;
    const inlineSdtChromeWidth = hasExplicitSegmentPositioning(line) ? 0 : getInlineSdtChromeExtraWidth(runsForLine);

    const resolvedLine = content?.lines[index];
    const lineIndex = resolvedLine?.lineIndex ?? lineIndexBase + index;
    const lineOffset = resolveBlockSdtChromeLineOffset(block, line, resolvedLine, lineIndex);
    const availableWidth = resolveBlockSdtChromeAvailableWidth(block, line, fragmentWidth, lineOffset, resolvedLine);
    const paintedLineWidth = resolveBlockSdtChromePaintedLineWidth(
      block,
      line,
      lineWidth,
      availableWidth,
      index,
      lines.length,
      fragmentContinuesOnNext,
      resolvedLine,
      content,
    );
    const paintedLineWidthWithChrome = paintedLineWidth + inlineSdtChromeWidth;
    const alignmentSlack = Math.max(0, availableWidth - paintedLineWidthWithChrome);
    const alignment = resolveTextAlign(block.attrs?.alignment, getParagraphInlineDirection(block.attrs) === 'rtl');
    const lineLeft =
      lineOffset + (alignment === 'center' ? alignmentSlack / 2 : alignment === 'right' ? alignmentSlack : 0);
    contentLeft = Math.min(contentLeft, lineLeft);
    contentRight = Math.max(contentRight, lineLeft + paintedLineWidthWithChrome);
  }

  if (!Number.isFinite(contentLeft) || !Number.isFinite(contentRight)) return;

  const chromeLeft = Math.max(0, contentLeft);
  const chromeWidth = Math.max(0, Math.min(fragmentWidth, contentRight) - chromeLeft);
  if (chromeWidth <= 0 || chromeWidth >= fragmentWidth) return;

  element.style.setProperty('--sd-sdt-chrome-left', `${chromeLeft}px`);
  element.style.setProperty('--sd-sdt-chrome-width', `${chromeWidth}px`);
};

const getInlineSdtChromeExtraWidth = (runs: Run[]): number => {
  let wrapperCount = 0;
  let currentSdtId: string | null = null;

  for (const run of runs) {
    const sdt = 'sdt' in run ? run.sdt : undefined;
    const sdtId =
      sdt?.type === 'structuredContent' && sdt.scope === 'inline' && sdt.id && sdt.appearance !== 'hidden'
        ? String(sdt.id)
        : null;

    if (sdtId !== currentSdtId) {
      if (sdtId) wrapperCount += 1;
      currentSdtId = sdtId;
    }
  }

  return wrapperCount * INLINE_SDT_CHROME_EXTRA_WIDTH_PX;
};

const resolveBlockSdtChromeLineOffset = (
  block: ParagraphBlock,
  line: Line,
  resolvedLine: ResolvedParagraphContent['lines'][number] | undefined,
  lineIndex: number,
): number => {
  if (resolvedLine) {
    if (resolvedLine.isListFirstLine) {
      return resolvedLine.resolvedListTextStartPx ?? resolvedLine.indentOffset;
    }
    if (resolvedLine.hasExplicitSegmentPositioning) {
      return resolvedLine.indentOffset;
    }
    return Math.max(0, resolvedLine.paddingLeftPx + resolvedLine.textIndentPx);
  }

  const paraIndent = block.attrs?.indent;
  const indentLeft = paraIndent?.left ?? 0;
  const firstLine = paraIndent?.firstLine ?? 0;
  const hanging = paraIndent?.hanging ?? 0;
  const suppressFirstLineIndent = block.attrs?.suppressFirstLineIndent === true;
  const firstLineOffset = suppressFirstLineIndent ? 0 : firstLine - hanging;
  const isFirstLine = lineIndex === 0;
  const lineHasExplicitSegmentPositioning = line.segments?.some((segment) => segment.x !== undefined) === true;

  if (lineHasExplicitSegmentPositioning) {
    const effectiveLeftIndent = indentLeft < 0 ? 0 : indentLeft;
    return Math.max(0, effectiveLeftIndent + (isFirstLine ? firstLineOffset : 0));
  }

  if (isFirstLine) {
    return Math.max(0, indentLeft + firstLineOffset);
  }
  if (indentLeft > 0) {
    return indentLeft;
  }
  if (hanging > 0 && indentLeft >= 0) {
    return hanging;
  }
  return 0;
};

const resolveBlockSdtChromeAvailableWidth = (
  block: ParagraphBlock,
  line: Line,
  fragmentWidth: number,
  lineOffset: number,
  resolvedLine: ResolvedParagraphContent['lines'][number] | undefined,
): number => {
  if (resolvedLine) {
    return Math.max(0, resolvedLine.availableWidth);
  }

  const rightIndent = Math.max(0, block.attrs?.indent?.right ?? 0);
  const fallbackAvailableWidth = Math.max(0, fragmentWidth - lineOffset - rightIndent);
  if (line.maxWidth != null) {
    return Math.min(line.maxWidth, fallbackAvailableWidth);
  }
  return fallbackAvailableWidth;
};

const resolveBlockSdtChromePaintedLineWidth = (
  block: ParagraphBlock,
  line: Line,
  lineWidth: number,
  availableWidth: number,
  fragmentLineIndex: number,
  fragmentLineCount: number,
  fragmentContinuesOnNext: boolean | undefined,
  resolvedLine: ResolvedParagraphContent['lines'][number] | undefined,
  content: ResolvedParagraphContent | undefined,
): number => {
  const explicitPositionedSegmentCount = line.segments?.filter((segment) => segment.x !== undefined).length ?? 0;
  const hasMultipleExplicitPositionedSegments = explicitPositionedSegmentCount > 1;
  const paragraphEndsWithLineBreak =
    content?.paragraphEndsWithLineBreak === true || block.runs[block.runs.length - 1]?.kind === 'lineBreak';
  const isLastLineOfParagraph =
    resolvedLine != null
      ? resolvedLine.skipJustify
      : fragmentLineIndex === fragmentLineCount - 1 && !fragmentContinuesOnNext;
  const justifyShouldApply = shouldApplyJustify({
    alignment: block.attrs?.alignment,
    hasExplicitPositioning: line.segments?.some((segment) => segment.x !== undefined) === true,
    hasExplicitTabStops: line.hasExplicitTabStops === true,
    isLastLineOfParagraph,
    paragraphEndsWithLineBreak,
    skipJustifyOverride: (resolvedLine?.skipJustify ?? false) || hasMultipleExplicitPositionedSegments,
  });

  return justifyShouldApply ? Math.max(lineWidth, availableWidth) : lineWidth;
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
    measure.marker?.indentLeft ?? wordLayoutIndentLeft ?? (typeof paraIndent?.left === 'number' ? paraIndent.left : 0);
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
