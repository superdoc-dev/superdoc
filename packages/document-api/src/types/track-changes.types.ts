import type { TrackedChangeAddress } from './address.js';

export type TrackChangeType = 'insert' | 'delete' | 'format';

export interface TrackChangeInfo {
  address: TrackedChangeAddress;
  /** Convenience alias for `address.entityId`. */
  id: string;
  type: TrackChangeType;
  author?: string;
  authorEmail?: string;
  authorImage?: string;
  date?: string;
  excerpt?: string;
}

export interface TrackChangesListQuery {
  limit?: number;
  offset?: number;
  type?: TrackChangeType;
}

export interface TrackChangesListResult {
  matches: TrackedChangeAddress[];
  total: number;
  changes?: TrackChangeInfo[];
}
