import type { Receipt, TextAddress } from '../types/index.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields, assertNonNegativeInteger } from '../validation-primitives.js';

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
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
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
  target?: TextAddress;
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
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

const ADD_COMMENT_ALLOWED_KEYS = new Set(['target', 'text', 'blockId', 'start', 'end']);

/**
 * Validates AddCommentInput and throws DocumentApiValidationError on violations.
 */
function validateAddCommentInput(input: unknown): asserts input is AddCommentInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'comments.add input must be a non-null object.');
  }

  assertNoUnknownFields(input, ADD_COMMENT_ALLOWED_KEYS, 'comments.add');

  const { target, text, blockId, start, end } = input;
  const hasTarget = target !== undefined;
  const hasBlockId = blockId !== undefined;
  const hasStart = start !== undefined;
  const hasEnd = end !== undefined;

  if (hasTarget && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  if (typeof text !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `text must be a string, got ${typeof text}.`, {
      field: 'text',
      value: text,
    });
  }

  if (hasBlockId && typeof blockId !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `blockId must be a string, got ${typeof blockId}.`, {
      field: 'blockId',
      value: blockId,
    });
  }

  if (!hasTarget && !hasBlockId && !hasStart && !hasEnd) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'comments.add requires a target. Provide either target or blockId + start + end.',
    );
  }

  if (hasTarget && (hasBlockId || hasStart || hasEnd)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'Cannot combine target with blockId/start/end. Use exactly one locator mode.',
      {
        fields: [
          'target',
          ...(hasBlockId ? ['blockId'] : []),
          ...(hasStart ? ['start'] : []),
          ...(hasEnd ? ['end'] : []),
        ],
      },
    );
  }

  if (!hasBlockId && (hasStart || hasEnd)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'start/end require blockId.', {
      fields: ['blockId', ...(hasStart ? ['start'] : []), ...(hasEnd ? ['end'] : [])],
    });
  }

  if (hasBlockId && !hasTarget) {
    if (!hasStart || !hasEnd) {
      throw new DocumentApiValidationError('INVALID_TARGET', 'blockId requires both start and end for comments.add.', {
        fields: ['blockId', 'start', 'end'],
      });
    }
  }

  if (hasStart) assertNonNegativeInteger(start, 'start');
  if (hasEnd) assertNonNegativeInteger(end, 'end');
  if (hasStart && hasEnd && (start as number) > (end as number)) {
    throw new DocumentApiValidationError('INVALID_TARGET', `start must be <= end, got start=${start}, end=${end}.`, {
      fields: ['start', 'end'],
      start,
      end,
    });
  }
}

const MOVE_COMMENT_ALLOWED_KEYS = new Set(['commentId', 'target', 'blockId', 'start', 'end']);

/**
 * Validates MoveCommentInput and throws DocumentApiValidationError on violations.
 */
function validateMoveCommentInput(input: unknown): asserts input is MoveCommentInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'comments.move input must be a non-null object.');
  }

  assertNoUnknownFields(input, MOVE_COMMENT_ALLOWED_KEYS, 'comments.move');

  const { commentId, target, blockId, start, end } = input;
  const hasTarget = target !== undefined;
  const hasBlockId = blockId !== undefined;
  const hasStart = start !== undefined;
  const hasEnd = end !== undefined;

  if (typeof commentId !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `commentId must be a string, got ${typeof commentId}.`, {
      field: 'commentId',
      value: commentId,
    });
  }

  if (hasTarget && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  if (hasBlockId && typeof blockId !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `blockId must be a string, got ${typeof blockId}.`, {
      field: 'blockId',
      value: blockId,
    });
  }

  if (!hasTarget && !hasBlockId && !hasStart && !hasEnd) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'comments.move requires a target. Provide either target or blockId + start + end.',
    );
  }

  if (hasTarget && (hasBlockId || hasStart || hasEnd)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'Cannot combine target with blockId/start/end. Use exactly one locator mode.',
      {
        fields: [
          'target',
          ...(hasBlockId ? ['blockId'] : []),
          ...(hasStart ? ['start'] : []),
          ...(hasEnd ? ['end'] : []),
        ],
      },
    );
  }

  if (!hasBlockId && (hasStart || hasEnd)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'start/end require blockId.', {
      fields: ['blockId', ...(hasStart ? ['start'] : []), ...(hasEnd ? ['end'] : [])],
    });
  }

  if (hasBlockId && !hasTarget) {
    if (!hasStart || !hasEnd) {
      throw new DocumentApiValidationError('INVALID_TARGET', 'blockId requires both start and end for comments.move.', {
        fields: ['blockId', 'start', 'end'],
      });
    }
  }

  if (hasStart) assertNonNegativeInteger(start, 'start');
  if (hasEnd) assertNonNegativeInteger(end, 'end');
  if (hasStart && hasEnd && (start as number) > (end as number)) {
    throw new DocumentApiValidationError('INVALID_TARGET', `start must be <= end, got start=${start}, end=${end}.`, {
      fields: ['start', 'end'],
      start,
      end,
    });
  }
}

/**
 * Normalizes friendly locator fields into canonical TextAddress for comment inputs.
 * Returns the input with `target` resolved if blockId+start+end was provided.
 */
function normalizeCommentTarget<T extends { target?: TextAddress; blockId?: string; start?: number; end?: number }>(
  input: T,
): T & { target: TextAddress } {
  if (input.target) return input as T & { target: TextAddress };

  const target: TextAddress = {
    kind: 'text',
    blockId: input.blockId!,
    range: { start: input.start!, end: input.end! },
  };

  // Return a clean object with the canonical target — no leftover friendly fields.
  const { blockId: _b, start: _s, end: _e, ...rest } = input;
  return { ...rest, target } as T & { target: TextAddress };
}

/**
 * Execute wrappers below are the canonical interception point for input
 * normalization and validation. Query-only operations currently pass through
 * directly. Mutation operations will gain validation as the API matures.
 * Keep the wrappers to preserve this extension surface.
 */
export function executeAddComment(adapter: CommentsAdapter, input: AddCommentInput): Receipt {
  validateAddCommentInput(input);
  const normalized = normalizeCommentTarget(input);
  return adapter.add(normalized);
}

export function executeEditComment(adapter: CommentsAdapter, input: EditCommentInput): Receipt {
  return adapter.edit(input);
}

export function executeReplyToComment(adapter: CommentsAdapter, input: ReplyToCommentInput): Receipt {
  return adapter.reply(input);
}

export function executeMoveComment(adapter: CommentsAdapter, input: MoveCommentInput): Receipt {
  validateMoveCommentInput(input);
  const normalized = normalizeCommentTarget(input);
  return adapter.move(normalized);
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
