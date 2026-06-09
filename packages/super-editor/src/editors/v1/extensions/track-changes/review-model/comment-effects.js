// @ts-check
/**
 * Comment effects plan computation for the tracked-change decision engine.
 *
 * Produces a {@link CommentEffectsPlan} describing how comment threads
 * should change as a side effect of a tracked-change decision. Inputs are
 * the planned coverage that will be removed/kept and the current PM doc;
 * outputs are deterministic ids to delete or shrink plus PM-level anchor
 * changes (removing `commentRangeStart` / `commentRangeEnd` /
 * `commentReference` nodes that fall inside removed coverage).
 *
 * Boundary: this module does NOT mutate PM state. The decision engine
 * applies the plan inside the atomic transaction once preflight succeeds.
 */

/**
 * @typedef {Object} CommentAnchorSpan
 * @property {string} commentId
 * @property {number} startPos `commentRangeStart` node position.
 * @property {number} endPos `commentRangeEnd` node position.
 * @property {number} referencePos `commentReference` position when present.
 */

/**
 * @typedef {Object} CommentNodeDelete
 * @property {'commentRangeStart'|'commentRangeEnd'|'commentReference'} kind
 * @property {number} from
 * @property {number} to
 * @property {string} commentId
 */

/**
 * @typedef {Object} CommentEffectsPlan
 * @property {CommentNodeDelete[]} nodeDeletes  PM ranges to remove.
 * @property {Array<{ id: string, cause: string }>} entityDeletes Comment thread ids to remove.
 * @property {Array<{ id: string, cause: string, anchor?: { from: number, to: number } }>} entityShrinks Comments whose anchor shrinks.
 * @property {Array<{ id: string, cause: string }>} entityDetaches Comments whose anchor survives but should detach from tracked-change threading.
 * @property {Array<{ code: string, message: string }>} diagnostics
 */

const COMMENT_NODE_NAMES = new Set(['commentRangeStart', 'commentRangeEnd', 'commentReference']);

/**
 * Walk the document and produce the list of comment anchor spans.
 *
 * @param {import('prosemirror-model').Node} doc
 * @returns {CommentAnchorSpan[]}
 */
export const enumerateCommentAnchors = (doc) => {
  /** @type {Map<string, CommentAnchorSpan>} */
  const byId = new Map();
  if (!doc) return [];
  doc.descendants((node, pos) => {
    if (!COMMENT_NODE_NAMES.has(node.type.name)) return;
    const id = node.attrs?.['w:id'] ?? node.attrs?.commentId ?? node.attrs?.attributes?.['w:id'];
    if (id == null) return;
    const key = String(id);
    const existing = byId.get(key);
    if (node.type.name === 'commentRangeStart') {
      if (existing) {
        existing.startPos = pos;
      } else {
        byId.set(key, { commentId: key, startPos: pos, endPos: -1, referencePos: -1 });
      }
    } else if (node.type.name === 'commentRangeEnd') {
      if (existing) {
        existing.endPos = pos;
      } else {
        byId.set(key, { commentId: key, startPos: -1, endPos: pos, referencePos: -1 });
      }
    } else if (node.type.name === 'commentReference') {
      if (existing) {
        existing.referencePos = pos;
      } else {
        byId.set(key, { commentId: key, startPos: -1, endPos: -1, referencePos: pos });
      }
    }
  });
  return Array.from(byId.values());
};

