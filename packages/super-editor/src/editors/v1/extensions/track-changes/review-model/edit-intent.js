// @ts-check
/**
 * TrackedEditIntent factories and helpers.
 *
 * Every tracked text mutation — native step rewrites, the
 * `insertTrackedChange` command, and document-api tracked writes — must
 * normalize its input into a TrackedEditIntent before consulting the
 * overlap compiler. The intent type is the only contract the compiler
 * accepts; each call site decides whether it produces a `text-insert`,
 * `text-delete`, `text-replace`, or `format-apply`/`format-remove`.
 *
 * `source` is preserved purely for failure routing (native vs document-api
 * vs plan-engine) and never changes semantic rules. `replacementGroupHint`
 * exists for transitional callers that cannot avoid producing adjacent
 * delete/insert intents while migrating to one fused `text-replace`.
 */

import { Slice, Fragment } from 'prosemirror-model';

/** @typedef {'native'|'document-api'|'programmatic'} EditIntentSource */

/**
 * @typedef {Object} TrackedEditIntentUser
 * @property {string} name
 * @property {string} email
 * @property {string} [image]
 */

/**
 * @typedef {Object} TrackedEditIntentBase
 * @property {EditIntentSource} source
 * @property {TrackedEditIntentUser} user
 * @property {string} date
 * @property {string} [replacementGroupHint]
 * @property {boolean} [probeForDeletionSpan] When true, the compiler may
 *   probe for an adjacent tracked-delete span and move the insertion to
 *   after it. Single-step user replace turns this on; multi-step transactions
 *   leave it off so each granular op lands at its own position.
 * @property {boolean} [preserveExistingReviewState] When true, the compiler
 *   must not collapse/refine existing tracked review marks even if the
 *   current user owns them. Used by explicit direct mutations that are
 *   re-routed through tracking only to protect existing review state.
 */

/**
 * @typedef {(TrackedEditIntentBase & {
 *   kind: 'text-insert',
 *   at: number,
 *   content: import('prosemirror-model').Slice,
 * }) | (TrackedEditIntentBase & {
 *   kind: 'text-delete',
 *   from: number,
 *   to: number,
 * }) | (TrackedEditIntentBase & {
 *   kind: 'text-replace',
 *   from: number,
 *   to: number,
 *   content: import('prosemirror-model').Slice,
 *   replacements: 'paired'|'independent',
 * }) | (TrackedEditIntentBase & {
 *   kind: 'format-apply'|'format-remove',
 *   from: number,
 *   to: number,
 *   mark: import('prosemirror-model').Mark,
 * })} TrackedEditIntent
 */

const isFiniteNonNeg = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Build a Slice that wraps a single text string with the given marks.
 * openStart/openEnd are 0 so callers can use `replaceRange` for inline merge.
 *
 * @param {*} schema
 * @param {string} text
 * @param {readonly import('prosemirror-model').Mark[]} [marks]
 * @returns {import('prosemirror-model').Slice}
 */
export const sliceFromText = (schema, text, marks) => {
  if (!text) return Slice.empty;
  return new Slice(Fragment.from(schema.text(text, marks ?? null)), 0, 0);
};

/**
 * Coerce string or Slice into a Slice.
 *
 * @param {*} schema
 * @param {*} content
 * @returns {import('prosemirror-model').Slice}
 */
export const toSliceContent = (schema, content) => {
  if (content instanceof Slice) return content;
  if (typeof content === 'string') return sliceFromText(schema, content);
  return Slice.empty;
};

/**
 * Build a `text-insert` intent. The caller is expected to have already
 * resolved `at` against the transaction it will pass to the compiler.
 *
 * @param {{
 *   at: number,
 *   content: import('prosemirror-model').Slice | string,
 *   schema?: *,
 *   user: TrackedEditIntentUser,
 *   date: string,
 *   source: EditIntentSource,
 *   replacementGroupHint?: string,
 *   preserveExistingReviewState?: boolean,
 * }} input
 * @returns {TrackedEditIntent}
 */
