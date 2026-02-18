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
