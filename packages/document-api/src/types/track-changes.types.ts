import type { TrackedChangeAddress } from './address.js';
import type { DiscoveryOutput } from './discovery.js';
import type { StoryLocator } from './story.types.js';

export type TrackChangeType = 'insert' | 'delete' | 'replacement' | 'format';
export type TrackChangeOverlapRelationship = 'parent' | 'child' | 'standalone';
export type TrackChangeGrouping = 'standalone' | 'replacement-pair' | 'unknown';
export type TrackChangeProvenanceOrigin = 'word' | 'google-docs' | 'superdoc' | 'custom' | 'unknown';

export interface TrackChangeOverlapLayer {
  id: string;
  type: TrackChangeType;
  relationship: TrackChangeOverlapRelationship;
}

export interface TrackChangeOverlapInfo {
  visualLayers?: TrackChangeOverlapLayer[];
  preferredContextTargetId?: string;
  preferredContextTarget?: TrackChangeOverlapLayer;
}

/**
 * Scope marker used by {@link TrackChangesListQuery.in} to request changes
 * across every revision-capable story (body + headers + footers + footnotes +
 * endnotes). Equivalent to a multi-story aggregate list.
 */
export const TRACK_CHANGES_IN_ALL = 'all' as const;
export type TrackChangesInAll = typeof TRACK_CHANGES_IN_ALL;

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
  grouping?: TrackChangeGrouping;
  pairedWithChangeId?: string | null;
  /** Raw imported Word OOXML revision IDs (`w:id`) from the source document when available. */
  wordRevisionIds?: TrackChangeWordRevisionIds;
  /** Overlap metadata for nested tracked changes that share the same text range. */
  overlap?: TrackChangeOverlapInfo;
  author?: string;
  authorEmail?: string;
  authorImage?: string;
  date?: string;
  excerpt?: string;
  /** Inserted content for insertion-style changes when available. */
  insertedText?: string;
  /** Deleted content for deletion-style changes when available. */
  deletedText?: string;
  /** Source application or package family detected on import. */
  origin?: TrackChangeProvenanceOrigin;
  /** True when this tracked change came from an imported document revision. */
  imported?: boolean;
}

export interface TrackChangesListQuery {
  limit?: number;
  offset?: number;
  type?: TrackChangeType;
  /**
   * Story scope.
   * - `undefined` (default): body only (backward compatible).
   * - A {@link StoryLocator}: only that story.
   * - `'all'`: flat list across body + every revision-capable non-body story.
   */
  in?: StoryLocator | TrackChangesInAll;
}

/**
 * Domain fields for a tracked-change discovery item (C3a).
 */
export interface TrackChangeDomain {
  address: TrackedChangeAddress;
  type: TrackChangeType;
  grouping?: TrackChangeGrouping;
  pairedWithChangeId?: string | null;
  /** Raw imported Word OOXML revision IDs (`w:id`) from the source document when available. */
  wordRevisionIds?: TrackChangeWordRevisionIds;
  /** Overlap metadata for nested tracked changes that share the same text range. */
  overlap?: TrackChangeOverlapInfo;
  author?: string;
  authorEmail?: string;
  authorImage?: string;
  date?: string;
  excerpt?: string;
  /** Inserted content for insertion-style changes when available. */
  insertedText?: string;
  /** Deleted content for deletion-style changes when available. */
  deletedText?: string;
  /** Source application or package family detected on import. */
  origin?: TrackChangeProvenanceOrigin;
  /** True when this tracked change came from an imported document revision. */
  imported?: boolean;
}

/**
 * Standardized discovery output for `trackChanges.list`.
 */
export type TrackChangesListResult = DiscoveryOutput<TrackChangeDomain>;
