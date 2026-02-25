import type { Receipt, TextAddress } from '../types/index.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments.types.js';
import type { RevisionGuardOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';

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
  target?: TextAddress;
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

// ---------------------------------------------------------------------------
// Canonical consolidated inputs (Phase 4 Wave 3)
// ---------------------------------------------------------------------------

/**
 * Input for `comments.create` — creates a new comment thread or a reply.
 *
 * When `parentCommentId` is provided, creates a reply on an existing thread.
 * Otherwise, creates a new root comment anchored to the given text range.
 */
export interface CommentsCreateInput {
  /** The comment body text. */
  text: string;
  /** The text range to attach the comment to (root comments only). */
  target?: TextAddress;
  /** Parent comment ID — when provided, creates a reply instead of a root comment. */
  parentCommentId?: string;
}

/**
 * Input for `comments.patch` — field-level patch on an existing comment.
 *
 * Exactly one mutation field (`text`, `target`, `status`, `isInternal`)
 * should be provided per call. Multiple fields are applied sequentially.
 */
export interface CommentsPatchInput {
  /** The ID of the comment to patch. */
  commentId: string;
  /** New body text (routes to edit). */
  text?: string;
  /** New anchor range (routes to move). */
  target?: TextAddress;
  /** Set status to 'resolved' (routes to resolve). */
  status?: 'resolved';
  /** Set the internal/private flag (routes to setInternal). */
  isInternal?: boolean;
}

/**
 * Input for `comments.delete` — removes a comment by ID.
 */
export interface CommentsDeleteInput {
  /** The ID of the comment to delete. */
  commentId: string;
}

/**
 * Engine-specific adapter that the comments API delegates to.
 */
export interface CommentsAdapter {
  /** Add a comment at the specified text range. */
  add(input: AddCommentInput, options?: RevisionGuardOptions): Receipt;
  /** Edit the body text of an existing comment. */
  edit(input: EditCommentInput, options?: RevisionGuardOptions): Receipt;
  /** Reply to an existing comment thread. */
  reply(input: ReplyToCommentInput, options?: RevisionGuardOptions): Receipt;
  /** Move a comment to a different text range. */
  move(input: MoveCommentInput, options?: RevisionGuardOptions): Receipt;
  /** Resolve an open comment. */
  resolve(input: ResolveCommentInput, options?: RevisionGuardOptions): Receipt;
  /** Remove a comment from the document. */
  remove(input: RemoveCommentInput, options?: RevisionGuardOptions): Receipt;
  /** Set the internal/private flag on a comment. */
  setInternal(input: SetCommentInternalInput, options?: RevisionGuardOptions): Receipt;
  /** Set which comment is currently active/focused. Pass `null` to clear. */
  setActive(input: SetCommentActiveInput, options?: RevisionGuardOptions): Receipt;
  /** Scroll to and focus a comment in the document. */
  goTo(input: GoToCommentInput): Receipt;
  /** Retrieve full information for a single comment. */
  get(input: GetCommentInput): CommentInfo;
  /** List comments matching the given query. */
  list(query?: CommentsListQuery): CommentsListResult;
}

/**
 * Public comments API surface exposed on `editor.doc.comments`.
 *
 * Canonical operations: `create`, `patch`, `delete`, `get`, `list`.
 *
 * Excludes UI-state operations (`setActive`, `goTo`) that live on
 * {@link CommentsAdapter} for internal editor use but are not part
 * of the document-api contract.
 */
export interface CommentsApi {
  create(input: CommentsCreateInput, options?: RevisionGuardOptions): Receipt;
  patch(input: CommentsPatchInput, options?: RevisionGuardOptions): Receipt;
  delete(input: CommentsDeleteInput, options?: RevisionGuardOptions): Receipt;
  get(input: GetCommentInput): CommentInfo;
  list(query?: CommentsListQuery): CommentsListResult;
}

const CREATE_COMMENT_ALLOWED_KEYS = new Set(['target', 'text', 'parentCommentId']);

/**
 * Validates CommentsCreateInput for root comments (non-reply) and throws DocumentApiValidationError on violations.
 */
function validateCreateCommentInput(input: unknown): asserts input is CommentsCreateInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'comments.create input must be a non-null object.');
  }

  assertNoUnknownFields(input, CREATE_COMMENT_ALLOWED_KEYS, 'comments.create');

  const { target, text, parentCommentId } = input;
  const hasTarget = target !== undefined;
  const isReply = parentCommentId !== undefined;

  if (typeof text !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `text must be a string, got ${typeof text}.`, {
      field: 'text',
      value: text,
    });
  }

  // Replies only need parentCommentId + text — skip target validation
  if (isReply) {
    if (typeof parentCommentId !== 'string' || parentCommentId.length === 0) {
      throw new DocumentApiValidationError('INVALID_TARGET', 'parentCommentId must be a non-empty string.', {
        field: 'parentCommentId',
        value: parentCommentId,
      });
    }
    if (hasTarget) {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        'Cannot combine parentCommentId with target. Replies do not take a target.',
        { fields: ['parentCommentId', 'target'] },
      );
    }
    return;
  }

  if (hasTarget && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }
}

