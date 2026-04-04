import type { TrackedChangeAddress } from './address.js';
import type { DiscoveryOutput } from './discovery.js';

export type TrackChangeType = 'insert' | 'delete' | 'format';

export interface TrackChangeWordRevisionIds {
  insert?: string;
  delete?: string;
  format?: string;
}

export interface TrackChangeInfo {
  address: TrackedChangeAddress;
  /** Convenience alias for `address.entityId`. */
  id: string;
  type: TrackChangeType;
  wordRevisionIds?: TrackChangeWordRevisionIds;
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

/**
 * Domain fields for a tracked-change discovery item (C3a).
 */
export interface TrackChangeDomain {
  address: TrackedChangeAddress;
  type: TrackChangeType;
  wordRevisionIds?: TrackChangeWordRevisionIds;
  author?: string;
  authorEmail?: string;
  authorImage?: string;
  date?: string;
  excerpt?: string;
}

/**
 * Standardized discovery output for `trackChanges.list`.
 */
export type TrackChangesListResult = DiscoveryOutput<TrackChangeDomain>;
