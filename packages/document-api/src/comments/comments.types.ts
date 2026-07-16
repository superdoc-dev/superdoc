import type {
  CommentAddress,
  CommentStatus,
  SelectionTarget,
  StoryLocator,
  TextAddress,
  TextTarget,
} from '../types/index.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { TrackChangeType } from '../types/track-changes.types.js';
export type { CommentStatus } from '../types/index.js';
/**
 * Side of a tracked-change anchor that a comment is currently anchored on.
 * Derived on read; not stored in a persisted custom carrier.
 */
export type CommentTrackedChangeSide = 'inserted' | 'deleted' | 'source' | 'destination';
export type TrackedChangeCommentTargetSide = CommentTrackedChangeSide;
/**
 * Convenience target for `comments.create` and
 * `comments.patch({ target })` that references a logical tracked-change
 * id instead of a raw text range.
 */
export interface TrackedChangeCommentTarget {
  /**
   * Discriminator. Optional for compatibility with Labs runners that spell
   * the target as `{ trackedChangeId }` without an explicit `kind` field.
   */
  kind?: 'trackedChange';
  /** SuperDoc logical tracked-change id from `trackChanges.list/get`. */
  trackedChangeId: string;
  /** Which revision side to anchor the comment to. */
  side?: TrackedChangeCommentTargetSide;
  /** Optional story scope. */
  story?: StoryLocator;
}
/**
 * Shorthand for "anchor this comment to the first occurrence of this text".
 * Adapters normalize it to a concrete TextAddress/TextTarget before mutation.
 */
export interface TextSearchCommentTarget {
  text: string;
  story?: StoryLocator;
}
export type CommentTarget =
  | TextAddress
  | TextTarget
  | SelectionTarget
  | TrackedChangeCommentTarget
  | TextSearchCommentTarget;
/**
 * Richer derived projection that exposes the linked tracked
 * change a comment is anchored to. Carries the canonical logical id, the
 * broad tracked-change type, the side of the link, and (where applicable)
 * the inserted/deleted text excerpts so consumers can render a "comment on
 * tracked change" affordance without an additional `trackChanges.get` call.
 *
 * Derived on read alongside the existing `trackedChangeParentId` /
 * `trackedChangeSide` fields. The legacy fields remain as compatibility
 * aliases (`trackedChangeParentId === trackedChangeLink.trackedChangeId`,
 * `trackedChangeSide === trackedChangeLink.side`).
 */
