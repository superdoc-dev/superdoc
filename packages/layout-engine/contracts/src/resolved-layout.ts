import type { DrawingBlock, FlowMode, Fragment, ImageBlock, Line, TableBlock, TableMeasure } from './index.js';

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
export type ResolvedPaintItem =
  | ResolvedGroupItem
  | ResolvedFragmentItem
  | ResolvedTableItem
  | ResolvedImageItem
  | ResolvedDrawingItem;

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
  /** Pre-resolved paragraph content for non-table paragraph fragments. */
  content?: ResolvedParagraphContent;
};

/** Resolved paragraph content for non-table paragraph/list-item fragments. */
export type ResolvedParagraphContent = {
  /** The lines to render, with all layout data pre-resolved. */
  lines: ResolvedTextLineItem[];
  /** Drop cap rendering data. Only present on first fragment of a paragraph with a drop cap. */
  dropCap?: ResolvedDropCapItem;
  /** List marker rendering data. Only present on first fragment of a list paragraph. */
  marker?: ResolvedListMarkerItem;
  /** Whether this fragment continues from a previous page. */
  continuesFromPrev?: boolean;
  /** Whether this fragment continues on the next page. */
  continuesOnNext?: boolean;
  /** Whether the source paragraph ends with a lineBreak run. */
  paragraphEndsWithLineBreak?: boolean;
};

/** A single resolved text line with pre-computed rendering geometry. */
export type ResolvedTextLineItem = {
  /** The source Line data (segments, leaders, bars, dimensions, run indices). */
  line: Line;
  /** Global line index within the paragraph (fragment.fromLine + localIndex). */
  lineIndex: number;
  /** Pre-computed available width for justify calculations. */
  availableWidth: number;
  /** Whether to skip justification for this line (last line of paragraph). */
  skipJustify: boolean;
  /** Pre-computed CSS paddingLeft in pixels. */
  paddingLeftPx: number;
  /** Pre-computed CSS paddingRight in pixels. */
  paddingRightPx: number;
  /** Pre-computed CSS textIndent in pixels (0 when not applicable). */
  textIndentPx: number;
  /** Whether this is a list first line (indent handled by marker, not CSS). */
  isListFirstLine: boolean;
  /** Resolved text-start position for list first lines with explicit segment positioning. */
  resolvedListTextStartPx?: number;
  /** Whether this line has explicit segment positioning (tabs). */
  hasExplicitSegmentPositioning: boolean;
  /** Pre-computed indent offset for the segment positioning path in renderLine. */
  indentOffset: number;
};

/** Resolved drop cap rendering data. */
export type ResolvedDropCapItem = {
  /** Drop cap text content. */
  text: string;
  /** Drop cap mode. */
  mode: 'drop' | 'margin';
  /** Font family. */
  fontFamily: string;
  /** Font size in pixels. */
  fontSize: number;
  /** Bold styling. */
  bold?: boolean;
  /** Italic styling. */
  italic?: boolean;
  /** Text color. */
  color?: string;
  /** Vertical position offset in pixels. */
  position?: number;
  /** Measured width in pixels. */
  width?: number;
  /** Measured height in pixels. */
  height?: number;
};

// ============================================================================
// Kind-specific resolved items (PR7: table, image, drawing)
// ============================================================================

/**
 * A resolved table fragment with pre-extracted block/measure data.
 * Replaces blockLookup.get() in the table render path.
 */
export type ResolvedTableItem = {
  kind: 'fragment';
  /** Discriminant for table fragments. */
  fragmentKind: 'table';
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
  /** Height in pixels (from fragment.height). */
  height: number;
  /** Stacking order (tables typically don't have zIndex at fragment level). */
  zIndex?: number;
  /** Block ID — written to data-block-id. */
  blockId: string;
  /** Index within page.fragments — bridge to legacy rendering. */
  fragmentIndex: number;
  /** Pre-extracted TableBlock (replaces blockLookup.get()). */
  block: TableBlock;
  /** Pre-extracted TableMeasure (replaces blockLookup.get()). */
  measure: TableMeasure;
  /** Pre-computed cell spacing: measure.cellSpacingPx ?? getCellSpacingPx(block.attrs?.cellSpacing). */
  cellSpacingPx: number;
  /** Pre-computed effective column widths: fragment.columnWidths ?? measure.columnWidths. */
  effectiveColumnWidths: number[];
};

/**
 * A resolved image fragment with pre-extracted block data.
 * Replaces blockLookup.get() in the image render path.
 */
export type ResolvedImageItem = {
  kind: 'fragment';
  /** Discriminant for image fragments. */
  fragmentKind: 'image';
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
  /** Height in pixels. */
  height: number;
  /** Stacking order for anchored images. */
  zIndex?: number;
  /** Block ID — written to data-block-id. */
  blockId: string;
  /** Index within page.fragments — bridge to legacy rendering. */
  fragmentIndex: number;
  /** Pre-extracted ImageBlock (replaces blockLookup.get()). */
  block: ImageBlock;
};

/**
 * A resolved drawing fragment with pre-extracted block data.
 * Replaces blockLookup.get() in the drawing render path.
 */
export type ResolvedDrawingItem = {
  kind: 'fragment';
  /** Discriminant for drawing fragments. */
  fragmentKind: 'drawing';
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
  /** Height in pixels. */
  height: number;
  /** Stacking order for anchored drawings. */
  zIndex?: number;
  /** Block ID — written to data-block-id. */
  blockId: string;
  /** Index within page.fragments — bridge to legacy rendering. */
  fragmentIndex: number;
  /** Pre-extracted DrawingBlock (replaces blockLookup.get()). */
  block: DrawingBlock;
};

/** Type guard: checks whether a resolved paint item is a ResolvedTableItem. */
export function isResolvedTableItem(item: ResolvedPaintItem): item is ResolvedTableItem {
  return item.kind === 'fragment' && 'fragmentKind' in item && item.fragmentKind === 'table' && 'measure' in item;
}

/** Type guard: checks whether a resolved paint item is a ResolvedImageItem. */
export function isResolvedImageItem(item: ResolvedPaintItem): item is ResolvedImageItem {
  return item.kind === 'fragment' && 'fragmentKind' in item && item.fragmentKind === 'image' && 'block' in item;
}

/** Type guard: checks whether a resolved paint item is a ResolvedDrawingItem. */
export function isResolvedDrawingItem(item: ResolvedPaintItem): item is ResolvedDrawingItem {
  return item.kind === 'fragment' && 'fragmentKind' in item && item.fragmentKind === 'drawing' && 'block' in item;
}

/** Resolved list marker rendering data with pre-computed positioning. */
export type ResolvedListMarkerItem = {
  /** Marker text content (e.g., "1.", "a)", bullet). */
  text: string;
  /** Horizontal justification. */
  justification: 'left' | 'right' | 'center';
  /** Suffix type after marker. */
  suffix: 'tab' | 'space' | 'nothing';
  /** Whether marker should be hidden (vanish property). */
  vanish?: boolean;
  /** Pre-computed left position of marker container in pixels. */
  markerStartPx: number;
  /** Pre-computed tab/space suffix width in pixels. */
  suffixWidthPx: number;
  /** CSS paddingLeft for the first line when marker is present. */
  firstLinePaddingLeftPx: number;
  /** Extra padding adjustment for center-justified markers. */
  centerPaddingAdjustPx?: number;
  /** Marker run styling. */
  run: {
    fontFamily: string;
    fontSize: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    letterSpacing?: number;
  };
};
