/**
 * Section Types Module
 *
 * Type definitions for section handling in the PM adapter.
 * Includes section ranges, signatures, and OOXML structures.
 */

/**
 * Section types in Word documents.
 * Controls how section breaks create new pages.
 */
export enum SectionType {
  /** Section continues on same page */
  CONTINUOUS = 'continuous',
  /** Section starts on next page */
  NEXT_PAGE = 'nextPage',
  /** Section starts on next even page */
  EVEN_PAGE = 'evenPage',
  /** Section starts on next odd page */
  ODD_PAGE = 'oddPage',
}

// Default section types
export const DEFAULT_PARAGRAPH_SECTION_TYPE = SectionType.NEXT_PAGE; // Word's default when w:type omitted
export const DEFAULT_BODY_SECTION_TYPE = SectionType.CONTINUOUS; // Body sectPr doesn't force page break at end

/**
 * OOXML sectPr XML element structure
 */
export interface SectPrElement {
  type: 'element';
  name: 'w:sectPr';
  attributes?: Record<string, string>;
  elements?: SectPrChildElement[];
}

/**
 * Child elements within sectPr
 */
export interface SectPrChildElement {
  type: 'element';
  name: string;
  attributes?: Record<string, string | number>;
  elements?: SectPrChildElement[];
}

/**
 * Paragraph properties structure that may contain sectPr
 */
export interface ParagraphProperties {
  sectPr?: SectPrElement | SectPrLikeObject;
  [key: string]: unknown;
}

/**
 * Alternative sectPr shape from normalized JSON (not OOXML element)
 */
export interface SectPrLikeObject {
  elements?: SectPrChildElement[];
  [key: string]: unknown;
}

/**
 * Section signature tracks section properties to determine if a new section
 * requires a page boundary for Word compatibility.
 */
export type SectionSignature = {
  titlePg?: boolean;
  headerPx?: number;
  footerPx?: number;
  pageSizePx?: { w: number; h: number };
  orientation?: 'portrait' | 'landscape';
  headerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  footerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  columnsPx?: { count: number; gap: number; withSeparator?: boolean };
  numbering?: {
    format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
    start?: number;
  };
} | null;

/**
 * Vertical alignment of content within a section/page.
 * Maps to OOXML w:vAlign values in sectPr.
 */
export type SectionVerticalAlign = 'top' | 'center' | 'bottom' | 'both';

/**
 * Section range represents a contiguous section in the document.
 * Word uses "end-tagged" section semantics: a paragraph's sectPr defines
 * properties for the section ENDING at that paragraph, not starting after it.
 */
export interface SectionRange {
  sectionIndex: number;
  startParagraphIndex: number;
  endParagraphIndex: number;
  sectPr: SectPrElement | null;
  margins: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    header: number;
    footer: number;
  } | null;
  pageSize: { w: number; h: number } | null;
  orientation: 'portrait' | 'landscape' | null;
  columns: { count: number; gap: number; withSeparator?: boolean } | null;
  type: SectionType;
  titlePg: boolean;
  headerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  footerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  numbering?: {
    format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
    start?: number;
  };
  vAlign?: SectionVerticalAlign;
}
