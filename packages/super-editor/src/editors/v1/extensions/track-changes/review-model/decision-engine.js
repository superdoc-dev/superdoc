// @ts-check
/**
 * Tracked-change decision engine.
 *
 * Single atomic entry point for accept/reject of one or more logical
 * tracked changes within a story. Used by:
 *
 *   - native commands (acceptTrackedChangeById / rejectTrackedChangeById /
 *     acceptTrackedChangesBetween / rejectTrackedChangesBetween /
 *     accept|rejectAllTrackedChanges)
 *   - document-api `trackChanges.decide` for id, range, and all targets
 *   - toolbar / context-menu wrappers via the existing resolveTrackedChangeAction
 *
 * Callers MUST treat `ok: false` as an abort and MUST NOT fall through to
 * older mark-scan paths.
 *
 * The engine does NOT mutate PM state on failure. Preflight produces a
 * complete mutation plan (PM ops + comment effects + bubble lifecycle
 * payload + receipt entities) and the engine applies it under one
 * transaction once preflight succeeds.
 */

import { Slice } from 'prosemirror-model';
import { AddMarkStep, RemoveMarkStep, ReplaceStep, Mapping } from 'prosemirror-transform';

import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';
import { CommentsPluginKey } from '../../comment/comments-plugin.js';
import { TrackChangesBasePluginKey } from '../plugins/index.js';
import { findMarkInRangeBySnapshot } from '../trackChangesHelpers/markSnapshotHelpers.js';

import { buildReviewGraph, CanonicalChangeType, SegmentSide } from './review-graph.js';
import { graphHasErrors } from './graph-invariants.js';
import {
  classifyOwnership,
  getCurrentUserIdentity,
  getChangeAuthorIdentity,
  isSameUserHighConfidence,
} from './identity.js';
import { planCommentEffects } from './comment-effects.js';

/**
 * @typedef {'accept'|'reject'} ReviewDecision
 */

/**
 * @typedef {{ kind: 'id', id: string }
 *          | { kind: 'range', from: number, to: number }
 *          | { kind: 'all' }} NormalizedDecisionTarget
 */

/**
 * @typedef {Object} DecisionDiagnostic
 * @property {string} code
 * @property {'info'|'warning'|'error'} severity
 * @property {string} message
 * @property {string[]} [changeIds]
 * @property {unknown} [details]
 */

/**
 * @typedef {Object} DecisionReceiptEntities
 * @property {string[]} createdChangeIds successor fragment ids minted by partial-range decisions.
 * @property {string[]} updatedChangeIds changes whose surviving coverage changed.
 * @property {Array<{ id: string, cause?: string }>} removedChangeIds retired logical change ids.
 * @property {Array<{ id: string, cause: string }>} deletedComments comment threads removed as side effects.
 * @property {Array<{ id: string, cause: string }>} detachedComments comment threads whose anchors survive but should detach from tracked-change threading.
 * @property {Array<{ id: string, cause: string }>} shrunkenComments comment threads that shrank.
 * @property {Array<{ changeId: string }>} affectedChildren child ids that retired with their parent.
 */

/**
 * @typedef {Object} DecisionResult
 * @property {true} ok
 * @property {import('prosemirror-state').Transaction} tr Pending transaction the caller dispatches.
 * @property {DecisionReceiptEntities} receipt
 * @property {Set<string>} touchedChangeIds Ids the bubble lifecycle should refresh.
 * @property {DecisionDiagnostic[]} diagnostics
 */

/**
 * @typedef {Object} DecisionFailure
 * @property {false} ok
 * @property {'TARGET_NOT_FOUND'|'INVALID_TARGET'|'REVISION_MISMATCH'|'PERMISSION_DENIED'|'CAPABILITY_UNAVAILABLE'|'PRECONDITION_FAILED'|'COMMENT_CASCADE_PARTIAL'|'NO_OP'} code
 * @property {string} message
 * @property {DecisionDiagnostic[]} [diagnostics]
 * @property {unknown} [details]
 */

const TRACKED_MARK_NAMES = new Set([TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName]);

const failure = (code, message, extra) => ({ ok: false, code, message, ...(extra || {}) });

