import type { CommentAddress, CommentStatus, TextTarget } from '../types/index.js';
import type { DiscoveryOutput } from '../types/discovery.js';

export type { CommentStatus } from '../types/index.js';

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
