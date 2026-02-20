import type {
  FlowBlock,
  Fragment,
  Layout,
  Measure,
  Page,
  PainterDOM,
  PageMargins,
  PositionMapping,
} from '@superdoc/contracts';
import { DomPainter } from './renderer.js';
import type { PageStyles } from './styles.js';
import type { PaintSnapshot, RulerOptions } from './renderer.js';

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
export type { PaintSnapshot } from './renderer.js';

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

export type LayoutMode = 'vertical' | 'horizontal' | 'book';
export type PageDecorationPayload = {
  fragments: Fragment[];
  height: number;
  /** Optional measured content height; when provided, footer content will be bottom-aligned within its box. */
  contentHeight?: number;
  offset?: number;
  marginLeft?: number;
  contentWidth?: number;
  headerId?: string;
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
  blocks: FlowBlock[];
  measures: Measure[];
  pageStyles?: PageStyles;
  layoutMode?: LayoutMode;
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
     * to this value during virtualization. Default approximates existing margin+gap look: 72.
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
};

export const createDomPainter = (
  options: DomPainterOptions,
): PainterDOM & {
  setProviders?: (header?: PageDecorationProvider, footer?: PageDecorationProvider) => void;
  setVirtualizationPins?: (pageIndices: number[] | null | undefined) => void;
  setActiveComment?: (commentId: string | null) => void;
  getActiveComment?: () => string | null;
  getPaintSnapshot?: () => PaintSnapshot | null;
  onScroll?: () => void;
} => {
  const painter = new DomPainter(options.blocks, options.measures, {
    pageStyles: options.pageStyles,
    layoutMode: options.layoutMode,
    pageGap: options.pageGap,
    headerProvider: options.headerProvider,
    footerProvider: options.footerProvider,
    virtualization: options.virtualization,
    ruler: options.ruler,
  });

  return {
    paint(layout: Layout, mount: HTMLElement, mapping?: PositionMapping) {
      painter.paint(layout, mount, mapping);
    },
    setData(
      blocks: FlowBlock[],
      measures: Measure[],
      headerBlocks?: FlowBlock[],
      headerMeasures?: Measure[],
      footerBlocks?: FlowBlock[],
      footerMeasures?: Measure[],
    ) {
      painter.setData(blocks, measures, headerBlocks, headerMeasures, footerBlocks, footerMeasures);
    },
    // Non-standard extension for demo app to avoid re-instantiating on provider changes
    setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider) {
      painter.setProviders(header, footer);
    },
    setVirtualizationPins(pageIndices: number[] | null | undefined) {
      painter.setVirtualizationPins(pageIndices);
    },
    setActiveComment(commentId: string | null) {
      painter.setActiveComment(commentId);
    },
    getActiveComment() {
      return painter.getActiveComment();
    },
    getPaintSnapshot() {
      return painter.getPaintSnapshot();
    },
    // Trigger virtualization update when scroll container is external to the painter
    onScroll() {
      painter.onScroll();
    },
  };
};
