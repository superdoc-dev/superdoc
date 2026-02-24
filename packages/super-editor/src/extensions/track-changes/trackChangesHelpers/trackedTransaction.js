import { Mapping, ReplaceStep, AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { TextSelection } from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';
import { replaceStep } from './replaceStep.js';
import { addMarkStep } from './addMarkStep.js';
import { removeMarkStep } from './removeMarkStep.js';
import { TrackDeleteMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/index.js';
import { findMark } from '@core/helpers/index.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';

/**
 * Tracked transaction to track changes.
 * @param {{ tr: import('prosemirror-state').Transaction; state: import('prosemirror-state').EditorState; user: import('@core/types/EditorConfig.js').User }} params
 * @returns {import('prosemirror-state').Transaction} Modified transaction.
 */
export const trackedTransaction = ({ tr, state, user }) => {
  const onlyInputTypeMeta = ['inputType', 'uiEvent', 'paste', 'pointer'];
  const notAllowedMeta = ['historyUndo', 'historyRedo', 'acceptReject'];
  const isProgrammaticInput = tr.getMeta('inputType') === 'programmatic';
  const ySyncMeta = tr.getMeta(ySyncPluginKey);
  const allowedMeta = new Set([...onlyInputTypeMeta, ySyncPluginKey.key]);
  const hasDisallowedMeta = tr.meta && Object.keys(tr.meta).some((meta) => !allowedMeta.has(meta));

  if (
    ySyncMeta?.isChangeOrigin || // Skip Yjs-origin transactions (remote/rehydration).
    !tr.steps.length ||
    (hasDisallowedMeta && !isProgrammaticInput) ||
    notAllowedMeta.includes(tr.getMeta('inputType')) ||
    tr.getMeta(CommentsPluginKey) // Skip if it's a comment transaction.
  ) {
    return tr;
  }

  const newTr = state.tr;
  const map = new Mapping();
  const fixedTimeTo10Mins = Math.floor(Date.now() / 600000) * 600000;
  const date = new Date(fixedTimeTo10Mins).toISOString();

  tr.steps.forEach((originalStep, originalStepIndex) => {
    const step = originalStep.map(map);
    const { doc } = newTr;

    if (!step) {
      return;
    }

    if (step instanceof ReplaceStep) {
      replaceStep({
        state,
        tr,
        step,
        newTr,
        map,
        doc,
        user,
        date,
        originalStep,
        originalStepIndex,
      });
    } else if (step instanceof AddMarkStep) {
      addMarkStep({
        state,
        tr,
        step,
        newTr,
        map,
        doc,
        user,
        date,
      });
    } else if (step instanceof RemoveMarkStep) {
      removeMarkStep({
        state,
        tr,
        step,
        newTr,
        map,
        doc,
        user,
        date,
      });
    } else {
      newTr.step(step);
    }
  });

  if (tr.getMeta('inputType')) {
    newTr.setMeta('inputType', tr.getMeta('inputType'));
  }

  if (tr.getMeta('uiEvent')) {
    newTr.setMeta('uiEvent', tr.getMeta('uiEvent'));
  }

  if (tr.getMeta('addToHistory') !== undefined) {
    newTr.setMeta('addToHistory', tr.getMeta('addToHistory'));
  }

  // Get the track changes meta to check if we have an adjusted insertion position (SD-1624).
  const trackMeta = newTr.getMeta(TrackChangesBasePluginKey);

  if (tr.selectionSet) {
    if (
      tr.selection instanceof TextSelection &&
      (tr.selection.from < state.selection.from || tr.getMeta('inputType') === 'deleteContentBackward')
    ) {
      const caretPos = map.map(tr.selection.from, -1);
      newTr.setSelection(new TextSelection(newTr.doc.resolve(caretPos)));
    } else if (trackMeta?.insertedTo !== undefined) {
      const boundedInsertedTo = Math.max(0, Math.min(trackMeta.insertedTo, newTr.doc.content.size));
      const $insertPos = newTr.doc.resolve(boundedInsertedTo);
      // Near is used here because its safer than an exact position
      // exact is not guaranteed to be a valid cursor position
      newTr.setSelection(TextSelection.near($insertPos, 1));
    } else {
      const deletionMarkSchema = state.schema.marks[TrackDeleteMarkName];
      const deletionMark = findMark(state, deletionMarkSchema, false);

      if (tr.selection.from > state.selection.from && deletionMark) {
        const caretPos = map.map(deletionMark.to + 1, 1);
        newTr.setSelection(new TextSelection(newTr.doc.resolve(caretPos)));
      } else {
        newTr.setSelection(tr.selection.map(newTr.doc, map));
      }
    }
  } else if (state.selection.from - tr.selection.from > 1 && tr.selection.$head.depth > 1) {
    const caretPos = map.map(tr.selection.from - 2, -1);
    newTr.setSelection(new TextSelection(newTr.doc.resolve(caretPos)));
  } else {
    // Skip the other cases for now.
  }

  if (tr.storedMarksSet) {
    newTr.setStoredMarks(tr.storedMarks);
  }

  if (tr.scrolledIntoView) {
    newTr.scrollIntoView();
  }

  return newTr;
};