/**
 * Plan and apply (or fail closed) a tracked-change decision.
 *
 * @param {Object} input
 * @param {import('prosemirror-state').EditorState} input.state PM editor state at decision time.
 * @param {object} input.editor v1 editor; used for permission resolver + identity context.
 * @param {ReviewDecision} input.decision
 * @param {object} input.target Raw target shape (id, range, all, legacy aliases).
 * @param {'paired'|'independent'} [input.replacements] replacements mode.
 * @returns {DecisionResult | DecisionFailure}
 */
export const decideTrackedChanges = ({ state, editor, decision, target, replacements = 'paired' }) => {
  if (decision !== 'accept' && decision !== 'reject') {
    return failure('INVALID_TARGET', `decision must be "accept" or "reject" (got "${String(decision)}").`);
  }

  const normalized = normalizeDecisionTarget(target);
  if (!normalized.ok) return normalized.failure;

  const graph = buildReviewGraph({
    state,
    replacementsMode: replacements,
  });
  if (graphHasErrors(graph)) {
    return failure('PRECONDITION_FAILED', 'tracked review graph has invariant errors before decision.', {
      diagnostics: graph.validate(),
    });
  }

  // Resolve the target into a set of selections describing which logical
  // changes get resolved and how (full vs partial coverage). The selections
  // are deterministic across undo/redo and collaboration replay because they
  // derive from logical change ids and normalized offsets, not transient PM
  // positions.
  const selectionResult = resolveTargetToSelections({ graph, normalized: normalized.value });
  if (!selectionResult.ok) return selectionResult.failure;
  const { selections } = selectionResult;
  if (!selections.length) {
    return failure('TARGET_NOT_FOUND', 'no tracked changes match the requested decision target.');
  }

  // Permission preflight — call once per logical change. One denial aborts.
  const permissionResult = runPermissionPreflight({ editor, decision, selections });
  if (!permissionResult.ok) return permissionResult.failure;

  // Compute the PM mutation plan + comment effects.
  const planResult = buildMutationPlan({ state, graph, selections, decision, replacements });
  if (!planResult.ok) return planResult.failure;
  const { plan } = planResult;

  // Apply the plan atomically.
  const applyResult = applyPlan({ state, plan });
  if (!applyResult.ok) return applyResult.failure;

  return {
    ok: true,
    tr: applyResult.tr,
    receipt: applyResult.receipt,
    touchedChangeIds: applyResult.touchedChangeIds,
    diagnostics: plan.diagnostics,
  };
};

// ---------------------------------------------------------------------------
// Target normalization
// ---------------------------------------------------------------------------

/**
 * Normalize the raw target shape into the canonical
 * `{ kind: 'id'|'range'|'all' }` form. Accepts legacy aliases:
 *   - `{ id: string }`                        → `{ kind: 'id', id }`
 *   - `{ scope: 'all' }`                      → `{ kind: 'all' }`
 *   - `{ from, to }`                          → `{ kind: 'range', from, to }`
 *   - canonical `{ kind: 'id'|'range'|'all' }` is passed through.
 */
const normalizeDecisionTarget = (target) => {
  if (!target || typeof target !== 'object') {
    return { ok: false, failure: failure('INVALID_TARGET', 'decision target must be an object.') };
  }
  const t = /** @type {Record<string, unknown>} */ (target);
  if (t.kind === 'id') {
    if (typeof t.id !== 'string' || !t.id) {
      return { ok: false, failure: failure('INVALID_TARGET', 'target.kind = "id" requires a non-empty id.') };
    }
    return { ok: true, value: { kind: 'id', id: t.id } };
  }
  if (t.kind === 'range') {
    const from = Number(t.from);
    const to = Number(t.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0 || from > to) {
      return { ok: false, failure: failure('INVALID_TARGET', 'target.kind = "range" requires from <= to.') };
    }
    return { ok: true, value: { kind: 'range', from, to } };
  }
  if (t.kind === 'all') {
    return { ok: true, value: { kind: 'all' } };
  }
  // Legacy aliases.
  if (typeof t.id === 'string' && t.id) {
    return { ok: true, value: { kind: 'id', id: t.id } };
  }
  if (t.scope === 'all') {
    return { ok: true, value: { kind: 'all' } };
  }
  if (Number.isFinite(t.from) && Number.isFinite(t.to)) {
    const from = Number(t.from);
    const to = Number(t.to);
    if (from > to) {
      return { ok: false, failure: failure('INVALID_TARGET', 'range target requires from <= to.') };
    }
    return { ok: true, value: { kind: 'range', from, to } };
  }
  return { ok: false, failure: failure('INVALID_TARGET', 'decision target shape was not recognised.') };
};

