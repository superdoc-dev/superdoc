import type { CommentAddress, CommentStatus, TextAddress } from '../types/index.js';

export type { CommentStatus } from '../types/index.js';

export interface CommentInfo {
  address: CommentAddress;
  commentId: string;
  importedId?: string;
  parentCommentId?: string;
  text?: string;
  isInternal?: boolean;
  status: CommentStatus;
  target?: TextAddress;
  createdTime?: number;
  creatorName?: string;
  creatorEmail?: string;
}

export interface CommentsListQuery {
  includeResolved?: boolean;
}

export interface CommentsListResult {
  matches: CommentInfo[];
  total: number;
}
