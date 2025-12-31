import type { Schema } from 'prosemirror-model';
import type { NodeInfo } from './generic-diffing.ts';
import { createParagraphSnapshot } from './paragraph-diffing.ts';

/**
 * Raw comment data used for diffing comment content and metadata.
 */
export interface CommentInput {
  /** Primary comment identifier when available. */
  commentId?: string;
  /** Imported comment identifier used as a fallback. */
  importedId?: string;
  /** Alternate identifier used by some integrations. */
  id?: string;
  /** ProseMirror-compatible JSON for the comment body (expected to be a paragraph node). */
  textJson?: unknown;
  /** Additional comment metadata fields. */
  [key: string]: unknown;
}

/**
 * Normalized token representation for a single comment.
 */
export interface CommentToken {
  /** Resolved identifier for the comment. */
  commentId: string;
  /** Original comment payload. */
  commentJSON: CommentInput;
  /** Parsed comment body content when available. */
  content: NodeInfo | null;
}

/**
 * Builds normalized tokens for diffing comment content.
 *
 * @param comments Comment payloads to normalize.
 * @param schema Schema used to build ProseMirror nodes from comment JSON.
 * @returns Normalized comment tokens.
 */
export function buildCommentTokens(comments: CommentInput[], schema: Schema): CommentToken[] {
  return comments
    .map((comment) => {
      const commentId = resolveCommentId(comment);
      if (!commentId) {
        return null;
      }
      const content = tokenizeCommentText(comment, schema);
      return {
        commentId,
        commentJSON: comment,
        content,
      };
    })
    .filter((token): token is CommentToken => token !== null);
}

/**
 * Resolves a stable comment identifier from a comment payload.
 *
 * @param comment Comment payload to inspect.
 * @returns Resolved comment id or null when unavailable.
 */
function resolveCommentId(comment: CommentInput): string | null {
  return comment.importedId ?? comment.id ?? comment.commentId ?? null;
}

/**
 * Tokenizes a comment body into inline tokens and a flattened text string.
 *
 * @param comment Comment payload containing `textJson`.
 * @param schema Schema used to build ProseMirror nodes.
 * @returns Tokenization output for the comment body.
 */
function tokenizeCommentText(comment: CommentInput, schema: Schema): NodeInfo | null {
  if (!comment.textJson) {
    return null;
  }

  const node = schema.nodeFromJSON(comment.textJson as Record<string, unknown>);
  if (node.type.name !== 'paragraph') {
    return {
      node,
      pos: 0,
      depth: 0,
    };
  }

  return createParagraphSnapshot(node, 0, 0);
}
