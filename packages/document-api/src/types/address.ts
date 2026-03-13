import type { BlockNodeType } from './base.js';

export type Range = {
  /** Inclusive start offset (0-based, UTF-16 code units). */
  start: number;
  /** Exclusive end offset (0-based, UTF-16 code units). */
  end: number;
};

export type TextAddress = {
  kind: 'text';
  blockId: string;
  range: Range;
};

/**
 * A single anchored text segment within one block.
 *
 * Unlike {@link TextAddress} (used for mutation inputs), TextSegment is a
 * lightweight component of a {@link TextTarget} — it carries no `kind`
 * discriminant because the parent TextTarget already provides it.
 */
export type TextSegment = {
  blockId: string;
  range: Range;
};

/**
 * Multi-segment text target returned by comment read operations.
 *
 * A single comment can span multiple discontinuous text ranges (e.g. when Word
 * applies the same comment ID across separate marked runs or across blocks).
 * TextTarget faithfully represents all anchored segments in document order.
 *
 * Invariants:
 * - `segments` is non-empty (at least one segment).
 * - Segments are sorted in document order.
 * - Segment bounds are valid integers (start >= 0, start <= end).
 */
export type TextTarget = {
  kind: 'text';
  segments: [TextSegment, ...TextSegment[]];
};

// ---------------------------------------------------------------------------
// Selection-based mutation targeting (v1)
// ---------------------------------------------------------------------------

/**
 * Block node types valid as `nodeEdge` selection anchors.
 *
 * Excludes:
 * - `tableRow`, `tableCell` — row/column semantics out of scope
 * - `listItem` — derived from paragraph attrs, no distinct PM wrapper node
 */
export type SelectionEdgeNodeType = Exclude<BlockNodeType, 'tableRow' | 'tableCell' | 'listItem'>;

export const SELECTION_EDGE_NODE_TYPES = [
  'paragraph',
  'heading',
  'table',
  'tableOfContents',
  'sdt',
  'image',
] as const satisfies readonly SelectionEdgeNodeType[];

/** Block node address valid as a `nodeEdge` selection anchor. */
export type SelectionEdgeNodeAddress = {
  kind: 'block';
  nodeType: SelectionEdgeNodeType;
  nodeId: string;
};

/**
 * A point within a document selection.
 *
 * - `text`: A character offset within a specific block's flattened text model.
 * - `nodeEdge`: The boundary of a block-level node (before or after).
 */
export type SelectionPoint =
  | { kind: 'text'; blockId: string; offset: number }
  | { kind: 'nodeEdge'; node: SelectionEdgeNodeAddress; edge: 'before' | 'after' };

/**
 * A contiguous document selection — the canonical public target for the core
 * selection-mutation family (`delete`, `replace`, `format.apply`, `mutations.apply`).
 *
 * Other range-targeted APIs (comments, hyperlinks) continue to use `TextAddress`.
 */
export type SelectionTarget = {
  kind: 'selection';
  start: SelectionPoint;
  end: SelectionPoint;
};

/** Discriminated input for direct operations: either an explicit target or a ref string. */
export type TargetLocator = { target: SelectionTarget; ref?: undefined } | { ref: string; target?: undefined };

/** Delete behavior mode. */
export type DeleteBehavior = 'selection' | 'exact';

export type EntityType = 'comment' | 'trackedChange';

export type CommentAddress = {
  kind: 'entity';
  entityType: 'comment';
  entityId: string;
};

export type TrackedChangeAddress = {
  kind: 'entity';
  entityType: 'trackedChange';
  entityId: string;
};

export type EntityAddress = CommentAddress | TrackedChangeAddress;