const PATCH_COMMENT_ALLOWED_KEYS = new Set(['commentId', 'target', 'text', 'status', 'isInternal']);

/**
 * Validates CommentsPatchInput target fields and throws DocumentApiValidationError on violations.
 * Only validates target-related fields when a target is being patched.
 */
function validatePatchCommentInput(input: unknown): asserts input is CommentsPatchInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'comments.patch input must be a non-null object.');
  }

  assertNoUnknownFields(input, PATCH_COMMENT_ALLOWED_KEYS, 'comments.patch');

  const { commentId, target } = input;
  const hasTarget = target !== undefined;

  if (typeof commentId !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `commentId must be a string, got ${typeof commentId}.`, {
      field: 'commentId',
      value: commentId,
    });
  }

  const { status } = input;
  if (status !== undefined && status !== 'resolved') {
    throw new DocumentApiValidationError('INVALID_TARGET', `status must be "resolved", got "${String(status)}".`, {
      field: 'status',
      value: status,
    });
  }

  if (hasTarget && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers — canonical interception point for input normalization
// and validation. These route to the fine-grained adapter methods.
// ---------------------------------------------------------------------------

/**
 * Execute `comments.create` — routes to `adapter.add` or `adapter.reply`
 * depending on whether `parentCommentId` is provided.
 */
export function executeCommentsCreate(
  adapter: CommentsAdapter,
  input: CommentsCreateInput,
  options?: RevisionGuardOptions,
): Receipt {
  // Validate the raw input first (catches null, unknown fields, etc.)
  validateCreateCommentInput(input);

  if (input.parentCommentId !== undefined) {
    return adapter.reply({ parentCommentId: input.parentCommentId, text: input.text }, options);
  }
  return adapter.add(input, options);
}

/**
 * Execute `comments.patch` — routes to the appropriate adapter method(s)
 * based on which fields are provided.
 */
export function executeCommentsPatch(
  adapter: CommentsAdapter,
  input: CommentsPatchInput,
  options?: RevisionGuardOptions,
): Receipt {
  // Validate the full input up front — commentId, unknown fields, and target
  // constraints — before any adapter mutations.
  validatePatchCommentInput(input);

  let lastReceipt: Receipt = { success: true };

  if (input.text !== undefined) {
    lastReceipt = adapter.edit({ commentId: input.commentId, text: input.text }, options);
  }

  if (input.target !== undefined) {
    lastReceipt = adapter.move({ commentId: input.commentId, target: input.target }, options);
  }

  if (input.status === 'resolved') {
    lastReceipt = adapter.resolve({ commentId: input.commentId }, options);
  }

  if (input.isInternal !== undefined) {
    lastReceipt = adapter.setInternal({ commentId: input.commentId, isInternal: input.isInternal }, options);
  }

  return lastReceipt;
}

/**
 * Execute `comments.delete` — routes to `adapter.remove`.
 */
export function executeCommentsDelete(
  adapter: CommentsAdapter,
  input: CommentsDeleteInput,
  options?: RevisionGuardOptions,
): Receipt {
  return adapter.remove({ commentId: input.commentId }, options);
}

// Internal-use execute wrappers (setActive, goTo remain for adapter consumers)
export function executeSetCommentActive(
  adapter: CommentsAdapter,
  input: SetCommentActiveInput,
  options?: RevisionGuardOptions,
): Receipt {
  return adapter.setActive(input, options);
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