/**
 * Compute the comment effects plan for a set of PM ranges that will be
 * removed from the document. Implements the rule subset required by
 * phase0-004 Comment Effects and cross-feature-interactions.md:
 *
 *  - comment anchor wholly inside removed coverage → delete the thread.
 *  - removed coverage spans the `commentRangeEnd` / `commentReference`
 *    boundary → delete the thread (asymmetric Word boundary rule).
 *  - removed coverage strictly inside an anchor (start preserved, end
 *    preserved) → shrink anchor; the anchor nodes themselves survive but
 *    the comment's coverage is reported as shrunken.
 *  - removed coverage at the left edge only → shrink anchor (commentRangeStart
 *    will be carried away by PM's range replacement; we still need to
 *    delete that anchor node and report a shrink with new bounds).
 *
 * @param {Object} input
 * @param {import('prosemirror-model').Node} input.doc Document before mutation.
 * @param {Array<{ from: number, to: number, cause: string }>} input.removedRanges Coverage to be removed.
 * @param {Array<{ from: number, to: number, cause: string }>} [input.resolvedRanges] Full tracked-change coverage being retired while content may survive.
 * @returns {CommentEffectsPlan}
 */
export const planCommentEffects = ({ doc, removedRanges, resolvedRanges = [] }) => {
  /** @type {CommentEffectsPlan} */
  const plan = { nodeDeletes: [], entityDeletes: [], entityShrinks: [], entityDetaches: [], diagnostics: [] };
  if (!doc) return plan;
  const anchors = enumerateCommentAnchors(doc);
  if (!anchors.length) return plan;

  const sortedRemoved = [...removedRanges].filter((r) => r.from < r.to).sort((a, b) => a.from - b.from);
  const sortedResolved = [...resolvedRanges].filter((r) => r.from < r.to).sort((a, b) => a.from - b.from);
  if (!sortedRemoved.length && !sortedResolved.length) return plan;

  for (const anchor of anchors) {
    const start = anchor.startPos;
    const end = anchor.endPos;
    const ref = anchor.referencePos;
    if (start < 0 && end < 0 && ref < 0) continue;
    const anchorStart = start >= 0 ? start : ref >= 0 ? ref : end;
    const anchorEnd = end >= 0 ? end + 1 : ref >= 0 ? ref + 1 : start + 1;
    const removedCause = sortedRemoved[0]?.cause ?? 'trackedChange';
    const resolvedMatch = sortedResolved.find((r) => r.from < anchorEnd && r.to > anchorStart);
    const resolvedCause = resolvedMatch?.cause ?? removedCause;

    // Determine whether any removed range covers the anchor end or reference.
    const removesEnd = sortedRemoved.some((r) => end >= 0 && r.from <= end && r.to > end);
    const removesRef = sortedRemoved.some((r) => ref >= 0 && r.from <= ref && r.to > ref);
    const fullyCovered = sortedRemoved.some((r) => r.from <= anchorStart && r.to >= anchorEnd);

    if (fullyCovered || removesEnd || removesRef) {
      plan.entityDeletes.push({ id: anchor.commentId, cause: removedCause });
      if (start >= 0)
        plan.nodeDeletes.push({ kind: 'commentRangeStart', from: start, to: start + 1, commentId: anchor.commentId });
      if (end >= 0)
        plan.nodeDeletes.push({ kind: 'commentRangeEnd', from: end, to: end + 1, commentId: anchor.commentId });
      if (ref >= 0)
        plan.nodeDeletes.push({ kind: 'commentReference', from: ref, to: ref + 1, commentId: anchor.commentId });
      continue;
    }

    // Removed coverage overlaps the anchor but preserves end/reference: shrink.
    const overlaps = sortedRemoved.some((r) => r.from < anchorEnd && r.to > anchorStart);
    if (overlaps) {
      plan.entityShrinks.push({
        id: anchor.commentId,
        cause: removedCause,
        anchor: { from: anchorStart, to: anchorEnd },
      });
      // We do not remove the commentRangeStart/End nodes themselves when only
      // shrinking; PM will reposition them when surrounding text is removed.
      if (resolvedMatch) {
        plan.entityDetaches.push({ id: anchor.commentId, cause: resolvedCause });
      }
      continue;
    }

    if (resolvedMatch) {
      plan.entityDetaches.push({ id: anchor.commentId, cause: resolvedCause });
    }
  }

  return plan;
};
