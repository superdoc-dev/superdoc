import type { FlowMode, Fragment } from './index.js';

/** A fully resolved layout ready for the next-generation paint pipeline. */
export type ResolvedLayout = {
  /** Schema version for forward compatibility. */
  version: 1;
  /** Rendering flow mode used to produce this layout. */
  flowMode: FlowMode;
  /** Gap between pages in pixels (0 when unset). */
  pageGap: number;
  /** Resolved pages with normalized dimensions. */
  pages: ResolvedPage[];
};

/** A single resolved page with stable identity and normalized dimensions. */
export type ResolvedPage = {
  /** Stable page identifier (e.g. `page-0`). */
  id: string;
  /** 0-based page index. */
  index: number;
  /** 1-based page number (from Page.number). */
  number: number;
  /** Page width in pixels (resolved from page.size?.w ?? layout.pageSize.w). */
  width: number;
  /** Page height in pixels (resolved from page.size?.h ?? layout.pageSize.h). */
  height: number;
  /** Resolved paint items for this page. */
  items: ResolvedPaintItem[];
};

/** Union of all resolved paint item kinds. */
export type ResolvedPaintItem = ResolvedGroupItem | ResolvedFragmentItem;

/** A group of nested resolved paint items (for future use). */
export type ResolvedGroupItem = {
  kind: 'group';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: ResolvedPaintItem[];
};

/**
 * A resolved fragment wrapper item.
 * Carries positioning and metadata needed to create the fragment's DOM wrapper,
 * while inner content rendering is delegated to legacy fragment renderers via fragmentIndex.
 */
export type ResolvedFragmentItem = {
  kind: 'fragment';
  /** Stable identifier matching fragmentKey() semantics from the painter. */
  id: string;
  /** 0-based page index this item belongs to. */
  pageIndex: number;
  /** Left position in pixels. */
  x: number;
  /** Top position in pixels. */
  y: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels (computed from measure data for para/list-item). */
  height: number;
  /** Stacking order for anchored images/drawings. */
  zIndex?: number;
  /** Source fragment kind — used by the painter for wrapper style decisions. */
  fragmentKind: Fragment['kind'];
  /** Block ID — written to data-block-id and used for legacy content lookup. */
  blockId: string;
  /** Index within page.fragments — bridge to legacy content rendering. */
  fragmentIndex: number;
};
