import type { TrackedChangeAddress } from './address.js';
import type { DiscoveryOutput } from './discovery.js';
import type { StoryLocator } from './story.types.js';

export type TrackChangeType = 'insert' | 'delete' | 'format';

/**
 * Scope marker used by {@link TrackChangesListQuery.in} to request changes
 * across every revision-capable story (body + headers + footers + footnotes +
 * endnotes). Equivalent to a multi-story aggregate list.
 */
export const TRACK_CHANGES_IN_ALL = 'all' as const;
export type TrackChangesInAll = typeof TRACK_CHANGES_IN_ALL;

/**
 * Source provenance: the original Word `w:id` values from the imported DOCX,
 * keyed by `insert` / `delete` / `format`. Use to correlate a SuperDoc tracked
 * change back to the source file or an external review system. Not present
 * for tracked changes created in the current session.
 */
export interface TrackChangeWordRevisionIds {
  /** Original `w:id` from the source DOCX's `<w:ins>` element. */
  insert?: string;
  /** Original `w:id` from the source DOCX's `<w:del>` element. */
  delete?: string;
  /** Original `w:id` from the source DOCX's `<w:rPrChange>` element. */
  format?: string;
}

export interface TrackChangeInfo {
  address: TrackedChangeAddress;
  /**
   * SuperDoc tracked-change id for the loaded document. Use this with `get()`,
   * `decide()`, UI rows, and tracked-change events. For source DOCX correlation,
   * use {@link TrackChangeInfo.wordRevisionIds}.
   */
  id: string;
  type: TrackChangeType;
  /** Source provenance: original Word `w:id` values from the imported DOCX. See {@link TrackChangeWordRevisionIds}. */
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
