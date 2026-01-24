import { ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import { markInsertion } from './markInsertion.js';
import { markDeletion } from './markDeletion.js';
import { TrackDeleteMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/index.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import { findMarkPosition } from './documentHelpers.js';

/**
 * Replace step.
 * @param {import('prosemirror-state').EditorState} options.state Editor state.
 * @param {import('prosemirror-state').Transaction} options.tr Transaction.
 * @param {import('prosemirror-transform').ReplaceStep} options.step Step.
 * @param {import('prosemirror-state').Transaction} options.newTr New transaction.
 * @param {import('prosemirror-transform').Mapping} options.map Map.
 * @param {import('prosemirror-model').Node} options.doc Doc.
 * @param {object} options.user User object ({ name, email }).
 * @param {string} options.date Date.
 * @param {import('prosemirror-transform').ReplaceStep} options.originalStep Original step.
 * @param {number} options.originalStepIndex Original step index.
 */
export const replaceStep = ({ state, tr, step, newTr, map, user, date, originalStep, originalStepIndex }) => {
  const trTemp = state.apply(newTr).tr;

  // Default: insert replacement after the selected range (Word-like replace behavior).
  // If the selection ends inside an existing deletion, move insertion to after that deletion span.
  // NOTE: Only adjust position for single-step transactions. Multi-step transactions (like input rules)
  // have subsequent steps that depend on original positions, and adjusting breaks their mapping.
  let positionTo = step.to;
  let positionAdjusted = false;
  const isSingleStep = tr.steps.length === 1;

  if (isSingleStep) {
    const probePos = Math.max(step.from, step.to - 1);
    const deletionSpan = findMarkPosition(trTemp.doc, probePos, TrackDeleteMarkName);
    if (deletionSpan && deletionSpan.to > positionTo) {
      positionTo = deletionSpan.to;
      positionAdjusted = true;
    }
  }

  const tryInsert = (slice) => {
    const insertionStep = new ReplaceStep(positionTo, positionTo, slice, false);
    if (trTemp.maybeStep(insertionStep).failed) return null;
    return {
      insertedFrom: insertionStep.from,
      insertedTo: insertionStep.getMap().map(insertionStep.to, 1),
    };
  };

  const insertion = tryInsert(step.slice) || tryInsert(Slice.maxOpen(step.slice.content, true));

  // If we can't insert the replacement content into the temp transaction, fall back to applying the original step.
  // This keeps user intent (content change) even if we can't represent it as tracked insert+delete.
  if (!insertion) {
    if (!newTr.maybeStep(step).failed) {
      map.appendMap(step.getMap());
    }
    return;
  }

  const meta = {};
  const insertedMark = markInsertion({
    tr: trTemp,
    from: insertion.insertedFrom,
    to: insertion.insertedTo,
    user,
    date,
  });

  // Condense insertion down to a single replace step (so this tracked transaction remains a single-step insertion).
  const trackedInsertedSlice = trTemp.doc.slice(insertion.insertedFrom, insertion.insertedTo);
  const condensedStep = new ReplaceStep(positionTo, positionTo, trackedInsertedSlice, false);
  if (newTr.maybeStep(condensedStep).failed) {
    // If the condensed step can't be applied, fall back to the original step and skip deletion tracking.
    if (!newTr.maybeStep(step).failed) {
      map.appendMap(step.getMap());
    }
    return;
  }

  // We didn't apply the original step in its original place. We adjust the map accordingly.
  const invertStep = originalStep.invert(tr.docs[originalStepIndex]).map(map);
  map.appendMap(invertStep.getMap());
  const mirrorIndex = map.maps.length - 1;
  map.appendMap(condensedStep.getMap(), mirrorIndex);

  if (insertion.insertedFrom !== insertion.insertedTo) {
    meta.insertedMark = insertedMark;
    meta.step = condensedStep;
    // Store the actual insertion end position for cursor placement (SD-1624).
    // Only needed when position was adjusted to insert after a deletion span.
    // For single-step transactions, positionTo is in newTr.doc coordinates after our condensedStep,
    // so we just add the insertion length to get the cursor position.
    if (positionAdjusted) {
      const insertionLength = insertion.insertedTo - insertion.insertedFrom;
      meta.insertedTo = positionTo + insertionLength;
    }
  }

  if (!newTr.selection.eq(trTemp.selection)) {
    newTr.setSelection(trTemp.selection);
  }

  if (step.from !== step.to) {
    const {
      deletionMark,
      deletionMap,
      nodes: deletionNodes,
    } = markDeletion({
      tr: newTr,
      from: step.from,
      to: step.to,
      user,
      date,
      id: meta.insertedMark?.attrs?.id,
    });

    meta.deletionNodes = deletionNodes;
    meta.deletionMark = deletionMark;

    // Map insertedTo through deletionMap to account for position shifts from removing
    // the user's own prior insertions (which markDeletion deletes instead of marking).
    if (meta.insertedTo !== undefined) {
      meta.insertedTo = deletionMap.map(meta.insertedTo, 1);
    }

    map.appendMapping(deletionMap);
  }

  // Add meta to the new transaction.
  newTr.setMeta(TrackChangesBasePluginKey, meta);
  newTr.setMeta(CommentsPluginKey, { type: 'force' });
};
