import type { FlowBlock, Fragment, Layout, Measure, Page, PageMargins, ResolvedLayout } from '@superdoc/contracts';
import { DomPainter } from './renderer.js';
import type { PageStyles } from './styles.js';
import type { DomPainterInput, PaintSnapshot, PositionMapping, RulerOptions, FlowMode } from './renderer.js';

// Re-export constants
export { DOM_CLASS_NAMES } from './constants.js';
export type { DomClassName } from './constants.js';

// Re-export ruler utilities
export {
  generateRulerDefinition,
  generateRulerDefinitionFromPx,
  createRulerElement,
  ensureRulerStyles,
  clampHandlePosition,
  calculateMarginFromHandle,
  RULER_CLASS_NAMES,
} from './ruler/index.js';
export type {
  RulerDefinition,
  RulerConfig,
  RulerConfigPx,
  RulerTick,
  CreateRulerElementOptions,
} from './ruler/index.js';
export type { RulerOptions } from './renderer.js';
export type {
  PaintSnapshot,
  PaintSnapshotAnnotationEntity,
  PaintSnapshotStructuredContentBlockEntity,
  PaintSnapshotStructuredContentInlineEntity,
  PaintSnapshotImageEntity,
  PaintSnapshotEntities,
} from './renderer.js';
export type { DomPainterInput, PositionMapping, RenderedLineInfo } from './renderer.js';

// Re-export utility functions for testing
export { sanitizeUrl, linkMetrics, applyRunDataAttributes } from './renderer.js';

export { applySquareWrapExclusionsToLines } from './utils/anchor-helpers';
export { buildImagePmSelector, buildInlineImagePmSelector } from './utils/image-selectors.js';

// Re-export PM position validation utilities
export {
  assertPmPositions,
  assertFragmentPmPositions,
  validateRenderedElement,
  logValidationSummary,
  resetValidationStats,
  getValidationStats,
  globalValidationStats,
} from './pm-position-validation.js';
export type { PmPositionValidationStats } from './pm-position-validation.js';

// Re-export proofing decoration utilities
export { applyProofingDecorations, clearProofingDecorations, PROOFING_CSS } from './proofing/index.js';
export type { ProofingAnnotation } from './proofing/index.js';

export type LayoutMode = 'vertical' | 'horizontal' | 'book';
export type { FlowMode } from './renderer.js';
export type PageDecorationPayload = {
  fragments: Fragment[];
  height: number;
  /**
   * Decoration fragments are expressed in header/footer-local coordinates.
   * Header/footer layout normalizes page- and margin-relative anchors before
   * they reach the painter.
   */
  /** Optional measured content height; when provided, footer content will be bottom-aligned within its box. */
  contentHeight?: number;
  offset?: number;
  marginLeft?: number;
  contentWidth?: number;
  headerFooterRefId?: string;
  sectionType?: string;
  /** Minimum Y coordinate from layout; negative when content extends above y=0 */
  minY?: number;
  box?: { x: number; y: number; width: number; height: number };
  hitRegion?: { x: number; y: number; width: number; height: number };
};

export type PageDecorationProvider = (
  pageNumber: number,
  pageMargins?: PageMargins,
  page?: Page,
) => PageDecorationPayload | null;

export type DomPainterOptions = {
  /**
   * Legacy compatibility: initial body block data.
   * New callers should pass block data through `paint(input, mount)`.
   */
  blocks?: FlowBlock[];
  /**
   * Legacy compatibility: initial body measures.
   * New callers should pass measure data through `paint(input, mount)`.
   */
  measures?: Measure[];
  pageStyles?: PageStyles;
  layoutMode?: LayoutMode;
  flowMode?: FlowMode;
  /** Gap between pages in pixels (default: 24px for vertical, 20px for horizontal) */
  pageGap?: number;
  headerProvider?: PageDecorationProvider;
  footerProvider?: PageDecorationProvider;
  /**
   * Feature-flagged page virtualization.
   * When enabled (vertical mode only), the painter renders only a sliding window of pages
   * with top/bottom spacers representing offscreen content height.
   */
  virtualization?: {
    enabled?: boolean;
    /** Max number of pages in DOM at any time. Default: 5 */
    window?: number;
    /** Extra pages to render before/after the window (per side). Default: 0 */
    overscan?: number;
    /**
     * Gap between pages used for spacer math (px). When set, container gap is overridden
     * to this value during virtualization. Defaults to the effective `pageGap`.
     */
    gap?: number;
    /** Optional mount padding-top override (px) used in scroll mapping; defaults to computed style. */
    paddingTop?: number;
  };
  /**
   * Per-page ruler options.
   * When enabled, renders a horizontal ruler at the top of each page showing
   * inch marks and optionally margin handles for interactive margin adjustment.
   */
  ruler?: RulerOptions;
  /** Called with the paint snapshot after each paint cycle completes. */
  onPaintSnapshot?: (snapshot: PaintSnapshot) => void;
};

type LegacyDomPainterState = {
  blocks: FlowBlock[];
  measures: Measure[];
  headerBlocks?: FlowBlock[];
  headerMeasures?: Measure[];
  footerBlocks?: FlowBlock[];
  footerMeasures?: Measure[];
  resolvedLayout: ResolvedLayout | null;
};

type BlockMeasurePair = {
  blocks: FlowBlock[];
  measures: Measure[];
};

