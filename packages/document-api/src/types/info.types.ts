export interface DocumentInfoCounts {
  words: number;
  paragraphs: number;
  headings: number;
  tables: number;
  images: number;
  comments: number;
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
