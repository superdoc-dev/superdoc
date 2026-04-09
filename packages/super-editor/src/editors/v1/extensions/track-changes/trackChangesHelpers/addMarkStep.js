import { TrackDeleteMarkName, TrackFormatMarkName, TrackedFormatMarkNames } from '../constants.js';
import { v4 as uuidv4 } from 'uuid';
import { TrackChangesBasePluginKey } from '../plugins/trackChangesBasePlugin.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import {
  hasMatchingMark,
  markSnapshotMatchesStepMark,
  upsertMarkSnapshotByType,
  isTrackFormatNoOp,
  getTypeName,
} from './markSnapshotHelpers.js';
import { getLiveInlineMarksInRange } from './getLiveInlineMarksInRange.js';

/**
 * Add mark step.
 * @param {import('prosemirror-state').EditorState} options.state Editor state.
 * @param {import('prosemirror-state').Transaction} options.tr Transaction.
 * @param {import('prosemirror-transform').AddMarkStep} options.step Step.
 * @param {import('prosemirror-state').Transaction} options.newTr New transaction.
 * @param {import('prosemirror-transform').Mapping} options.map Map.
 * @param {import('prosemirror-model').Node} options.doc Doc.
 * @param {object} options.user User object ({ name, email }).
 * @param {string} options.date Date.
 */
export const addMarkStep = ({ state, step, newTr, doc, user, date }) => {
  const meta = {};
  let sharedWid = null;

  doc.nodesBetween(step.from, step.to, (node, pos) => {
    if (!node.isInline || node.type.name === 'run') {
      return;
    }

    if (node.marks.find((mark) => mark.type.name === TrackDeleteMarkName)) {
      return false;
    }

    const rangeFrom = Math.max(step.from, pos);
    const rangeTo = Math.min(step.to, pos + node.nodeSize);

    const liveMarks = getLiveInlineMarksInRange({
      doc: newTr.doc,
      from: rangeFrom,
      to: rangeTo,
    });
    const existingChangeMark = liveMarks.find((mark) =>
      [TrackDeleteMarkName, TrackFormatMarkName].includes(mark.type.name),
    );
    const wid = existingChangeMark ? existingChangeMark.attrs.id : (sharedWid ?? (sharedWid = uuidv4()));
    newTr.addMark(Math.max(step.from, pos), Math.min(step.to, pos + node.nodeSize), step.mark);

    if (TrackedFormatMarkNames.includes(step.mark.type.name) && !hasMatchingMark(liveMarks, step.mark)) {
      const formatChangeMark = liveMarks.find((mark) => mark.type.name === TrackFormatMarkName);

      let after = [];
      let before = [];

      if (formatChangeMark) {
        let foundBefore = formatChangeMark.attrs.before.find((mark) =>
          markSnapshotMatchesStepMark(mark, step.mark, true),
        );

        if (foundBefore) {
          before = [
            ...formatChangeMark.attrs.before.filter((mark) => !markSnapshotMatchesStepMark(mark, step.mark, true)),
          ];
          // The step restores the original mark for this type — remove the
          // corresponding "after" entry since the change has been reverted.
          after = formatChangeMark.attrs.after.filter((mark) => getTypeName(mark) !== step.mark.type.name);
        } else {
          before = [...formatChangeMark.attrs.before];
          after = upsertMarkSnapshotByType(formatChangeMark.attrs.after, {
            type: step.mark.type.name,
            attrs: { ...step.mark.attrs },
          });
        }
      } else {
        const existingMarkOfSameType = liveMarks.find(
          (mark) =>
            mark.type.name === step.mark.type.name &&
            ![TrackDeleteMarkName, TrackFormatMarkName].includes(mark.type.name),
        );
        before = existingMarkOfSameType
          ? [{ type: existingMarkOfSameType.type.name, attrs: { ...existingMarkOfSameType.attrs } }]
          : [];

        after = [
          {
            type: step.mark.type.name,
            attrs: { ...step.mark.attrs },
          },
        ];
      }

      // Check if the format change is effectively a no-op (e.g., reverting
      // vertAlign to 'baseline' when the original had no vertAlign).
      if (isTrackFormatNoOp(before, after)) {
        if (formatChangeMark) {
          newTr.removeMark(Math.max(step.from, pos), Math.min(step.to, pos + node.nodeSize), formatChangeMark);
        }
        return;
      }

      if (after.length || before.length) {
        const newFormatMark = state.schema.marks[TrackFormatMarkName].create({
          id: wid,
          sourceId: formatChangeMark?.attrs?.sourceId || '',
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
