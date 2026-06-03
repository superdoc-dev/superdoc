import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';
import { findInlineNodes } from './documentHelpers.js';

/**
 * Get the tracked-change marks in the document. Each entry pairs the
 * live PM mark with the `[from, to]` range of its bearing inline node.
 * When `id` is supplied, the result is filtered to marks whose
 * `attrs.id` equals it (used to find every range belonging to one
 * tracked-change group).
 *
 * Tolerates a missing or partially-initialized state and returns an
 * empty array instead of throwing. Comment-import bootstrap can call
 * this through a `setTimeout(0)` before the editor's PM state is
 * attached (SD-2641).
 *
 * @param {import('./types.js').EditorState | null | undefined} state
 * @param {string | null} [id] - Filter to marks with this `attrs.id`.
 * @returns {import('./types.js').TrackedMarkRange[]} `{ mark, from, to }`
 *   per tracked-change mark, optionally filtered by id.
 */
export const getTrackChanges = (state, id = null) => {
  /** @type {import('./types.js').TrackedMarkRange[]} */
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
            node,
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
