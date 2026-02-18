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
  // Handle structural deletions with no inline content (e.g., empty paragraph removal,
  // paragraph joins). When there's no content being inserted and no inline content in
  // the deletion range, markDeletion has nothing to mark — apply the step directly.
  //
  // Edge case: if a paragraph contains only TrackDelete-marked text, hasInlineContent
  // returns true and the normal tracking flow runs. markDeletion skips already-deleted
  // nodes, but the join still applies through the replace machinery — the delete is
  // not swallowed. This is correct: the structural join merges the blocks while
  // preserving the existing deletion marks on the text content.
  if (step.from !== step.to && step.slice.content.size === 0) {
    let hasInlineContent = false;
    newTr.doc.nodesBetween(step.from, step.to, (node) => {
      if (node.isInline) {
        hasInlineContent = true;
        return false;
      }
    });

    if (!hasInlineContent) {
      if (!newTr.maybeStep(step).failed) {
        map.appendMap(step.getMap());
      }
      return;
    }
  }

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

  // When pasting into a textblock, try the open slice first so content merges inline
  // instead of creating new paragraphs (prevents inserting block nodes into non-textblocks).
  const baseParentIsTextblock = trTemp.doc.resolve(positionTo).parent?.isTextblock;
  const shouldPreferInlineInsertion = step.from === step.to && baseParentIsTextblock;

  const tryInsert = (slice) => {
    const tempTr = state.apply(newTr).tr;
    // Empty slices represent pure deletions (no content to insert).
    // Detecting them ensures deletion tracking runs even if `tempTr` doesn't change.
    const isEmptySlice = slice?.content?.size === 0;
    try {
      tempTr.replaceRange(positionTo, positionTo, slice);
    } catch {
      return null;
    }

    if (!tempTr.docChanged && !isEmptySlice) return null;

    const insertedFrom = tempTr.mapping.map(positionTo, -1);
    const insertedTo = tempTr.mapping.map(positionTo, 1);
    if (insertedFrom === insertedTo) return { tempTr, insertedFrom, insertedTo };
    if (shouldPreferInlineInsertion && !tempTr.doc.resolve(insertedFrom).parent?.isTextblock) return null;
    return { tempTr, insertedFrom, insertedTo };
  };

  const openSlice = Slice.maxOpen(step.slice.content, true);
  const insertion = tryInsert(step.slice) || tryInsert(openSlice);

  // If we can't insert the replacement content into the temp transaction, fall back to applying the original step.
  // This keeps user intent (content change) even if we can't represent it as tracked insert+delete.
  if (!insertion) {
    if (!newTr.maybeStep(step).failed) {
      map.appendMap(step.getMap());
    }
    return;
  }

  const meta = {};
  const { insertedFrom, insertedTo, tempTr } = insertion;
  let insertedMark = null;
  let trackedInsertedSlice = Slice.empty;

  if (insertedFrom !== insertedTo) {
    insertedMark = markInsertion({
      tr: tempTr,
      from: insertedFrom,
      to: insertedTo,
      user,
      date,
    });
    trackedInsertedSlice = tempTr.doc.slice(insertedFrom, insertedTo);
  }

  // Condense insertion down to a single replace step (so this tracked transaction remains a single-step insertion).
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

  if (insertedFrom !== insertedTo) {
    meta.insertedMark = insertedMark;
    meta.step = condensedStep;
    // Store the actual insertion end position for cursor placement (SD-1624).
    // Only needed when position was adjusted to insert after a deletion span.
    // For single-step transactions, positionTo is in newTr.doc coordinates after our condensedStep,
    // so we just add the insertion length to get the cursor position.
    if (positionAdjusted) {
      const insertionLength = insertedTo - insertedFrom;
      meta.insertedTo = positionTo + insertionLength;
    }
  }

  if (!newTr.selection.eq(tempTr.selection)) {
    newTr.setSelection(tempTr.selection);
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
