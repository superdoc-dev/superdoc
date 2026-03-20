import type {
  ColumnLayout,
  FlowBlock,
  FlowMode,
  HeaderFooterLayout,
  Layout,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
} from '@superdoc/contracts';
type PageSize = {
  w: number;
  h: number;
};
type Margins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  header?: number;
  footer?: number;
};
export type LayoutOptions = {
  pageSize?: PageSize;
  margins?: Margins;
  columns?: ColumnLayout;
  flowMode?: FlowMode;
  semantic?: {
    contentWidth?: number;
    marginLeft?: number;
    marginRight?: number;
    marginTop?: number;
    marginBottom?: number;
  };
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number, firstLineIndent?: number) => ParagraphMeasure;
};
export declare const SEMANTIC_PAGE_HEIGHT_PX = 1000000;
export type HeaderFooterConstraints = {
  width: number;
  /** Body content height used as the measurement canvas (pagination boundary). */
  height: number;
  /** Actual page width for page-relative anchor positioning. */
  pageWidth?: number;
  /** Physical page height for vertical page-relative anchor conversion. */
  pageHeight?: number;
  /**
   * Page margins for anchor positioning.
   * `left`/`right`: horizontal page-relative conversion.
   * `top`/`bottom`: vertical margin-relative conversion and footer band origin.
   * `header`: header distance from page top edge (header band origin).
   */
  margins?: {
    left: number;
    right: number;
    top?: number;
    bottom?: number;
    header?: number;
  };
  /**
   * Optional base height used to bound behindDoc overflow handling.
   * When provided, decorative assets far outside the header/footer band
   * won't inflate layout height.
   */
  overflowBaseHeight?: number;
};
/**
 * Layout FlowBlocks into paginated fragments using measured line data.
 *
 * The function is intentionally deterministic: it walks the provided
 * FlowBlocks in order, consumes their Measure objects (same index),
 * and greedily stacks fragments inside the content box of each page/column.
 */
export declare function layoutDocument(blocks: FlowBlock[], measures: Measure[], options?: LayoutOptions): Layout;
export declare function layoutHeaderFooter(
  blocks: FlowBlock[],
  measures: Measure[],
  constraints: HeaderFooterConstraints,
  kind?: 'header' | 'footer',
): HeaderFooterLayout;
export { normalizeFragmentsForRegion } from './normalize-header-footer-fragments.js';
export { buildAnchorMap, resolvePageRefTokens, getTocBlocksForRemeasurement } from './resolvePageRefs.js';
export { formatPageNumber, computeDisplayPageNumber } from './pageNumbering.js';
export type { PageNumberFormat, DisplayPageInfo } from './pageNumbering.js';
