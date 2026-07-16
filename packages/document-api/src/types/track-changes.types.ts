import type { TextTarget, TrackedChangeAddress } from './address.js';
import type { DiscoveryOutput } from './discovery.js';
import type { StoryLocator } from './story.types.js';
/**
 * Canonical tracked-change broad-type vocabulary defined by
 * `../labs/tests/requirements/specs/tracked-changes-comments/tracked-changes-spec.md`
 * §3 / §5.
 *
 * Public adapters MUST emit one of these values. Existing v1 emitters and
 * tests still produce the legacy `insert` / `delete` / `format` strings; both
 * sets are accepted by {@link TrackChangeType} during the vocabulary
 * transition. Legacy strings are documented compatibility aliases only — new
 * code must emit the canonical vocabulary.
 */
export type TrackChangeBroadType = 'insertion' | 'deletion' | 'replacement' | 'formatting' | 'move' | 'structural';
/**
 * Legacy aliases retained during the vocabulary migration. Do not introduce new
 * call sites that emit these values; prefer {@link TrackChangeBroadType}.
 */
export type LegacyTrackChangeType = 'insert' | 'delete' | 'format';
/**
 * Tracked-change broad type accepted by the public API. Logical projections
 * emit {@link TrackChangeBroadType}; legacy v1 emitters may still produce
 * {@link LegacyTrackChangeType}. Filters accept either spelling.
 */
export type TrackChangeType = TrackChangeBroadType | LegacyTrackChangeType;
/**
 * Optional semantic subtype string. Spec §3 lists a required subtype
 * vocabulary; the current model covers text revisions (`text-insertion`,
 * `text-deletion`, `text-replacement`). Other subtypes are emitted once
 * later phases land their structural/formatting/move work.
 */
export type TrackChangeSubtype = string;
/**
 * Lifecycle state per spec §3. Open tracked changes are the only ones
 * returned by `trackChanges.list` / `trackChanges.get`. The read model
 * always emits `open`; accepted/rejected resolution is applied through
 * 003.
 */
export type TrackChangeState = 'open' | 'accepted' | 'rejected';
/**
 * Raw imported Word OOXML revision IDs (`w:id`) from the source document
 * when available.
 *
 * @deprecated Provenance metadata only. Prefer {@link TrackChangeSourceIds}
 * for new code. Retained as a compatibility alias surfacing the prior
 * legacy shape: an insertion fragment surfaces `insert`, a deletion
 * surfaces `delete`, a formatting revision surfaces `format`, and a paired
 * replacement may surface both text sides.
 */
export interface TrackChangeWordRevisionIds {
  /** Raw imported Word OOXML revision ID (`w:id`) from a `<w:ins>` element when present. */
  insert?: string;
  /** Raw imported Word OOXML revision ID (`w:id`) from a `<w:del>` element when present. */
  delete?: string;
  /** Raw imported Word OOXML revision ID (`w:id`) from a `<w:rPrChange>` element when present. */
  format?: string;
}
/**
 * Canonical multi-side source provenance per spec §3 / §4. Each value is
 * raw, source-format identity (Word `w:id`, `w:rsidR` / `w:rsidDel`, future
 * platform ids). They are not the canonical SuperDoc logical id and MUST
 * NOT be returned as the primary identifier.
 */
export interface TrackChangeSourceIds {
  /** Word `w:id` value from the insertion side of this logical change. */
  wordIdInsert?: string;
  /** Word `w:id` value from the deletion side of this logical change. */
  wordIdDelete?: string;
  /** Word `w:id` values from other wrappers (e.g. rPrChange, moveFrom/moveTo). */
  wordIdOther?: readonly string[];
  /** Word revision-save ids (`w:rsidR` / `w:rsidDel`) seen on contributing wrappers. */
  rsids?: readonly string[];
}
/**
 * Per-side metadata returned for replacement changes in `paired` mode. The
 * `id` values are stable SuperDoc-internal side ids so callers (e.g. decide
 * decide range targeting) can address either side without re-reading OOXML.
 */
