import type { CommentStatus, TrackChangeType } from './index.js';

// ---------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------

/**
 * Table coordinates for an {@link ExtractBlock} that lives inside a table cell.
 *
 * Blocks inside tables are extracted at paragraph granularity (one entry per
 * paragraph/heading/listItem/image/sdt/tableOfContents in each cell). Group
 * by these fields to reconstruct cells, rows, or whole tables:
 *
 * - cell:  group by `tableOrdinal + rowIndex + columnIndex`
 * - row:   group by `tableOrdinal + rowIndex`
 * - table: group by `tableOrdinal`
 */
export interface ExtractTableContext {
  /** 0-based table ordinal, unique within one `extract()` result. */
  tableOrdinal: number;
  /** Ordinal of the parent table when this block is inside a nested table. */
  parentTableOrdinal?: number;
  /** Row index within the parent table. Only set with `parentTableOrdinal`. */
  parentRowIndex?: number;
  /** Column index within the parent table. Only set with `parentTableOrdinal`. */
  parentColumnIndex?: number;
  /** 0-based row index of the containing cell. */
  rowIndex: number;
  /** 0-based logical grid column of the containing cell, not the row's child order. */
  columnIndex: number;
  /** Number of rows the containing cell spans. 1 for unmerged cells. */
  rowspan: number;
  /** Number of columns the containing cell spans. 1 for unmerged cells. */
  colspan: number;
}

/**
 * One addressable unit of document content.
 *
 * Extraction is paragraph-granular: tables are NOT returned as a single block.
 * Paragraph-like descendants of table cells are emitted individually with
 * `tableContext` attached.
 *
 * Block SDTs (structured document tags / content controls) are transparent:
 * their children emit individually as if they were direct children of the
 * enclosing container. No wrapper `sdt` block is emitted. This prevents
 * SDT-wrapped tables from re-flattening through the wrapper's textContent.
 */
export interface ExtractBlock {
  /** Stable block ID. Pass to `scrollToElement()` for navigation. */
  nodeId: string;
  /** Block type: paragraph, heading, listItem, image, tableOfContents. */
  type: string;
  /** Full plain text content of the block. */
  text: string;
  /** Heading level (1-6). Only present for headings. */
  headingLevel?: number;
  /** Table coordinates. Only present for blocks inside a table cell. */
  tableContext?: ExtractTableContext;
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