// ---------------------------------------------------------------------------
// Target → selections
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ChangeSelection
 * @property {import('./review-graph.js').LogicalTrackedChange} change
 * @property {'full'|'partial'} coverage `full` resolves whole logical change.
 * @property {Array<{ from: number, to: number }>} ranges Concrete PM ranges to resolve.
 */

const resolveTargetToSelections = ({ graph, normalized }) => {
  if (normalized.kind === 'all') {
    /** @type {ChangeSelection[]} */
    const sel = [];
    for (const change of graph.changes.values()) {
      sel.push({ change, coverage: 'full', ranges: change.segments.map((s) => ({ from: s.from, to: s.to })) });
    }
    // Document-order sort to make the apply pass deterministic and to keep
    // reverse-order step application stable.
    sel.sort((a, b) => firstFrom(a) - firstFrom(b));
    return { ok: true, selections: sel };
  }
  if (normalized.kind === 'id') {
    const change = graph.changes.get(normalized.id);
    if (!change)
      return { ok: false, failure: failure('TARGET_NOT_FOUND', `no tracked change with id "${normalized.id}".`) };
    return {
      ok: true,
      selections: [
        {
          change,
          coverage: 'full',
          ranges: change.segments.map((s) => ({ from: s.from, to: s.to })),
        },
      ],
    };
  }
  // range
  const { from, to } = normalized;
  /** @type {Map<string, ChangeSelection>} */
  const byId = new Map();
  for (const segment of graph.segments) {
    const overlapFrom = Math.max(segment.from, from);
    const overlapTo = Math.min(segment.to, to);
    if (overlapFrom >= overlapTo) {
      // collapsed cursor inside a segment also counts as "select whole change"
      // per phase0-004 "Range Decisions": collapsed range inside a change
      // resolves the whole logical change.
      if (from === to && segment.from <= from && segment.to > from) {
        const change = graph.changes.get(segment.changeId);
        if (!change) continue;
        const existing = byId.get(change.id);
        if (existing) {
          existing.coverage = 'full';
          existing.ranges = change.segments.map((s) => ({ from: s.from, to: s.to }));
        } else {
          byId.set(change.id, {
            change,
            coverage: 'full',
            ranges: change.segments.map((s) => ({ from: s.from, to: s.to })),
          });
        }
      }
      continue;
    }
    const change = graph.changes.get(segment.changeId);
    if (!change) continue;
    const existing = byId.get(change.id);
    if (existing) {
      existing.ranges.push({ from: overlapFrom, to: overlapTo });
      // Promote to full if the union covers all segments of the change.
      if (rangesCoverChange(existing.ranges, change)) {
        existing.coverage = 'full';
        existing.ranges = change.segments.map((s) => ({ from: s.from, to: s.to }));
      } else {
        existing.coverage = 'partial';
      }
      continue;
    }
    const isFull =
      segment.from >= from && segment.to <= to && change.segments.every((s) => s.from >= from && s.to <= to);
    byId.set(change.id, {
      change,
      coverage: isFull ? 'full' : 'partial',
      ranges: [{ from: overlapFrom, to: overlapTo }],
    });
  }
  // Sort selections by first PM position so apply order is deterministic.
  const sel = Array.from(byId.values()).sort((a, b) => firstFrom(a) - firstFrom(b));
  return { ok: true, selections: sel };
};

const firstFrom = (selection) => selection.ranges[0]?.from ?? 0;

const rangesCoverChange = (ranges, change) => {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  // Merge into max envelope ranges
  /** @type {Array<{from:number,to:number}>} */
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) {
      last.to = Math.max(last.to, r.to);
    } else {
      merged.push({ from: r.from, to: r.to });
    }
  }
  return change.segments.every((seg) => merged.some((r) => r.from <= seg.from && r.to >= seg.to));
};

// ---------------------------------------------------------------------------
// Permission preflight
// ---------------------------------------------------------------------------

