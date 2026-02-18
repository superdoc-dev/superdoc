import type { Receipt, TextAddress } from '../types/index.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments.types.js';

/**
 * Input for adding a comment to a text range.
 */
export interface AddCommentInput {
  /**
   * The text range to attach the comment to.
   *
   * Note: text matches can span multiple blocks; callers should pick a single
   * block range (e.g., the first `textRanges` entry from `find`) until
   * multi-block comment targets are supported.
   */
  target: TextAddress;
  /** The comment body text. */
  text: string;
}

export interface EditCommentInput {
  commentId: string;
  text: string;
}

export interface ReplyToCommentInput {
  parentCommentId: string;
  text: string;
}

export interface MoveCommentInput {
  commentId: string;
  target: TextAddress;
}

export interface ResolveCommentInput {
  commentId: string;
}

export interface RemoveCommentInput {
  commentId: string;
}

export interface SetCommentInternalInput {
  commentId: string;
  isInternal: boolean;
}

export interface SetCommentActiveInput {
  commentId: string | null;
}

export interface GoToCommentInput {
  commentId: string;
}

export interface GetCommentInput {
  commentId: string;
}

/**
 * Engine-specific adapter that the comments API delegates to.
 */
export interface CommentsAdapter {
  /** Add a comment at the specified text range. */
  add(input: AddCommentInput): Receipt;
  /** Edit the body text of an existing comment. */
  edit(input: EditCommentInput): Receipt;
  /** Reply to an existing comment thread. */
  reply(input: ReplyToCommentInput): Receipt;
  /** Move a comment to a different text range. */
  move(input: MoveCommentInput): Receipt;
  /** Resolve an open comment. */
  resolve(input: ResolveCommentInput): Receipt;
  /** Remove a comment from the document. */
  remove(input: RemoveCommentInput): Receipt;
  /** Set the internal/private flag on a comment. */
  setInternal(input: SetCommentInternalInput): Receipt;
  /** Set which comment is currently active/focused. Pass `null` to clear. */
  setActive(input: SetCommentActiveInput): Receipt;
  /** Scroll to and focus a comment in the document. */
  goTo(input: GoToCommentInput): Receipt;
  /** Retrieve full information for a single comment. */
  get(input: GetCommentInput): CommentInfo;
  /** List comments matching the given query. */
  list(query?: CommentsListQuery): CommentsListResult;
}

/**
 * Public comments API surface exposed on `editor.doc.comments`.
 */
export type CommentsApi = CommentsAdapter;

/**
 * Execute wrappers below are the canonical interception point for input
 * normalization and validation. Query-only operations currently pass through
 * directly. Mutation operations will gain validation as the API matures.
 * Keep the wrappers to preserve this extension surface.
 */
export function executeAddComment(adapter: CommentsAdapter, input: AddCommentInput): Receipt {
  return adapter.add(input);
}

export function executeEditComment(adapter: CommentsAdapter, input: EditCommentInput): Receipt {
  return adapter.edit(input);
}

export function executeReplyToComment(adapter: CommentsAdapter, input: ReplyToCommentInput): Receipt {
  return adapter.reply(input);
}

export function executeMoveComment(adapter: CommentsAdapter, input: MoveCommentInput): Receipt {
  return adapter.move(input);
}

export function executeResolveComment(adapter: CommentsAdapter, input: ResolveCommentInput): Receipt {
  return adapter.resolve(input);
}

export function executeRemoveComment(adapter: CommentsAdapter, input: RemoveCommentInput): Receipt {
  return adapter.remove(input);
}

export function executeSetCommentInternal(adapter: CommentsAdapter, input: SetCommentInternalInput): Receipt {
  return adapter.setInternal(input);
}

export function executeSetCommentActive(adapter: CommentsAdapter, input: SetCommentActiveInput): Receipt {
  return adapter.setActive(input);
}

export function executeGoToComment(adapter: CommentsAdapter, input: GoToCommentInput): Receipt {
  return adapter.goTo(input);
}

export function executeGetComment(adapter: CommentsAdapter, input: GetCommentInput): CommentInfo {
  return adapter.get(input);
}

export function executeListComments(adapter: CommentsAdapter, query?: CommentsListQuery): CommentsListResult {
  return adapter.list(query);
}
