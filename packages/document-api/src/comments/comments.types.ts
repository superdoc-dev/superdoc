import type { CommentAddress, CommentStatus, TextTarget } from '../types/index.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { StoryLocator } from '../types/story.types.js';

export type { CommentStatus } from '../types/index.js';

/**
 * Scope marker used by {@link CommentsListQuery.in} to request comments
 * across every story (body + headers + footers + footnotes + endnotes).
 * Equivalent to a multi-story aggregate list.
 */
export const COMMENTS_IN_ALL = 'all' as const;
export type CommentsInAll = typeof COMMENTS_IN_ALL;

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
}

export interface CommentsListQuery {
  includeResolved?: boolean;
  limit?: number;
  offset?: number;
  /**
   * Story scope.
   * - `undefined` (default): body only (backward compatible).
   * - A {@link StoryLocator}: only that story.
   * - `'all'`: flat list across body + every non-body story.
   */
  in?: StoryLocator | CommentsInAll;
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
}

/**
 * Standardized discovery output for `comments.list`.
 */
export type CommentsListResult = DiscoveryOutput<CommentDomain>;