export interface CommentTrackedChangeLink {
  /** Discriminator — always `true` when the comment is linked. */
  trackedChange: true;
  /** Canonical SuperDoc logical id of the linked tracked change. */
  trackedChangeId: string;
  /** Broad type of the linked tracked change (insertion/deletion/replacement/...). */
  trackedChangeType: TrackChangeType;
  /** Side of the linked tracked change the comment anchor sits on. */
  side?: CommentTrackedChangeSide;
  /**
   * Visible-text excerpt of the side the comment anchors. For deletions and
   * deleted sides of a replacement this carries the deleted text; for
   * insertions and inserted sides of a replacement this carries the
   * inserted text. Omitted when no excerpt is available.
   */
  trackedChangeText?: string;
  /** Display-oriented tracked-change type label, when available. */
  trackedChangeDisplayType?: string | null;
  /** Story containing the linked tracked change, when available. */
  trackedChangeStory?: StoryLocator | null;
  /** Internal anchor key used by older projections, when available. */
  trackedChangeAnchorKey?: string | null;
  /** Inserted text for the linked tracked change, when available. */
  insertedText?: string;
  /** Deleted text for the linked tracked change, when available. */
  deletedText?: string;
}
export interface CommentInfo {
  address: CommentAddress;
  commentId: string;
  /**
   * Logical tracked-change id that the comment anchor
   * currently maps wholly to, when the surviving anchor sits inside
   * exactly one active tracked change. Derived on read from the comment
   * anchor index plus the tracked-change catalog. Cleared when the
   * surviving anchor no longer maps wholly to one revision side.
   */
  trackedChangeParentId?: string;
  /** Which side of the tracked change the anchor sits on. */
  trackedChangeSide?: CommentTrackedChangeSide;
  /**
   * Richer linked tracked-change projection. When present, the
   * legacy `trackedChangeParentId` / `trackedChangeSide` fields mirror
   * `trackedChangeLink.trackedChangeId` / `trackedChangeLink.side`.
   */
  trackedChangeLink?: CommentTrackedChangeLink | null;
  /**
   * Compatibility aliases for consumers that predate `trackedChangeLink`.
   * `trackedChangeType` uses the legacy side vocabulary (`insert`,
   * `delete`, `format`) when there is a direct side equivalent, while the
   * nested `trackedChangeLink.trackedChangeType` remains the canonical broad
   * type.
   */
  trackedChange?: boolean;
  trackedChangeType?: TrackChangeType;
  trackedChangeDisplayType?: string | null;
  trackedChangeStory?: StoryLocator | null;
  trackedChangeAnchorKey?: string | null;
  trackedChangeText?: string;
  insertedText?: string;
  deletedText?: string;
  /**
   * Source `w:id` provenance when import repaired the incoming id to mint a
   * canonical, Word-compatible `commentId`. Per `comments-spec.md` §13.2 /
   * §13.4: present when the source id was missing, malformed, duplicated, or
   * non-Word-compatible. Omitted when the source id was already a valid unique
   * Word id and was kept unchanged.
   */
  importedId?: string;
  parentCommentId?: string;
  rootCommentId?: string;
  replyCount?: number;
  origin?: 'word' | 'google-docs' | 'superdoc' | 'custom' | 'unknown';
  imported?: boolean;
  text?: string;
  /**
   * @deprecated Legacy `sdcom:internal` compatibility residue. Internal/private
   * comments are not supported for new patch behavior (`comments-spec.md` §7 /
   * §14.6). The field is kept in the type for backward-compatibility with v1
   * consumers and MUST be ignored in new code. `comments.patch({ isInternal })`
   * fails with `CAPABILITY_UNAVAILABLE`.
   */
  isInternal?: boolean;
  status: CommentStatus;
  target?: TextTarget;
  anchoredText?: string;
  /**
   * Creation timestamp in milliseconds. Omitted when the source had no
   * `w:date` (`comments-spec.md` §3.1 / §13.2).
   */
  createdTime?: number;
  creatorName?: string;
  creatorEmail?: string;
}
export interface CommentsListQuery {
  includeResolved?: boolean;
  limit?: number;
  offset?: number;
}
/**
 * Domain fields for a comment discovery item (C2).
 *
 * These are the comment-specific fields carried alongside the standard
 * `id` and `handle` in each `DiscoveryItem<CommentDomain>`.
 */
export interface CommentDomain {
  address: CommentAddress;
  /** See {@link CommentInfo.importedId}. */
  importedId?: string;
  /** See {@link CommentInfo.trackedChangeParentId}. */
  trackedChangeParentId?: string;
  /** See {@link CommentInfo.trackedChangeSide}. */
  trackedChangeSide?: CommentTrackedChangeSide;
  /** See {@link CommentInfo.trackedChangeLink}. */
  trackedChangeLink?: CommentTrackedChangeLink | null;
  /** See {@link CommentInfo.trackedChange}. */
  trackedChange?: boolean;
  /** See {@link CommentInfo.trackedChangeType}. */
  trackedChangeType?: TrackChangeType;
  /** See {@link CommentInfo.trackedChangeDisplayType}. */
  trackedChangeDisplayType?: string | null;
  /** See {@link CommentInfo.trackedChangeStory}. */
  trackedChangeStory?: StoryLocator | null;
  /** See {@link CommentInfo.trackedChangeAnchorKey}. */
  trackedChangeAnchorKey?: string | null;
  /** See {@link CommentInfo.trackedChangeText}. */
  trackedChangeText?: string;
  /** See {@link CommentInfo.insertedText}. */
  insertedText?: string;
  /** See {@link CommentInfo.deletedText}. */
  deletedText?: string;
  parentCommentId?: string;
  rootCommentId?: string;
  replyCount?: number;
  origin?: 'word' | 'google-docs' | 'superdoc' | 'custom' | 'unknown';
  imported?: boolean;
  text?: string;
  /** @deprecated See {@link CommentInfo.isInternal}. Legacy compatibility residue. */
  isInternal?: boolean;
  status: CommentStatus;
  target?: TextTarget;
  anchoredText?: string;
  createdTime?: number;
  creatorName?: string;
  creatorEmail?: string;
}
/**
 * Standardized discovery output for `comments.list`.
 */
export type CommentsListResult = DiscoveryOutput<CommentDomain>;
