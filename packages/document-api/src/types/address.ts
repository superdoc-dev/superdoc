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
