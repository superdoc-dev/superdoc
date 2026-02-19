import type { TableBlock, TableMeasure, TableFragment } from '@superdoc/contracts';

export type PageState = {
  page: { fragments: unknown[] };
  columnIndex: number;
  cursorY: number;
  contentBottom: number;
};

/**
 * Ratio of column width (0..1). An anchored table with totalWidth >= columnWidth * this value
 * is treated as full-width and laid out inline instead of as a floating fragment.
 */
export declare const ANCHORED_TABLE_FULL_WIDTH_RATIO: number;
export type TableLayoutContext = {
  block: TableBlock;
  measure: TableMeasure;
  columnWidth: number;
  ensurePage: () => PageState;
  advanceColumn: (state: PageState) => PageState;
  columnX: (columnIndex: number) => number;
};
export declare function layoutTableBlock({
  block,
  measure,
  columnWidth,
  ensurePage,
  advanceColumn,
  columnX,
}: TableLayoutContext): void;
export declare function createAnchoredTableFragment(
  block: TableBlock,
  measure: TableMeasure,
  x: number,
  y: number,
): TableFragment;
