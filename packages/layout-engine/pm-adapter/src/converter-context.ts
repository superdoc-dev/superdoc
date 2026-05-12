/**
 * Converter Context Types
 *
 * Provides lightweight type definitions for data that flows from the
 * SuperConverter (DOCX import pipeline) into the layout-engine adapter.
 *
 * The context is intentionally minimal to avoid tight coupling; helpers
 * should always guard for undefined fields and degrade gracefully.
 */

import type { ParagraphSpacing, SectionDirectionContext } from '@superdoc/contracts';
import type { NumberingProperties, StylesDocumentProperties, TableInfo } from '@superdoc/style-engine/ooxml';

/**
 * Paragraph properties from a table style that should be applied to
 * paragraphs inside table cells as part of the OOXML style cascade.
 */
export type TableStyleParagraphProps = {
  spacing?: ParagraphSpacing;
};

export type ConverterContext = {
  sectionDirection?: 'ltr' | 'rtl';
  /**
   * Resolved direction context for the body section (page direction, writing mode,
   * gutter). Computed once from the body's `w:sectPr` and used by the paragraph
   * resolver chain so paragraph writing-mode can inherit from the section per
   * ECMA §17.3.1.41. Per-paragraph-section variation and table cell direction
   * context are not yet plumbed through; paragraphs in vertical sections covered
   * by paragraph-level `w:sectPr` and paragraphs in vertical table cells will
   * still see `writingMode: 'horizontal-tb'` until SD-2777 lands.
   */
  sectionDirectionContext?: SectionDirectionContext;
  docx?: Record<string, unknown>;
  translatedNumbering: NumberingProperties;
  translatedLinkedStyles: StylesDocumentProperties;
  /**
   * Optional mapping from OOXML footnote id -> display number.
   * Display numbers are assigned in order of first appearance in the document (1-based),
   * matching Word's visible numbering behavior even when ids are non-contiguous or start at 0.
   */
  footnoteNumberById?: Record<string, number>;
  /**
   * Optional mapping from OOXML endnote id -> display number.
   * Same semantics as footnoteNumberById but for endnotes.
   */
  endnoteNumberById?: Record<string, number>;
  /**
   * Paragraph properties inherited from the containing table's style.
   * Per OOXML spec, table styles can define pPr that applies to all
   * paragraphs within the table. This is set by the table converter
   * and read by paragraph converters inside table cells.
   *
   * Style cascade: docDefaults → tableStyleParagraphProps → paragraph style → direct formatting
   */
  tableInfo?: TableInfo;
  /**
   * Background color of the containing table cell (hex format, e.g., "#342D8C").
   * Used for auto text color resolution - text without explicit color should
   * contrast with the cell background per WCAG guidelines.
   */
  backgroundColor?: string;
  /**
   * Default table style ID from `w:defaultTableStyle` in document settings.
   * Used by table creation paths to determine which style to apply to new tables.
   */
  defaultTableStyleId?: string;
  /**
   * When true, emit visible gray `[` and `]` marker TextRuns at bookmarkStart
   * and bookmarkEnd positions — matching Word's "Show bookmarks" feature
   * (File > Options > Advanced). Off by default because bookmarks are a
   * structural concept, not a visual one. SD-2454.
   */
  showBookmarks?: boolean;

  /**
   * Populated by the bookmark-start inline converter during conversion: the
   * set of bookmark numeric ids (as strings) that actually rendered a start
   * marker. The bookmark-end converter reads this set to suppress emitting
   * an orphan `]` for a start it also suppressed (e.g. `_Toc…` / `_Ref…`
   * auto-generated bookmarks filtered out by the `showBookmarks` feature).
   * SD-2454.
   */
  renderedBookmarkIds?: Set<string>;
};

/**
 * Guard that checks whether DOCX data is available for table style lookups.
 *
 * Table style hydration only needs access to styles.xml, so numbering data
 * is optional.
 */
export const hasTableStyleContext = (
  context?: ConverterContext,
): context is ConverterContext & { docx: Record<string, unknown> } => {
  return Boolean(context?.docx);
};
