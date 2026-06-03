// @ts-check
/**
 * Low-level tracked-mark span enumerator.
 *
 * Plan: v1-3220 / phase0-002 ("Consumers To Migrate").
 *
 * The legacy raw mark scan can remain as a primitive inside this module.
 * `getTrackChanges` is preserved as a low-level mark-span enumerator for
 * tests and compatibility, but it MUST NOT define logical behavior for
 * list/get/decide/bubbles/permissions. That is the job of the graph
 * (review-graph.js), which is built on top of this primitive.
 *
 * This file deliberately re-exports the existing helper rather than
 * duplicating its body, so any future bugfix in `getTrackChanges` keeps the
 * graph and the legacy raw-scan consumers in sync.
 */

import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';
import { findInlineNodes } from '../trackChangesHelpers/documentHelpers.js';

const TRACKED_MARK_SET = new Set([TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName]);

/**
 * @typedef {Object} TrackedMarkSpan
 * @property {import('prosemirror-model').Mark} mark
 * @property {number} from
 * @property {number} to
 */

/**
 * Enumerate every tracked-mark span in document order. One inline leaf node
 * can carry more than one tracked mark (e.g. trackInsert + trackFormat
 * stacked) — every mark is yielded as its own span.
 *
 * Tolerates a missing or partially-initialized state and returns [] instead
 * of throwing, matching `getTrackChanges`. Comment-import bootstrap can call
 * this through a setTimeout(0) before the editor's PM state is attached.
 *
 * @param {import('prosemirror-state').EditorState | { doc?: import('prosemirror-model').Node } | null | undefined} state
 * @returns {TrackedMarkSpan[]}
 */
export const enumerateTrackedMarkSpans = (state) => {
  const out = [];
  if (!state?.doc) return out;
  const inlineNodes = findInlineNodes(state.doc);
  if (!inlineNodes.length) return out;

  for (const { node, pos } of inlineNodes) {
    const marks = node?.marks ?? [];
    if (!marks.length) continue;
    for (const mark of marks) {
      if (!TRACKED_MARK_SET.has(mark.type.name)) continue;
      out.push({ mark, from: pos, to: pos + node.nodeSize });
    }
  }

  return out;
};
