import type { BaseNodeInfo } from './base.js';

export interface CommentNodeInfo extends BaseNodeInfo {
  nodeType: 'comment';
  kind: 'inline';
  properties: CommentProperties;
  bodyText?: string;
  bodyNodes?: BaseNodeInfo[];
}

export type CommentStatus = 'open' | 'resolved';

export interface CommentProperties {
  commentId: string;
  author?: string;
  status?: CommentStatus;
  createdAt?: string;
  /** User-visible sidebar text */
  commentText?: string;
}
