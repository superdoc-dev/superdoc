import type { TrackedChangeAddress } from './address.js';
import type { DiscoveryOutput } from './discovery.js';

export type TrackChangeType = 'insert' | 'delete' | 'format';

/**
 * Raw imported Word OOXML revision IDs (`w:id`) from the source document when available.
 *
 * This is provenance metadata, not the canonical SuperDoc tracked-change ID.
 * Replacements may include both `insert` and `delete` IDs.
 */
export interface TrackChangeWordRevisionIds {
  /** Raw imported Word OOXML revision ID (`w:id`) from a `<w:ins>` element when present. */
  insert?: string;
  /** Raw imported Word OOXML revision ID (`w:id`) from a `<w:del>` element when present. */
  delete?: string;
  /** Raw imported Word OOXML revision ID (`w:id`) from a `<w:rPrChange>` element when present. */
  format?: string;
}

export interface TrackChangeInfo {
  address: TrackedChangeAddress;
  /** Convenience alias for `address.entityId`. */
  id: string;
  type: TrackChangeType;
  /** Raw imported Word OOXML revision IDs (`w:id`) from the source document when available. */
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
  /** Raw imported Word OOXML revision IDs (`w:id`) from the source document when available. */
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
