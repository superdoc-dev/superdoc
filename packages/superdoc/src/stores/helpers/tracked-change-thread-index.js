// @ts-check

import { trackedChangeThreadParentIdForComment } from '../../components/CommentsLayer/tracked-change-threading.js';
import { isV2SyntheticTrackedChangeRow } from '../../core/v2-integration/v2-integration.js';

/**
 * Build every tracked-change conversation in one graph pass.
 *
 * `CommentDialog` instances are intentionally mounted for every tracked-change
 * review card. Computing one thread by scanning the full comments list in each
 * instance turns a one-row prune into O(reviewRows * comments). This index
 * resolves parent edges once, then structurally shares unchanged thread arrays
 * with the previous index so Vue computed values for surviving cards keep the
 * same identity.
 *
 * Parent links and explicit tracked-change thread provenance are normalized by
 * the legacy collector, while the tracked-change row id is not. Keep that
 * asymmetry here so numeric tracked-change row ids do not acquire new thread
 * membership.
 *
 * @template {{ commentId: string|number, trackedChange?: boolean, createdTime?: number, parentCommentId?: string|number|null, threadingParentCommentId?: string|number|null, trackedChangeParentId?: string|number|null }} Comment
 * @param {ReadonlyArray<Comment>} allComments
 * @param {ReadonlyMap<string|number, ReadonlyArray<Comment>>} [previous]
 * @returns {Map<string|number, ReadonlyArray<Comment>>}
 */
export const buildTrackedChangeThreadIndex = (allComments, previous = new Map()) => {
  /** @type {Map<string, Comment[]>} Parent links are normalized exactly as in the legacy collector. */
  const childrenByParentId = new Map();
  /** @type {Map<string, Comment[]>} Explicit tracked-change conversation roots, normalized like the legacy collector. */
  const anchoredRootsByTrackedChangeId = new Map();
  /** @type {Map<string|number, Comment[]>} */
  const commentsById = new Map();
  /** @type {Map<Comment, number>} */
  const sourceIndex = new Map();

  /**
   * @template Key, Value
   * @param {Map<Key, Value[]>} map
   * @param {Key} key
   * @param {Value} value
   */
  const append = (map, key, value) => {
    const existing = map.get(key);
    if (existing) existing.push(value);
    else map.set(key, [value]);
  };

  allComments.forEach((comment, index) => {
    sourceIndex.set(comment, index);
    append(commentsById, comment.commentId, comment);
    const parentIds = new Set(
      [comment.parentCommentId, comment.threadingParentCommentId].filter((id) => id != null).map((id) => String(id)),
    );
    parentIds.forEach((parentId) => append(childrenByParentId, parentId, comment));
    const trackedChangeThreadParentId = isV2SyntheticTrackedChangeRow(comment)
      ? null
      : trackedChangeThreadParentIdForComment(comment);
    if (trackedChangeThreadParentId != null && !comment.parentCommentId) {
      append(anchoredRootsByTrackedChangeId, String(trackedChangeThreadParentId), comment);
    }
  });

  /** @type {Map<string|number, ReadonlyArray<Comment>>} */
  const next = new Map();
  for (const parentComment of allComments) {
    if (!parentComment?.trackedChange || parentComment.commentId == null) continue;
    const trackedChangeId = parentComment.commentId;
    const threadIds = new Set([trackedChangeId]);
    /** @type {Array<string|number>} */
    const queue = [];
    const seed =
      typeof trackedChangeId === 'string'
        ? [
            ...(childrenByParentId.get(trackedChangeId) ?? []),
            ...(anchoredRootsByTrackedChangeId.get(trackedChangeId) ?? []),
          ]
        : [];
    for (const comment of seed) {
      const id = comment.commentId;
      if (id === trackedChangeId || threadIds.has(id)) continue;
      threadIds.add(id);
      queue.push(id);
    }
    for (let index = 0; index < queue.length; index += 1) {
      const parentId = queue[index];
      for (const comment of typeof parentId === 'string' ? (childrenByParentId.get(parentId) ?? []) : []) {
        const id = comment.commentId;
        if (threadIds.has(id)) continue;
        threadIds.add(id);
        queue.push(id);
      }
    }

    const members = [...threadIds]
      .flatMap((id) => commentsById.get(id) ?? [])
      .sort((left, right) => (sourceIndex.get(left) ?? 0) - (sourceIndex.get(right) ?? 0));
    members.sort((left, right) => {
      if (left === parentComment) return -1;
      if (right === parentComment) return 1;
      return Number(left.createdTime) - Number(right.createdTime);
    });
    const prior = previous.get(trackedChangeId);
    const stable =
      prior?.length === members.length && members.every((comment, index) => prior[index] === comment) ? prior : members;
    next.set(trackedChangeId, stable);
  }
  return next;
};

/**
 * Index the broader set of association fields used when a tracked-change
 * decision resolves or detaches linked comments. This is deliberately
 * separate from the visible conversation index above: a spatial
 * `trackedChangeParentId` must not make a comment appear in the review card,
 * but it still has to be detached when that tracked change is decided.
 *
 * @template {{ parentCommentId?: string|number|null, threadingParentCommentId?: string|number|null, trackedChangeParentId?: string|number|null, trackedChangeThreadParentId?: string|number|null }} Comment
 * @param {ReadonlyArray<Comment>} allComments
 * @param {ReadonlyMap<string, ReadonlyArray<Comment>>} [previous]
 * @returns {Map<string, ReadonlyArray<Comment>>}
 */
export const buildTrackedChangeDecisionLinkIndex = (allComments, previous = new Map()) => {
  /** @type {Map<string, Comment[]>} */
  const grouped = new Map();
  for (const comment of allComments) {
    const ids = new Set(
      [
        comment.parentCommentId,
        comment.threadingParentCommentId,
        comment.trackedChangeParentId,
        comment.trackedChangeThreadParentId,
      ]
        .filter((id) => id != null)
        .map((id) => String(id)),
    );
    for (const id of ids) {
      const existing = grouped.get(id);
      if (existing) existing.push(comment);
      else grouped.set(id, [comment]);
    }
  }

  /** @type {Map<string, ReadonlyArray<Comment>>} */
  const next = new Map();
  for (const [id, comments] of grouped) {
    const prior = previous.get(id);
    next.set(
      id,
      prior?.length === comments.length && comments.every((comment, index) => prior[index] === comment)
        ? prior
        : comments,
    );
  }
  return next;
};
