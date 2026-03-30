/**
 * Updates the position of a comment in the editor.
 * @param {Object} param0 - The parameters for updating the comment position.
 * @param {Object} param0.allCommentPositions - The current positions of all comments.
 * @param {string} param0.threadId - The ID of the comment thread.
 * @param {number} param0.pos - The new position of the comment.
 * @param {DOMRect|Object} param0.currentBounds - The current bounds of the comment.
 * @param {Object} param0.node - The ProseMirror node representing the comment.
 */
export const updatePosition = ({ allCommentPositions, threadId, pos, currentBounds, node }) => {
  let bounds = {};

  if (currentBounds instanceof DOMRect) {
    bounds = {
      top: currentBounds.top,
      bottom: currentBounds.bottom,
      left: currentBounds.left,
      right: currentBounds.right,
    };
  } else {
    bounds = { ...currentBounds };
  }

  if (!allCommentPositions[threadId]) {
    allCommentPositions[threadId] = {
      threadId,
      start: pos,
      end: pos + node.nodeSize,
      bounds,
    };
  } else {
    // Adjust the positional indices
    const existing = allCommentPositions[threadId];
    existing.start = Math.min(existing.start, pos);
    existing.end = Math.max(existing.end, pos + node.nodeSize);
    existing.bounds.top = Math.min(existing.bounds.top, currentBounds.top);
    existing.bounds.bottom = Math.max(existing.bounds.bottom, currentBounds.bottom);
  }
};
