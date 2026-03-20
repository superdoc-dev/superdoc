export interface DocumentInfoCounts {
  words: number;
  /**
   * Length of the Document API plain-text projection.
   *
   * This is a "characters with spaces" metric derived from
   * `doc.textBetween(0, size, '\n', '\n')`. It includes whitespace,
   * inter-block newline separators, and one `'\n'` per non-text leaf node
   * (images, tabs, breaks). It is neither Word's `ap:Characters` nor
   * `ap:CharactersWithSpaces`.
   */
  characters: number;
  paragraphs: number;
  headings: number;
  tables: number;
  images: number;
  comments: number;
  /** Count of grouped tracked-change entities (insertions, deletions, format changes). */
  trackedChanges: number;
  /** Count of field-like SDT/content-control nodes (text/date/checkbox/choice controls). */
  sdtFields: number;
  /** Count of unique list sequences, not individual list items. */
  lists: number;
  /** Number of layout pages. Absent when pagination is inactive or layout hasn't completed. */
  pages?: number;
}

export interface DocumentInfoOutlineItem {
  level: number;
  text: string;
  nodeId: string;
}

export interface DocumentInfoCapabilities {
  canFind: boolean;
  canGetNode: boolean;
  canComment: boolean;
  canReplace: boolean;
}

/** A paragraph style discovered in the document. */
export interface DocumentStyleInfo {
  /** Style identifier (e.g. 'Normal', 'Heading1', 'BodyText'). */
  styleId: string;
  /** Number of paragraphs using this style. */
  count: number;
  /** Font family used by text in this style (from actual text marks). */
  fontFamily?: string;
  /** Font size in half-points used by text in this style. */
  fontSize?: number;
}

/** Style information collected from the document. */
export interface DocumentStyles {
  /** Paragraph styles currently in use, sorted by frequency (most common first). */
  paragraphStyles: DocumentStyleInfo[];
}

/** Default formatting detected from the document's body text. */
export interface DocumentDefaults {
  /** Most common body text font family. */
  fontFamily?: string;
  /** Most common body text font size in half-points. */
  fontSize?: number;
  /** Most common body paragraph styleId. */
  styleId?: string;
}

export interface DocumentInfo {
  counts: DocumentInfoCounts;
  outline: DocumentInfoOutlineItem[];
  capabilities: DocumentInfoCapabilities;
  /** Monotonic decimal-string revision counter. Increments on every document change. */
  revision: string;
  /** Styles currently in use in the document. */
  styles?: DocumentStyles;
  /** Default formatting detected from the document's most common body text. */
  defaults?: DocumentDefaults;
}
