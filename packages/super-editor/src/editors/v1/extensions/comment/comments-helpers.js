import { CommentMarkName } from './comments-constants.js';
import { CommentsPluginKey } from './comments-plugin.js';
import { ensureFallbackComment, resolveCommentMeta } from './comment-import-helpers.js';
import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../track-changes/constants.js';

const TRACK_CHANGE_MARKS = [TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName];

/**
 * Remove comment by id
 *
 * @param {Object} param0
 * @param {string} param0.commentId The comment ID
 * @param {string} [param0.importedId] The imported comment ID
 * @param {import('prosemirror-state').EditorState} state The current editor state
 * @param {import('prosemirror-state').Transaction} tr The current transaction
 * @param {Function} param0.dispatch The dispatch function
 * @returns {boolean} True if any comment marks were removed
 */
export const removeCommentsById = ({ commentId, importedId, state, tr, dispatch }) => {
  const positions = getCommentPositionsById(commentId, state.doc, importedId);
  const anchorNodePositions = [];

  state.doc.descendants((node, pos) => {
    const nodeTypeName = node.type?.name;
    if (nodeTypeName !== 'commentRangeStart' && nodeTypeName !== 'commentRangeEnd') return;
    const wid = node.attrs?.['w:id'];
    if (wid === commentId || (importedId && wid === importedId)) {
      anchorNodePositions.push(pos);
    }
  });

  if (!positions.length && !anchorNodePositions.length) return false;

  // Remove the mark
  positions.forEach(({ from, to, mark }) => {
    tr.removeMark(from, to, mark);
  });

  // Remove resolved-comment anchors (commentRangeStart/commentRangeEnd) when present.
  anchorNodePositions
    .slice()
    .sort((a, b) => b - a)
    .forEach((pos) => {
      tr.delete(pos, pos + 1);
    });

  dispatch(tr);
  return true;
};

/**
 * Get the positions of a comment by ID
 *
 * @param {String} commentId The comment ID
 * @param {String} [importedId] The imported comment ID
 * @param {import('prosemirror-model').Node} doc The prosemirror document
 * @returns {Array<{from:number,to:number,mark:Object}>} The positions and exact mark instances for the comment
 */
export const getCommentPositionsById = (commentId, doc, importedId) => {
  const positions = [];
  doc.descendants((node, pos) => {
    const { marks } = node;
    marks
      .filter((mark) => mark.type.name === CommentMarkName)
      .forEach((commentMark) => {
        const { attrs } = commentMark;
        const currentCommentId = attrs?.commentId;
        const currentImportedId = attrs?.importedId;
        if (commentId === currentCommentId || (importedId && importedId === currentImportedId)) {
          positions.push({ from: pos, to: pos + node.nodeSize, mark: commentMark });
        }
      });
  });
  return positions;
};

/**
 * Collect all inline-node segments that have a comment mark for a given comment ID.
 * This returns the raw segments (per inline node) rather than merged contiguous ranges.
 *
 * @param {string} commentId The comment ID to match
 * @param {string} [importedId] The imported comment ID to match
 * @param {import('prosemirror-model').Node} doc The ProseMirror document
 * @returns {Array<{from:number,to:number,attrs:Object}>} Segments containing mark attrs
 */
const getCommentMarkSegmentsById = (commentId, doc, importedId) => {
  const segments = [];

  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    const commentMark = node.marks?.find(
      (mark) =>
        mark.type.name === CommentMarkName &&
        (mark.attrs?.commentId === commentId || (importedId && mark.attrs?.importedId === importedId)),
    );
    if (!commentMark) return;

    segments.push({
      from: pos,
      to: pos + node.nodeSize,
      attrs: commentMark.attrs || {},
    });
  });

  return segments;
};

/**
 * Collapse raw mark segments for a single comment id into anchor ranges.
 *
 * Per ECMA-376 §17.13.4.3 / §17.13.4.4 / §17.13.4.5, `w:id` is the
 * unique identifier for an annotation, and the start / end / reference
 * triplet appears exactly once per id. A multi-paragraph comment is
 * still ONE annotation: PM splits it into multiple text-node mark
 * segments because the paragraph close + open structural delta sits
 * between them, but the OOXML emission must collapse them back into
 * a single `(commentRangeStart, commentRangeEnd)` pair covering the
 * full extent.
 *
 * Verified against Word: a comment that crosses a paragraph break
 * produces one `<w:commentRangeStart w:id="…"/>` at the first
 * commented position and one `<w:commentRangeEnd w:id="…"/>` after
 * the last commented position, with the paragraph break sitting
 * inside the range.
 *
 * Two flavors of "multiple segments" need to be told apart:
 *
 *   1. Paragraph-crossing: segments separated only by a structural
 *      boundary (paragraph close + open). No uncommented text
 *      between them. Logical extent is one contiguous range; merge.
 *
 *   2. Truly disjoint: segments separated by uncommented text. Most
 *      common cause: a user copy-pasted commented content into a new
 *      location; PM preserves the `commentMark` attrs (the mark has
 *      no clipboard hook), so the same `commentId` ends up on
 *      anchored regions that have unrelated content between them.
 *      The two regions are logically two annotations that happen to
 *      share an id; merging them into one envelope would expand the
 *      comment's scope to cover the unrelated content. Keep them as
 *      separate ranges instead — the resulting OOXML still has a
 *      duplicate id (which a follow-up should remap to fresh ids),
 *      but the per-range scope is preserved correctly.
 *
 * The previous adjacency-based merge (`seg.from <= active.to`)
 * conflated paragraph-crossing with disjoint and produced N pairs
 * for an N-paragraph contiguous comment. The fix walks the doc
 * between consecutive segments and merges only when the gap carries
 * no text content.
 *
 * @param {string} commentId The comment ID to match
 * @param {string} [importedId] The imported comment ID to match
 * @param {import('prosemirror-model').Node} doc The ProseMirror document
 * @returns {{segments:Array<{from:number,to:number,attrs:Object}>,ranges:Array<{from:number,to:number,internal:boolean}>}}
 */