export interface TrackChangeReplacementSides {
  inserted: TrackChangeReplacementSide | null;
  deleted: TrackChangeReplacementSide | null;
}
export interface TrackChangeReplacementSide {
  /** SuperDoc-internal side id (stable across a session for the same fragment). */
  id: string;
  /** Visible text excerpt on this side. */
  excerpt: string;
  /** Raw Word `w:id` for this side, when known. */
  wordId?: string;
}
/**
 * Tracked formatting subtype vocabulary per `tracked-changes-spec.md` §6.
 * Covers run, paragraph, list, table, row, cell, and section
 * formatting revisions. Image / drawing property revisions fail closed in
 * revisions. Image / drawing property revisions currently fail closed.
 */
export type TrackChangeFormattingSubtype = 'run' | 'paragraph' | 'list' | 'table' | 'row' | 'cell' | 'section';
/**
 * Per-side metadata for tracked moves. `id` is the SuperDoc-
 * internal side id, `excerpt` is a visible-text preview, and `wordId` carries
 * the raw Word `w:id` from the `w:moveFrom` / `w:moveTo` wrapper. Mirrors
 * the shape of {@link TrackChangeReplacementSide} for symmetry.
 */
export interface TrackChangeMoveSide {
  /** SuperDoc-internal side id (stable across a session for the same fragment). */
  id: string;
  /** Visible-text excerpt for this side. */
  excerpt: string;
  /** Raw Word `w:id` on this side, when known. */
  wordId?: string;
}
/**
 * Paired source / destination metadata for tracked moves
 * (spec §5). `pairId` is the SuperDoc logical pair identity reconstructed
 * from Word move range markers and adjacency. `null` sides describe a
 * source/destination half whose mate could not be paired.
 */
export interface TrackChangeMoveSides {
  /** Move-from side (source content / location). */
  source: TrackChangeMoveSide | null;
  /** Move-to side (destination content / location). */
  destination: TrackChangeMoveSide | null;
  /** Logical pair identity when both sides are reliably paired. */
  pairId?: string;
}
/**
 * Logical move target projection. Text-level paired moves
 * surface concrete source/destination text targets; future structural move
 * support may widen these lanes beyond text.
 */
export interface TrackChangeMoveTarget {
  kind: 'move';
  address: TrackedChangeAddress;
  source: TextTarget | null;
  destination: TextTarget | null;
}
/**
 * Semantic snapshot for one side of a tracked formatting revision.
 * `xml` carries the raw OOXML preserved by import / native creation;
 * `properties` exposes a subtype-aware key→value view for the most commonly
 * tracked properties so callers can render the delta without an OOXML parser.
 */
export interface TrackChangeFormattingSnapshot {
  /** Raw OOXML for the property block on this side. */
  xml: string;
  /** Subtype-aware semantic property map. */
  properties: Record<string, unknown>;
}
/**
 * Logical structural target classes required by the tracked-changes spec's
 * structural contract. The target remains a logical document object, not raw
 * OOXML storage detail.
 */
export type TrackChangeStructuralTargetKind = 'paragraph' | 'table' | 'row' | 'column' | 'cell' | 'paragraph-mark';
/**
 * Semantic snapshot for one side of a structural tracked change.
 * `xml` is the raw OOXML snapshot needed to restore/apply the relevant
 * structure; `state` distinguishes structural absence (e.g. insertion
 * before-state) from a present structural shape.
 */
export interface TrackChangeStructuralSnapshot {
  /** Which structural object/boundary this snapshot describes. */
  targetKind: TrackChangeStructuralTargetKind;
  /** Semantic structural subtype driving accept/reject. */
  structuralKind: TrackChangeSubtype;
  /** Whether the targeted structure exists on this side of the change. */
  state: 'present' | 'absent';
  /** Raw OOXML snapshot for this side when the structure is present. */
  xml: string | null;
  /** Raw marker / wrapper XML preserved from the source when relevant. */
  markerXml?: string;
  /** Wrapped inner XML for block-level structural wrappers when available. */
  innerXml?: string;
}
/**
 * Logical target description per spec §3. The model ships `text`,
 * `replacement`, and `formatting` target kinds;
 * structural target kinds land under the same field as they arrive.
 */
