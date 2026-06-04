/**
 * Shared header/footer types.
 *
 * Canonical definitions for header/footer region data used across
 * PresentationEditor and HeaderFooterSessionManager.
 */

/**
 * Represents a header or footer region on a specific page with position,
 * dimension, and section identity data.
 *
 * `sectionId` and `sectionIndex` are required after `rebuildRegions()` —
 * they identify the document section this region belongs to so that
 * materialization helpers can target the correct sectPr.
 */
export type HeaderFooterRegion = {
  /** Type of region: header or footer */
  kind: 'header' | 'footer';

  /** Relationship ID of the header/footer content (formerly `headerId`) */
  headerFooterRefId?: string;

  /** Section type/variant (default, first, even, odd) */
  sectionType?: string;

  /** Actual matched variant supplying the bound part, when it differs from `sectionType`. */
  matchedVariant?: string;

  /** Document section ID (e.g. "section-0") — required after rebuildRegions */
  sectionId: string;

  /** Zero-based section index — required after rebuildRegions */
  sectionIndex: number;

  /** Zero-based page index */
  pageIndex: number;

  /** One-based page number for display */
  pageNumber: number;

  /** Section-aware display page number (e.g. "7" when physical page is 10 due to section numbering) */
  displayPageNumber?: string;

  /** Numeric section-aware display page number before PAGE field-local formatting */
  displayPageNumberValue?: number;

  /** Chapter prefix for PAGE fields on this page, when chapter numbering is enabled */
  displayPageChapterNumberText?: string;

  /** Separator between chapter prefix and PAGE component */
  displayPageChapterSeparator?: 'hyphen' | 'period' | 'colon' | 'emDash' | 'enDash';

  /** Physical page count in this region's section */
  sectionPageCount?: number;

  /** X coordinate relative to page */
  localX: number;

  /** Y coordinate relative to page */
  localY: number;

  /** Width of the region in pixels */
  width: number;

  /** Height of the region in pixels */
  height: number;

  /** Rendered content height from layout when known. */
  contentHeight?: number;

  /**
   * Minimum Y coordinate from layout (can be negative if content extends above y=0).
   * Used to adjust editor host positioning for content with negative offsets.
   */
  minY?: number;
};

// =============================================================================
// Read-only story-part layout snapshot types
// =============================================================================
//
// These describe facts the editor already knows after a normal layout pass —
// per-page header/footer bindings and the raw/resolved layout for each distinct
// header/footer story. They are deliberately editor-neutral and read-only: a
// plain, JSON-safe projection of internal manager state (no Maps, DOM nodes, or
// editor/session instances) that an out-of-process consumer can serialize and
// diff path-by-path.
//
// The top-level name (`HeaderFooterLayoutSnapshot`) and the generic story shape
// (`storyKey` / `kind` / `rawLayout` / `resolvedLayout`) are intentionally shaped
// so later story families (footnotes, endnotes, textboxes) can be added without
// a schema rewrite.

/** Story family this snapshot describes. Headers and footers today; extensible. */
export type HeaderFooterStoryKind = 'header' | 'footer';

/** Geometry of a header/footer band on a page, in layout pixels (rounded). */
export type HeaderFooterRegionSnapshot = {
  /** X coordinate relative to the page. */
  localX: number;
  /** Y coordinate relative to the page. */
  localY: number;
  /** Width of the band. */
  width: number;
  /** Height of the band. */
  height: number;
  /** Rendered content height when known (footer positioning), else null. */
  contentHeight: number | null;
};

/** Which story is bound to a header/footer band on a single page. */
export type HeaderFooterStoryBinding = {
  /** Stable, section-aware key joining this binding to a `storyLayouts` entry, or null when no story is bound. */
  storyKey: string | null;
  /** Relationship id of the bound header/footer part, or null. */
  refId: string | null;
  /** Resolved variant for the page (`default` | `first` | `even` | `odd`), or null. */
  variant: string | null;
  /** Band geometry, or null when no band exists for the page. */
  region: HeaderFooterRegionSnapshot | null;
};

/** Which header/footer stories are active on a given body page. */
export type HeaderFooterPageBinding = {
  /** Zero-based page index. */
  pageIndex: number;
  /** One-based page number. */
  pageNumber: number;
  /** Zero-based section index this page belongs to. */
  sectionIndex: number;
  /** Header binding for the page, or null when the page has no header band. */
  header: HeaderFooterStoryBinding | null;
  /** Footer binding for the page, or null when the page has no footer band. */
  footer: HeaderFooterStoryBinding | null;
};