const runPermissionPreflight = ({ editor, decision, selections }) => {
  const resolver = editor?.options?.permissionResolver;
  if (typeof resolver !== 'function') return { ok: true };

  const role = editor.options?.role ?? 'editor';
  const isInternal = Boolean(editor.options?.isInternal);
  const currentIdentity = getCurrentUserIdentity(editor);

  for (const selection of selections) {
    const change = selection.change;
    const classification = classifyOwnership({
      currentUser: currentIdentity,
      change: getChangeAuthorIdentity({
        author: change.author,
        authorId: change.authorId,
        authorEmail: change.authorEmail,
        importedAuthor: change.importedAuthor,
      }),
    });
    const isOwn = isSameUserHighConfidence(classification);
    const permission =
      decision === 'accept' ? (isOwn ? 'RESOLVE_OWN' : 'RESOLVE_OTHER') : isOwn ? 'REJECT_OWN' : 'REJECT_OTHER';

    const allowed = resolver({
      permission,
      role,
      isInternal,
      trackedChange: {
        id: change.id,
        type: change.type,
        attrs: { author: change.author, authorId: change.authorId, authorEmail: change.authorEmail, date: change.date },
        from: selection.ranges[0]?.from ?? 0,
        to: selection.ranges[selection.ranges.length - 1]?.to ?? 0,
        segments: change.segments.map((s) => ({ from: s.from, to: s.to })),
        commentId: change.id,
      },
      comment: null,
    });
    if (allowed === false) {
      return {
        ok: false,
        failure: failure('PERMISSION_DENIED', `permission denied for ${decision} of change "${change.id}".`, {
          details: { changeId: change.id, permission },
        }),
      };
    }
  }
  return { ok: true };
};

// ---------------------------------------------------------------------------
// Mutation plan
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} MutationOp
 * @property {'removeContent'|'removeMark'|'addMark'|'unwrapInsert'|'restoreFormat'|'removeFormat'} kind
 * @property {number} from
 * @property {number} to
 * @property {string} [changeId]
 * @property {string} [side]
 * @property {import('prosemirror-model').Mark} [mark]
 * @property {Array<unknown>} [beforeMarks]
 * @property {Array<unknown>} [afterMarks]
 */

/**
 * @typedef {Object} MutationPlan
 * @property {MutationOp[]} ops Document-order op list.
 * @property {import('./comment-effects.js').CommentEffectsPlan & { _affectedChildren?: Array<{ changeId: string }> }} commentEffects
 * @property {Set<string>} touchedChangeIds Logical ids retired/updated by the decision.
 * @property {Set<string>} retiredChangeIds Logical ids retired by the decision (subset).
 * @property {DecisionDiagnostic[]} diagnostics
 */