export type TrackChangeTarget =
  | {
      kind: 'text';
      address: TrackedChangeAddress;
    }
  | {
      kind: 'replacement';
      address: TrackedChangeAddress;
    }
  | {
      kind: 'formatting';
      address: TrackedChangeAddress;
      /** Which property class the revision affects. */
      subtype: TrackChangeFormattingSubtype;
    }
  | {
      kind: 'structural';
      address: TrackedChangeAddress;
      /** Which structural object/boundary the change targets. */
      targetKind: TrackChangeStructuralTargetKind;
    }
  | TrackChangeMoveTarget;
/**
 * Semantic before/after snapshot. Shape depends on `type` / `subtype`.
 * Text revisions emit visible text snapshots; tracked property changes
 * add formatting snapshots.
 */
export interface TrackChangeSnapshot {
  /** Visible text snapshot, when the affected revision is text-shaped. */
  text?: string;
  /** Formatting snapshot, when the affected revision is property-shaped. */
  formatting?: TrackChangeFormattingSnapshot;
  /** Structural snapshot, when the affected revision is structure-shaped. */
  structural?: TrackChangeStructuralSnapshot;
}
/**
 * Source-platform provenance per spec §3. Imported Word DOCX revisions surface
 * as `word`; native edits surface `superdoc`.
 */
export type TrackChangeProvenanceOrigin = 'word' | 'google-docs' | 'superdoc' | 'custom' | 'unknown';
export type TrackChangeSourcePlatform = TrackChangeProvenanceOrigin;
/**
 * Public semantic grouping for a tracked change. A paired replacement is one
 * logical public item representing both the deleted and inserted Word
 * revision wrappers.
 */
export type TrackChangeGrouping = 'standalone' | 'replacement-pair' | 'unknown';
/**
 * How the public logical id was canonicalized from source revision data.
 */
export type TrackChangeCanonicalizationKind =
  | 'single-word-revision'
  | 'paired-word-revision'
  | 'generated-runtime-id'
  | 'unknown';
/**
 * Flat navigation address summary for semantic snapshots.
 */
export type TrackChangeAddressKind = 'entity' | 'story-entity' | 'unknown';
/**
 * Relationship a tracked change has to its overlap group.
 *
 *   • `parent`     — the change is the parent surface of an overlap (e.g.
 *                    Word's outer insertion that flanks a child deletion).
 *   • `child`      — the change is a follow-up nested inside another
 *                    author's revision shape.
 *   • `standalone` — no overlap relationship; surface omitted by default.
 */
export type TrackChangeOverlapRelationship = 'parent' | 'child' | 'standalone';
/**
 * One visual layer in an overlap group. `type` mirrors the
 * canonical broad-type vocabulary so renderers can paint each layer with
 * the same style they use for non-overlap revisions.
 */
export interface TrackChangeOverlapLayer {
  /** SuperDoc logical id of the contributing tracked change. */
  id: string;
  /** Broad type of the layer (canonical spelling). */
  type: TrackChangeType;
  /** Layer relationship to the parent overlap surface. */
  relationship: TrackChangeOverlapRelationship;
}
/**
 * Overlap metadata projected onto a tracked change. The
 * parent surface carries the layer list and the preferred context-target
 * pointer. Child changes carry a minimal payload (`relationship: 'child'`
 * plus the parent layer reference) so consumers can route comments / UI
 * back to the parent group.
 */