const getCommentMarkRangesById = (commentId, doc, importedId) => {
  const segments = getCommentMarkSegmentsById(commentId, doc, importedId);
  if (!segments.length) return { segments, ranges: [] };

  // Walk segments in document order, merging adjacent ones whenever
  // the gap between them carries no text content. PM's `textBetween`
  // walks every text leaf in the range and concatenates the text
  // (block separators omitted by passing empty strings), so a
  // paragraph close + open contributes nothing and a paragraph of
  // uncommented text contributes its full content.
  const sorted = [...segments].sort((a, b) => a.from - b.from);
  const ranges = [];
  let active = {
    from: sorted[0].from,
    to: sorted[0].to,
    internal: !!sorted[0].attrs?.internal,
  };
  for (let i = 1; i < sorted.length; i += 1) {
    const seg = sorted[i];
    if (seg.from <= active.to) {
      // Adjacent or overlapping in PM positions: definitely the
      // same logical region (e.g. two text nodes split by an inline
      // mark boundary).
      if (seg.to > active.to) active.to = seg.to;
      continue;
    }
    const gapHasText = doc.textBetween(active.to, seg.from, '', '').length > 0;
    if (!gapHasText) {
      // Structural boundary only (paragraph break, inline node
      // boundary). Same logical annotation across a paragraph
      // crossing — merge.
      active.to = seg.to;
      continue;
    }
    // Real gap of uncommented content. Two logically distinct
    // anchored regions sharing an id (paste-preserved, etc.). Keep
    // them as separate ranges so the resolved range doesn't expand
    // over unrelated content.
    ranges.push(active);
    active = {
      from: seg.from,
      to: seg.to,
      internal: !!seg.attrs?.internal,
    };
  }
  ranges.push(active);
  return { segments, ranges };
};

/**
 * Resolve a comment by removing its mark(s) and inserting commentRangeStart/commentRangeEnd
 * anchor nodes around the same text ranges, so the comment becomes hidden but its anchors
 * are preserved for later export/re-import.
 *
 * @param {Object} param0
 * @param {string} param0.commentId The comment ID
 * @param {string} [param0.importedId] The imported comment ID
 * @param {import('prosemirror-state').EditorState} param0.state The current editor state
 * @param {import('prosemirror-state').Transaction} param0.tr The current transaction
 * @param {Function} param0.dispatch The dispatch function
 * @returns {boolean} True if the comment mark existed and was processed
 */
export const resolveCommentById = ({ commentId, importedId, state, tr, dispatch }) => {
  const converted = resolveCommentsInTr({ items: [{ commentId, importedId }], state, tr });
  if (converted) dispatch(tr);
  return converted;
};

/**
 * Resolve several comments (a whole thread) inside a SINGLE transaction so the
 * resulting mark→node conversions form ONE undo step.
 *
 * Mirrors {@link resolveCommentById} but batches multiple comment ids and maps
 * every insert position through `tr.mapping`, so overlapping/shared anchors
 * (e.g. a reply that shares the thread root's range, as in Google-Docs-style
 * nested comments) stay correct. The caller dispatches `tr`.
 *
 * @param {{ commentId: string, importedId?: string, preserveAnchor?: boolean }[]} items Comments to resolve
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('prosemirror-state').Transaction} tr
 * @returns {boolean} Whether any comment mark was converted
 */
