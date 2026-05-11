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
  /**
   * SuperDoc tracked-change identifier. Stable across edits while the document
   * is loaded, matches the `commentId` emitted by `onCommentsUpdate` for this
   * change, and is what `get` and `decide` accept as `target.id`. Equal to
   * `address.entityId`.
   *
   * This is NOT the OOXML `w:id` from the source DOCX. Opening the same file
   * in a fresh editor produces fresh SuperDoc ids. For source correlation
   * (mapping back to the original DOCX or an external review system), read
   * {@link TrackChangeInfo.wordRevisionIds} instead.
   *
   * Story scope: the id is story-local. Two changes in different stories
   * (body, header, footer, footnote, endnote) may share the same id. When
   * listing across stories (`list({ in: 'all' })`), pair the id with
   * `address.story` and pass `{ id, story }` as the `decide` target to
   * disambiguate.
   */
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
