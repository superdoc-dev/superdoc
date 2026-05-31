import { ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import { TrackChangesBasePluginKey } from '../plugins/index.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import { compileTrackedEdit } from '../review-model/overlap-compiler.js';
import { makeTextInsertIntent, makeTextDeleteIntent, makeTextReplaceIntent } from '../review-model/edit-intent.js';

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
 * @param {object} options Replace step options.
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
 * @param {'paired' | 'independent'} [options.replacements] Replacement id pairing mode.
 */
export const replaceStep = ({
  state,
  tr,
  step,
  newTr,
  map,
  user,
  date,
  originalStep,
  originalStepIndex,
  replacements = 'paired',
}) => {
  const originalRange = { from: step.from, to: step.to, sliceSize: step.slice.content.size };
  step = normalizeReplaceStepSingleCharDelete({ step, doc: newTr.doc });
  const stepWasNormalized =
    step.from !== originalRange.from ||
    step.to !== originalRange.to ||
    step.slice.content.size !== originalRange.sliceSize;

  const compiled = tryCompileStep({
    state,
    tr,
    newTr,
    step,
    stepWasNormalized,
    originalStep,
    originalStepIndex,
    map,
    user,
    date,
    replacements,
  });
  if (compiled.handled) {
    return;
  }
  if (compiled.failed) {
    // Do not fall through to applying the original step untracked.
    return;
  }

  // Handle structural deletions with no inline content (e.g., empty paragraph removal,
  // paragraph joins). When there's no content being inserted and no inline content in
  // the deletion range, there is no tracked inline content for the compiler to mark, so
  // apply the structural step directly.
  //
  // Edge case: if a paragraph contains only TrackDelete-marked text, hasInlineContent
  // returns true and the compiler path runs. If the compiler cannot represent that
  // mixed text/structure operation, the edit fails closed rather than applying
  // untracked content.
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
  // Every text-shaped tracked edit must be represented by compileTrackedEdit.
  // If the compiler declined and the structural branch above did not apply,
  // fail closed instead of keeping a second tracked-write implementation here.
};

/**
 * Try to route a text-shaped ReplaceStep through the overlap-aware compiler.
 *
 * Returns one of:
 *  - `{ handled: true }`  — compiler applied the edit; caller must return.
 *  - `{ failed: true }`   — compiler aborted (typed failure); caller must
 *                          NOT fall back to the original untracked step.
 *  - `{ handled: false }` — compiler declined (e.g. structural step
 *                          without inline content). Caller may run the
 *                          narrow structural fallback below.
 *
 * @param {{ state: import('prosemirror-state').EditorState, tr: import('prosemirror-state').Transaction, newTr: import('prosemirror-state').Transaction, step: import('prosemirror-transform').ReplaceStep, stepWasNormalized: boolean, originalStep: import('prosemirror-transform').ReplaceStep, map: import('prosemirror-transform').Mapping, user: object, date: string, replacements: 'paired'|'independent' }} options
 */
const tryCompileStep = ({
  state,
  tr,
  newTr,
  step,
  stepWasNormalized,
  originalStep,
  originalStepIndex,
  map,
  user,
  date,
  replacements,
}) => {
  // Empty structural deletion handled by the structural branch above.
  if (step.from !== step.to && step.slice.content.size === 0) {
    let hasInlineContent = false;
    newTr.doc.nodesBetween(step.from, step.to, (node) => {
      if (node.isInline) {
        hasInlineContent = true;
        return false;
      }
    });
    if (!hasInlineContent) return { handled: false };
  }

  // Build the intent. Pure inserts and pure deletes use the matching intent
  // type; mixed (text-replace) carries the original slice.
  let intent;
  try {
    const preserveExistingReviewState = tr.getMeta('protectTrackedReviewState') === true;
    const source = tr.getMeta('inputType') === 'programmatic' ? 'document-api' : 'native';
    if (step.from === step.to && step.slice.content.size > 0) {
      intent = makeTextInsertIntent({
        at: step.from,
        content: step.slice,
        user,
        date,
        source,
        preserveExistingReviewState,
      });
    } else if (step.from !== step.to && step.slice.content.size === 0) {
      intent = makeTextDeleteIntent({
        from: step.from,
        to: step.to,
        user,
        date,
        source,
        preserveExistingReviewState,
      });
    } else if (step.from !== step.to && step.slice.content.size > 0) {
      intent = makeTextReplaceIntent({
        from: step.from,
        to: step.to,
        content: step.slice,
        replacements,
        user,
        date,
        source,
        preserveExistingReviewState,
      });
      // Single-step user actions (text replace from one ReplaceStep) probe
      // for adjacent tracked-delete spans so insertion lands past the
      // strike-through content. Multi-step transactions (input rules,
      // plan-engine multi-op rewrites) must not probe.
      if (tr.steps.length === 1) /** @type {any} */ (intent).probeForDeletionSpan = true;
    } else {
      // Zero-op step; nothing to compile.
      return { handled: false };
    }
  } catch (error) {
    return { failed: true, error };
  }

  const beforeSize = newTr.doc.content.size;
  const beforeSteps = newTr.steps.length;
  const newTrDocBeforeCompile = newTr.doc;
  const result = compileTrackedEdit({
    state,
    tr: newTr,
    intent,
    replacements,
  });

  if (!result.ok) {
    return { failed: true, error: new Error(result.message) };
  }

  // Update the outer mapping (`map`) so subsequent original steps in the
  // same transaction remap correctly into newTr.doc space. We didn't apply
  // the original step in its original place (we applied a condensed insert
  // at positionTo plus delete marks). For trackedTransaction's
  // `originalStep.map(map)` to land subsequent steps where the user expected,
  // the outer map must encode the original step's user-view position effect.
  // Mirror the legacy invert+condensed dance: append the inverse of the
  // source step (cancels the original step's expected map) then mirror-append
  // the compiled steps (what we actually did to newTr).
  const invertSourceStep = stepWasNormalized ? step : originalStep;
  const invertSourceDoc = stepWasNormalized ? newTrDocBeforeCompile : tr.docs[originalStepIndex];
  let invertStep;
  try {
    invertStep = stepWasNormalized
      ? invertSourceStep.invert(invertSourceDoc)
      : invertSourceStep.invert(invertSourceDoc).map(map);
  } catch {
    invertStep = null;
  }

  if (invertStep) {
    map.appendMap(invertStep.getMap());
    const mirrorIndex = map.maps.length - 1;
    for (let i = beforeSteps; i < newTr.steps.length; i += 1) {
      map.appendMap(newTr.steps[i].getMap(), mirrorIndex);
    }
  } else {
    for (let i = beforeSteps; i < newTr.steps.length; i += 1) {
      map.appendMap(newTr.steps[i].getMap());
    }
  }

  // Build comments-plugin-shaped metadata directly from the compiler result
  // so the bubble pipeline can derive inserted/deleted text immediately
  // (without fake step.slice payloads).
  const meta = {};
  if (typeof result.insertedTo === 'number') {
    meta.insertedTo = result.insertedTo;
  }
  if (result.insertedMark) {
    meta.insertedMark = result.insertedMark;
  }
  if (result.deletionMark) {
    meta.deletionMark = result.deletionMark;
  } else if (result.deletionMarks?.length) {
    meta.deletionMark = result.deletionMarks[0];
  }
  if (result.deletionNodes?.length) {
    meta.deletionNodes = result.deletionNodes;
  }
  if (result.insertedMark && result.insertedStep) {
    // Pass the real condensed ReplaceStep so the comments plugin can read
    // step.slice.content (Fragment) just like the legacy code did.
    meta.step = result.insertedStep;
  } else if (result.insertedMark && result.insertedNodes?.length) {
    // Compiler paths that don't produce a single condensed ReplaceStep —
    // fall back to a shaped step the comments plugin already understands.
    meta.step = { slice: { content: { content: result.insertedNodes } } };
  }
  if (result.selection?.kind === 'near' && stepWasNormalized && !result.insertedMark) {
    meta.selectionPos = result.selection.pos;
  }
  newTr.setMeta(TrackChangesBasePluginKey, meta);
  newTr.setMeta(CommentsPluginKey, { type: 'force' });

  return { handled: true, sizeDelta: newTr.doc.content.size - beforeSize };
};
