import { ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import { replaceStep } from './replaceStep.js';
import { TrackDeleteMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/index.js';

/**
 * Find the closest live (non-tracked-deleted) text character position before
 * the cursor, within the same paragraph.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} cursorPos
 * @param {import('prosemirror-model').MarkType} trackDeleteMarkType
 * @returns {number | null} The document position of the character, or null.
 */
const findPreviousLiveCharPos = (doc, cursorPos, trackDeleteMarkType) => {
  const $cursor = doc.resolve(cursorPos);

  // Find the enclosing paragraph (may need to go up past run nodes).
  let paraDepth = $cursor.depth;
  while (paraDepth > 0 && $cursor.node(paraDepth).type.name !== 'paragraph') {
    paraDepth--;
  }
  if (paraDepth <= 0) return null;

  const paraStart = $cursor.before(paraDepth) + 1;

  // Walk through inline nodes from paragraph start to cursor,
  // keeping track of the last live character position found.
  let lastLiveCharPos = null;

  doc.nodesBetween(paraStart, cursorPos, (node, pos) => {
    if (!node.isText) return;

    const hasDeleteMark = node.marks.some((m) => m.type === trackDeleteMarkType);
    if (hasDeleteMark) return;

    // This is a live text node. Its last character within our range is
    // at min(nodeEnd, cursorPos) - 1.
    const nodeEnd = pos + node.nodeSize;
    const relevantEnd = Math.min(nodeEnd, cursorPos);
    if (relevantEnd > pos) {
      lastLiveCharPos = relevantEnd - 1;
    }
  });

  return lastLiveCharPos;
};

/**
 * Handle a ReplaceAroundStep in tracked changes mode.
 *
 * ReplaceAroundStep is ProseMirror's structural "change wrapper" operation
 * (e.g. lifting content out of a list item, changing block type). In tracked
 * changes mode we must never silently apply structural changes — they would
 * alter paragraph properties (numbering, font, alignment) without tracking.
 *
 * For backspace/delete, the user's intent is to delete a character, not change
 * paragraph structure. We convert the step to a tracked single-character
 * deletion using the existing replaceStep handler.
 *
 * @param {object} options
 * @param {import('prosemirror-state').EditorState} options.state
 * @param {import('prosemirror-state').Transaction} options.tr
 * @param {import('prosemirror-transform').ReplaceAroundStep} options.step
 * @param {import('prosemirror-state').Transaction} options.newTr
 * @param {import('prosemirror-transform').Mapping} options.map
 * @param {import('prosemirror-model').Node} options.doc
 * @param {object} options.user
 * @param {string} options.date
 * @param {import('prosemirror-transform').Step} options.originalStep
 * @param {number} options.originalStepIndex
 */
export const replaceAroundStep = ({
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
}) => {
  const inputType = tr.getMeta('inputType');
  const isBackspace = inputType === 'deleteContentBackward';

  if (!isBackspace) {
    // Non-backspace ReplaceAroundStep in tracked changes: block it.
    // Structural wrapper changes (list toggle, block type change) should be
    // implemented as tracked format changes in the future. For now, silently
    // dropping them is safer than applying them untracked.
    return;
  }

  // For backspace: find the previous live character and track its deletion.
  const trackDeleteMarkType = state.schema.marks[TrackDeleteMarkName];
  const deleteFrom = findPreviousLiveCharPos(doc, state.selection.from, trackDeleteMarkType);

  if (deleteFrom === null) {
    // No live character found — nothing to delete. Skip the structural change.
    return;
  }

  const charStep = new ReplaceStep(deleteFrom, deleteFrom + 1, Slice.empty);

  replaceStep({
    state,
    tr,
    step: charStep,
    newTr,
    map,
    doc,
    user,
    date,
    originalStep: charStep,
    originalStepIndex,
  });

  // Position the cursor at the deletion edge. The original transaction's
  // selection was computed for the structural ReplaceAroundStep, not our
  // fabricated character deletion. Override it so the cursor visually
  // moves left with each backspace.
  const trackMeta = newTr.getMeta(TrackChangesBasePluginKey) || {};
  trackMeta.selectionPos = deleteFrom;
  newTr.setMeta(TrackChangesBasePluginKey, trackMeta);

  // Merge adjacent trackDelete marks that have the same author/date but different IDs.
  // When backspace first deletes a character (e.g. ".") via a normal ReplaceStep and
  // subsequent presses delete further characters (e.g. "l") via ReplaceAroundStep,
  // the deletion marks end up with different IDs because run node boundaries create
  // a position gap larger than findTrackedMarkBetween's ±1 offset. Re-mark the
  // earlier deletion with the current ID so they merge into a single tracked change.
  if (trackMeta.deletionMark) {
    const ourId = trackMeta.deletionMark.attrs.id;
    const ourEmail = trackMeta.deletionMark.attrs.authorEmail;
    const ourDate = trackMeta.deletionMark.attrs.date;
    const searchTo = Math.min(newTr.doc.content.size, deleteFrom + 20);

    let contiguous = true;
    newTr.doc.nodesBetween(deleteFrom, searchTo, (node, pos) => {
      if (!contiguous) return false;
      if (!node.isText) return;
      const delMark = node.marks.find((m) => m.type.name === TrackDeleteMarkName);
      if (!delMark) {
        contiguous = false; // Live text — stop, deletions are no longer contiguous.
        return;
      }
      if (delMark.attrs.id !== ourId && delMark.attrs.authorEmail === ourEmail && delMark.attrs.date === ourDate) {
        const markType = state.schema.marks[TrackDeleteMarkName];
        const merged = markType.create({ ...delMark.attrs, id: ourId });
        newTr.removeMark(pos, pos + node.nodeSize, delMark);
        newTr.addMark(pos, pos + node.nodeSize, merged);
      }
    });
  }
};
