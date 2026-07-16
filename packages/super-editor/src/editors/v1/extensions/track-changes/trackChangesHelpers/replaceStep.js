import { ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import { TrackChangesBasePluginKey } from '../plugins/index.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import { compileTrackedEdit } from '../review-model/overlap-compiler.js';
import { makeTextInsertIntent, makeTextDeleteIntent, makeTextReplaceIntent } from '../review-model/edit-intent.js';
import { stampTableRows } from './stampTableRows.js';
import { collectWholeTablesInRange } from './collectWholeTablesInRange.js';
import { markInsertion } from './markInsertion.js';
import { markDeletion } from './markDeletion.js';

/**
 * Whether a slice's top-level content contains a `table` node (directly, or
 * wrapped — the toolbar's `insertTable` emits `[paragraph, table, paragraph]`
 * when the new table would otherwise sit adjacent to a document boundary).
 *
 * @param {import('prosemirror-model').Slice | null | undefined} slice
 * @returns {boolean}
 */
const sliceContainsTable = (slice) => {
  const content = slice?.content;
  if (!content) return false;
  let found = false;
  content.forEach((node) => {
    if (found) return;
    if (node?.type?.name === 'table') found = true;
  });
  return found;
};

/**
 * Whether the range `[from, to)` in `doc` fully contains at least one WHOLE
 * `table` node (the table node starts at or after `from` and ends at or before
 * `to`). This is the deletion analog of `sliceContainsTable`: a whole-table
 * delete is a `tr.delete(tableStart, tableEnd)` (the shape `deleteTable` emits),
 * so the deleted range exactly brackets the table node.
 *
 * @param {{ doc: import('prosemirror-model').Node, from: number, to: number }} options
 * @returns {boolean}
 */
const rangeContainsWholeTable = ({ doc, from, to }) => collectWholeTablesInRange({ doc, from, to }).length > 0;

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
 * Whether a slice carries any inline leaf content (text, hard breaks, inline
 * widgets). A slice without inline leaves is a purely structural shell — e.g.
 * the paragraph re-join slice `deleteRange` produces for a deletion that spans
 * a paragraph boundary (`<paragraph><run/></paragraph>` with open ends).
 *
 * @param {import('prosemirror-model').Slice} slice
 * @returns {boolean}
 */
const sliceHasInlineLeafContent = (slice) => {
  let found = false;
  slice.content.descendants((node) => {
    if (found) return false;
    if (node.isInline && (node.isText || node.isLeaf)) {
      found = true;
      return false;
    }
  });
  return found;
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
 * Apply a tracked STRUCTURAL insert for a ReplaceStep whose inserted slice
 * contains a whole `table` node.
 *
 * The inline overlap-compiler is text-centric: it produces an insertion mark
 * over inline text. An empty (freshly authored) table has no inline text, so
 * the compiler fails closed and the table would otherwise land untracked. This
 * path instead applies the original step verbatim (preserving any separator
 * paragraphs the `insertTable` command wrapped around the table) and then makes
 * the insertion tracked:
 *
 *   1. Apply the original ReplaceStep to `newTr`. For a replace
 *      (`from !== to`) this also removes the replaced range. The common toolbar
 *      shape replaces an empty paragraph (`from=0, to=2` in an empty doc), so
 *      there is no live content to preserve; the inserted slice simply takes
 *      its place. We do NOT tracked-delete the replaced empty paragraph — it
 *      carries no inline content and Word treats a table inserted over the
 *      caret's empty paragraph as a pure structural insert.
 *   2. Mark every inserted INLINE text run (e.g. text the slice's wrapping
 *      separator paragraphs may carry, or pre-filled cell text) with a tracked
 *      insertion mark via `markInsertion`. An empty new table contributes none,
 *      which is fine — `markInsertion` skips table internals by design.
 *   3. Stamp each inserted table's rows with a structural `rowInsert` revision
 *      (one shared `revisionGroupId` per table) via `stampTableRows`,
 *      matching the shape the importer lands from `<w:ins>` in `<w:trPr>`.
 *   4. Keep the outer `map` consistent (append the step's map) so subsequent
 *      original steps in the same transaction remap correctly, and report
 *      `insertedTo` so `trackedTransaction` places the caret after the table.
 *
 * `setNodeMarkup` (step 3) and `addMark` (step 2) do not change node sizes, so
 * the mapping established in step 1 stays valid.
 *
 * @param {{ newTr: import('prosemirror-state').Transaction, step: import('prosemirror-transform').ReplaceStep, map: import('prosemirror-transform').Mapping, user: object, date: string }} options
 * @returns {{ handled: boolean }}
 */
const tryStructuralTableInsert = ({ newTr, step, map, user, date }) => {
  const beforeSteps = newTr.steps.length;
  const beforeSize = newTr.doc.content.size;
  const insertAt = step.from;
  const replacedLength = step.to - step.from;

  // Only the no-real-content insert/replace is safe to fast-path here — e.g.
  // inserting a table at the caret in an empty paragraph (the common toolbar
  // shape: ReplaceStep from=0 to=2 replacing the empty leading paragraph). If
  // the replaced range holds real content, applying the step directly would
  // delete that content WITHOUT a tracked deletion (data loss). Bail so it is
  // handled by the normal tracked path instead of silently dropping live
  // content. Real content is text OR a non-text leaf/atom (image, hardBreak, …)
  // — `textBetween` alone misses atoms, so an image-only selection would slip
  // through and be dropped untracked. Empty structural nodes (an empty
  // paragraph) are not leaves, so the legit fast-path still applies.
  if (step.from !== step.to) {
    let hasRealContent = false;
    newTr.doc.nodesBetween(step.from, step.to, (node) => {
      if (hasRealContent) return false;
      if ((node.isText && node.text) || (node.isLeaf && !node.isText)) hasRealContent = true;
      return !hasRealContent;
    });
    if (hasRealContent) return { handled: false };
  }

  // 1. Apply the original step (insert slice, replacing [from, to)).
  if (newTr.maybeStep(step).failed) {
    return { handled: false };
  }

  // Keep the outer mapping consistent with the other replaceStep branches so
  // later original steps in this transaction land where the user expects.
  const stepMap = newTr.steps[beforeSteps].getMap();
  map.appendMap(stepMap);

  // Inserted range in newTr.doc space. The step deletes `[from, to)` and
  // inserts the slice at `from`, so the new content starts exactly at `from`.
  // Its span is the net document growth plus the replaced length (this is
  // exact regardless of the slice's open depth). Mapping `from` through the
  // step map collapses both biases onto the deletion point and cannot bracket
  // the freshly inserted nodes, so derive the range from the doc delta instead.
  const insertedFrom = insertAt;
  const insertedTo = insertAt + (newTr.doc.content.size - beforeSize) + replacedLength;

  // 2. Mark inserted inline text (separator-paragraph text, pre-filled cell
  //    text). markInsertion skips table rows/cells internals by design, so an
  //    empty table contributes nothing here.
  if (insertedTo > insertedFrom) {
    let hasInlineText = false;
    newTr.doc.nodesBetween(insertedFrom, insertedTo, (node) => {
      if (node.isText && node.text) {
        hasInlineText = true;
        return false;
      }
    });
    if (hasInlineText) {
      markInsertion({ tr: newTr, from: insertedFrom, to: insertedTo, user, date });
    }
  }

  // 3. Stamp each whole inserted table's rows with a structural rowInsert
  //    revision (shared revisionGroupId per table).
  stampTableRows({ type: 'rowInsert', tr: newTr, from: insertedFrom, to: insertedTo, user, date });

  // 4. Surface insertion meta so the caret lands after the table and the
  //    bubble/comments pipeline sees a tracked insert.
  newTr.setMeta(TrackChangesBasePluginKey, { insertedTo });
  newTr.setMeta(CommentsPluginKey, { type: 'force' });

  return { handled: true };
};

/**
 * Apply a tracked STRUCTURAL delete for a ReplaceStep whose deleted range fully
 * brackets one or more whole `table` nodes (the shape `deleteTable` /
 * `deleteTableWhenSelected` / select-table-then-Delete emit:
 * `tr.delete(tableStart, tableEnd)` with an EMPTY slice).
 *
 * A tracked deletion keeps the content VISIBLE (struck-through / red) rather
 * than removing it, so this path is the inverse of `tryStructuralTableInsert`:
 * it does NOT apply the removal step. Instead it leaves the table(s) in place
 * and makes them tracked-deleted:
 *
 *   1. Do NOT apply the original ReplaceStep — the table must stay so the
 *      reviewer can accept (remove) or reject (restore) it later.
 *   2. Mark every INLINE text run in the deleted range with a `trackDelete`
 *      mark via `markDeletion` (so cell text and any non-table text in the
 *      range renders struck-through). `markDeletion` skips table rows/cells
 *      structure nodes by design and only marks leaf inline text, so the table
 *      nodes themselves are preserved. An EMPTY table contributes no cell text,
 *      which is fine — step 3 alone makes it a tracked deletion.
 *   3. Stamp each WHOLE table in the range with a structural `rowDelete`
 *      revision on every row (one shared `revisionGroupId` per table) via
 *      `stampTableRows`, matching the shape the importer lands from
 *      `<w:del>` in `<w:trPr>`.
 *   4. Set the tracked-changes / comments meta and report `handled: true` so
 *      `replaceStep` does NOT fall through to applying the untracked removal.
 *
 * Content safety for partial selections: because we never apply the removal and
 * `markDeletion` marks ALL inline text in `[from, to)` (table cell text AND any
 * text outside a table that the selection happened to include), no live content
 * is dropped untracked even when the range is a mix of whole table(s) and
 * surrounding text. Only WHOLE tables fully contained in the range receive the
 * `rowDelete` stamp; a partially-overlapping table is left to the structural
 * enumerator's fail-closed handling (it never becomes a decidable whole-table
 * change and is therefore never removed). Partial row/column/cell deletes are
 * out of scope (this branch is only taken when at least one WHOLE table is
 * fully bracketed).
 *
 * `markDeletion` (addMark) and `stampTableRows` (setNodeMarkup) do not
 * change node sizes and we apply no removal step, so the outer `map` stays the
 * identity for this step and subsequent original steps remap correctly.
 *
 * @param {{ newTr: import('prosemirror-state').Transaction, step: import('prosemirror-transform').ReplaceStep, user: object, date: string }} options
 * @returns {{ handled: boolean }}
 */
const tryStructuralTableDelete = ({ newTr, step, map, originalStep, originalStepIndex, tr, user, date }) => {
  const from = step.from;
  const to = step.to;

  // Collect the whole tables fully bracketed by the range.
  const tableRanges = collectWholeTablesInRange({ doc: newTr.doc, from, to });

  // Only handle a CLEAN whole-table delete: the range must not include inline
  // text OUTSIDE the table(s). A mixed selection (surrounding text + table)
  // would share one deletion id across inside/outside text via `markDeletion`,
  // breaking structural reject cleanup and the bubble subsumption. Decline so
  // such ranges fall through to the normal inline-deletion path instead.
  let hasOutsideText = false;
  newTr.doc.nodesBetween(from, to, (node, pos) => {
    if (hasOutsideText) return false;
    if (node.isText && node.text && !tableRanges.some((r) => pos >= r.from && pos < r.to)) {
      hasOutsideText = true;
      return false;
    }
    return undefined;
  });
  if (hasOutsideText) return { handled: false };

  // Tracked-delete the cell text inside the table(s) (all inside-table now).
  // markDeletion marks only leaf inline text and keeps table structure nodes.
  let hasInlineText = false;
  newTr.doc.nodesBetween(from, to, (node) => {
    if (node.isText && node.text) {
      hasInlineText = true;
      return false;
    }
    return undefined;
  });
  if (hasInlineText) {
    markDeletion({ tr: newTr, from, to, user, date });
  }

  // Stamp each whole table's rows with a structural rowDelete revision (shared
  // revisionGroupId per table). Required for an empty table (no cell text) and
  // for the structural "Deleted table" change/bubble in all cases.
  const stamped = stampTableRows({ type: 'rowDelete', tr: newTr, from, to, user, date });

  // Nothing trackable — decline so the caller can fall through.
  if (!stamped && !hasInlineText) {
    return { handled: false };
  }

  // We applied NO removal (the table stays). Cancel the original step's
  // positional effect on the outer `map` so any LATER original step in the same
  // transaction lands in the kept-table document instead of drifting backward by
  // the un-removed table's size. Mirrors the inline-deletion map dance; a no-op
  // for a single-step deleteTable (no later steps to remap).
  if (map && originalStep && tr) {
    try {
      const invertStep = originalStep.invert(tr.docs[originalStepIndex]).map(map);
      if (invertStep) map.appendMap(invertStep.getMap());
    } catch {
      // Best effort: leave the map unchanged.
    }
  }

  // Surface meta so the bubble/comments pipeline sees the tracked deletion.
  newTr.setMeta(TrackChangesBasePluginKey, {});
  newTr.setMeta(CommentsPluginKey, { type: 'force' });

  return { handled: true };
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
  // Structural insert: the inserted slice introduces a whole `table` node
  // (possibly wrapped by the separator paragraphs `insertTable` emits at a
  // document boundary). The inline-text-centric compiler cannot represent an
  // empty table — it has no inline text to mark — so it fails closed and the
  // table would land untracked. Route such inserts through the dedicated
  // structural path instead.
  if (step.slice.content.size > 0 && sliceContainsTable(step.slice)) {
    const structural = tryStructuralTableInsert({ newTr, step, map, user, date });
    if (structural.handled) return structural;
    // If the structural insert could not apply (e.g. PM rejected the step),
    // fall through to the normal compiler path rather than dropping the edit.
  }

  // Structural delete: an empty-slice deletion whose range fully brackets one
  // or more WHOLE `table` nodes (the shape `deleteTable` /
  // `deleteTableWhenSelected` / select-table-then-Delete emit). A tracked
  // deletion must keep the table VISIBLE (struck-through), so route it through
  // the dedicated structural path that stamps `rowDelete` + marks cell text
  // WITHOUT removing the table. This must run before the empty-deletion
  // fall-through below, which would otherwise let the structural fallback
  // remove an empty table untracked (data loss of the tracked intent).
  if (
    step.from !== step.to &&
    step.slice.content.size === 0 &&
    rangeContainsWholeTable({ doc: newTr.doc, from: step.from, to: step.to })
  ) {
    const structural = tryStructuralTableDelete({
      newTr,
      step,
      map,
      originalStep,
      originalStepIndex,
      tr,
      user,
      date,
    });
    if (structural.handled) return structural;
    // If the structural delete declined (e.g. nothing trackable), fall through
    // to the normal paths rather than dropping the edit.
  }

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

  // A non-empty slice without inline leaf content is a structural re-join
  // shell, not user-visible replacement content. `deleteRange` emits one for
  // a deletion that spans a paragraph boundary; compiling it as a replacement
  // would insert the empty block shell at the range end and split the
  // trailing paragraph (SD-3386). Track it as a plain deletion instead.
  const isStructuralShellDelete =
    step.from !== step.to && step.slice.content.size > 0 && !sliceHasInlineLeafContent(step.slice);

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
    } else if (step.from !== step.to && (step.slice.content.size === 0 || isStructuralShellDelete)) {
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
      // Mirror pairing assumes the compiled steps re-apply the original
      // step's position effect (the condensed insert in the replace path).
      // A structural-shell delete compiles to mark steps only — pairing
      // their empty maps as mirrors of the invert map corrupts position
      // recovery (Position NaN) for positions inside the never-inserted
      // shell, so append those without mirrors (SD-3386).
      if (isStructuralShellDelete) {
        map.appendMap(newTr.steps[i].getMap());
      } else {
        map.appendMap(newTr.steps[i].getMap(), mirrorIndex);
      }
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
  // Structural-shell deletes also need the explicit override: the original
  // step's post-step selection can sit inside the shell slice that was never
  // inserted, so mapping it back is meaningless — honor the compiler's caret
  // hint (left edge of the tracked deletion) instead.
  if (result.selection?.kind === 'near' && (stepWasNormalized || isStructuralShellDelete) && !result.insertedMark) {
    meta.selectionPos = result.selection.pos;
  }
  newTr.setMeta(TrackChangesBasePluginKey, meta);
  newTr.setMeta(CommentsPluginKey, { type: 'force' });

  // Structural authoring: the compiler/markInsertion only mark inline content
  // and deliberately skip table internals. If this insertion introduced a
  // whole table, stamp a `rowInsert` revision on each of its rows so the table
  // is tracked as ONE whole-table insert (matching imported tracked tables).
  // The inserted range is [step.from, insertedTo); setNodeMarkup keeps sizes
  // stable so it does not disturb the mapping established above.
  if (typeof result.insertedTo === 'number' && result.insertedTo > step.from) {
    stampTableRows({
      type: 'rowInsert',
      tr: newTr,
      from: step.from,
      to: result.insertedTo,
      user,
      date,
    });
  }

  return { handled: true, sizeDelta: newTr.doc.content.size - beforeSize };
};