const buildMutationPlan = ({ state, graph, selections, decision, replacements }) => {
  /** @type {MutationOp[]} */
  const ops = [];
  /** @type {Array<{ from: number, to: number, cause: string }>} */
  const removedRanges = [];
  /** @type {Array<{ from: number, to: number, cause: string }>} */
  const resolvedRanges = [];
  /** @type {Set<string>} */
  const touched = new Set();
  /** @type {Set<string>} */
  const retired = new Set();
  /** @type {DecisionDiagnostic[]} */
  const diagnostics = [];

  for (const selection of selections) {
    const { change } = selection;
    const isFull = selection.coverage === 'full';
    if (!isFull) {
      if (change.type === CanonicalChangeType.Replacement) {
        return {
          ok: false,
          failure: failure(
            'CAPABILITY_UNAVAILABLE',
            'partial-range replacement decisions are not yet fixture-backed.',
            {
              details: { changeId: change.id },
            },
          ),
        };
      }
      if (change.type === CanonicalChangeType.Formatting) {
        return {
          ok: false,
          failure: failure('CAPABILITY_UNAVAILABLE', 'partial-range formatting decisions are not yet fixture-backed.', {
            details: { changeId: change.id },
          }),
        };
      }
    }
    touched.add(change.id);
    if (isFull) {
      for (const segment of change.segments) {
        resolvedRanges.push({
          from: segment.from,
          to: segment.to,
          cause: `${decision}:${change.id}`,
        });
      }
    }

    if (!isFull && (change.type === CanonicalChangeType.Insertion || change.type === CanonicalChangeType.Deletion)) {
      const partialResult = planPartialTextDecision({
        ops,
        change,
        selection,
        decision,
        removedRanges,
        retired,
      });
      if (!partialResult.ok) return { ok: false, failure: partialResult.failure };
      for (const id of partialResult.createdChangeIds) touched.add(id);
    } else if (change.type === CanonicalChangeType.Insertion) {
      planInsertionDecision({ ops, change, selection, decision, removedRanges, retired });
    } else if (change.type === CanonicalChangeType.Deletion) {
      planDeletionDecision({ ops, change, selection, decision, removedRanges, retired });
    } else if (change.type === CanonicalChangeType.Replacement) {
      const repResult = planReplacementDecision({ ops, change, decision, removedRanges, retired });
      if (!repResult.ok) return { ok: false, failure: repResult.failure };
    } else if (change.type === CanonicalChangeType.Formatting) {
      planFormattingDecision({ ops, change, decision, retired });
    } else {
      return {
        ok: false,
        failure: failure(
          'CAPABILITY_UNAVAILABLE',
          `unsupported change type "${change.type}" for change "${change.id}".`,
        ),
      };
    }
  }

  if (!ops.length) {
    return {
      ok: false,
      failure: failure('NO_OP', 'decision target produced no operations.', {
        details: { selections: selections.map((s) => s.change.id) },
      }),
    };
  }

  // Identify child changes wholly inside removed ranges and mark them as
  // retired side effects. Per phase0-004 "Parent/Child Decision Rules":
  // accepting/rejecting a parent insertion retires children inside removed
  // content; accepting a parent deletion retires children wholly inside the
  // removed content; rejecting a parent deletion removes child insertions
  // that were meaningful only inside it.
  /** @type {Array<{ changeId: string }>} */
  const affectedChildren = [];
  for (const change of graph.changes.values()) {
    if (touched.has(change.id)) continue;
    if (!change.parent) continue;
    if (!retired.has(change.parent) && !touched.has(change.parent)) continue;
    const inside = change.segments.every((seg) => removedRanges.some((r) => r.from <= seg.from && r.to >= seg.to));
    if (inside) {
      retired.add(change.id);
      touched.add(change.id);
      affectedChildren.push({ changeId: change.id });
    }
  }

  const commentEffects = planCommentEffects({ doc: state.doc, removedRanges, resolvedRanges });

  // Convert comment node deletions into removeContent ops so apply respects
  // the same reverse-order pass. Removing the anchor nodes from inside
  // already-removed coverage is harmless (PM clips); explicitly listing them
  // makes shrink+keep cases idempotent.
  for (const del of commentEffects.nodeDeletes) {
    ops.push({ kind: 'removeContent', from: del.from, to: del.to });
  }

  /** @type {MutationPlan} */
  const plan = {
    ops,
    commentEffects: { ...commentEffects, _affectedChildren: affectedChildren },
    touchedChangeIds: touched,
    retiredChangeIds: retired,
    diagnostics,
  };
  return { ok: true, plan };
};

const planInsertionDecision = ({ ops, change, selection, decision, removedRanges, retired }) => {
  const isFull = selection.coverage === 'full';
  if (decision === 'accept') {
    // Accept insertion: keep content, remove the trackInsert mark.
    const ranges = isFull ? change.insertedSegments.map((s) => ({ from: s.from, to: s.to })) : selection.ranges;
    for (const range of ranges) {
      pushRemoveMarkOpsForRange({
        ops,
        segments: change.insertedSegments,
        range,
        changeId: change.id,
        side: SegmentSide.Inserted,
      });
    }
    if (isFull) retired.add(change.id);
    return;
  }
  // Reject insertion: remove inserted content.
  const ranges = isFull ? change.insertedSegments.map((s) => ({ from: s.from, to: s.to })) : selection.ranges;
  for (const range of ranges) {
    ops.push({
      kind: 'removeContent',
      from: range.from,
      to: range.to,
      changeId: change.id,
      side: SegmentSide.Inserted,
    });
    removedRanges.push({ from: range.from, to: range.to, cause: `reject-insertion:${change.id}` });
  }
  if (isFull) retired.add(change.id);
};

const planDeletionDecision = ({ ops, change, selection, decision, removedRanges, retired }) => {
  const isFull = selection.coverage === 'full';
  if (decision === 'accept') {
    // Accept deletion: remove tracked-deleted content permanently.
    const ranges = isFull ? change.deletedSegments.map((s) => ({ from: s.from, to: s.to })) : selection.ranges;
    for (const range of ranges) {
      ops.push({
        kind: 'removeContent',
        from: range.from,
        to: range.to,
        changeId: change.id,
        side: SegmentSide.Deleted,
      });
      removedRanges.push({ from: range.from, to: range.to, cause: `accept-deletion:${change.id}` });
    }
    if (isFull) retired.add(change.id);
    return;
  }
  // Reject deletion: remove the trackDelete mark; content stays as live.
  const ranges = isFull ? change.deletedSegments.map((s) => ({ from: s.from, to: s.to })) : selection.ranges;
  for (const range of ranges) {
    pushRemoveMarkOpsForRange({
      ops,
      segments: change.deletedSegments,
      range,
      changeId: change.id,
      side: SegmentSide.Deleted,
    });
  }
  if (isFull) retired.add(change.id);
};

