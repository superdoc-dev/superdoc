// @ts-check

/**
 * Collect every comment that should appear inside the tracked-change dialog
 * for `parentComment`. Walks two sources of membership:
 *
 *   1. **Seed**: comments anchored to this TC via `trackedChangeParentId`
 *      whose conversational thread *starts here* (no `parentCommentId`),
 *      plus direct replies whose `parentCommentId === parentComment.commentId`.
 *   2. **BFS**: replies-of-replies — any comment whose `parentCommentId`
 *      points to something already in the thread.
 *
 * AIDEV-NOTE: SD-2528 P2 #3. The importer (`documentCommentsImporter.js`)
 * can produce a comment with BOTH a non-TC `parentCommentId` and a
 * `trackedChangeParentId`: the comment's range lives inside a TC, but its
 * actual reply parent is a regular comment outside the TC. Seeding such a
 * comment via `trackedChangeParentId` alone would pull it into this TC
 * dialog while it ALSO renders under its real parent's thread — a
 * duplicate. Restricting the direct seed to roots (no `parentCommentId`)
 * lets the BFS step below pick up chains of same-TC-anchored replies (the
 * common case) without shadowing parent-thread membership.
 *
 * Pure function — no side effects, no Vue, no store. Extracted from
 * CommentDialog.vue so the logic can be unit-tested in isolation.
 *
 * @template {{ commentId: string, parentCommentId?: string|null, trackedChangeParentId?: string|null }} Comment
 * @param {Comment} parentComment The tracked-change comment whose dialog this collects.
 * @param {ReadonlyArray<Comment>} allComments All known comments in the store.
 * @returns {Array<Comment>} Comments belonging to this tracked-change thread, in original list order.
 */
export const collectTrackedChangeThread = (parentComment, allComments) => {
  const trackedChangeId = parentComment.commentId;
  const threadIds = new Set([trackedChangeId]);
  /** @type {string[]} */
  const queue = [];

  allComments.forEach((comment) => {
    if (comment.commentId === trackedChangeId) return;
    const isDirectChild = comment.parentCommentId === trackedChangeId;
    const isTrackedChangeAnchoredRoot = comment.trackedChangeParentId === trackedChangeId && !comment.parentCommentId;

    if (isDirectChild || isTrackedChangeAnchoredRoot) {
      threadIds.add(comment.commentId);
      queue.push(comment.commentId);
    }
  });

  for (let i = 0; i < queue.length; i += 1) {
    const parentId = queue[i];
    allComments.forEach((comment) => {
      if (comment.parentCommentId === parentId && !threadIds.has(comment.commentId)) {
        threadIds.add(comment.commentId);
        queue.push(comment.commentId);
      }
    });
  }

  return allComments.filter((comment) => threadIds.has(comment.commentId));
};