export interface TrackChangeOverlapInfo {
  /**
   * Ordered visual layers backing this overlap. The parent layer is index
   * 0; children follow in deterministic order (deletions before insertions,
   * then document order, then logical id).
   */
  visualLayers?: readonly TrackChangeOverlapLayer[];
  /**
   * Preferred context-target id for parent surfaces. Points to the first
   * child deletion when one exists, otherwise the first child, otherwise
   * absent.
   */
  preferredContextTargetId?: string;
  /** Mirror of the chosen layer for `preferredContextTargetId`. */
  preferredContextTarget?: TrackChangeOverlapLayer;
  /** Relationship of this change to the overlap group. */
  relationship?: TrackChangeOverlapRelationship;
  /**
   * For child layers, the parent's logical id. Lets consumers walk back
   * to the parent surface without re-running the overlap projection.
   */
  parentId?: string;
}
export interface TrackChangeLinkedComments {
  count: number;
  commentIds?: readonly string[];
}
export interface TrackChangeInfo {
  address: TrackedChangeAddress;
  /** Stable SuperDoc logical tracked-change id (spec §3 / §4). */
  id: string;
  type: TrackChangeType;
  /** Semantic subtype string (spec §3, required-subtype matrix). */
  subtype?: TrackChangeSubtype;
  /** Lifecycle state. The read model always emits `open`. */
  state?: TrackChangeState;
  /** Logical target description. */
  target?: TrackChangeTarget;
  /** Semantic before-state needed to reject the change. */
  before?: TrackChangeSnapshot;
  /** Semantic after-state needed to accept the change. */
  after?: TrackChangeSnapshot;
  /**
   * Canonical multi-side source provenance (spec §3 / §4). New consumers
   * MUST read provenance from this field. `wordRevisionIds` is preserved
   * as a compatibility alias only.
   */
  sourceIds?: TrackChangeSourceIds;
  /**
   * @deprecated Use {@link sourceIds}. Compatibility alias retained during
   * the vocabulary migration; populated alongside `sourceIds` for existing
   * consumers that read this field. Will be removed in a later cleanup.
   */
  wordRevisionIds?: TrackChangeWordRevisionIds;
  /** Stable revision-group id (spec §3, fragment lineage). */
  revisionGroupId?: string;
  /** Set to the retired source id when this change is a partial-split fragment; otherwise `null`. */
  splitFromId?: string | null;
  /** Replacement side metadata (`paired` mode replacements only). */
  replacement?: TrackChangeReplacementSides;
  /** Move side metadata for paired tracked moves. */
  move?: TrackChangeMoveSides;
  author?: string;
  authorEmail?: string;
  authorImage?: string;
  /** Author initials (spec §3 required field, when provided by the source). */
  initials?: string;
  date?: string;
  /**
   * Story locator the change lives in (spec §3 part/story). Body remains
   * the default and is also represented inline on `address.story`.
   */
  storyLocator?: StoryLocator;
  /** Originating platform of the imported revision when known. */
  sourcePlatform?: TrackChangeSourcePlatform;
  /** Flat semantic grouping used by public requirement snapshots. */
  grouping?: TrackChangeGrouping;
  /** Partner logical id when the change is represented as one side of a pair; otherwise `null`. */
  pairedWithChangeId?: string | null;
  /** Inserted visible text for text insertions/replacements when available. */
  insertedText?: string | null;
  /** Deleted visible text for text deletions/replacements when available. */
  deletedText?: string | null;
  /** Human-readable formatting delta summary for formatting changes; otherwise `null`. */
  formattingDeltaSummary?: string | null;
  /** Originating platform alias for consumers that read flat provenance fields. */
  origin?: TrackChangeSourcePlatform;
  /** Whether the change came from an imported source revision wrapper. */
  imported?: boolean;
  /** How the public id was derived from source revision data. */
  canonicalizationKind?: TrackChangeCanonicalizationKind;
  /** Flat address summary for list/get semantic snapshots. */
  addressKind?: TrackChangeAddressKind;
  /** Whether `trackChanges.get({ id })` can resolve this public list id. */
  resolvableById?: boolean;
  /** Comments whose anchor is wholly associated with this tracked change. */
  linkedComments?: TrackChangeLinkedComments;
  excerpt?: string;
  /**
   * Overlap relationship metadata for Word-shape overlapping
   * tracked changes. Absent when the change is standalone.
   */
  overlap?: TrackChangeOverlapInfo;
}
export interface TrackChangesListQuery {
  limit?: number;
  offset?: number;
  /**
   * Filter by tracked-change broad type. Accepts the canonical spec
   * vocabulary (`insertion` / `deletion` / `replacement` / ...) and the
   * legacy `insert` / `delete` / `format` aliases during migration.
   */
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
 * Scope marker used by {@link TrackChangesListQuery.in} to request changes
 * across every revision-capable story (body + headers + footers + footnotes +
 * endnotes). Equivalent to a multi-story aggregate list.
 */
export const TRACK_CHANGES_IN_ALL = 'all' as const;
export type TrackChangesInAll = typeof TRACK_CHANGES_IN_ALL;
/**
 * Compact list-projection fields.
 * `trackChanges.list` MAY omit the richer `target` / `before` / `after`
 * payloads carried by {@link TrackChangeInfo}; callers wanting full detail
 * call `trackChanges.get`.
 */
export interface TrackChangeDomain {
  address: TrackedChangeAddress;
  type: TrackChangeType;
  /** Semantic subtype string. */
  subtype?: TrackChangeSubtype;
  /** Lifecycle state. */
  state?: TrackChangeState;
  /** Logical target summary for list consumers when the compact projection can provide it safely. */
  target?: TrackChangeTarget;
  /** Move side metadata for paired tracked moves. */
  move?: TrackChangeMoveSides;
  /** Stable revision-group id. */
  revisionGroupId?: string;
  /** Set to the retired source id when this list item is a partial-split fragment; otherwise `null`. */
  splitFromId?: string | null;
  /**
   * Canonical multi-side source provenance. Compact list projection MAY
   * surface this so callers can correlate ids back to source OOXML.
   */
  sourceIds?: TrackChangeSourceIds;
  /**
   * @deprecated Use {@link sourceIds}. Compatibility alias only.
   */
  wordRevisionIds?: TrackChangeWordRevisionIds;
  author?: string;
  authorEmail?: string;
  authorImage?: string;
  /** Author initials. */
  initials?: string;
  date?: string;
  excerpt?: string;
  /** Story locator for the change (body omitted for backward compat). */
  storyLocator?: StoryLocator;
  /** Flat semantic grouping used by public requirement snapshots. */
  grouping?: TrackChangeGrouping;
  /** Partner logical id when the change is represented as one side of a pair; otherwise `null`. */
  pairedWithChangeId?: string | null;
  /** Inserted visible text for text insertions/replacements when available. */
  insertedText?: string | null;
  /** Deleted visible text for text deletions/replacements when available. */
  deletedText?: string | null;
  /** Human-readable formatting delta summary for formatting changes; otherwise `null`. */
  formattingDeltaSummary?: string | null;
  /** Originating platform alias for consumers that read flat provenance fields. */
  origin?: TrackChangeSourcePlatform;
  /** Whether the change came from an imported source revision wrapper. */
  imported?: boolean;
  /** How the public id was derived from source revision data. */
  canonicalizationKind?: TrackChangeCanonicalizationKind;
  /** Flat address summary for list/get semantic snapshots. */
  addressKind?: TrackChangeAddressKind;
  /** Whether `trackChanges.get({ id })` can resolve this public list id. */
  resolvableById?: boolean;
  /** Comments whose anchor is wholly associated with this tracked change. */
  linkedComments?: TrackChangeLinkedComments;
  /**
   * Overlap relationship metadata for list consumers. When
   * present, `visualLayers` lets a list-only client render the overlap
   * stack without an extra `trackChanges.get` round trip.
   */
  overlap?: TrackChangeOverlapInfo;
}
/**
 * Standardized discovery output for `trackChanges.list`.
 */
export type TrackChangesListResult = DiscoveryOutput<TrackChangeDomain>;
