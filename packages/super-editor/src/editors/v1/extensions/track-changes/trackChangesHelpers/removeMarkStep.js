import { TrackDeleteMarkName, TrackedFormatMarkNames } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/trackChangesBasePlugin.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import { compileTrackedEdit } from '../review-model/overlap-compiler.js';
import { makeFormatIntent } from '../review-model/edit-intent.js';

/**
 * Remove mark step.
 * @param {object} options Remove mark options.
 * @param {import('prosemirror-state').EditorState} options.state Editor state.
 * @param {import('prosemirror-transform').RemoveMarkStep} options.step Step.
 * @param {import('prosemirror-state').Transaction} options.newTr New transaction.
 * @param {import('prosemirror-model').Node} options.doc Doc.
 * @param {object} options.user User object ({ name, email }).
 * @param {string} options.date Date.
 */
export const removeMarkStep = ({ state, step, newTr, doc, user, date }) => {
  if (TrackedFormatMarkNames.includes(step.mark.type.name)) {
    const intentUser = {
      name: user?.name || '',
      email: user?.email || '',
      image: user?.image || '',
    };
    const intent = makeFormatIntent({
      kind: 'format-remove',
      from: step.from,
      to: step.to,
      mark: step.mark,
      user: intentUser,
      date,
      source: 'native',
    });
    const result = compileTrackedEdit({
      state,
      tr: newTr,
      intent,
    });
    if (result.ok) {
      if (result.formatMarks?.length) {
        newTr.setMeta(TrackChangesBasePluginKey, {
          formatMark: result.formatMarks[0],
          step,
        });
      }
      newTr.setMeta(CommentsPluginKey, { type: 'force' });
      return;
    }
    // Fail closed for tracked formatting; do not silently apply untracked.
    return;
  }

  doc.nodesBetween(step.from, step.to, (node, pos) => {
    if (!node.isInline || node.type.name === 'run') {
      return true;
    }

    if (node.marks.find((mark) => mark.type.name === TrackDeleteMarkName)) {
      return false;
    }

    newTr.removeMark(Math.max(step.from, pos), Math.min(step.to, pos + node.nodeSize), step.mark);
  });
};
