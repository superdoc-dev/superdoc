import type { Schema } from 'prosemirror-model';
import { diffNodes, type NodeDiff, type NodeInfo } from './generic-diffing.ts';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing.ts';
import { createParagraphSnapshot, type ParagraphNodeInfo } from './paragraph-diffing.ts';
import { diffSequences } from './sequence-diffing.ts';

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
 * Base shape shared by every comment diff payload.
 */
export interface CommentDiffBase<Action extends 'added' | 'deleted' | 'modified'> {
  /** Change type for this comment. */
  action: Action;
  /** Node type identifier for comment diffs. */
  nodeType: 'comment';
  /** Resolved comment identifier (importedId → id → commentId). */
  commentId: string;
}

/**
 * Diff payload describing an added comment.
 */
export type CommentAddedDiff = CommentDiffBase<'added'> & {
  /** Serialized comment payload inserted into the document. */
  commentJSON: CommentInput;
  /** Plain-text representation of the comment body. */
  text: string;
};

/**
 * Diff payload describing a deleted comment.
 */
export type CommentDeletedDiff = CommentDiffBase<'deleted'> & {
  /** Serialized comment payload removed from the document. */
  commentJSON: CommentInput;
  /** Plain-text representation of the removed comment body. */
  oldText: string;
};

/**
 * Diff payload describing a modified comment.
 */
export type CommentModifiedDiff = CommentDiffBase<'modified'> & {
  /** Serialized comment payload before the change. */
  oldCommentJSON: CommentInput;
  /** Serialized comment payload after the change. */
  newCommentJSON: CommentInput;
  /** Plain-text content before the change. */
  oldText: string;
  /** Plain-text content after the change. */
  newText: string;
  /** Node-level diff for the comment body content. */
  contentDiff: NodeDiff[];
  /** Attribute-level diff for comment metadata. */
  attrsDiff: AttributesDiff | null;
};

/**
 * Union of every diff variant the comment diffing logic can produce.
 */
export type CommentDiff = CommentAddedDiff | CommentDeletedDiff | CommentModifiedDiff;

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
 * Computes diffs between two comment lists.
 *
 * @param oldComments Previous comment list.
 * @param newComments Updated comment list.
 * @param schema Schema used to parse comment bodies.
 * @returns Comment diff payloads.
 */
export function diffComments(oldComments: CommentInput[], newComments: CommentInput[], schema: Schema): CommentDiff[] {
  const oldTokens = buildCommentTokens(oldComments, schema);
  const newTokens = buildCommentTokens(newComments, schema);

  return diffSequences<CommentToken, CommentDiff, CommentDiff, CommentDiff>(oldTokens, newTokens, {
    comparator: commentComparator,
    shouldProcessEqualAsModification,
    canTreatAsModification: () => false,
    buildAdded: (token) => buildAddedCommentDiff(token),
    buildDeleted: (token) => buildDeletedCommentDiff(token),
    buildModified: (oldToken, newToken) => buildModifiedCommentDiff(oldToken, newToken),
  });
}

/**
 * Compares two comment tokens to determine if they represent the same comment.
 *
 * @param oldToken Comment token from the old list.
 * @param newToken Comment token from the new list.
 * @returns True when comment ids match.
 */
export function commentComparator(oldToken: CommentToken, newToken: CommentToken): boolean {
  return oldToken.commentId === newToken.commentId;
}

/**
 * Determines whether equal comment tokens should still be treated as modified.
 *
 * @param oldToken Comment token from the old list.
 * @param newToken Comment token from the new list.
 * @returns True when content or metadata differs.
 */
export function shouldProcessEqualAsModification(oldToken: CommentToken, newToken: CommentToken): boolean {
  const attrsDiff = getAttributesDiff(oldToken.commentJSON, newToken.commentJSON, ['textJson', 'commentId']);
  if (attrsDiff) {
    return true;
  }

  const oldSignature = oldToken.content ? JSON.stringify(oldToken.content.node.toJSON()) : '';
  const newSignature = newToken.content ? JSON.stringify(newToken.content.node.toJSON()) : '';
  return oldSignature !== newSignature;
}

/**
 * Determines whether delete/insert pairs should be treated as modifications.
 *
 * @returns False because comment ids are treated as stable identities.
 */
export function canTreatAsModification(): boolean {
  return false;
}

/**
 * Builds a normalized payload describing a comment addition.
 *
 * @param comment Comment token being added.
 * @returns Diff payload for the added comment.
 */
export function buildAddedCommentDiff(comment: CommentToken): CommentAddedDiff {
  return {
    action: 'added',
    nodeType: 'comment',
    commentId: comment.commentId,
    commentJSON: comment.commentJSON,
    text: getCommentText(comment.content),
  };
}

/**
 * Builds a normalized payload describing a comment deletion.
 *
 * @param comment Comment token being deleted.
 * @returns Diff payload for the deleted comment.
 */
export function buildDeletedCommentDiff(comment: CommentToken): CommentDeletedDiff {
  return {
    action: 'deleted',
    nodeType: 'comment',
    commentId: comment.commentId,
    commentJSON: comment.commentJSON,
    oldText: getCommentText(comment.content),
  };
}

/**
 * Builds the payload for a comment modification, including inline diffs when possible.
 *
 * @param oldComment Comment token from the old list.
 * @param newComment Comment token from the new list.
 * @returns Diff payload or null when no changes exist.
 */
export function buildModifiedCommentDiff(
  oldComment: CommentToken,
  newComment: CommentToken,
): CommentModifiedDiff | null {
  const contentDiff =
    oldComment.content && newComment.content ? diffNodes([oldComment.content], [newComment.content]) : [];
  const attrsDiff = getAttributesDiff(oldComment.commentJSON, newComment.commentJSON, ['textJson', 'commentId']);

  if (contentDiff.length === 0 && !attrsDiff) {
    return null;
  }

  return {
    action: 'modified',
    nodeType: 'comment',
    commentId: oldComment.commentId,
    oldCommentJSON: oldComment.commentJSON,
    newCommentJSON: newComment.commentJSON,
    oldText: getCommentText(oldComment.content),
    newText: getCommentText(newComment.content),
    contentDiff,
    attrsDiff,
  };
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
 * Returns the flattened comment text when the content is a paragraph.
 *
 * @param content Comment content payload.
 * @returns Flattened text string.
 */
function getCommentText(content: NodeInfo | null): string {
  if (!content) {
    return '';
  }
  if (content.node.type.name === 'paragraph') {
    const paragraphContent = content as ParagraphNodeInfo;
    return paragraphContent.fullText;
  }
  return '';
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
