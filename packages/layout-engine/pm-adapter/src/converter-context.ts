/**
 * Converter Context Types
 *
 * Provides lightweight type definitions for data that flows from the
 * SuperConverter (DOCX import pipeline) into the layout-engine adapter.
 *
 * The context is intentionally minimal to avoid tight coupling; helpers
 * should always guard for undefined fields and degrade gracefully.
 */

import type { ParagraphSpacing } from '@superdoc/contracts';
import type { NumberingProperties, StylesDocumentProperties, TableInfo } from '@superdoc/style-engine/ooxml';

/**
 * Paragraph properties from a table style that should be applied to
 * paragraphs inside table cells as part of the OOXML style cascade.
 */
export type TableStyleParagraphProps = {
  spacing?: ParagraphSpacing;
};

export type ConverterContext = {
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
