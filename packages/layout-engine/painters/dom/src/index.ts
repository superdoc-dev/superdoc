import { DomPainter } from './renderer.js';
import type { PageStyles } from './styles.js';
import type {
  DomPainterInput,
  PageDecorationPayload,
  PageDecorationProvider,
  PaintSnapshot,
  PositionMapping,
  RulerOptions,
  FlowMode,
} from './renderer.js';

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
export type { DomPainterInput, PositionMapping } from './renderer.js';
export type { RenderedLineInfo } from './runs/index.js';

// Re-export utility functions for testing
export { sanitizeUrl, linkMetrics, applyRunDataAttributes } from './runs/index.js';

export { applySquareWrapExclusionsToLines } from './utils/anchor-helpers';
export { buildImagePmSelector, buildInlineImagePmSelector } from './images/image-selectors.js';

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
export type { FlowMode } from './renderer.js';
export type { PageDecorationPayload, PageDecorationProvider } from './renderer.js';

export type DomPainterOptions = {
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
  /** Render nonprinting formatting marks such as spaces, tabs, and paragraph marks. */
  showFormattingMarks?: boolean;
  /** Built-in SDT chrome rendering mode. */
  contentControlsChrome?: 'default' | 'none';
  /**
   * Per-document logical->physical font resolver (a CSS-stack resolver). The painter paints each
   * run in the family this returns - e.g. Carlito for Calibri - the SAME family measurement used,
   * so glyph advances match the laid-out positions. Set per painter instance (per document) so two
   * editors can map one logical family differently. Defaults to the global bundled resolver.
   */
  resolvePhysical?: (cssFontFamily: string, face: { weight: '400' | '700'; style: 'normal' | 'italic' }) => string;
};

export type DomPainterHandle = {
  paint(input: DomPainterInput, mount: HTMLElement, mapping?: PositionMapping): void;
  setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider): void;
  setVirtualizationPins(pageIndices: number[] | null | undefined): void;
  getMountedPageIndices(): number[];
  onScroll(): void;
  setZoom(zoom: number): void;
  setScrollContainer(el: HTMLElement | null): void;
  setShowFormattingMarks(showFormattingMarks: boolean): void;
};

/**
 * Thin pass-through factory: instantiates DomPainter with the supplied options
 * and returns a stable handle that exposes only the rendering-stage API.
 *
 * The handle accepts only `DomPainterInput` (resolvedLayout-only).
 * Header/footer decoration providers must supply both `fragments` and `items`
 * on their `PageDecorationPayload`.
 */
export const createDomPainter = (options: DomPainterOptions): DomPainterHandle => {
  const painter = new DomPainter(options);
  return {
    paint(input: DomPainterInput, mount: HTMLElement, mapping?: PositionMapping) {
      painter.paint(input, mount, mapping);
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
    setShowFormattingMarks(showFormattingMarks: boolean) {
      painter.setShowFormattingMarks(showFormattingMarks);
    },
  };
};
