import type {
  DrawingBlock,
  Fragment,
  ImageHyperlink,
  Line,
  ParagraphBlock,
  ResolvedTableItem,
  Run,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '@superdoc/contracts';
import { expandRunsForInlineNewlines } from '@superdoc/contracts';
import { renderDrawingContent as renderSharedDrawingContent } from '../drawings/renderDrawingContent.js';
import { buildImageHyperlinkAnchor as buildSharedImageHyperlinkAnchor } from '../images/hyperlink.js';
import type { FragmentRenderContext } from '../renderer.js';
import type { SdtBoundaryOptions } from '../sdt/container.js';
import { applyContainerSdtDataset, applySdtDataset } from '../sdt/dataset.js';
import { applyStyles } from '../utils/apply-styles.js';
import { renderTableFragment } from './renderTableFragment.js';

type TableRenderData = {
  block: TableBlock;
  measure: TableMeasure;
  cellSpacingPx: number;
  effectiveColumnWidths: number[];
};

export type RenderResolvedTableFragmentDeps = {
  doc: Document | null;
  fragment: TableFragment;
  context: FragmentRenderContext;
  sdtBoundary?: SdtBoundaryOptions;
  resolvedItem?: ResolvedTableItem;
  renderLine: (
    block: ParagraphBlock,
    line: Line,
    context: FragmentRenderContext,
    availableWidthOverride?: number,
    lineIndex?: number,
    skipJustify?: boolean,
    preExpandedRuns?: Run[],
    resolvedListTextStartPx?: number,
  ) => HTMLElement;
  capturePaintSnapshotLine: (
    lineEl: HTMLElement,
    context: FragmentRenderContext,
    options?: { inTableFragment?: boolean; inTableParagraph?: boolean; wrapperEl?: HTMLElement },
  ) => void;
  applyFragmentFrame: (el: HTMLElement, fragment: Fragment, section?: 'body' | 'header' | 'footer') => void;
  applyResolvedFragmentFrame: (
    el: HTMLElement,
    item: ResolvedTableItem,
    fragment: Fragment,
    section?: 'body' | 'header' | 'footer',
  ) => void;
  createErrorPlaceholder: (blockId: string, error: unknown) => HTMLElement;
};

const resolveTableRenderData = (fragment: TableFragment, resolvedItem?: ResolvedTableItem): TableRenderData => {
  if (!resolvedItem) {
    throw new Error(`DomPainter: missing resolved table item for fragment ${fragment.blockId}`);
  }
  return {
    block: resolvedItem.block,
    measure: resolvedItem.measure,
    cellSpacingPx: resolvedItem.cellSpacingPx,
    effectiveColumnWidths: resolvedItem.effectiveColumnWidths,
  };
};

export const renderResolvedTableFragment = ({
  doc,
  fragment,
  context,
  sdtBoundary,
  resolvedItem,
  renderLine,
  capturePaintSnapshotLine,
  applyFragmentFrame,
  applyResolvedFragmentFrame,
  createErrorPlaceholder,
}: RenderResolvedTableFragmentDeps): HTMLElement => {
  try {
    if (!doc) {
      throw new Error('DomPainter: document is not available');
    }

    const tableCellExpandedRunsCache = new WeakMap<ParagraphBlock, Run[]>();
    const renderLineForTableCell = (
      block: ParagraphBlock,
      line: Line,
      ctx: FragmentRenderContext,
      lineIndex: number,
      isLastLine: boolean,
      resolvedListTextStartPx?: number,
    ): HTMLElement => {
      const lastRun = block.runs.length > 0 ? block.runs[block.runs.length - 1] : null;
      const paragraphEndsWithLineBreak = lastRun?.kind === 'lineBreak';
      const shouldSkipJustify = isLastLine && !paragraphEndsWithLineBreak;

      let expandedRuns = tableCellExpandedRunsCache.get(block);
      if (!expandedRuns) {
        expandedRuns = expandRunsForInlineNewlines(block.runs);
        tableCellExpandedRunsCache.set(block, expandedRuns);
      }

      return renderLine(
        block,
        line,
        ctx,
        undefined,
        lineIndex,
        shouldSkipJustify,
        expandedRuns,
        resolvedListTextStartPx,
      );
    };

    const buildTableImageHyperlinkAnchor = (
      imageEl: HTMLElement,
      hyperlink: ImageHyperlink | undefined,
      display: 'block' | 'inline-block',
    ): HTMLElement => buildSharedImageHyperlinkAnchor(doc, imageEl, hyperlink, display);

    const renderDrawingContentForTableCell = (
      block: DrawingBlock,
      options?: { clipContainer?: HTMLElement },
    ): HTMLElement =>
      renderSharedDrawingContent({
        doc,
        block,
        geometry: 'geometry' in block ? block.geometry : undefined,
        context,
        clipContainer: options?.clipContainer,
        buildImageHyperlinkAnchor: buildTableImageHyperlinkAnchor,
      });

    const tableRenderData = resolveTableRenderData(fragment, resolvedItem);
    const el = renderTableFragment({
      doc,
      fragment,
      context,
      block: tableRenderData.block,
      measure: tableRenderData.measure,
      cellSpacingPx: tableRenderData.cellSpacingPx,
      effectiveColumnWidths: tableRenderData.effectiveColumnWidths,
      sdtBoundary,
      renderLine: renderLineForTableCell,
      captureLineSnapshot: (lineEl, lineContext, options) => {
        capturePaintSnapshotLine(lineEl, lineContext, {
          inTableFragment: true,
          inTableParagraph: options?.inTableParagraph ?? false,
          wrapperEl: options?.wrapperEl,
        });
      },
      renderDrawingContent: renderDrawingContentForTableCell,
      applyFragmentFrame: (element, innerFragment) => applyFragmentFrame(element, innerFragment, context.section),
      applySdtDataset,
      applyContainerSdtDataset,
      applyStyles,
    });

    if (resolvedItem) {
      applyResolvedFragmentFrame(el, resolvedItem, fragment, context.section);
      if (sdtBoundary?.widthOverride != null) {
        el.style.width = `${sdtBoundary.widthOverride}px`;
      }
    }

    return el;
  } catch (error) {
    console.error('[DomPainter] Table fragment rendering failed:', { fragment, error });
    return createErrorPlaceholder(fragment.blockId, error);
  }
};
