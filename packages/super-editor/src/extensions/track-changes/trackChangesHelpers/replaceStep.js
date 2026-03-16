import { ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import { Selection, TextSelection } from 'prosemirror-state';
import { markInsertion } from './markInsertion.js';
import { markDeletion } from './markDeletion.js';
import { TrackDeleteMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/index.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import { findMarkPosition } from './documentHelpers.js';

/**
 * Given a range (from..to) and a count of characters ("the Nth character in that range"),
 * returns the exact index in the document where that character sits. We only count
 * real text—things like embedded widgets or block boundaries are skipped. Returns
 * null if the count is beyond the end of the text in the range.
 *
 * @param {{ doc: import('prosemirror-model').Node, from: number, to: number, textOffset: number }} options
 * @returns {number | null}
 */
const findDocPosByTextOffset = ({ doc, from, to, textOffset }) => {
  let remaining = textOffset;
  let foundPos = null;

  doc.nodesBetween(from, to, (node, pos) => {
    if (foundPos !== null) {
      return false;
    }
    if (!node.isText || !node.text) {
      return;
    }

    const nodeStart = Math.max(from, pos);
    const nodeEnd = Math.min(to, pos + node.text.length);
    if (nodeStart >= nodeEnd) {
      return;
    }

    const nodeLen = nodeEnd - nodeStart;
    if (remaining < nodeLen) {
      foundPos = nodeStart + remaining;
      return false;
    }

    remaining -= nodeLen;
  });

  return foundPos;
};

/**
 * When the user deletes one character (e.g. backspace), the editor sometimes
 * reports a change that spans a whole range—for example when the cursor is at
 * the end of a paragraph. If the only real change is one character removed, we
 * rewrite that into a simple "delete one character at position X" so we can
 * show the right red strikethrough and put the cursor in the right place.
 * We first try to see that from the changed range alone; if that fails (e.g. the
 * range includes bookmarks or paragraph boundaries), we compare the full document
 * text before and after to find the single deleted character. Returns the
 * original change unchanged if it isn't actually a one-character delete or if
 * we can't safely rewrite it.
 *
 * @param {{ step: import('prosemirror-transform').ReplaceStep, doc: import('prosemirror-model').Node }} options
 * @returns {import('prosemirror-transform').ReplaceStep}
 */
const normalizeReplaceStepSingleCharDelete = ({ step, doc }) => {
  if (
    !(step instanceof ReplaceStep) ||
    step.from === step.to ||
    step.to - step.from <= 1 ||
    step.slice.content.size === 0
  ) {
    return step;
  }

  const findSingleDeletedCharPos = ({ oldText, newText, from, to }) => {
    if (oldText.length - newText.length !== 1) {
      return null;
    }

    let prefix = 0;
    while (prefix < newText.length && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
      prefix += 1;
    }

    let suffix = 0;
    while (
      suffix < newText.length - prefix &&
      oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
    ) {
      suffix += 1;
    }

    if (prefix + suffix !== newText.length) {
      return null;
    }

    return findDocPosByTextOffset({ doc, from, to, textOffset: prefix });
  };

  // First try: only look at the text in the range that changed.
  const rangeOldText = doc.textBetween(step.from, step.to);
  const rangeNewText = step.slice.content.textBetween(0, step.slice.content.size);
  let deleteFrom = findSingleDeletedCharPos({
    oldText: rangeOldText,
    newText: rangeNewText,
    from: step.from,
    to: step.to,
  });

  // If that didn't work—the range can include things that aren't plain text
  // (e.g. bookmarks or paragraph boundaries)—compare the whole document before
  // and after the change to find the one character that was removed. This path
  // is rare and O(doc size); acceptable for normal docs.
  if (deleteFrom === null) {
    const applied = step.apply(doc);
    if (applied.failed || !applied.doc) {
      return step;
    }
    const oldDocText = doc.textBetween(0, doc.content.size);
    const newDocText = applied.doc.textBetween(0, applied.doc.content.size);
    deleteFrom = findSingleDeletedCharPos({
      oldText: oldDocText,
      newText: newDocText,
      from: 0,
      to: doc.content.size,
    });
    if (deleteFrom === null || deleteFrom < step.from || deleteFrom >= step.to) {
      return step;
    }
  }

  try {
    const deleteTo = deleteFrom + 1;
    const candidate = new ReplaceStep(deleteFrom, deleteTo, Slice.empty, step.structure);
    const result = candidate.apply(doc);
    return result.failed ? step : candidate;
  } catch {
    return step;
  }
};

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
  const originalRange = { from: step.from, to: step.to, sliceSize: step.slice.content.size };
  step = normalizeReplaceStepSingleCharDelete({ step, doc: newTr.doc });
  const stepWasNormalized =
    step.from !== originalRange.from ||
    step.to !== originalRange.to ||
    step.slice.content.size !== originalRange.sliceSize;

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
  const isSingleStep = tr.steps.length === 1;

  if (isSingleStep) {
    const probePos = Math.max(step.from, step.to - 1);
    const deletionSpan = findMarkPosition(trTemp.doc, probePos, TrackDeleteMarkName);
    if (deletionSpan && deletionSpan.to > positionTo) {
      positionTo = deletionSpan.to;
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
  const docBeforeCondensedStep = newTr.doc;
  const condensedStep = new ReplaceStep(positionTo, positionTo, trackedInsertedSlice, false);
  if (newTr.maybeStep(condensedStep).failed) {
    // If the condensed step can't be applied, fall back to the original step and skip deletion tracking.
    if (!newTr.maybeStep(step).failed) {
      map.appendMap(step.getMap());
    }
    return;
  }

  // We didn't apply the original step in its original place. We adjust the map accordingly.
  // When stepWasNormalized is true, `step` is already in the mapped position space
  // (originalStep.map(map) was applied before entering replaceStep). Calling .map(map)
  // again would double-map positions and corrupt subsequent step/selection mapping
  // in multi-step transactions.
  const invertSourceStep = stepWasNormalized ? step : originalStep;
  const invertSourceDoc = stepWasNormalized ? docBeforeCondensedStep : tr.docs[originalStepIndex];
  const invertStep = stepWasNormalized
    ? invertSourceStep.invert(invertSourceDoc)
    : invertSourceStep.invert(invertSourceDoc).map(map);
  map.appendMap(invertStep.getMap());
  const mirrorIndex = map.maps.length - 1;
  map.appendMap(condensedStep.getMap(), mirrorIndex);

  if (insertedFrom !== insertedTo) {
    meta.insertedMark = insertedMark;
    meta.step = condensedStep;
    // Store insertion end position when (1) we adjusted the insertion position (e.g. past a
    // deletion span), or (2) single-step replace of a range — selection mapping is wrong then
    // so we need an explicit caret position. Skip for multi-step (e.g. input rules) so their
    // intended selection is preserved.
    const needInsertedTo = positionTo !== step.to || (isSingleStep && step.from !== step.to);
    if (needInsertedTo) {
      const insertionLength = insertedTo - insertedFrom;
      meta.insertedTo = positionTo + insertionLength;
    }
  }

  if (!newTr.selection.eq(tempTr.selection)) {
    syncSelectionFromTransaction({ targetTr: newTr, sourceSelection: tempTr.selection });
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

    // Normalized broad -> single-char deletions should keep the caret at the
    // normalized deletion edge, not the original broad transaction selection.
    // This avoids follow-up Backspace events targeting structural boundaries.
    if (stepWasNormalized && !meta.insertedMark) {
      meta.selectionPos = deletionMap.map(step.from, -1);
    }

    map.appendMapping(deletionMap);
  }

  // Add meta to the new transaction.
  newTr.setMeta(TrackChangesBasePluginKey, meta);
  newTr.setMeta(CommentsPluginKey, { type: 'force' });
};

/**
 * Copies a selection from one transaction into another transaction that has a different
 * document instance, while guaranteeing the resulting selection is valid for the target doc.
 *
 * ProseMirror selections are bound to a specific document object. Reusing a `Selection`
 * created from another transaction can throw:
 * `Selection passed to setSelection must point at the current document`.
 *
 * This helper performs a safe transfer strategy:
 * 1. Clamp source selection positions to the target document bounds.
 * 2. Recreate `TextSelection` directly on the target doc when possible.
 * 3. If recreation fails (for example, target endpoints are no longer valid text positions),
 *    fall back to `Selection.near(...)` so caret placement still succeeds.
 * 4. For non-text selections, use the same `Selection.near(...)` fallback.
 *
 * The intent is to preserve cursor location as closely as possible without ever throwing
 * during tracked replay.
 *
 * @param {{ targetTr: import('prosemirror-state').Transaction, sourceSelection: import('prosemirror-state').Selection }} options
 * @param {import('prosemirror-state').Transaction} options.targetTr
 *   Transaction that should receive the selection. The resulting selection is always created
 *   against `targetTr.doc`.
 * @param {import('prosemirror-state').Selection} options.sourceSelection
 *   Selection taken from another transaction/document context.
 * @returns {void}
 */
const syncSelectionFromTransaction = ({ targetTr, sourceSelection }) => {
  const boundedFrom = Math.max(0, Math.min(sourceSelection.from, targetTr.doc.content.size));
  const boundedTo = Math.max(0, Math.min(sourceSelection.to, targetTr.doc.content.size));

  if (sourceSelection instanceof TextSelection) {
    try {
      targetTr.setSelection(TextSelection.create(targetTr.doc, boundedFrom, boundedTo));
      return;
    } catch {
      targetTr.setSelection(Selection.near(targetTr.doc.resolve(boundedFrom), -1));
      return;
    }
  }

  targetTr.setSelection(Selection.near(targetTr.doc.resolve(boundedFrom), -1));
};
