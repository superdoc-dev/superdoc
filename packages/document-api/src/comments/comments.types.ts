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

export interface TrackedChangeCommentTarget {
  kind?: 'trackedChange';
  trackedChangeId: string;
  story?: StoryLocator;
}

export type CommentTarget = TextAddress | TextTarget | SelectionTarget | TrackedChangeCommentTarget;

export interface CommentTrackedChangeLink {
  trackedChange: boolean;
  trackedChangeType?: TrackChangeType;
  trackedChangeDisplayType?: string | null;
  trackedChangeStory?: StoryLocator | null;
  trackedChangeAnchorKey?: string | null;
  trackedChangeText?: string | null;
  deletedText?: string | null;
}

export interface CommentInfo {
  address: CommentAddress;
  commentId: string;
  importedId?: string;
  parentCommentId?: string;
  text?: string;
  isInternal?: boolean;
  status: CommentStatus;
  target?: TextTarget;
  anchoredText?: string;
  createdTime?: number;
  creatorName?: string;
  creatorEmail?: string;
  trackedChange?: boolean;
  trackedChangeType?: TrackChangeType;
  trackedChangeDisplayType?: string | null;
  trackedChangeStory?: StoryLocator | null;
  trackedChangeAnchorKey?: string | null;
  trackedChangeText?: string | null;
  deletedText?: string | null;
  trackedChangeLink?: CommentTrackedChangeLink | null;
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
  importedId?: string;
  parentCommentId?: string;
  text?: string;
  isInternal?: boolean;
  status: CommentStatus;
  target?: TextTarget;
  anchoredText?: string;
  createdTime?: number;
  creatorName?: string;
  creatorEmail?: string;
  trackedChange?: boolean;
  trackedChangeType?: TrackChangeType;
  trackedChangeDisplayType?: string | null;
  trackedChangeStory?: StoryLocator | null;
  trackedChangeAnchorKey?: string | null;
  trackedChangeText?: string | null;
  deletedText?: string | null;
  trackedChangeLink?: CommentTrackedChangeLink | null;
}

/**
 * Standardized discovery output for `comments.list`.
 */
export type CommentsListResult = DiscoveryOutput<CommentDomain>;
