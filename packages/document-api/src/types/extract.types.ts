import type { CommentStatus, TrackChangeType } from './index.js';

// ---------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------

export interface ExtractBlock {
  /** Stable block ID — pass to `scrollToElement()` for navigation. */
  nodeId: string;
  /** Block type: paragraph, heading, listItem, image, etc. */
  type: string;
  /** Full plain text content of the block. */
  text: string;
  /** Heading level (1–6). Only present for headings. */
  headingLevel?: number;
  /**
   * Structural position when this block lives inside a table cell. Lets
   * callers tag RAG chunks with their row/column in the table, or reconstruct
   * table shape downstream. Omitted for blocks outside a table.
   */
  tableContext?: ExtractTableContext;
}

export interface ExtractTableContext {
  /**
   * Stable ID of the table that contains this block. Use to group blocks by
   * their parent table (e.g. when the extract result has multiple tables, or
   * when a block lives inside a nested table — its `tableNodeId` is the inner
   * table, not the outer one).
   */
  tableNodeId: string;
  /** Zero-based row index within `tableNodeId`. */
  rowIndex: number;
  /**
   * Zero-based logical column index within `tableNodeId`. Accounts for
   * column merges (`gridSpan`): a cell that follows a `colspan=2` cell starts
   * at `colIndex: 2`. For merged cells, `colIndex` is the origin column.
   */
  colIndex: number;
  /**
   * Number of columns the containing cell spans. Only present when greater
   * than 1. Use together with `colIndex` to reconstruct row layout or tell
   * "absent because merged" apart from "absent because empty".
   */
  colspan?: number;
  /**
   * Number of rows the containing cell spans. Only present when greater than 1.
   */
  rowspan?: number;
}

export interface ExtractComment {
  /** Comment entity ID — pass to `scrollToElement()` for navigation. */
  entityId: string;
  /** Comment body text. */
  text?: string;
  /** The document text the comment is anchored to. */
  anchoredText?: string;
  /** Block ID the comment is anchored to (first segment). */
  blockId?: string;
  /** Comment status. */
  status: CommentStatus;
  /** Comment author name. */
  author?: string;
}

export interface ExtractTrackedChange {
  /** Tracked change entity ID — pass to `scrollToElement()` for navigation. */
  entityId: string;
  /** Change type. */
  type: TrackChangeType;
  /** Short text excerpt of the changed content. */
  excerpt?: string;
  /** Change author name. */
  author?: string;
  /** Change date (ISO string). */
  date?: string;
}

export interface ExtractResult {
  /** All blocks in document order with stable IDs and full text. */
  blocks: ExtractBlock[];
  /** All comments with entity IDs and anchored block references. */
  comments: ExtractComment[];
  /** All tracked changes with entity IDs and excerpts. */
  trackedChanges: ExtractTrackedChange[];
  /** Document revision at the time of extraction. */
  revision: string;
}
