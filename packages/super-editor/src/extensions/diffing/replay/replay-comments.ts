import { ReplayResult } from './replay-types';
import { comments_module_events } from '@superdoc/common';
import { resolveCommentId } from '../algorithm/comment-diffing';

/**
 * Finds a comment index in a mutable comment store by its resolved id.
 *
 * @param comments Mutable comment store.
 * @param commentId Target resolved id.
 * @returns Matching index or -1 when not found.
 */
function findCommentIndexById(
  comments: import('../algorithm/comment-diffing').CommentInput[],
  commentId: string,
): number {
  return comments.findIndex((comment) => resolveCommentId(comment) === commentId);
}

type ReplayEditor = {
  emit?: (event: string, payload: unknown) => void;
  options?: {
    documentId?: string | null;
  };
};

/**
 * Builds a replay event payload with stable id and document ownership metadata.
 *
 * @param params.comment Source comment payload.
 * @param params.commentId Resolved comment id from diff token.
 * @param params.editor Optional editor used to infer active document ownership.
 * @returns Normalized comment payload for commentsUpdate events.
 */
function buildReplayCommentEventPayload({
  comment,
  commentId,
  editor,
}: {
  comment: import('../algorithm/comment-diffing').CommentInput;
  commentId: string;
  editor?: ReplayEditor;
}): import('../algorithm/comment-diffing').CommentInput {
  const payload = {
    ...comment,
  };

  if (!payload.commentId) {
    payload.commentId = commentId;
  }

  const editorDocumentId = editor?.options?.documentId != null ? String(editor.options.documentId) : null;
  const payloadDocumentId = payload.documentId != null ? String(payload.documentId) : null;
  const payloadFileId = payload.fileId != null ? String(payload.fileId) : null;
  const documentId = payloadDocumentId ?? editorDocumentId;
  const fileId = payloadFileId ?? documentId ?? editorDocumentId;

  if (!payload.documentId && documentId) {
    payload.documentId = documentId;
  }
  if (!payload.fileId && fileId) {
    payload.fileId = fileId;
  }

  return payload;
}

/**
 * Replays one comment diff into a mutable comment store.
 *
 * Behavior:
 * - `added`: inserts the new comment payload.
 * - `modified`: replaces the existing comment payload with the updated version.
 * - `deleted`: removes the existing comment payload.
 *
 * @param params Input bundle for replaying one comment diff.
 * @param params.comments Mutable comment store to update in place.
 * @param params.diff Comment diff payload.
 * @returns Result summary for the applied comment diff.
 */
