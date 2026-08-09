/**
 * Resolve the comments-store identity for a document-origin v2 review target.
 * Painted review carriers can become interactive before the asynchronous row
 * hydration finishes. In that window the host's canonical entity id remains
 * the correct pending active identity; once hydrated, the row aliases win.
 */
export function resolveV2ReviewTargetCommentId(target, getComment) {
  if (!target || typeof target.entityId !== 'string') return null;
  if (target.entityType !== 'comment' && target.entityType !== 'trackedChange') return null;
  const comment = typeof getComment === 'function' ? getComment(target.entityId) : null;
  const commentId = comment?.commentId ?? comment?.importedId ?? target.entityId;
  return commentId != null ? String(commentId) : null;
}
