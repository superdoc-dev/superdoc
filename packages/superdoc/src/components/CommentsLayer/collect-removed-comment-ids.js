// @ts-check

import { trackedChangeThreadParentIdForComment } from './tracked-change-threading.js';

/**
 * Expand deleted comment ids through comment and tracked-change descendants.
 *
 * @param {ReadonlyArray<Record<string, any>>} comments
 * @param {ReadonlyArray<string>} targetIds
 * @param {(comment: Record<string, any>) => boolean} [isInScope]
 * @returns {Set<string>}
 */
export const collectRemovedCommentIds = (comments, targetIds, isInScope = () => true) => {
  const targets = new Set(targetIds.map(String));
  const removedIds = new Set();

  comments.forEach((comment) => {
    if (!isInScope(comment)) return;
    const commentId = comment.commentId != null ? String(comment.commentId) : null;
    const importedId = comment.importedId != null ? String(comment.importedId) : null;
    if (!(commentId && targets.has(commentId)) && !(importedId && targets.has(importedId))) return;
    if (commentId) removedIds.add(commentId);
    if (importedId) removedIds.add(importedId);
  });

  let expanded = true;
  while (expanded) {
    expanded = false;
    comments.forEach((comment) => {
      if (!isInScope(comment)) return;
      const commentId = comment.commentId != null ? String(comment.commentId) : null;
      const importedId = comment.importedId != null ? String(comment.importedId) : null;
      const parentCommentId = comment.parentCommentId != null ? String(comment.parentCommentId) : null;
      const trackedChangeThreadParentIdValue = trackedChangeThreadParentIdForComment(comment);
      const trackedChangeThreadParentId =
        trackedChangeThreadParentIdValue != null ? String(trackedChangeThreadParentIdValue) : null;
      const isRemovedComment = (commentId && removedIds.has(commentId)) || (importedId && removedIds.has(importedId));
      const isDescendant =
        (parentCommentId && removedIds.has(parentCommentId)) ||
        (trackedChangeThreadParentId && removedIds.has(trackedChangeThreadParentId));
      if (!isRemovedComment && !isDescendant) return;

      const sizeBefore = removedIds.size;
      if (commentId) removedIds.add(commentId);
      if (importedId) removedIds.add(importedId);
      if (removedIds.size > sizeBefore) expanded = true;
    });
  }

  return removedIds;
};
