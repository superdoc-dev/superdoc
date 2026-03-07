/**
 * SDM/1 section, numbering, reference catalog, and annotation types.
 */

import type { SDContentNode } from './sd-nodes.js';
import type { SDRunProps, SDParagraphProps } from './sd-props.js';

// ---------------------------------------------------------------------------
// Numbering catalog
// ---------------------------------------------------------------------------

export interface SDNumberingCatalog {
  definitions?: Record<
    string,
    {
      levels: Array<{
        level: number;
        kind: 'ordered' | 'bullet';
        format?: string;
        text?: string;
        start?: number;
        restartAfterLevel?: number | null;
      }>;
    }
  >;
}

// ---------------------------------------------------------------------------
// Section model
// ---------------------------------------------------------------------------

export interface SDSection {
  id: string;
  breakType?: 'continuous' | 'nextPage' | 'evenPage' | 'oddPage';
  pageSetup?: {
    width?: number;
    height?: number;
    orientation?: 'portrait' | 'landscape';
    paperSize?: string;
  };
  margins?: { top?: number; right?: number; bottom?: number; left?: number; gutter?: number };
  headerFooterMargins?: { header?: number; footer?: number };
  columns?: { count?: number; gap?: number; equalWidth?: boolean };
  lineNumbering?: {
    enabled: boolean;
    countBy?: number;
    start?: number;
    distance?: number;
    restart?: 'continuous' | 'newPage' | 'newSection';
  };
  pageNumbering?: {
    start?: number;
    format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
  };
  titlePage?: boolean;
  oddEvenHeadersFooters?: boolean;
  verticalAlign?: 'top' | 'center' | 'bottom' | 'both';
  sectionDirection?: 'ltr' | 'rtl';
  headerContent?: {
    default?: SDContentNode[];
    first?: SDContentNode[];
    even?: SDContentNode[];
  };
  footerContent?: {
    default?: SDContentNode[];
    first?: SDContentNode[];
    even?: SDContentNode[];
  };
}

// ---------------------------------------------------------------------------
// Reference catalogs
// ---------------------------------------------------------------------------

export interface SDCitationSource {
  sourceId: string;
  tag?: string;
  type?: string;
  fields?: Record<string, unknown>;
}

export interface SDReferenceCatalogs {
  citationSources?: SDCitationSource[];
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export interface SDAnchorRange {
  kind: 'text';
  segments: Array<{ blockId: string; start: number; end: number }>;
}

export interface SDBookmark {
  id: string;
  name: string;
  target: SDAnchorRange;
}

export interface SDCommentThread {
  id: string;
  status: 'open' | 'resolved';
  target: SDAnchorRange;
  comments: Array<{ id: string; author?: string; createdAt?: string; text: string }>;
}

export interface SDTrackedChange {
  id: string;
  type: 'insert' | 'delete' | 'format';
  author?: string;
  date?: string;
  target?: SDAnchorRange;
  excerpt?: string;
  formatChange?: {
    scope?: 'run' | 'paragraph';
    runPropsBefore?: Partial<SDRunProps>;
    runPropsAfter?: Partial<SDRunProps>;
    paragraphPropsBefore?: Partial<SDParagraphProps>;
    paragraphPropsAfter?: Partial<SDParagraphProps>;
  };
}

export interface SDAnnotations {
  bookmarks?: SDBookmark[];
  comments?: SDCommentThread[];
  trackedChanges?: SDTrackedChange[];
}