export const resolveCommentsInTr = ({ items = [], state, tr }) => {
  const { schema } = state;
  const markType = schema.marks?.[CommentMarkName];
  if (!markType) return false;
  const startType = schema.nodes?.commentRangeStart;
  const endType = schema.nodes?.commentRangeEnd;

  const insertions = [];
  const seen = new Set();
  let converted = false;

  // First pass: remove every comment's mark. `removeMark` does not change doc
  // size, so the ranges read from `state.doc` stay valid across all items.
  for (const item of items) {
    if (!item) continue;
    const { commentId, importedId } = item;
    if (commentId == null) continue;
    const key = `${commentId}:${importedId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { segments, ranges } = getCommentMarkRangesById(commentId, state.doc, importedId);
    if (!segments.length) continue;
    converted = true;
    segments.forEach(({ from, to, attrs }) => {
      tr.removeMark(from, to, markType.create(attrs));
    });
    if (startType && endType && item.preserveAnchor !== false) {
      ranges.forEach(({ from, to, internal }) => insertions.push({ from, to, internal, commentId }));
    }
  }

  // Second pass: insert the anchor nodes. Process highest position first and
  // map through `tr.mapping` so prior inserts (including at a shared range) are
  // accounted for.
  if (startType && endType && insertions.length) {
    insertions
      .sort((a, b) => b.from - a.from || b.to - a.to)
      .forEach(({ from, to, internal, commentId }) => {
        tr.insert(tr.mapping.map(to), endType.create({ 'w:id': commentId }));
        tr.insert(tr.mapping.map(from), startType.create({ 'w:id': commentId, internal }));
      });
  }

  return converted;
};

/**
 * Collect all `commentRangeStart` / `commentRangeEnd` anchor nodes for a
 * given comment id and pair them up into ranges in document order.
 *
 * Handles split / multi-segment anchors the same way `resolveCommentById`
 * inserts them: starts and ends are matched by document order so a
 * comment that originally spanned multiple disjoint inline ranges
 * round-trips as a sequence of `(start, end)` pairs. Mismatched counts
 * (extra start with no matching end, or vice versa) are dropped to
 * avoid leaving the doc in a partially-anchored state — the caller
 * receives the well-formed pairs only.
 *
 * @param {string} commentId The canonical comment ID (matches `w:id` attr)
 * @param {string} [importedId] Optional imported alias to also match
 * @param {import('prosemirror-model').Node} doc The ProseMirror document
 * @returns {{ pairs: Array<{ from: number; to: number; internal: boolean }>, anchorNodePositions: number[] }}
 */
const getCommentRangeAnchorsById = (commentId, doc, importedId) => {
  /** @type {Array<{ pos: number; type: 'start' | 'end'; internal: boolean }>} */
  const anchors = [];

  doc.descendants((node, pos) => {
    const typeName = node.type?.name;
    if (typeName !== 'commentRangeStart' && typeName !== 'commentRangeEnd') return;
    const wid = node.attrs?.['w:id'];
    if (wid !== commentId && (!importedId || wid !== importedId)) return;
    anchors.push({
      pos,
      type: typeName === 'commentRangeStart' ? 'start' : 'end',
      internal: !!node.attrs?.internal,
    });
  });

  /** @type {Array<{ from: number; to: number; internal: boolean }>} */
  const pairs = [];
  /** @type {Array<{ pos: number; internal: boolean }>} */
  const stack = [];
  for (const anchor of anchors) {
    if (anchor.type === 'start') {
      stack.push({ pos: anchor.pos, internal: anchor.internal });
      continue;
    }
    const opener = stack.shift();
    if (!opener) continue;
    pairs.push({ from: opener.pos, to: anchor.pos, internal: opener.internal });
  }

  return {
    pairs,
    anchorNodePositions: anchors.map((a) => a.pos),
  };
};

/**
 * Reopen a previously-resolved comment by removing its
 * `commentRangeStart` / `commentRangeEnd` anchor nodes and re-inserting
 * a live `comment` mark across the same range(s). Symmetric inverse of
 * {@link resolveCommentById}.
 *
 * The mark is re-inserted with the original `(commentId, importedId,
 * internal)` attrs so subsequent export, search, and entity-store
 * lookups see the same shape as a never-resolved comment. The caller
 * supplies `importedId` and `internal` because they aren't fully
 * recoverable from the doc alone (`commentRangeStart` keeps `internal`
 * but `importedId` lives in the entity store, and the public `comments.patch`
 * input doesn't take it).
 *
 * Idempotent on the no-op path: if no matching anchor nodes exist,
 * returns `false` without dispatching.
 *
 * @param {Object} param0
 * @param {string} param0.commentId The canonical comment ID
 * @param {string} [param0.importedId] The imported alias (matched against `w:id` for legacy docs)
 * @param {boolean} [param0.internal] Override for the restored mark's `internal` flag — falls back to the value stamped on `commentRangeStart` so import-resolved comments keep their flag
 * @param {import('prosemirror-state').EditorState} param0.state Current editor state
 * @param {import('prosemirror-state').Transaction} param0.tr Current transaction
 * @param {Function} param0.dispatch The dispatch function
 * @returns {boolean} True when the anchor nodes existed and the mark was restored
 */
export const reopenCommentById = ({ commentId, importedId, internal, state, tr, dispatch }) => {
  const { schema } = state;
  const markType = schema.marks?.[CommentMarkName];
  if (!markType) return false;

  const { pairs, anchorNodePositions } = getCommentRangeAnchorsById(commentId, state.doc, importedId);
  if (!pairs.length) return false;

  // Re-add the comment mark first, working in *original* document
  // coordinates. Because subsequent deletes will shift positions, we
  // map the inserts forward through `tr.mapping` after each step. The
  // pairs array is already in document order; restoring the mark from
  // first to last keeps mappings monotonic.
  pairs.forEach(({ from, to, internal: anchorInternal }) => {
    const mappedFrom = tr.mapping.map(from);
    const mappedTo = tr.mapping.map(to);
    if (mappedTo <= mappedFrom) return;
    const attrs = {
      commentId,
      importedId,
      internal: typeof internal === 'boolean' ? internal : anchorInternal,
    };
    // The mark must cover the inline content *between* the anchor
    // nodes, not the anchor nodes themselves. `commentRangeStart` sits
    // at `from` (one node-size wide) and `commentRangeEnd` sits at
    // `to`. Adding the mark from `from + 1` to `to` covers exactly the
    // text that was originally marked before resolve.
    tr.addMark(mappedFrom + 1, mappedTo, markType.create(attrs));
  });

  // Delete the anchor nodes in descending order so earlier deletes
  // don't shift later positions. `getCommentRangeAnchorsById` returns
  // raw doc-positions; map each through `tr.mapping` so previous
  // mark insertions are accounted for, then sort the *mapped*
  // positions descending.
  const mappedAnchorPositions = anchorNodePositions.map((pos) => tr.mapping.map(pos)).sort((a, b) => b - a);
  mappedAnchorPositions.forEach((pos) => {
    // Each anchor node is one node-size wide. Recompute the node size
    // defensively in case mapping collapsed the range to zero width
    // (e.g. concurrent delete elsewhere).
    const node = tr.doc.nodeAt(pos);
    if (!node) return;
    const typeName = node.type?.name;
    if (typeName !== 'commentRangeStart' && typeName !== 'commentRangeEnd') return;
    tr.delete(pos, pos + node.nodeSize);
  });

  dispatch(tr);
  return true;
};

/**
 * Prepare comments for export by converting the marks back to commentRange nodes
 * This function handles both Word format (via commentsExtended.xml) and Google Docs format
 * (via nested comment ranges). For threaded comments from Google Docs, it maintains the
 * nested structure: Parent Start → Child Start → Content → Parent End → Child End
 *
 * @param {import('prosemirror-model').Node} doc The prosemirror document
 * @param {import('prosemirror-state').Transaction} tr The preparation transaction
 * @param {import('prosemirror-model').Schema} schema The editor schema
 * @param {Array[Object]} comments The comments to prepare (may contain parentCommentId relationships)
 * @returns {void}
 */
export const prepareCommentsForExport = (doc, tr, schema, comments = []) => {
  // Create a map of commentId -> comment for quick lookup
  const commentMap = new Map();
  comments.forEach((c) => {
    commentMap.set(c.commentId, c);
  });

  const trackedChangeSpanById = new Map();
  const trackedChangeMarksById = new Map();
  doc.descendants((node, pos) => {
    const trackedChangeMark = node.marks?.find((mark) => TRACK_CHANGE_MARKS.includes(mark.type.name));
    if (!trackedChangeMark) return;
    const trackedChangeId = trackedChangeMark.attrs?.id;
    if (!trackedChangeId) return;

    const existing = trackedChangeSpanById.get(trackedChangeId);
    const startPos = pos;
    const endPos = pos + node.nodeSize;
    if (!existing) {
      trackedChangeSpanById.set(trackedChangeId, { startPos, endPos });
    } else {
      existing.startPos = Math.min(existing.startPos, startPos);
      existing.endPos = Math.max(existing.endPos, endPos);
    }

    const marksEntry = trackedChangeMarksById.get(trackedChangeId) || {};
    if (trackedChangeMark.type?.name === TrackInsertMarkName && !marksEntry.insertMark) {
      marksEntry.insertMark = trackedChangeMark;
    }
    if (trackedChangeMark.type?.name === TrackDeleteMarkName && !marksEntry.deleteMark) {
      marksEntry.deleteMark = trackedChangeMark;
    }
    trackedChangeMarksById.set(trackedChangeId, marksEntry);
  });

  const getThreadingParentId = (comment) => {
    if (!comment) return undefined;
    const usesRangeThreading =
      comment.threadingStyleOverride === 'range-based' ||
      comment.threadingMethod === 'range-based' ||
      comment.originalXmlStructure?.hasCommentsExtended === false;
    if (usesRangeThreading && comment.threadingParentCommentId) {
      return comment.threadingParentCommentId;
    }
    return comment.parentCommentId;
  };

  // First pass: collect full ranges for each comment mark
  // Map of commentId -> { start: number, end: number, attrs: object }
  const commentRanges = new Map();
  const commentTrackedChangeId = new Map();

  doc.descendants((node, pos) => {
    const commentMarks = node.marks?.filter((mark) => mark.type.name === CommentMarkName) || [];
    if (!commentMarks.length) return;

    const nodeEnd = pos + node.nodeSize;
    const trackedChangeMark = node.marks?.find((mark) => TRACK_CHANGE_MARKS.includes(mark.type.name));
    const trackedChangeId = trackedChangeMark?.attrs?.id;

    commentMarks.forEach((commentMark) => {
      const { attrs = {} } = commentMark;
      const { commentId } = attrs;

      if (commentId === 'pending') return;

      if (!commentRanges.has(commentId)) {
        // First occurrence - record start and end
        commentRanges.set(commentId, {
          start: pos,
          end: nodeEnd,
          attrs,
        });
      } else {
        // Extend the range to include this node
        const existing = commentRanges.get(commentId);
        existing.start = Math.min(existing.start, pos);
        existing.end = Math.max(existing.end, nodeEnd);
      }

      if (trackedChangeId && !commentTrackedChangeId.has(commentId)) {
        commentTrackedChangeId.set(commentId, trackedChangeId);
      }
    });
  });

  // Note: Parent/child relationships are tracked via comment.parentCommentId property
  const startNodes = [];
  const endNodes = [];
  const seen = new Set();
  const trackedChangeCommentMeta = new Map();

  // Second pass: create start/end nodes using the full ranges
  commentRanges.forEach(({ start, end, attrs }, commentId) => {
    if (seen.has(commentId)) return;
    seen.add(commentId);

    const comment = commentMap.get(commentId);
    const parentCommentId = getThreadingParentId(comment);
    const trackedChangeId = commentTrackedChangeId.get(commentId);
    const trackedSpan = trackedChangeId ? trackedChangeSpanById.get(trackedChangeId) : null;
    if (trackedSpan) {
      trackedChangeCommentMeta.set(commentId, {
        comment,
        parentCommentId,
        trackedChangeId,
        actualStart: start,
        actualEnd: end,
      });
      return;
    }

    const commentStartNodeAttrs = getPreparedComment(attrs);
    const startNode = schema.nodes.commentRangeStart.create(commentStartNodeAttrs);
    startNodes.push({
      pos: start,
      node: startNode,
      commentId,
      parentCommentId,
    });

    const endNode = schema.nodes.commentRangeEnd.create(commentStartNodeAttrs);
    endNodes.push({
      pos: end,
      node: endNode,
      commentId,
      parentCommentId,
    });

    // Find child comments that should be nested inside this comment
    const childComments = comments
      .filter((c) => getThreadingParentId(c) === commentId)
      .sort((a, b) => a.createdTime - b.createdTime);

    childComments.forEach((c) => {
      if (seen.has(c.commentId)) return;
      seen.add(c.commentId);

      // Check if child has its own range in the document
      const childRange = commentRanges.get(c.commentId);
      const childStart = childRange?.start ?? start;
      const childEnd = childRange?.end ?? end;

      const childMark = getPreparedComment({
        commentId: c.commentId,
        internal: c.isInternal,
      });
      const childStartNode = schema.nodes.commentRangeStart.create(childMark);
      startNodes.push({
        pos: childStart,
        node: childStartNode,
        commentId: c.commentId,
        parentCommentId: getThreadingParentId(c),
      });

      const childEndNode = schema.nodes.commentRangeEnd.create(childMark);
      endNodes.push({
        pos: childEnd,
        node: childEndNode,
        commentId: c.commentId,
        parentCommentId: getThreadingParentId(c),
      });
    });
  });

  if (trackedChangeSpanById.size > 0) {
    trackedChangeCommentMeta.forEach(({ comment, parentCommentId, trackedChangeId, actualStart, actualEnd }) => {
      if (!comment || !trackedChangeSpanById.has(trackedChangeId)) return;

      const span = trackedChangeSpanById.get(trackedChangeId);
      if (!span) return;

      const childMark = getPreparedComment({
        commentId: comment.commentId,
        internal: comment.isInternal,
      });

      const trackedMarks = trackedChangeMarksById.get(trackedChangeId) || {};
      const startMarks = trackedMarks.insertMark
        ? [trackedMarks.insertMark]
        : trackedMarks.deleteMark
          ? [trackedMarks.deleteMark]
          : undefined;
      const endMarks = trackedMarks.deleteMark
        ? [trackedMarks.deleteMark]
        : trackedMarks.insertMark
          ? [trackedMarks.insertMark]
          : undefined;

      // Use actual comment range if available, fall back to full TC span
      const startPos = actualStart ?? span.startPos;
      const endPos = actualEnd ?? span.endPos;

      const childStartNode = schema.nodes.commentRangeStart.create(childMark, null, startMarks);
      startNodes.push({
        pos: startPos,
        node: childStartNode,
        commentId: comment.commentId,
        parentCommentId,
      });

      const childEndNode = schema.nodes.commentRangeEnd.create(childMark, null, endMarks);
      endNodes.push({
        pos: endPos,
        node: childEndNode,
        commentId: comment.commentId,
        parentCommentId,
      });

      const childComments = comments
        .filter((c) => getThreadingParentId(c) === comment.commentId)
        .sort((a, b) => a.createdTime - b.createdTime);

      childComments.forEach((c) => {
        if (seen.has(c.commentId)) return;
        seen.add(c.commentId);

        const childRange = commentRanges.get(c.commentId);
        // Use child's own range, fall back to parent's actual range, then TC span
        const childStart = childRange?.start ?? actualStart ?? span.startPos;
        const childEnd = childRange?.end ?? actualEnd ?? span.endPos;
        const childStartMarks = childRange ? undefined : startMarks;
        const childEndMarks = childRange ? undefined : endMarks;

        const childMarkAttrs = getPreparedComment({
          commentId: c.commentId,
          internal: c.isInternal,
        });

        const childStartNode = schema.nodes.commentRangeStart.create(childMarkAttrs, null, childStartMarks);
        startNodes.push({
          pos: childStart,
          node: childStartNode,
          commentId: c.commentId,
          parentCommentId: getThreadingParentId(c),
        });

        const childEndNode = schema.nodes.commentRangeEnd.create(childMarkAttrs, null, childEndMarks);
        endNodes.push({
          pos: childEnd,
          node: childEndNode,
          commentId: c.commentId,
          parentCommentId: getThreadingParentId(c),
        });
      });
    });

    // Handle comments that are on tracked change text (identified by trackedChangeParentId)
    comments
      .filter((comment) => {
        const tcParentId = comment.trackedChangeParentId || comment.parentCommentId;
        return trackedChangeSpanById.has(tcParentId) && !comment.trackedChange;
      })
      .sort((a, b) => a.createdTime - b.createdTime)
      .forEach((comment) => {
        if (seen.has(comment.commentId)) return;
        seen.add(comment.commentId);

        const tcParentId = comment.trackedChangeParentId || comment.parentCommentId;
        const span = trackedChangeSpanById.get(tcParentId);
        if (!span) return;

        const childMark = getPreparedComment({
          commentId: comment.commentId,
          internal: comment.isInternal,
        });

        const parentCommentId = getThreadingParentId(comment);
        const trackedMarks = trackedChangeMarksById.get(tcParentId) || {};
        const startMarks = trackedMarks.insertMark
          ? [trackedMarks.insertMark]
          : trackedMarks.deleteMark
            ? [trackedMarks.deleteMark]
            : undefined;
        const endMarks = trackedMarks.deleteMark
          ? [trackedMarks.deleteMark]
          : trackedMarks.insertMark
            ? [trackedMarks.insertMark]
            : undefined;

        const childStartNode = schema.nodes.commentRangeStart.create(childMark, null, startMarks);
        startNodes.push({
          pos: span.startPos,
          node: childStartNode,
          commentId: comment.commentId,
          parentCommentId,
        });

        const childEndNode = schema.nodes.commentRangeEnd.create(childMark, null, endMarks);
        endNodes.push({
          pos: span.endPos,
          node: childEndNode,
          commentId: comment.commentId,
          parentCommentId,
        });
      });
  }

  // SD-3355 — re-anchor resolved-thread replies. Resolving a thread converts
  // the root's mark into commentRangeStart/End nodes and normalizes reply
  // marks away entirely (a reply carries no anchor of its own). The passes
  // above only walk comment MARKS, so such replies survive word/comments.xml
  // but lose their document.xml markers — and Word silently drops a comment
  // with no w:commentReference in a story. Nest each unrepresented reply
  // inside its nearest node-anchored ancestor's preserved range (Parent
  // Start, Child Start … Parent End, Child End) so the commentRangeEnd
  // translator synthesizes the reply's w:commentReference again.
  const nodeAnchorsById = new Map();
  doc.descendants((node, pos) => {
    const typeName = node.type?.name;
    if (typeName !== 'commentRangeStart' && typeName !== 'commentRangeEnd') return;
    const anchorId = node.attrs?.['w:id'];
    if (anchorId == null) return;
    const entry = nodeAnchorsById.get(anchorId) || {};
    if (typeName === 'commentRangeStart') entry.startPos = pos;
    else entry.endPos = pos;
    nodeAnchorsById.set(anchorId, entry);
  });

  const isRepresented = (c) =>
    seen.has(c.commentId) ||
    (c.importedId != null && seen.has(c.importedId)) ||
    nodeAnchorsById.has(c.commentId) ||
    (c.importedId != null && nodeAnchorsById.has(c.importedId));

  const findAncestorNodeAnchor = (comment) => {
    let current = comment;
    const visited = new Set();
    while (current) {
      const parentId = getThreadingParentId(current);
      if (parentId == null || visited.has(parentId)) return null;
      visited.add(parentId);
      const parent =
        commentMap.get(parentId) || comments.find((c) => c.importedId === parentId || c.commentId === parentId);
      const anchor =
        nodeAnchorsById.get(parentId) ??
        (parent ? (nodeAnchorsById.get(parent.commentId) ?? nodeAnchorsById.get(parent.importedId)) : undefined);
      if (anchor?.startPos != null && anchor?.endPos != null) return anchor;
      current = parent;
    }
    return null;
  };

  comments
    .filter((c) => !c.trackedChange && c.commentId != null && !isRepresented(c))
    .sort((a, b) => (a.createdTime || 0) - (b.createdTime || 0))
    .forEach((c) => {
      const anchor = findAncestorNodeAnchor(c);
      if (!anchor) return;
      seen.add(c.commentId);

      const childAttrs = getPreparedComment({
        commentId: c.commentId,
        internal: c.isInternal,
      });
      startNodes.push({
        pos: anchor.startPos + 1,
        node: schema.nodes.commentRangeStart.create(childAttrs),
        commentId: c.commentId,
        parentCommentId: getThreadingParentId(c),
      });
      endNodes.push({
        pos: anchor.endPos + 1,
        node: schema.nodes.commentRangeEnd.create(childAttrs),
        commentId: c.commentId,
        parentCommentId: getThreadingParentId(c),
      });
    });

  // Sort start nodes to ensure proper nesting order for Google Docs format:
  // Parent ranges must wrap child ranges: Parent Start, Child Start, Content, Parent End, Child End
  startNodes.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    // At the same position: parents before children
    // This ensures: Parent Start comes before Child Start
    const aIsParentOfB = a.commentId === b.parentCommentId;
    const bIsParentOfA = b.commentId === a.parentCommentId;
    if (aIsParentOfB) return -1; // a is parent, should come before b (child)
    if (bIsParentOfA) return 1; // b is parent, should come before a (child)
    // Both children of the same parent: maintain creation order
    if (a.parentCommentId && a.parentCommentId === b.parentCommentId) {
      const aComment = commentMap.get(a.commentId);
      const bComment = commentMap.get(b.commentId);
      return (aComment?.createdTime || 0) - (bComment?.createdTime || 0);
    }
    return 0;
  });

  // Sort end nodes to ensure proper nesting order for Google Docs format:
  // Parent ends must come before child ends to maintain nesting: Parent End, Child End
  endNodes.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    // At the same position: parent ends before child ends
    // This ensures: Parent End comes before Child End
    const aIsParentOfB = a.commentId === b.parentCommentId;
    const bIsParentOfA = b.commentId === a.parentCommentId;
    if (aIsParentOfB) return -1; // a is parent, should end before b (child)
    if (bIsParentOfA) return 1; // b is parent, should end before a (child)
    // Both children of the same parent: maintain creation order
    if (a.parentCommentId && a.parentCommentId === b.parentCommentId) {
      const aComment = commentMap.get(a.commentId);
      const bComment = commentMap.get(b.commentId);
      return (aComment?.createdTime || 0) - (bComment?.createdTime || 0);
    }
    return 0;
  });

  startNodes.forEach((n) => {
    const { pos, node } = n;
    const mappedPos = tr.mapping.map(pos);

    tr.insert(mappedPos, node);
  });

  endNodes.forEach((n) => {
    const { pos, node } = n;
    const mappedPos = tr.mapping.map(pos);

    tr.insert(mappedPos, node);
  });

  return tr;
};

/**
 * Generate the prepared comment attrs for export
 *
 * @param {Object} attrs The comment mark attributes
 * @returns {Object} The prepared comment attributes
 */
export const getPreparedComment = (attrs) => {
  const { commentId, internal } = attrs;
  return {
    'w:id': commentId,
    internal: internal,
  };
};

/**
 * Prepare comments for import by removing the commentRange nodes and replacing with marks
 *
 * @param {import('prosemirror-model').Node} doc The prosemirror document
 * @param {import('prosemirror-state').Transaction} tr The preparation transaction
 * @param {import('prosemirror-model').Schema} schema The editor schema
 * @returns {void}
 */
export const prepareCommentsForImport = (doc, tr, schema, converter) => {
  const toMark = [];
  const toDelete = [];
  const toUpdate = [];

  doc.descendants((node, pos) => {
    const { type } = node;

    const commentNodes = ['commentRangeStart', 'commentRangeEnd', 'commentReference'];
    if (!commentNodes.includes(type.name)) return;

    const { resolvedCommentId, importedId, internal, matchingImportedComment, trackedChange } = resolveCommentMeta({
      converter,
      importedId: node.attrs['w:id'],
    });
    const isDone = !!matchingImportedComment?.isDone;

    // If the node is a commentRangeStart, record it so we can place a mark once we find the end.
    if (type.name === 'commentRangeStart') {
      if (!matchingImportedComment || !matchingImportedComment.isDone) {
        toMark.push({
          commentId: resolvedCommentId,
          importedId,
          internal,
          trackedChange,
          start: pos,
        });
      }

      ensureFallbackComment({
        converter,
        matchingImportedComment,
        commentId: resolvedCommentId,
        importedId,
      });

      if (isDone) {
        toUpdate.push({
          pos,
          attrs: {
            ...node.attrs,
            'w:id': resolvedCommentId,
            internal,
          },
        });
      } else {
        // We'll remove this node from the final doc
        toDelete.push({ start: pos, end: pos + 1 });
      }
    }

    // When we reach the commentRangeEnd, add a mark spanning from start to current pos,
    // then mark it for deletion as well.
    else if (type.name === 'commentRangeEnd') {
      if (isDone) {
        toUpdate.push({
          pos,
          attrs: {
            ...node.attrs,
            'w:id': resolvedCommentId,
          },
        });
        return;
      }

      const itemToMark = toMark.find((p) => p.importedId === importedId);
      if (!itemToMark) return; // No matching start? just skip

      const { start } = itemToMark;
      const markAttrs = {
        commentId: itemToMark.commentId,
        importedId,
        internal: itemToMark.internal,
        trackedChange: itemToMark.trackedChange,
      };

      tr.addMark(start, pos + 1, schema.marks[CommentMarkName].create(markAttrs));
      toDelete.push({ start: pos, end: pos + 1 });
    }

    // commentReference nodes likewise get deleted
    else if (type.name === 'commentReference') {
      toDelete.push({ start: pos, end: pos + 1 });
    }
  });

  // Update (but do not remove) comment range nodes for done comments.
  // We keep them so resolved comments still have anchor positions in the document.
  if (typeof tr.setNodeMarkup === 'function') {
    toUpdate
      .sort((a, b) => b.pos - a.pos)
      .forEach(({ pos, attrs }) => {
        tr.setNodeMarkup(pos, undefined, attrs);
      });
  }

  // Sort descending so deletions don't mess up positions
  toDelete
    .sort((a, b) => b.start - a.start)
    .forEach(({ start, end }) => {
      tr.delete(start, end);
    });
};

/**
 * Translate a list of before/after marks into a human-readable format we can
 * display in tracked change comments. This tells us what formatting changes
 * a suggester made
 *
 * @param {Object} attrs The tracked change node attributes. Contains before/after lists
 * @returns {String} The human-readable format of the changes
 */
export const translateFormatChangesToEnglish = (attrs = {}) => {
  const { before = [], after = [] } = attrs;

  const beforeTypes = new Set(before.map((mark) => mark.type));
  const afterTypes = new Set(after.map((mark) => mark.type));

  const ignore = new Set(['textStyle', 'commentMark']);
  const parts = [];

  // Mark-level additions (bold, italic, etc.)
  const added = [...afterTypes].filter((t) => !beforeTypes.has(t) && !ignore.has(t));
  for (const type of added) parts.push(type);

  // Mark-level removals
  const removed = [...beforeTypes].filter((t) => !afterTypes.has(t) && !ignore.has(t));
  for (const type of removed) parts.push(`removed ${type}`);

  // textStyle attribute changes (font, color, size, etc.)
  const beforeTextStyle = before.find((mark) => mark.type === 'textStyle')?.attrs || {};
  const afterTextStyle = after.find((mark) => mark.type === 'textStyle')?.attrs || {};
  const formatAttrName = (attr) => attr.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

  for (const attr of Object.keys({ ...beforeTextStyle, ...afterTextStyle })) {
    const beforeVal = beforeTextStyle[attr];
    const afterVal = afterTextStyle[attr];
    if (beforeVal === afterVal || afterVal === null) continue;

    const label = formatAttrName(attr);
    if (attr === 'color') {
      parts.push('color');
    } else if (beforeVal === undefined || beforeVal === null) {
      parts.push(`${label} ${afterVal}`);
    } else if (afterVal === undefined) {
      parts.push(`removed ${label}`);
    } else {
      parts.push(`${label} ${afterVal}`);
    }
  }

  return parts.length ? parts.join(', ') : 'formatting';
};

/**
 * Get the highlight color for a comment or tracked changes node
 *
 * @param {Object} param0
 * @param {String} param0.activeThreadId The active comment ID
 * @param {String} param0.threadId The current thread ID
 * @param {Boolean} param0.isInternal Whether the comment is internal or external
 * @param {EditorView} param0.editor The current editor view
 * @returns {String} The color to use for the highlight
 */

/** Default opacity for active comment highlights (0x44/0xff ≈ 0.267) */
const DEFAULT_ACTIVE_ALPHA = 0x44 / 0xff;

/** Default opacity for inactive comment highlights (0x22/0xff ≈ 0.133) */
const DEFAULT_INACTIVE_ALPHA = 0x22 / 0xff;

/**
 * Clamps an opacity value to the valid range [0, 1].
 * @param {number} value - The opacity value to clamp
 * @returns {number|null} The clamped value, or null if input is not a finite number
 */
export const clampOpacity = (value) => {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
};

/**
 * Applies an alpha/opacity value to a hex color string.
 * @param {string} color - Hex color in 3-digit (#abc) or 6-digit (#aabbcc) format
 * @param {number} opacity - Opacity value between 0 and 1
 * @returns {string} The color with alpha appended (e.g., #aabbcc44), or original color if invalid format
 */
export const applyAlphaToHex = (color, opacity) => {
  if (typeof color !== 'string') return color;
  const match = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return color;

  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : match[1];
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${hex}${alpha}`;
};

export const getHighlightColor = ({ activeThreadId, threadId, isInternal, editor }) => {
  if (!editor.options.isInternal && isInternal) return 'transparent';
  const pluginState = CommentsPluginKey.getState(editor.state);
  const highlightColors = editor.options.comments?.highlightColors || {};
  const highlightOpacity = editor.options.comments?.highlightOpacity || {};
  const isActive = activeThreadId === threadId;

  const baseColor = isInternal
    ? (highlightColors.internal ?? pluginState.internalColor)
    : (highlightColors.external ?? pluginState.externalColor);

  const activeOverride = isInternal ? highlightColors.activeInternal : highlightColors.activeExternal;
  if (isActive && activeOverride) return activeOverride;

  const resolvedOpacity = clampOpacity(isActive ? highlightOpacity.active : highlightOpacity.inactive);
  const opacity = resolvedOpacity ?? (isActive ? DEFAULT_ACTIVE_ALPHA : DEFAULT_INACTIVE_ALPHA);
  return applyAlphaToHex(baseColor, opacity);
};
