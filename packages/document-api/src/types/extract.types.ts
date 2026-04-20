import type { CommentStatus, TrackChangeType } from './index.js';

// ---------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------

export interface ExtractBlock {
  /** Stable block ID — pass to `scrollToElement()` for navigation. */
  nodeId: string;
  /** Block type: paragraph, heading, listItem, table, image, etc. */
  type: string;
  /** Full plain text content of the block. */
  text: string;
  /** Heading level (1–6). Only present for headings. */
  headingLevel?: number;
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
