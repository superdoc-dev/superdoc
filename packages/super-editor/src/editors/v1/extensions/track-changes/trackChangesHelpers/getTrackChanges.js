import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';
import { findInlineNodes } from './documentHelpers.js';

/**
 * Get track changes marks.
 *
 * Tolerates a missing or partially-initialized state and returns an empty array
 * instead of throwing. Comment-import bootstrap can call this through a
 * setTimeout(0) before the editor's PM state is attached (SD-2641).
 *
 * @param {import('prosemirror-state').EditorState | null | undefined} state
 * @param {string} [id]
 * @returns {Array} Array with track changes marks.
 */
export const getTrackChanges = (state, id = null) => {
  const trackedChanges = [];
  if (!state?.doc) return trackedChanges;
  const allInlineNodes = findInlineNodes(state.doc);

  if (!allInlineNodes.length) {
    return trackedChanges;
  }

  allInlineNodes.forEach(({ node, pos }) => {
    const { marks } = node;
    const trackedMarks = [TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName];

    if (marks.length > 0) {
      marks.forEach((mark) => {
        if (trackedMarks.includes(mark.type.name)) {
          trackedChanges.push({
            mark,
            from: pos,
            to: pos + node.nodeSize,
          });
        }
      });
    }
  });

  if (id) {
    return trackedChanges.filter(({ mark }) => mark.attrs.id === id);
  }

  return trackedChanges;
};
