/**
 * Converter Context Types
 *
 * Provides lightweight type definitions for data that flows from the
 * SuperConverter (DOCX import pipeline) into the layout-engine adapter.
 *
 * The context is intentionally minimal to avoid tight coupling; helpers
 * should always guard for undefined fields and degrade gracefully.
 */
export type ConverterNumberingContext = {
  definitions?: Record<string, unknown>;
  abstracts?: Record<string, unknown>;
};
export type ConverterLinkedStyle = {
  id: string;
  definition?: {
    styles?: Record<string, unknown>;
    attrs?: Record<string, unknown>;
  };
};
export type ConverterContext = {
  docx?: Record<string, unknown>;
  numbering?: ConverterNumberingContext;
  linkedStyles?: ConverterLinkedStyle[];
  /**
   * Optional mapping from OOXML footnote id -> display number.
   * Display numbers are assigned in order of first appearance in the document (1-based),
   * matching Word's visible numbering behavior even when ids are non-contiguous or start at 0.
   */
  footnoteNumberById?: Record<string, number>;
};
/**
 * Guard that checks whether the converter context includes DOCX data
 * required for paragraph style hydration.
 *
 * Paragraph hydration needs DOCX structures so it can follow style
 * inheritance chains via resolveParagraphProperties. Numbering is optional
 * since documents without lists should still get docDefaults spacing.
 */
export declare const hasParagraphStyleContext: (context?: ConverterContext) => context is ConverterContext & {
  docx: Record<string, unknown>;
};
/**
 * Guard that checks whether DOCX data is available for table style lookups.
 *
 * Table style hydration only needs access to styles.xml, so numbering data
 * is optional.
 */
export declare const hasTableStyleContext: (context?: ConverterContext) => context is ConverterContext & {
  docx: Record<string, unknown>;
};