export type DomPainterHandle = {
  paint(input: DomPainterInput | Layout, mount: HTMLElement, mapping?: PositionMapping): void;
  /**
   * Legacy compatibility API.
   * New callers should pass block/measure data via `paint(input, mount)`.
   */
  setData(
    blocks: FlowBlock[],
    measures: Measure[],
    headerBlocks?: FlowBlock[],
    headerMeasures?: Measure[],
    footerBlocks?: FlowBlock[],
    footerMeasures?: Measure[],
  ): void;
  /**
   * Legacy compatibility API.
   * New callers should pass resolved data via `paint(input, mount)`.
   */
  setResolvedLayout(resolvedLayout: ResolvedLayout | null): void;
  setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider): void;
  setVirtualizationPins(pageIndices: number[] | null | undefined): void;
  getMountedPageIndices(): number[];
  onScroll(): void;
  setZoom(zoom: number): void;
  setScrollContainer(el: HTMLElement | null): void;
};

function assertRequiredBlockMeasurePair(label: string, blocks: FlowBlock[], measures: Measure[]): void {
  if (blocks.length !== measures.length) {
    throw new Error(`${label} blocks and measures must have the same length.`);
  }
}

function normalizeOptionalBlockMeasurePair(
  label: 'header' | 'footer',
  blocks: FlowBlock[] | undefined,
  measures: Measure[] | undefined,
): BlockMeasurePair | undefined {
  const hasBlocks = blocks !== undefined;
  const hasMeasures = measures !== undefined;

  if (hasBlocks !== hasMeasures) {
    throw new Error(`${label}Blocks and ${label}Measures must both be provided or both be omitted.`);
  }

  if (!hasBlocks || !hasMeasures) {
    return undefined;
  }

  assertRequiredBlockMeasurePair(label, blocks, measures);
  return { blocks, measures };
}

function createEmptyResolvedLayout(flowMode: FlowMode | undefined, pageGap: number | undefined): ResolvedLayout {
  return {
    version: 1,
    flowMode: flowMode ?? 'paginated',
    pageGap: pageGap ?? 0,
    pages: [],
  };
}

function isDomPainterInput(value: DomPainterInput | Layout): value is DomPainterInput {
  return 'resolvedLayout' in value && 'sourceLayout' in value && 'blocks' in value && 'measures' in value;
}

function buildLegacyPaintInput(
  layout: Layout,
  legacyState: LegacyDomPainterState,
  flowMode: FlowMode | undefined,
  pageGap: number | undefined,
): DomPainterInput {
  return {
    resolvedLayout: legacyState.resolvedLayout ?? createEmptyResolvedLayout(flowMode, pageGap),
    sourceLayout: layout,
    blocks: legacyState.blocks,
    measures: legacyState.measures,
    headerBlocks: legacyState.headerBlocks,
    headerMeasures: legacyState.headerMeasures,
    footerBlocks: legacyState.footerBlocks,
    footerMeasures: legacyState.footerMeasures,
  };
}

export const createDomPainter = (options: DomPainterOptions): DomPainterHandle => {
  if ((options.blocks ?? []).length !== (options.measures ?? []).length) {
    throw new Error('DomPainter requires the same number of blocks and measures');
  }

  const painter = new DomPainter({
    pageStyles: options.pageStyles,
    layoutMode: options.layoutMode,
    flowMode: options.flowMode,
    pageGap: options.pageGap,
    headerProvider: options.headerProvider,
    footerProvider: options.footerProvider,
    virtualization: options.virtualization,
    ruler: options.ruler,
    onPaintSnapshot: options.onPaintSnapshot,
  });

  const legacyState: LegacyDomPainterState = {
    blocks: options.blocks ?? [],
    measures: options.measures ?? [],
    resolvedLayout: null,
  };

  return {
    paint(input: DomPainterInput | Layout, mount: HTMLElement, mapping?: PositionMapping) {
      const normalizedInput = isDomPainterInput(input)
        ? input
        : buildLegacyPaintInput(input, legacyState, options.flowMode, options.pageGap);
      painter.paint(normalizedInput, mount, mapping);
    },
    setData(
      blocks: FlowBlock[],
      measures: Measure[],
      headerBlocks?: FlowBlock[],
      headerMeasures?: Measure[],
      footerBlocks?: FlowBlock[],
      footerMeasures?: Measure[],
    ) {
      assertRequiredBlockMeasurePair('body', blocks, measures);
      const normalizedHeader = normalizeOptionalBlockMeasurePair('header', headerBlocks, headerMeasures);
      const normalizedFooter = normalizeOptionalBlockMeasurePair('footer', footerBlocks, footerMeasures);

      legacyState.blocks = blocks;
      legacyState.measures = measures;
      legacyState.headerBlocks = normalizedHeader?.blocks;
      legacyState.headerMeasures = normalizedHeader?.measures;
      legacyState.footerBlocks = normalizedFooter?.blocks;
      legacyState.footerMeasures = normalizedFooter?.measures;
    },
    setResolvedLayout(resolvedLayout: ResolvedLayout | null) {
      legacyState.resolvedLayout = resolvedLayout;
    },
    setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider) {
      painter.setProviders(header, footer);
    },
    setVirtualizationPins(pageIndices: number[] | null | undefined) {
      painter.setVirtualizationPins(pageIndices);
    },
    getMountedPageIndices() {
      return painter.getMountedPageIndices();
    },
    onScroll() {
      painter.onScroll();
    },
    setZoom(zoom: number) {
      painter.setZoom(zoom);
    },
    setScrollContainer(el: HTMLElement | null) {
      painter.setScrollContainer(el);
    },
  };
};
