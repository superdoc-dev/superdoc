import { v4 as uuidv4 } from 'uuid';
import { TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/trackChangesBasePlugin.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import { hasMatchingMark, markSnapshotMatchesStepMark, upsertMarkSnapshotByType } from './markSnapshotHelpers.js';
import { getLiveInlineMarksInRange } from './getLiveInlineMarksInRange.js';

/**
 * Remove mark step.
 * @param {import('prosemirror-state').EditorState} options.state Editor state.
 * @param {import('prosemirror-transform').RemoveMarkStep} options.step Step.
 * @param {import('prosemirror-state').Transaction} options.newTr New transaction.
 * @param {import('prosemirror-model').Node} options.doc Doc.
 * @param {object} options.user User object ({ name, email }).
 * @param {string} options.date Date.
 */
export const removeMarkStep = ({ state, step, newTr, doc, user, date }) => {
  const meta = {};
  let sharedWid = null;

  doc.nodesBetween(step.from, step.to, (node, pos) => {
    if (!node.isInline || node.type.name === 'run') {
      return true;
    }

    if (node.marks.find((mark) => mark.type.name === TrackDeleteMarkName)) {
      return false;
    }

    const rangeFrom = Math.max(step.from, pos);
    const rangeTo = Math.min(step.to, pos + node.nodeSize);
    const liveMarksBeforeRemove = getLiveInlineMarksInRange({
      doc: newTr.doc,
      from: rangeFrom,
      to: rangeTo,
    });
    newTr.removeMark(Math.max(step.from, pos), Math.min(step.to, pos + node.nodeSize), step.mark);

    const allowedMarks = ['bold', 'italic', 'strike', 'underline', 'textStyle', 'highlight'];

    if (allowedMarks.includes(step.mark.type.name) && hasMatchingMark(liveMarksBeforeRemove, step.mark)) {
      const formatChangeMark = liveMarksBeforeRemove.find((mark) => mark.type.name === TrackFormatMarkName);

      let after = [];
      let before = [];

      if (formatChangeMark) {
        let foundAfter = formatChangeMark.attrs.after.find((mark) =>
          markSnapshotMatchesStepMark(mark, step.mark, true),
        );

        if (foundAfter) {
          after = [
            ...formatChangeMark.attrs.after.filter((mark) => !markSnapshotMatchesStepMark(mark, step.mark, true)),
          ];
          if (after.length === 0) {
            // All additions were canceled. Check if any marks in `before` were
            // actually removed from the node. If they all still exist, the
            // tracked change is a no-op — clean it up.
            const remainingFormatMarks = liveMarksBeforeRemove.filter(
              (m) =>
                ![TrackDeleteMarkName, TrackFormatMarkName].includes(m.type.name) &&
                m.type.name !== step.mark.type.name,
            );
            const isNoop = formatChangeMark.attrs.before.every((snapshot) =>
              remainingFormatMarks.some((m) => markSnapshotMatchesStepMark(snapshot, m, true)),
            );
            if (isNoop) {
              newTr.removeMark(Math.max(step.from, pos), Math.min(step.to, pos + node.nodeSize), formatChangeMark);
              return;
            }
          }
          before = [...formatChangeMark.attrs.before];
        } else {
          after = [...formatChangeMark.attrs.after];
          before = upsertMarkSnapshotByType(formatChangeMark.attrs.before, {
            type: step.mark.type.name,
            attrs: { ...step.mark.attrs },
          });
        }
      } else {
        after = [];
        let existingMark = node.marks.find((mark) => mark.type === step.mark.type);
        if (existingMark) {
          before = [
            {
              type: step.mark.type.name,
              attrs: { ...existingMark.attrs },
            },
          ];
        } else {
          before = [];
        }
      }

      if (after.length || before.length) {
        const newFormatMark = state.schema.marks[TrackFormatMarkName].create({
          id: formatChangeMark ? formatChangeMark.attrs.id : (sharedWid ?? (sharedWid = uuidv4())),
          author: user.name,
          authorEmail: user.email,
          authorImage: user.image,
          date,
          before,
          after,
        });

        newTr.addMark(Math.max(step.from, pos), Math.min(step.to, pos + node.nodeSize), newFormatMark);

        meta.formatMark = newFormatMark;
        meta.step = step;

        newTr.setMeta(TrackChangesBasePluginKey, meta);
        newTr.setMeta(CommentsPluginKey, { type: 'force' });
      } else if (formatChangeMark) {
        newTr.removeMark(Math.max(step.from, pos), Math.min(step.to, pos + node.nodeSize), formatChangeMark);
      }
    }
  });
};
