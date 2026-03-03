import type { Schema } from 'prosemirror-model';
import { diffNodes, normalizeNodes, type NodeDiff, type NodeInfo } from './generic-diffing';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing';
import { createParagraphSnapshot, type ParagraphNodeInfo } from './paragraph-diffing';
import { diffSequences } from './sequence-diffing';

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
  /** Structured ProseMirror-like nodes used by imported DOCX comments. */
  elements?: unknown;
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
 * Comment attributes ignored during metadata diffing.
 *
 * `trackedChangeParentId` is runtime-coupled to tracked-change mark ids, which
 * may be regenerated between imports of the same DOCX. Treating it as a stable
 * diffable attribute causes false-positive comment modifications that can break
 * thread linkage on replay.
 */
const COMMENT_ATTRS_DIFF_IGNORED_KEYS = ['textJson', 'elements', 'commentId', 'trackedChangeParentId'];

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
  const attrsDiff = getAttributesDiff(oldToken.commentJSON, newToken.commentJSON, COMMENT_ATTRS_DIFF_IGNORED_KEYS);
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
  const contentDiff = buildCommentContentDiff(oldComment.content, newComment.content);
  const attrsDiff = getAttributesDiff(oldComment.commentJSON, newComment.commentJSON, COMMENT_ATTRS_DIFF_IGNORED_KEYS);

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
 * Diffs comment body content with support for both paragraph and doc-root bodies.
 *
 * Multi-block comment bodies are represented as `doc` nodes (from `elements`).
 * Diffing those via `diffNodes([doc],[doc])` only checks doc attrs and misses
 * child content edits, so we diff normalized descendants instead.
 *
 * @param oldContent Parsed old comment body.
 * @param newContent Parsed new comment body.
 * @returns Node-level content diff payload.
 */
function buildCommentContentDiff(oldContent: NodeInfo | null, newContent: NodeInfo | null): NodeDiff[] {
  if (!oldContent || !newContent) {
    return [];
  }

  if (oldContent.node.type.name === 'doc' && newContent.node.type.name === 'doc') {
    const oldNodes = normalizeNodes(oldContent.node);
    const newNodes = normalizeNodes(newContent.node);
    return diffNodes(oldNodes, newNodes);
  }

  return diffNodes([oldContent], [newContent]);
}

/**
 * Resolves a stable comment identifier from a comment payload.
 *
 * @param comment Comment payload to inspect.
 * @returns Resolved comment id or null when unavailable.
 */
export function resolveCommentId(comment: CommentInput): string | null {
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
  return content.node.textContent ?? '';
}

/**
 * Tokenizes a comment body into inline tokens and a flattened text string.
 *
 * @param comment Comment payload containing `textJson` and/or `elements`.
 * @param schema Schema used to build ProseMirror nodes.
 * @returns Tokenization output for the comment body.
 */
function tokenizeCommentText(comment: CommentInput, schema: Schema): NodeInfo | null {
  const nodeJson = resolveCommentBodyNodeJSON(comment);
  if (!nodeJson) {
    return null;
  }

  const node = schema.nodeFromJSON(nodeJson);
  if (node.type.name !== 'paragraph') {
    return {
      node,
      pos: 0,
      depth: 0,
    };
  }

  return createParagraphSnapshot(node, 0, 0);
}

/**
 * Resolves the comment body to a ProseMirror node JSON payload.
 *
 * Priority:
 * 1. `textJson` (legacy shape)
 * 2. `elements` (DOCX-imported shape)
 */
function resolveCommentBodyNodeJSON(comment: CommentInput): Record<string, unknown> | null {
  if (isRecord(comment.textJson)) {
    return comment.textJson;
  }

  if (Array.isArray(comment.elements) && comment.elements.length > 0) {
    if (comment.elements.length === 1 && isRecord(comment.elements[0])) {
      return comment.elements[0];
    }

    return {
      type: 'doc',
      content: comment.elements,
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