const planReplacementDecision = ({ ops, change, decision, removedRanges, retired }) => {
  const inserted = change.insertedSegments;
  const deleted = change.deletedSegments;
  if (!inserted.length || !deleted.length) {
    return {
      ok: false,
      failure: failure('PRECONDITION_FAILED', `replacement "${change.id}" missing inserted or deleted side.`),
    };
  }
  if (decision === 'accept') {
    for (const seg of deleted) {
      ops.push({ kind: 'removeContent', from: seg.from, to: seg.to, changeId: change.id, side: SegmentSide.Deleted });
      removedRanges.push({ from: seg.from, to: seg.to, cause: `accept-replacement-deleted:${change.id}` });
    }
    for (const seg of inserted) {
      pushRemoveMarkOpsForSegment({
        ops,
        segment: seg,
        changeId: change.id,
        side: SegmentSide.Inserted,
      });
    }
  } else {
    // Reject replacement: remove inserted side, restore deleted side as live.
    for (const seg of inserted) {
      ops.push({ kind: 'removeContent', from: seg.from, to: seg.to, changeId: change.id, side: SegmentSide.Inserted });
      removedRanges.push({ from: seg.from, to: seg.to, cause: `reject-replacement-inserted:${change.id}` });
    }
    for (const seg of deleted) {
      pushRemoveMarkOpsForSegment({
        ops,
        segment: seg,
        changeId: change.id,
        side: SegmentSide.Deleted,
      });
    }
  }
  retired.add(change.id);
  return { ok: true };
};

const planFormattingDecision = ({ ops, change, decision, retired }) => {
  for (const seg of change.formattingSegments) {
    if (decision === 'accept') {
      pushRemoveMarkOpsForSegment({
        ops,
        segment: seg,
        changeId: change.id,
        side: SegmentSide.Formatting,
      });
    } else {
      for (const run of getSegmentMarkRuns(seg)) {
        ops.push({
          kind: 'restoreFormat',
          from: run.from,
          to: run.to,
          changeId: change.id,
          side: SegmentSide.Formatting,
          mark: run.mark,
          beforeMarks: run.mark.attrs?.before ?? [],
          afterMarks: run.mark.attrs?.after ?? [],
        });
      }
    }
  }
  retired.add(change.id);
};

const planPartialTextDecision = ({ ops, change, selection, decision, removedRanges, retired }) => {
  const side = change.type === CanonicalChangeType.Insertion ? SegmentSide.Inserted : SegmentSide.Deleted;
  const segments = side === SegmentSide.Inserted ? change.insertedSegments : change.deletedSegments;
  if (!segments.length) {
    return { ok: false, failure: failure('PRECONDITION_FAILED', `change "${change.id}" has no ${side} segments.`) };
  }

  const selectedRanges = mergeRanges(selection.ranges);
  const successorRanges = [];
  let logicalOffset = 0;
  let successorOrdinal = 0;

  for (const segment of segments) {
    pushRemoveMarkOpsForSegment({
      ops,
      segment,
      changeId: change.id,
      side,
    });

    const pieces = subtractRanges({ from: segment.from, to: segment.to }, selectedRanges);
    for (const piece of pieces) {
      const offsetStart = logicalOffset + (piece.from - segment.from);
      const offsetEnd = logicalOffset + (piece.to - segment.from);
      const successorId = deterministicSuccessorId({
        sourceId: change.id,
        revisionGroupId: segment.attrs?.revisionGroupId || change.revisionGroupId || change.id,
        side,
        offsetStart,
        offsetEnd,
        decision,
        ordinal: successorOrdinal,
      });
      successorOrdinal += 1;
      const successorMark = segment.mark.type.create({
        ...segment.mark.attrs,
        id: successorId,
        splitFromId: change.id,
        revisionGroupId: segment.attrs?.revisionGroupId || change.revisionGroupId || change.id,
      });
      ops.push({ kind: 'addMark', from: piece.from, to: piece.to, changeId: successorId, side, mark: successorMark });
      successorRanges.push({ id: successorId, from: piece.from, to: piece.to });
    }
    logicalOffset += segment.to - segment.from;
  }

  for (const range of selectedRanges) {
    if (change.type === CanonicalChangeType.Insertion && decision === 'reject') {
      ops.push({ kind: 'removeContent', from: range.from, to: range.to, changeId: change.id, side });
      removedRanges.push({ from: range.from, to: range.to, cause: `partial-reject-insertion:${change.id}` });
    } else if (change.type === CanonicalChangeType.Deletion && decision === 'accept') {
      ops.push({ kind: 'removeContent', from: range.from, to: range.to, changeId: change.id, side });
      removedRanges.push({ from: range.from, to: range.to, cause: `partial-accept-deletion:${change.id}` });
    }
  }

  retired.add(change.id);
  return { ok: true, createdChangeIds: successorRanges.map((entry) => entry.id) };
};

