import type { ColumnLayout, Page, PageMargins } from '@superdoc/contracts';

export type NormalizedColumns = ColumnLayout & { width: number };

export type ConstraintBoundary = {
  y: number;
  columns: { count: number; gap: number; withSeparator?: boolean };
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
};

export type PaginatorOptions = {
  margins: { left: number; right: number };
  getActiveTopMargin(): number;
  getActiveBottomMargin(): number;
  getActiveHeaderDistance(): number;
  getActiveFooterDistance(): number;
  getActivePageSize(): { w: number; h: number };
  getDefaultPageSize(): { w: number; h: number };
  getActiveColumns(): { count: number; gap: number; withSeparator?: boolean };
  getCurrentColumns(): NormalizedColumns;
  createPage(number: number, pageMargins: PageMargins, pageSizeOverride?: { w: number; h: number }): Page;
  onNewPage?: (state: PageState) => void;
};

export function createPaginator(opts: PaginatorOptions) {
  const states: PageState[] = [];
  const pages: Page[] = [];

  const getActiveColumnsForState = (state: PageState): { count: number; gap: number; withSeparator?: boolean } => {
    if (state.activeConstraintIndex >= 0 && state.constraintBoundaries[state.activeConstraintIndex]) {
      return state.constraintBoundaries[state.activeConstraintIndex].columns;
    }
    return opts.getActiveColumns();
  };

  const columnX = (columnIndex: number): number => {
    const cols = opts.getCurrentColumns();
    return opts.margins.left + columnIndex * (cols.width + cols.gap);
  };

  const startNewPage = (): PageState => {
    // Allow caller to update state (e.g., apply pending→active) before we snapshot margins/size
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (opts.onNewPage) opts.onNewPage(undefined as any);
    const topMargin = opts.getActiveTopMargin();
    const bottomMargin = opts.getActiveBottomMargin();
    const headerDistance = opts.getActiveHeaderDistance();
    const footerDistance = opts.getActiveFooterDistance();
    const currentPageSize = opts.getActivePageSize();
    const defaultPageSize = opts.getDefaultPageSize();

    const contentBottom = currentPageSize.h - bottomMargin;
    const contentHeight = contentBottom - topMargin;

    if (contentHeight <= 0) {
      throw new Error('layoutDocument: pageSize and margins yield non-positive content area');
    }
    const pageMargins: PageMargins = {
      top: topMargin,
      bottom: bottomMargin,
      left: opts.margins.left,
      right: opts.margins.right,
      header: headerDistance,
      footer: footerDistance,
    };

    const pageSizeOverride =
      currentPageSize.w !== defaultPageSize.w || currentPageSize.h !== defaultPageSize.h ? currentPageSize : undefined;

    const state: PageState = {
      page: opts.createPage(pages.length + 1, pageMargins, pageSizeOverride),
      cursorY: topMargin,
      columnIndex: 0,
      topMargin,
      contentBottom,
      constraintBoundaries: [],
      activeConstraintIndex: -1,
      trailingSpacing: 0,
      lastParagraphStyleId: undefined,
    };
    states.push(state);
    pages.push(state.page);
    if (opts.onNewPage) opts.onNewPage(state);
    return state;
  };

  const ensurePage = (): PageState => {
    const last = states[states.length - 1];
    if (last) return last;
    return startNewPage();
  };

  const advanceColumn = (state: PageState): PageState => {
    const activeCols = getActiveColumnsForState(state);
    if (state.columnIndex < activeCols.count - 1) {
      state.columnIndex += 1;
      if (state.activeConstraintIndex >= 0 && state.constraintBoundaries[state.activeConstraintIndex]) {
        state.cursorY = state.constraintBoundaries[state.activeConstraintIndex].y;
      } else {
        state.cursorY = state.topMargin;
      }
      state.trailingSpacing = 0;
      state.lastParagraphStyleId = undefined;
      return state;
    }
    return startNewPage();
  };

  const getPageByNumber = (pageNumber: number): PageState => {
    return states.find((s) => s.page.number === pageNumber) ?? ensurePage();
  };

  return {
    pages,
    states,
    startNewPage,
    ensurePage,
    advanceColumn,
    columnX,
    getActiveColumnsForState,
    getPageByNumber,
  } as const;
}
