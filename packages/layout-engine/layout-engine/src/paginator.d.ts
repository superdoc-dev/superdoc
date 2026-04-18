import type { ColumnLayout, Page, PageMargins } from '@superdoc/contracts';
export type NormalizedColumns = ColumnLayout & {
  width: number;
};
export type ConstraintBoundary = {
  y: number;
  columns: {
    count: number;
    gap: number;
  };
};
export type PageState = {
  page: Page;
  cursorY: number;
  columnIndex: number;
  topMargin: number;
  contentBottom: number;
  constraintBoundaries: ConstraintBoundary[];
  activeConstraintIndex: number;
  trailingSpacing: number;
  lastParagraphStyleId?: string;
  lastParagraphContextualSpacing: boolean;
};
export type PaginatorOptions = {
  margins: {
    left: number;
    right: number;
  };
  getActiveTopMargin(): number;
  getActiveBottomMargin(): number;
  getActiveHeaderDistance(): number;
  getActiveFooterDistance(): number;
  getActivePageSize(): {
    w: number;
    h: number;
  };
  getDefaultPageSize(): {
    w: number;
    h: number;
  };
  getActiveColumns(): {
    count: number;
    gap: number;
  };
  getCurrentColumns(): NormalizedColumns;
  createPage(
    number: number,
    pageMargins: PageMargins,
    pageSizeOverride?: {
      w: number;
      h: number;
    },
  ): Page;
  onNewPage?: (state: PageState) => void;
};
export declare function createPaginator(opts: PaginatorOptions): {
  readonly pages: Page[];
  readonly states: PageState[];
  readonly startNewPage: () => PageState;
  readonly ensurePage: () => PageState;
  readonly advanceColumn: (state: PageState) => PageState;
  readonly columnX: (columnIndex: number) => number;
  readonly getActiveColumnsForState: (state: PageState) => {
    count: number;
    gap: number;
  };
};
