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
 * @param {import('prosemirror-state').EditorState} state The current editor state
 * @param {import('prosemirror-state').Transaction} tr The current transaction
 * @param {Function} param0.dispatch The dispatch function
 * @returns {void}
 */
export const removeCommentsById = ({ commentId, state, tr, dispatch }) => {
  const positions = getCommentPositionsById(commentId, state.doc);

  // Remove the mark
  positions.forEach(({ from, to }) => {
    tr.removeMark(from, to, state.schema.marks[CommentMarkName]);
  });
  dispatch(tr);
};

/**
 * Get the positions of a comment by ID
 *
 * @param {String} commentId The comment ID
 * @param {import('prosemirror-model').Node} doc The prosemirror document
 * @returns {Array} The positions of the comment
 */
export const getCommentPositionsById = (commentId, doc) => {
  const positions = [];
  doc.descendants((node, pos) => {
    const { marks } = node;
    const commentMark = marks.find((mark) => mark.type.name === CommentMarkName);

    if (commentMark) {
      const { attrs } = commentMark;
      const { commentId: currentCommentId } = attrs;
      if (commentId === currentCommentId) {
        positions.push({ from: pos, to: pos + node.nodeSize });
      }
    }
  });
  return positions;
};

/**
 * Collect all inline-node segments that have a comment mark for a given comment ID.
 * This returns the raw segments (per inline node) rather than merged contiguous ranges.
 *
 * @param {string} commentId The comment ID to match
 * @param {import('prosemirror-model').Node} doc The ProseMirror document
 * @returns {Array<{from:number,to:number,attrs:Object}>} Segments containing mark attrs
 */
const getCommentMarkSegmentsById = (commentId, doc) => {
  const segments = [];

  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    const commentMark = node.marks?.find(
      (mark) => mark.type.name === CommentMarkName && mark.attrs?.commentId === commentId,
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
 * Convert raw mark segments into merged contiguous ranges.
 * A single commentId can appear in multiple disjoint ranges (e.g. if content is split),
 * so this returns both the raw segments and the merged ranges.
 *
 * @param {string} commentId The comment ID to match
 * @param {import('prosemirror-model').Node} doc The ProseMirror document
 * @returns {{segments:Array<{from:number,to:number,attrs:Object}>,ranges:Array<{from:number,to:number,internal:boolean}>}}
 */
const getCommentMarkRangesById = (commentId, doc) => {
  const segments = getCommentMarkSegmentsById(commentId, doc);
  if (!segments.length) return { segments, ranges: [] };

  const ranges = [];
  let active = null;

  segments.forEach((seg) => {
    if (!active) {
      active = {
        from: seg.from,
        to: seg.to,
        internal: !!seg.attrs?.internal,
      };
      return;
    }

    if (seg.from <= active.to) {
      active.to = Math.max(active.to, seg.to);
      return;
    }

    ranges.push(active);
    active = {
      from: seg.from,
      to: seg.to,
      internal: !!seg.attrs?.internal,
    };
  });

  if (active) ranges.push(active);
  return { segments, ranges };
};

/**
 * Resolve a comment by removing its mark(s) and inserting commentRangeStart/commentRangeEnd
 * anchor nodes around the same text ranges, so the comment becomes hidden but its anchors
 * are preserved for later export/re-import.
 *
 * @param {Object} param0
 * @param {string} param0.commentId The comment ID
 * @param {import('prosemirror-state').EditorState} param0.state The current editor state
 * @param {import('prosemirror-state').Transaction} param0.tr The current transaction
 * @param {Function} param0.dispatch The dispatch function
 * @returns {boolean} True if the comment mark existed and was processed
 */
export const resolveCommentById = ({ commentId, state, tr, dispatch }) => {
  const { schema } = state;
  const markType = schema.marks?.[CommentMarkName];
  if (!markType) return false;

  const { segments, ranges } = getCommentMarkRangesById(commentId, state.doc);
  if (!segments.length) return false;

  segments.forEach(({ from, to, attrs }) => {
    tr.removeMark(from, to, markType.create(attrs));
  });

  const startType = schema.nodes?.commentRangeStart;
  const endType = schema.nodes?.commentRangeEnd;
  if (startType && endType) {
    ranges
      .slice()
      .sort((a, b) => b.from - a.from)
      .forEach(({ from, to, internal }) => {
        tr.insert(to, endType.create({ 'w:id': commentId }));
        tr.insert(from, startType.create({ 'w:id': commentId, internal }));
      });
  }

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

  const added = [...afterTypes].filter((type) => !beforeTypes.has(type));
  const removed = [...beforeTypes].filter((type) => !afterTypes.has(type));

  const messages = [];

  // Detect added formatting (excluding textStyle, handled separately)
  const nonTextStyleAdded = added.filter((type) => !['textStyle', 'commentMark'].includes(type));
  if (nonTextStyleAdded.length) {
    messages.push(`Added formatting: ${nonTextStyleAdded.join(', ')}`);
  }

  // Detect removed formatting (excluding textStyle, handled separately)
  const nonTextStyleRemoved = removed.filter((type) => !['textStyle', 'commentMark'].includes(type));
  if (nonTextStyleRemoved.length) {
    messages.push(`Removed formatting: ${nonTextStyleRemoved.join(', ')}`);
  }

  // Handling textStyle changes separately
  const beforeTextStyle = before.find((mark) => mark.type === 'textStyle')?.attrs || {};
  const afterTextStyle = after.find((mark) => mark.type === 'textStyle')?.attrs || {};

  const textStyleChanges = [];

  // Function to convert camelCase to human-readable format
  const formatAttrName = (attr) => attr.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

  Object.keys({ ...beforeTextStyle, ...afterTextStyle }).forEach((attr) => {
    const beforeValue = beforeTextStyle[attr];
    const afterValue = afterTextStyle[attr];

    if (beforeValue !== afterValue) {
      if (afterValue === null) {
        // Ignore attributes that are now null
        return;
      } else if (attr === 'color') {
        // Special case: Simplify color change message
        textStyleChanges.push(`Changed color`);
      } else {
        const label = formatAttrName(attr); // Convert camelCase to lowercase words
        if (beforeValue === undefined || beforeValue === null) {
          textStyleChanges.push(`Set ${label} to ${afterValue}`);
        } else {
          textStyleChanges.push(`Changed ${label} from ${beforeValue} to ${afterValue}`);
        }
      }
    }
  });

  if (textStyleChanges.length) {
    messages.push(`Modified text style: ${textStyleChanges.join(', ')}`);
  }

  return messages.length ? messages.join('. ') : 'No formatting changes.';
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