const pushRemoveMarkOpsForRange = ({ ops, segments, range, changeId, side }) => {
  for (const segment of segments) {
    if (segment.to <= range.from || segment.from >= range.to) continue;
    pushRemoveMarkOpsForSegment({
      ops,
      segment,
      changeId,
      side,
      from: Math.max(segment.from, range.from),
      to: Math.min(segment.to, range.to),
    });
  }
};

const pushRemoveMarkOpsForSegment = ({ ops, segment, changeId, side, from = segment.from, to = segment.to }) => {
  for (const run of getSegmentMarkRuns(segment)) {
    const clippedFrom = Math.max(from, run.from);
    const clippedTo = Math.min(to, run.to);
    if (clippedFrom >= clippedTo) continue;
    ops.push({
      kind: 'removeMark',
      from: clippedFrom,
      to: clippedTo,
      changeId,
      side,
      mark: run.mark,
    });
  }
};

const getSegmentMarkRuns = (segment) => {
  return segment.markRuns?.length ? segment.markRuns : [{ from: segment.from, to: segment.to, mark: segment.mark }];
};

const mergeRanges = (ranges) => {
  const sorted = ranges
    .filter((range) => range.from < range.to)
    .map((range) => ({ from: range.from, to: range.to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push(range);
    }
  }
  return merged;
};

const subtractRanges = (range, removals) => {
  let pieces = [range];
  for (const removal of removals) {
    const next = [];
    for (const piece of pieces) {
      if (removal.to <= piece.from || removal.from >= piece.to) {
        next.push(piece);
        continue;
      }
      if (removal.from > piece.from) next.push({ from: piece.from, to: Math.min(removal.from, piece.to) });
      if (removal.to < piece.to) next.push({ from: Math.max(removal.to, piece.from), to: piece.to });
    }
    pieces = next;
  }
  return pieces.filter((piece) => piece.from < piece.to);
};

const deterministicSuccessorId = ({ sourceId, revisionGroupId, side, offsetStart, offsetEnd, decision, ordinal }) => {
  const input = `${sourceId}|${revisionGroupId}|${side}|${offsetStart}|${offsetEnd}|${decision}|${ordinal}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${sourceId}~${side}~${(hash >>> 0).toString(36)}`;
};

// ---------------------------------------------------------------------------
// Plan application
// ---------------------------------------------------------------------------

const applyPlan = ({ state, plan }) => {
  const tr = state.tr;
  tr.setMeta('inputType', 'acceptReject');

  // Mark mutations are position-stable and must run before content deletion:
  // partial decisions remove the source mark, add successor marks to surviving
  // text, then delete only the selected text when the decision semantics ask
  // for removal. Applying all ops in one reversed pass can make a broad source
  // mark removal erase freshly-added successor marks.
  const sortedOps = [...plan.ops].sort((a, b) => a.from - b.from || a.to - b.to);
  const markOps = sortedOps.filter((op) => op.kind !== 'removeContent');
  const contentOps = sortedOps.filter((op) => op.kind === 'removeContent').reverse();

  try {
    for (const op of markOps) {
      if (op.kind === 'removeMark' && op.mark) {
        tr.step(new RemoveMarkStep(op.from, op.to, op.mark));
        continue;
      }
      if (op.kind === 'addMark' && op.mark) {
        tr.step(new AddMarkStep(op.from, op.to, op.mark));
        continue;
      }
      if (op.kind === 'restoreFormat' && op.mark) {
        // Remove the "after" marks first so the restored "before" marks aren't
        // shadowed by overlap matching (mirrors legacy rejectTrackedChangesBetween).
        for (const afterSnapshot of op.afterMarks ?? []) {
          const liveMark = findMarkInRangeBySnapshot({
            doc: tr.doc,
            from: op.from,
            to: op.to,
            snapshot: afterSnapshot,
          });
          if (liveMark) {
            tr.step(new RemoveMarkStep(op.from, op.to, liveMark));
          }
        }
        for (const beforeSnapshot of op.beforeMarks ?? []) {
          const markType = state.schema.marks[beforeSnapshot.type];
          if (!markType) continue;
          tr.step(new AddMarkStep(op.from, op.to, markType.create(beforeSnapshot.attrs)));
        }
        tr.step(new RemoveMarkStep(op.from, op.to, op.mark));
        continue;
      }
    }
    for (const op of contentOps) {
      tr.step(new ReplaceStep(op.from, op.to, Slice.empty));
    }
  } catch (error) {
    return {
      ok: false,
      failure: failure(
        'PRECONDITION_FAILED',
        /** @type {Error} */ (error).message ?? 'failed to apply mutation plan.',
        {
          details: { error: String(error) },
        },
      ),
    };
  }

  // Tracked-change plugin meta — preserve compatibility with the comments
  // plugin which listens for tracked-change resolution to update bubbles.
  tr.setMeta(TrackChangesBasePluginKey, {
    insertedMark: null,
    deletionMark: null,
    deletionNodes: [],
    step: null,
    emitCommentEvent: true,
    decisionTouchedChangeIds: Array.from(plan.touchedChangeIds),
    decisionRetiredChangeIds: Array.from(plan.retiredChangeIds),
  });
  tr.setMeta(CommentsPluginKey, { type: 'force' });
  tr.setMeta('skipTrackChanges', true);

  return {
    ok: true,
    tr,
    touchedChangeIds: plan.touchedChangeIds,
    receipt: buildReceipt({ plan }),
  };
};

const buildReceipt = ({ plan }) => {
  /** @type {DecisionReceiptEntities} */
  const receipt = {
    createdChangeIds: collectCreatedChangeIds(plan),
    updatedChangeIds: [],
    removedChangeIds: Array.from(plan.retiredChangeIds).map((id) => ({ id, cause: 'decision' })),
    deletedComments: plan.commentEffects.entityDeletes,
    detachedComments: plan.commentEffects.entityDetaches,
    shrunkenComments: plan.commentEffects.entityShrinks.map(({ id, cause }) => ({ id, cause })),
    affectedChildren: plan.commentEffects._affectedChildren ?? [],
  };
  return receipt;
};

const collectCreatedChangeIds = (plan) => {
  const ids = new Set();
  for (const op of plan.ops) {
    if (op.kind === 'addMark' && op.changeId) ids.add(op.changeId);
  }
  return Array.from(ids);
};

// ---------------------------------------------------------------------------
// Bubble lifecycle support
// ---------------------------------------------------------------------------

/**
 * Build the bubble lifecycle payload from a successful decision result. The
 * caller (acceptTrackedChangesBetween wrapper) emits this through the editor
 * once the transaction dispatches so consumers update from decision data,
 * not from re-scanning marks after dispatch.
 *
 * @param {Object} input
 * @param {DecisionResult} input.result
 * @param {object} input.editor
 * @returns {Array<{ type: 'trackedChange', event: 'resolve'|'update', changeId: string, resolvedById?: string, resolvedByEmail?: string, resolvedByName?: string }>}
 */
export const buildDecisionBubbleEvents = ({ result, editor }) => {
  const resolvedById = editor?.options?.user?.id;
  const resolvedByEmail = editor?.options?.user?.email;
  const resolvedByName = editor?.options?.user?.name;
  /** @type {Array<{ type: 'trackedChange', event: 'resolve'|'update', changeId: string, resolvedById?: string, resolvedByEmail?: string, resolvedByName?: string }>} */
  const events = [];
  for (const entry of result.receipt.removedChangeIds) {
    events.push({
      type: 'trackedChange',
      event: 'resolve',
      changeId: entry.id,
      resolvedById,
      resolvedByEmail,
      resolvedByName,
    });
  }
  for (const child of result.receipt.affectedChildren) {
    events.push({
      type: 'trackedChange',
      event: 'resolve',
      changeId: child.changeId,
      resolvedById,
      resolvedByEmail,
      resolvedByName,
    });
  }
  return events;
};

export { TRACKED_MARK_NAMES };