function replayCommentDiff({
  comments,
  diff,
  editor,
}: {
  comments: import('../algorithm/comment-diffing').CommentInput[];
  diff: import('../algorithm/comment-diffing').CommentDiff;
  editor?: ReplayEditor;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  /**
   * Records a skipped diff with a warning message.
   *
   * @param message Warning to record for a skipped diff.
   */
  const skipWithWarning = (message: string) => {
    result.skipped += 1;
    result.warnings.push(message);
  };

  if (diff.nodeType !== 'comment') {
    skipWithWarning(`Non-comment diff received: ${diff.nodeType}.`);
    return result;
  }

  if (diff.action === 'added') {
    const existingIndex = findCommentIndexById(comments, diff.commentId);
    if (existingIndex !== -1) {
      skipWithWarning(`Comment ${diff.commentId} already exists; skipping add.`);
      return result;
    }

    comments.push(diff.commentJSON);
    result.applied += 1;
    const payload = buildReplayCommentEventPayload({
      comment: diff.commentJSON,
      commentId: diff.commentId,
      editor,
    });
    const resolvedText = resolveCommentTextPayload({ comment: diff.commentJSON, fallbackText: diff.text });
    if (!payload.commentText && resolvedText) {
      payload.commentText = resolvedText;
    }
    editor?.emit?.('commentsUpdate', {
      type: comments_module_events.ADD,
      comment: payload,
    });
    return result;
  }

  if (diff.action === 'deleted') {
    const existingIndex = findCommentIndexById(comments, diff.commentId);
    if (existingIndex === -1) {
      skipWithWarning(`Comment ${diff.commentId} not found; skipping delete.`);
      return result;
    }

    comments.splice(existingIndex, 1);
    result.applied += 1;
    const payload = buildReplayCommentEventPayload({
      comment: diff.commentJSON,
      commentId: diff.commentId,
      editor,
    });
    editor?.emit?.('commentsUpdate', {
      type: comments_module_events.DELETED,
      comment: payload,
    });
    return result;
  }

  if (diff.action === 'modified') {
    const existingIndex = findCommentIndexById(comments, diff.commentId);
    if (existingIndex === -1) {
      skipWithWarning(`Comment ${diff.commentId} not found; skipping modify.`);
      return result;
    }

    comments.splice(existingIndex, 1, diff.newCommentJSON);
    result.applied += 1;
    const payload = buildReplayCommentEventPayload({
      comment: diff.newCommentJSON,
      commentId: diff.commentId,
      editor,
    });
    const resolvedText = resolveCommentTextPayload({ comment: diff.newCommentJSON, fallbackText: diff.newText });
    if (!payload.commentText && resolvedText) {
      payload.commentText = resolvedText;
    }
    editor?.emit?.('commentsUpdate', {
      type: comments_module_events.UPDATE,
      comment: payload,
    });
    return result;
  }

  skipWithWarning('Unsupported comment diff action.');
  return result;
}

/**
 * Resolves display text for a comment payload.
 *
 * Priority order:
 * 1. `comment.commentText` when present.
 * 2. `fallbackText` from the diff payload.
 * 3. Flattened text extracted from `comment.elements`.
 * 4. Flattened text extracted from `comment.textJson`.
 *
 * This keeps replayed comment events compatible with UI paths that expect
 * `commentText` even when imported DOCX comments only provide structured
 * comment bodies (`elements`) instead of plain text.
 */
function resolveCommentTextPayload({
  comment,
  fallbackText,
}: {
  comment: import('../algorithm/comment-diffing').CommentInput;
  fallbackText?: string;
}): string | undefined {
  if (typeof comment.commentText === 'string' && comment.commentText.length > 0) {
    return comment.commentText;
  }
  if (typeof fallbackText === 'string' && fallbackText.length > 0) {
    return fallbackText;
  }

  const fromElements = extractStructuredCommentText(comment.elements);
  if (fromElements) return fromElements;

  const fromTextJson = extractStructuredCommentText(comment.textJson);
  if (fromTextJson) return fromTextJson;

  return undefined;
}

/**
 * Extracts concatenated text from nested comment body structures.
 *
 * Supports the structures used by imported DOCX comments (`elements`) and
 * paragraph JSON trees (`textJson`) by walking `text`, `content`, and `elements`.
 */
function extractStructuredCommentText(value: unknown): string {
  if (!value) return '';

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractStructuredCommentText(item)).join('');
  }

  if (typeof value !== 'object') {
    return '';
  }

  const node = value as Record<string, unknown>;
  const textPart = typeof node.text === 'string' ? node.text : '';
  const contentPart = extractStructuredCommentText(node.content);
  const elementsPart = extractStructuredCommentText(node.elements);

  return `${textPart}${contentPart}${elementsPart}`;
}

/**
 * Replays a list of comment diffs into a mutable comment store.
 *
 * @param params Input bundle for replaying comment diffs.
 * @param params.comments Mutable comment store to update in place.
 * @param params.commentDiffs Comment diffs to replay in provided order.
 * @returns Aggregated result summary for all replayed comment diffs.
 */
export function replayComments({
  comments,
  commentDiffs,
  editor,
}: {
  comments: import('../algorithm/comment-diffing').CommentInput[];
  commentDiffs: import('../algorithm/comment-diffing').CommentDiff[];
  editor?: ReplayEditor;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  for (const diff of commentDiffs) {
    const diffResult = replayCommentDiff({ comments, diff, editor });
    result.applied += diffResult.applied;
    result.skipped += diffResult.skipped;
    result.warnings.push(...diffResult.warnings);
  }

  return result;
}