export const makeTextInsertIntent = ({
  at,
  content,
  schema,
  user,
  date,
  source,
  replacementGroupHint,
  preserveExistingReviewState,
}) => {
  if (!isFiniteNonNeg(at)) {
    throw new Error('makeTextInsertIntent: `at` must be a non-negative finite number');
  }
  const slice =
    content instanceof Slice ? content : schema ? sliceFromText(schema, /** @type {string} */ (content)) : Slice.empty;
  return {
    kind: 'text-insert',
    at,
    content: slice,
    user,
    date,
    source,
    ...(replacementGroupHint ? { replacementGroupHint } : {}),
    ...(preserveExistingReviewState ? { preserveExistingReviewState: true } : {}),
  };
};

/**
 * Build a `text-delete` intent.
 *
 * @param {{
 *   from: number,
 *   to: number,
 *   user: TrackedEditIntentUser,
 *   date: string,
 *   source: EditIntentSource,
 *   replacementGroupHint?: string,
 *   preserveExistingReviewState?: boolean,
 * }} input
 * @returns {TrackedEditIntent}
 */
export const makeTextDeleteIntent = ({
  from,
  to,
  user,
  date,
  source,
  replacementGroupHint,
  preserveExistingReviewState,
}) => {
  if (!isFiniteNonNeg(from) || !isFiniteNonNeg(to)) {
    throw new Error('makeTextDeleteIntent: `from`/`to` must be non-negative finite numbers');
  }
  if (from > to) throw new Error('makeTextDeleteIntent: `from` must be <= `to`');
  return {
    kind: 'text-delete',
    from,
    to,
    user,
    date,
    source,
    ...(replacementGroupHint ? { replacementGroupHint } : {}),
    ...(preserveExistingReviewState ? { preserveExistingReviewState: true } : {}),
  };
};

/**
 * Build a `text-replace` intent.
 *
 * @param {{
 *   from: number,
 *   to: number,
 *   content: import('prosemirror-model').Slice | string,
 *   schema?: *,
 *   replacements: 'paired'|'independent',
 *   user: TrackedEditIntentUser,
 *   date: string,
 *   source: EditIntentSource,
 *   replacementGroupHint?: string,
 *   preserveExistingReviewState?: boolean,
 * }} input
 * @returns {TrackedEditIntent}
 */
export const makeTextReplaceIntent = ({
  from,
  to,
  content,
  schema,
  replacements,
  user,
  date,
  source,
  replacementGroupHint,
  preserveExistingReviewState,
}) => {
  if (!isFiniteNonNeg(from) || !isFiniteNonNeg(to)) {
    throw new Error('makeTextReplaceIntent: `from`/`to` must be non-negative finite numbers');
  }
  if (from > to) throw new Error('makeTextReplaceIntent: `from` must be <= `to`');
  const slice =
    content instanceof Slice ? content : schema ? sliceFromText(schema, /** @type {string} */ (content)) : Slice.empty;
  return {
    kind: 'text-replace',
    from,
    to,
    content: slice,
    replacements,
    user,
    date,
    source,
    ...(replacementGroupHint ? { replacementGroupHint } : {}),
    ...(preserveExistingReviewState ? { preserveExistingReviewState: true } : {}),
  };
};

/**
 * Build a `format-apply`/`format-remove` intent.
 *
 * @param {{
 *   kind: 'format-apply'|'format-remove',
 *   from: number,
 *   to: number,
 *   mark: import('prosemirror-model').Mark,
 *   user: TrackedEditIntentUser,
 *   date: string,
 *   source: EditIntentSource,
 * }} input
 * @returns {TrackedEditIntent}
 */
export const makeFormatIntent = ({ kind, from, to, mark, user, date, source }) => {
  if (kind !== 'format-apply' && kind !== 'format-remove') {
    throw new Error(`makeFormatIntent: unsupported kind ${kind}`);
  }
  if (!isFiniteNonNeg(from) || !isFiniteNonNeg(to)) {
    throw new Error('makeFormatIntent: `from`/`to` must be non-negative finite numbers');
  }
  if (from > to) throw new Error('makeFormatIntent: `from` must be <= `to`');
  return { kind, from, to, mark, user, date, source };
};

/**
 * @param {TrackedEditIntent} intent
 * @returns {string}
 */
export const intentKind = (intent) => intent.kind;
