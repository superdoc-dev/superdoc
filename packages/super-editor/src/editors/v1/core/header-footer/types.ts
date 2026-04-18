/**
 * Shared header/footer types.
 *
 * Canonical definitions for header/footer region data used across
 * PresentationEditor, EditorOverlayManager, and HeaderFooterSessionManager.
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

  /** X coordinate relative to page */
  localX: number;

  /** Y coordinate relative to page */
  localY: number;

  /** Width of the region in pixels */
  width: number;

  /** Height of the region in pixels */
  height: number;

  /** Content height from layout (used for footer positioning) */
  contentHeight?: number;

  /**
   * Minimum Y coordinate from layout (can be negative if content extends above y=0).
   * Used to adjust editor host positioning for content with negative offsets.
   */
  minY?: number;
};
