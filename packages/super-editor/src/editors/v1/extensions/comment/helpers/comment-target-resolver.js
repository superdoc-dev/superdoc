import { CommentMarkName } from '../comments-constants.js';

const COMMENT_RANGE_NODE_TYPES = new Set(['commentRangeStart', 'commentRangeEnd']);

const toNonEmptyString = (value) => {
  if (typeof value !== 'string') return null;
  return value.length > 0 ? value : null;
};

const resolveMoveIds = ({ commentId, importedId }) => {
  const canonicalId = toNonEmptyString(commentId);
  const candidateImportedId = toNonEmptyString(importedId);
  const fallbackImportedId = candidateImportedId && candidateImportedId !== canonicalId ? candidateImportedId : null;
  return { canonicalId, fallbackImportedId };
};

const collectCanonicalMarkSegments = (doc, canonicalId) => {
  const segments = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    const commentMark = node.marks?.find(
      (mark) => mark.type.name === CommentMarkName && mark.attrs?.commentId === canonicalId,
    );
    if (!commentMark) return;
    segments.push({
      from: pos,
      to: pos + node.nodeSize,
      attrs: commentMark.attrs ?? {},
      mark: commentMark,
    });
  });
  return segments;
};

const collectImportedMarkSegments = (doc, importedId) => {
  const segments = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    const commentMark = node.marks?.find(
      (mark) => mark.type.name === CommentMarkName && mark.attrs?.importedId === importedId,
    );
    if (!commentMark) return;
    segments.push({
      from: pos,
      to: pos + node.nodeSize,
      attrs: commentMark.attrs ?? {},
      mark: commentMark,
    });
  });
  return segments;
};

const collectAnchorsById = (doc, id) => {
  const anchors = [];
  doc.descendants((node, pos) => {
    if (!COMMENT_RANGE_NODE_TYPES.has(node.type?.name)) return;
    if (node.attrs?.['w:id'] !== id) return;
    anchors.push({
      pos,
      typeName: node.type.name,
      attrs: { ...node.attrs },
    });
  });
  return anchors;
};

/**
 * Resolve which identity should be used when mutating comment marks/anchors.
 *
 * Resolution order:
 * 1) canonical ID (commentId)
 * 2) imported ID fallback (only if canonical has no targets)
 *
 * @param {import('prosemirror-model').Node} doc - The ProseMirror document to search
 * @param {Object} ids - Comment identifiers to resolve
 * @param {string} [ids.commentId] - Canonical comment ID
 * @param {string} [ids.importedId] - Imported comment ID (used as fallback)
 * @returns {{ status: 'resolved', strategy: 'canonical' | 'imported-fallback', matchId: string, canonicalId: string | null, fallbackImportedId: string | null } | { status: 'unresolved', reason: 'missing-identifiers' | 'no-targets' } | { status: 'ambiguous', reason: 'multiple-comment-ids' | 'canonical-mismatch', matchId: string }}
 */
export const resolveCommentIdentity = (doc, { commentId, importedId }) => {
  const { canonicalId, fallbackImportedId } = resolveMoveIds({ commentId, importedId });

  if (!canonicalId && !fallbackImportedId) {
    return { status: 'unresolved', reason: 'missing-identifiers' };
  }

  if (canonicalId) {
    const canonicalMarks = collectCanonicalMarkSegments(doc, canonicalId);
    const canonicalAnchors = collectAnchorsById(doc, canonicalId);
    if (canonicalMarks.length > 0 || canonicalAnchors.length > 0) {
      return {
        status: 'resolved',
        strategy: 'canonical',
        matchId: canonicalId,
        canonicalId,
        fallbackImportedId,
      };
    }
  }

  if (!fallbackImportedId) {
    return { status: 'unresolved', reason: 'no-targets' };
  }

  const fallbackMarks = collectImportedMarkSegments(doc, fallbackImportedId);
  const fallbackAnchors = collectAnchorsById(doc, fallbackImportedId);
  if (fallbackMarks.length === 0 && fallbackAnchors.length === 0) {
    return { status: 'unresolved', reason: 'no-targets' };
  }

  const distinctCommentIds = new Set(
    fallbackMarks.map((segment) => toNonEmptyString(segment.attrs?.commentId)).filter((id) => !!id),
  );
  if (distinctCommentIds.size > 1) {
    return { status: 'ambiguous', reason: 'multiple-comment-ids', matchId: fallbackImportedId };
  }

  if (canonicalId && distinctCommentIds.size === 1 && !distinctCommentIds.has(canonicalId)) {
    return { status: 'ambiguous', reason: 'canonical-mismatch', matchId: fallbackImportedId };
  }

  return {
    status: 'resolved',
    strategy: 'imported-fallback',
    matchId: fallbackImportedId,
    canonicalId,
    fallbackImportedId,
  };
};

/**
 * Collect all inline-node segments that carry a comment mark matching the resolved identity.
 *
 * @param {import('prosemirror-model').Node} doc - The ProseMirror document
 * @param {ReturnType<typeof resolveCommentIdentity>} identity - A resolved identity from {@link resolveCommentIdentity}
 * @returns {Array<{ from: number, to: number, attrs: Object, mark: Object }>} Mark segments, empty when identity is not resolved
 */
export const collectCommentMarkSegments = (doc, identity) => {
  if (!identity || identity.status !== 'resolved') return [];
  return identity.strategy === 'canonical'
    ? collectCanonicalMarkSegments(doc, identity.matchId)
    : collectImportedMarkSegments(doc, identity.matchId);
};

/**
 * Collect commentRangeStart/commentRangeEnd anchor nodes matching the resolved identity.
 *
 * @param {import('prosemirror-model').Node} doc - The ProseMirror document
 * @param {ReturnType<typeof resolveCommentIdentity>} identity - A resolved identity from {@link resolveCommentIdentity}
 * @returns {Array<{ pos: number, typeName: string, attrs: Object }>} Anchor nodes, empty when identity is not resolved
 */
export const collectCommentAnchorNodes = (doc, identity) => {
  if (!identity || identity.status !== 'resolved') return [];
  return collectAnchorsById(doc, identity.matchId);
};

/**
 * Find the paired commentRangeStart/commentRangeEnd positions for a resolved identity.
 *
 * @param {import('prosemirror-model').Node} doc - The ProseMirror document
 * @param {ReturnType<typeof resolveCommentIdentity>} identity - A resolved identity from {@link resolveCommentIdentity}
 * @returns {{ startPos: number, endPos: number, startAttrs: Object } | null} Range positions, or null when anchors are missing/incomplete
 */
export const collectCommentRangeAnchors = (doc, identity) => {
  if (!identity || identity.status !== 'resolved') return null;
  let startPos = null;
  let endPos = null;
  let startAttrs = { 'w:id': identity.matchId };

  doc.descendants((node, pos) => {
    if (!COMMENT_RANGE_NODE_TYPES.has(node.type?.name)) return;
    if (node.attrs?.['w:id'] !== identity.matchId) return;
    if (node.type.name === 'commentRangeStart') {
      startPos = pos;
      startAttrs = { ...node.attrs };
      return;
    }
    if (node.type.name === 'commentRangeEnd') {
      endPos = pos;
    }
  });

  if (startPos == null || endPos == null) return null;
  return { startPos, endPos, startAttrs };
};
