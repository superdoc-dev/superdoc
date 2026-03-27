import type { FlowMode } from './index.js';

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
  /** Resolved paint items for this page (empty in PR4). */
  items: ResolvedPaintItem[];
};

/** Union of all resolved paint item kinds. Starts narrow, expands in future PRs. */
export type ResolvedPaintItem = ResolvedGroupItem;

/** A group of nested resolved paint items. */
export type ResolvedGroupItem = {
  kind: 'group';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: ResolvedPaintItem[];
};
