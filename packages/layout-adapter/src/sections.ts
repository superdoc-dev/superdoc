/**
 * Adapter-neutral section model shared by document adapters and layout consumers.
 */

import type { ColumnLayout } from '@superdoc/contracts';

export enum SectionType {
  CONTINUOUS = 'continuous',
  NEXT_PAGE = 'nextPage',
  EVEN_PAGE = 'evenPage',
  ODD_PAGE = 'oddPage',
}

export const DEFAULT_PARAGRAPH_SECTION_TYPE = SectionType.NEXT_PAGE;
export const DEFAULT_BODY_SECTION_TYPE = SectionType.CONTINUOUS;

export interface SectPrElement {
  type: 'element';
  name: 'w:sectPr';
  attributes?: Record<string, string>;
  elements?: SectPrChildElement[];
}

export interface SectPrChildElement {
  type: 'element';
  name: string;
  attributes?: Record<string, string | number>;
  elements?: SectPrChildElement[];
}

export interface ParagraphProperties {
  sectPr?: SectPrElement | SectPrLikeObject;
  [key: string]: unknown;
}

export interface SectPrLikeObject {
  elements?: SectPrChildElement[];
  [key: string]: unknown;
}

export type SectionSignature = {
  titlePg?: boolean;
  headerPx?: number;
  footerPx?: number;
  pageSizePx?: { w: number; h: number };
  orientation?: 'portrait' | 'landscape';
  headerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  footerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  columnsPx?: ColumnLayout;
  numbering?: {
    format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
    start?: number;
  };
} | null;

export type SectionVerticalAlign = 'top' | 'center' | 'bottom' | 'both';

export interface SectionRange {
  sectionIndex: number;
  startNodeIndex: number;
  endNodeIndex: number;
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
  columns: ColumnLayout | null;
  type: SectionType;
  typeIsExplicit: boolean;
  titlePg: boolean;
  headerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  footerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  numbering?: {
    format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
    start?: number;
  };
  vAlign?: SectionVerticalAlign;
}
