import type {
  DropCapDescriptor,
  ParaFragment,
  ParagraphBlock,
  ParagraphMeasure,
  ResolvedFragmentItem,
  SdtMetadata,
} from '@superdoc/contracts';
import { isMinimalWordLayout as isMinimalWordLayoutShared } from '@superdoc/common/list-marker-utils';
import type { MinimalWordLayout } from '@superdoc/common/list-marker-utils';
import { CLASS_NAMES, fragmentStyles } from '../styles.js';
import { shouldRenderSdtContainerChrome, type SdtBoundaryOptions } from '../sdt/container.js';
import type { BetweenBorderInfo } from './borders/index.js';
import { renderParagraphContent, type ParagraphRenderLineInput } from './renderParagraphContent.js';

type ApplyStyles = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) => void;

type RenderParagraphFragmentParams = {
  doc: Document | null;
  fragment: ParaFragment;
  sdtBoundary?: SdtBoundaryOptions;
  betweenInfo?: BetweenBorderInfo;
  resolvedItem?: ResolvedFragmentItem;
  applyStyles: ApplyStyles;
  applyResolvedFragmentFrame: (el: HTMLElement, item: ResolvedFragmentItem, fragment: ParaFragment) => void;
  applyFragmentFrame: (el: HTMLElement, fragment: ParaFragment) => void;
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  applyContainerSdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  renderLine: (input: ParagraphRenderLineInput) => HTMLElement;
  captureLineSnapshot: (
    lineEl: HTMLElement,
    options?: { sourceAnchor?: ResolvedFragmentItem['sourceAnchor']; wrapperEl?: HTMLElement },
  ) => void;
  createErrorPlaceholder: (blockId: string, error: unknown) => HTMLElement;
  contentControlsChrome?: 'default' | 'none';
};

const isMinimalWordLayout = (value: unknown): value is MinimalWordLayout => isMinimalWordLayoutShared(value);

export const renderParagraphFragment = (params: RenderParagraphFragmentParams): HTMLElement => {
  const {
    doc,
    fragment,
    sdtBoundary,
    betweenInfo,
    resolvedItem,
    applyStyles,
    applyResolvedFragmentFrame,
    applyFragmentFrame,
    applySdtDataset,
    applyContainerSdtDataset,
    renderLine,
    captureLineSnapshot,
    createErrorPlaceholder,
    contentControlsChrome,
  } = params;

  try {
    if (!doc) {
      throw new Error('DomPainter: document is not available');
    }

    if (resolvedItem?.block?.kind !== 'paragraph' || resolvedItem?.measure?.kind !== 'paragraph') {
      throw new Error(`DomPainter: missing resolved paragraph block/measure for fragment ${fragment.blockId}`);
    }
    const block = resolvedItem.block as ParagraphBlock;
    const measure = resolvedItem.measure as ParagraphMeasure;
    const wordLayout = isMinimalWordLayout(block.attrs?.wordLayout) ? block.attrs.wordLayout : undefined;
    const content = resolvedItem?.content;

    const paraContinuesFromPrev = resolvedItem?.continuesFromPrev;
    const paraContinuesOnNext = resolvedItem?.continuesOnNext;
    const paraMarkerWidth = resolvedItem?.markerWidth;

    const fragmentEl = doc.createElement('div');
    fragmentEl.classList.add(CLASS_NAMES.fragment);

    const isTocEntry = block.attrs?.isTocEntry;
    const hasMarker = !paraContinuesFromPrev && paraMarkerWidth && wordLayout?.marker;
    const hasSdtContainer = shouldRenderSdtContainerChrome(block.attrs?.sdt, block.attrs?.containerSdt);
    const paraIndentForOverflow = block.attrs?.indent;
    const hasNegativeIndent = (paraIndentForOverflow?.left ?? 0) < 0 || (paraIndentForOverflow?.right ?? 0) < 0;
    const styles = isTocEntry
      ? { ...fragmentStyles, whiteSpace: 'nowrap' }
      : hasMarker || hasSdtContainer || hasNegativeIndent
        ? { ...fragmentStyles, overflow: 'visible' }
        : fragmentStyles;
    applyStyles(fragmentEl, styles);
    if (resolvedItem) {
      applyResolvedFragmentFrame(fragmentEl, resolvedItem, fragment);
    } else {
      applyFragmentFrame(fragmentEl, fragment);
    }

    if (isTocEntry) {
      fragmentEl.classList.add('superdoc-toc-entry');
    }

    if (paraContinuesFromPrev) {
      fragmentEl.dataset.continuesFromPrev = 'true';
    }
    if (paraContinuesOnNext) {
      fragmentEl.dataset.continuesOnNext = 'true';
    }

    const lines = fragment.lines ?? measure.lines.slice(fragment.fromLine, fragment.toLine);
    renderParagraphContent({
      doc,
      frameEl: fragmentEl,
      block,
      measure,
      containerKind: 'body-fragment',
      width: fragment.width,
      localStartLine: 0,
      localEndLine: lines.length,
      lineIndexOffset: fragment.fromLine,
      linesOverride: lines,
      continuesFromPrev: paraContinuesFromPrev,
      continuesOnNext: paraContinuesOnNext,
      markerWidth: paraMarkerWidth,
      markerTextWidth: fragment.markerTextWidth,
      wordLayout,
      resolvedContent: content,
      betweenInfo,
      sdtBoundary,
      applySdtDataset,
      applyContainerSdtDataset,
      renderDropCap: (descriptor, dropCapMeasure) => renderDropCap(doc, descriptor, dropCapMeasure),
      renderLine,
      captureLineSnapshot: (lineEl, options) => {
        captureLineSnapshot(lineEl, {
          sourceAnchor: options?.sourceAnchor,
          wrapperEl: fragmentEl,
        });
      },
      sourceAnchor: resolvedItem?.sourceAnchor,
      contentControlsChrome,
    });

    return fragmentEl;
  } catch (error) {
    console.error('[DomPainter] Fragment rendering failed:', { fragment, error });
    return createErrorPlaceholder(fragment.blockId, error);
  }
};

const renderDropCap = (
  doc: Document,
  descriptor: DropCapDescriptor,
  measure: ParagraphMeasure['dropCap'],
): HTMLElement => {
  const { run, mode } = descriptor;

  const dropCapEl = doc.createElement('span');
  dropCapEl.classList.add('superdoc-drop-cap');
  dropCapEl.textContent = run.text;

  dropCapEl.style.fontFamily = run.fontFamily;
  dropCapEl.style.fontSize = `${run.fontSize}px`;
  if (run.bold) {
    dropCapEl.style.fontWeight = 'bold';
  }
  if (run.italic) {
    dropCapEl.style.fontStyle = 'italic';
  }
  if (run.color) {
    dropCapEl.style.color = run.color;
  }

  if (mode === 'drop') {
    dropCapEl.style.float = 'left';
    dropCapEl.style.marginRight = '4px';
    dropCapEl.style.lineHeight = '1';
  } else if (mode === 'margin') {
    dropCapEl.style.position = 'absolute';
    dropCapEl.style.left = '0';
    dropCapEl.style.lineHeight = '1';
  }

  if (run.position && run.position !== 0) {
    dropCapEl.style.position = dropCapEl.style.position || 'relative';
    dropCapEl.style.top = `${run.position}px`;
  }

  if (measure) {
    dropCapEl.style.width = `${measure.width}px`;
    dropCapEl.style.height = `${measure.height}px`;
  }

  return dropCapEl;
};
