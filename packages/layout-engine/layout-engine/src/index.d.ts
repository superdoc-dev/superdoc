import type {
  ColumnLayout,
  FlowBlock,
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
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number, firstLineIndent?: number) => ParagraphMeasure;
};
export type HeaderFooterConstraints = {
  width: number;
  height: number;
  /** Actual page width for page-relative anchor positioning */
  pageWidth?: number;
  /** Page margins for page-relative anchor positioning */
  margins?: { left: number; right: number };
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
): HeaderFooterLayout;
export { buildAnchorMap, resolvePageRefTokens, getTocBlocksForRemeasurement } from './resolvePageRefs.js';
export { formatPageNumber, computeDisplayPageNumber } from './pageNumbering.js';
export type { PageNumberFormat, DisplayPageInfo } from './pageNumbering.js';