/** A single fragment placement in a raw header/footer layout (geometry + identity). */
export type HeaderFooterFragmentSummary = {
  /** Fragment kind (`para`, `table`, `image`, `drawing`, `list-item`). */
  kind: string;
  /** Source block id, or null. */
  blockId: string | null;
  /** Left position in layout pixels (rounded). */
  x: number;
  /** Top position in layout pixels (rounded). */
  y: number;
  /** Width in layout pixels (rounded), or null when not carried by the fragment. */
  width: number | null;
  /** Height in layout pixels (rounded), or null when not carried by the fragment. */
  height: number | null;
};

/** One raw header/footer layout page. */
export type HeaderFooterRawPageSummary = {
  /** One-based slot page number. */
  number: number;
  /** Section-aware numeric page value before formatting, or null. */
  displayNumber: number | null;
  /** Formatted page-number text, or null. */
  numberText: string | null;
  /** Fragment placements on this page. */
  fragments: HeaderFooterFragmentSummary[];
};

/** Raw (pre-resolve) header/footer story layout summary. */
export type HeaderFooterRawLayoutSummary = {
  /** Measurement height for pagination. */
  height: number;
  /** Minimum y of all rendered fragments, or null. */
  minY: number | null;
  /** Maximum y of all rendered fragments, or null. */
  maxY: number | null;
  /** Full visual extent of all rendered fragments, or null. */
  renderHeight: number | null;
  /** Pages, ordered by slot number. */
  pages: HeaderFooterRawPageSummary[];
};

/** A single resolved paint item in a header/footer layout (geometry + identity). */
export type HeaderFooterResolvedItemSummary = {
  /** Resolved item kind (`group` | `fragment` | `table` | `image` | `drawing`). */
  kind: string;
  /** Source block id, or null (groups have none). */
  blockId: string | null;
  /** Underlying fragment kind for fragment items, or null. */
  fragmentKind: string | null;
  /** Left position in layout pixels (rounded). */
  x: number;
  /** Top position in layout pixels (rounded). */
  y: number;
  /** Width in layout pixels (rounded), or null. */
  width: number | null;
  /** Height in layout pixels (rounded), or null. */
  height: number | null;
  /** Number of children for group items, or null. */
  childCount: number | null;
};

/** One resolved header/footer layout page. */
export type HeaderFooterResolvedPageSummary = {
  /** One-based slot page number. */
  number: number;
  /** Section-aware numeric page value before formatting, or null. */
  displayNumber: number | null;
  /** Formatted page-number text, or null. */
  numberText: string | null;
  /** Resolved paint items on this page. */
  items: HeaderFooterResolvedItemSummary[];
};

/** Resolved (post-resolve) header/footer story layout summary. */
export type HeaderFooterResolvedLayoutSummary = {
  /** Measurement height for pagination. */
  height: number;
  /** Minimum y of all rendered items, or null. */
  minY: number | null;
  /** Maximum y of all rendered items, or null. */
  maxY: number | null;
  /** Full visual extent of all rendered items, or null. */
  renderHeight: number | null;
  /** Pages, ordered by slot number. */
  pages: HeaderFooterResolvedPageSummary[];
};

/** A single header/footer story's identity plus its raw and resolved layouts. */
export type HeaderFooterStoryLayoutSnapshot = {
  /** Stable, section-aware story key (reuses the manager's per-rId layout key). */
  storyKey: string;
  /** Story family. */
  kind: HeaderFooterStoryKind;
  /** Relationship id of the part, or null when not derivable. */
  refId: string | null;
  /** Body section indices that reference this story, sorted ascending. */
  sectionIndices: number[];
  /** Raw layout summary, or null when no raw layout is available. */
  rawLayout: HeaderFooterRawLayoutSummary | null;
  /** Resolved layout summary, or null when no resolved layout is available. */
  resolvedLayout: HeaderFooterResolvedLayoutSummary | null;
};

/**
 * Read-only header/footer story-part layout snapshot: per-page bindings plus the
 * raw and resolved layout for each distinct story, grouped by family. Stable
 * ordering — page bindings sorted by `pageIndex`, story entries sorted by
 * `storyKey` — so repeated reads serialize identically.
 */
export type HeaderFooterLayoutSnapshot = {
  /** Per body page, which header/footer story applies. Sorted by `pageIndex`. */
  pageBindings: HeaderFooterPageBinding[];
  /** Raw and resolved layout for each distinct story, grouped by family. */
  storyLayouts: {
    /** Header stories, sorted by `storyKey`. */
    headers: HeaderFooterStoryLayoutSnapshot[];
    /** Footer stories, sorted by `storyKey`. */
    footers: HeaderFooterStoryLayoutSnapshot[];
  };
};
