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

export interface DocumentInfo {
  counts: DocumentInfoCounts;
  outline: DocumentInfoOutlineItem[];
  capabilities: DocumentInfoCapabilities;
  /** Monotonic decimal-string revision counter. Increments on every document change. */
  revision: string;
}
