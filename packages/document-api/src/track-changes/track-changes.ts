import type { Receipt, TrackChangeInfo, TrackChangesListQuery, TrackChangesListResult } from '../types/index.js';
import type { StoryLocator } from '../types/story.types.js';
import type { TextTarget } from '../types/address.js';
import type { RevisionGuardOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import { validateStoryLocator } from '../validation/story-validator.js';

export type TrackChangesListInput = TrackChangesListQuery;

export interface TrackChangesGetInput {
  id: string;
  /** Story containing the tracked change. Omit for body (backward compatible). */
  story?: StoryLocator;
}

export interface TrackChangesAcceptInput {
  id: string;
  /** Story containing the tracked change. Omit for body (backward compatible). */
  story?: StoryLocator;
}

export interface TrackChangesRejectInput {
  id: string;
  /** Story containing the tracked change. Omit for body (backward compatible). */
  story?: StoryLocator;
}

export interface TrackChangesAcceptAllInput {
  /**
   * Optional explicit bulk filter. Omit or pass `'all'` to operate across
   * every revision-capable story; pass a StoryLocator to scope the decision
   * to one story.
   */
  story?: StoryLocator | 'all';
}

export interface TrackChangesRejectAllInput {
  /**
   * Optional explicit bulk filter. Omit or pass `'all'` to operate across
   * every revision-capable story; pass a StoryLocator to scope the decision
   * to one story.
   */
  story?: StoryLocator | 'all';
}

/**
 * Range target for partial-range decisions.
 *
 * `range` is a canonical {@link TextTarget}; the engine resolves the
 * selected overlap with each affected logical tracked change and applies
 * the {@link https://www.w3.org/TR/selection-api/ selection-style} partial
 * resolution rules from the tracked-changes spec § 9.
 */
export interface TrackChangesRangeInput {
  range: TextTarget;
  /** Story containing the range. Omit for body (backward compatible). */
  story?: StoryLocator;
}

// ---------------------------------------------------------------------------
// trackChanges.decide: consolidated accept/reject operation
// ---------------------------------------------------------------------------

/**
 * Public decide target surface:
 * - `{ id, story? }` for a single logical tracked change
 * - `{ kind: 'range', range, story? }` for partial-range decisions
 * - `{ scope: 'all', story? }` for bulk decisions, optionally filtered by story
 *
 * The executor also accepts internal legacy aliases (`kind: 'id'` /
 * `kind: 'all'`) so JS-only callers keep working during the migration.
 */
export type ReviewDecisionTarget =
  | { id: string; story?: StoryLocator }
  | { kind: 'range'; range: TextTarget; story?: StoryLocator; part?: string }
  | { scope: 'all'; story?: StoryLocator | 'all' };

export type ReviewDecideInput =
  | { decision: 'accept'; target: ReviewDecisionTarget }
  | { decision: 'reject'; target: ReviewDecisionTarget };

export interface TrackChangesAdapter {
  /** List tracked changes matching the given query. */
  list(input?: TrackChangesListInput): TrackChangesListResult;
  /** Retrieve full information for a single tracked change. */
  get(input: TrackChangesGetInput): TrackChangeInfo;
  /** Accept a tracked change, applying it to the document. */
  accept(input: TrackChangesAcceptInput, options?: RevisionGuardOptions): Receipt;
  /** Reject a tracked change, reverting it from the document. */
  reject(input: TrackChangesRejectInput, options?: RevisionGuardOptions): Receipt;
  /** Accept all tracked changes matching the requested bulk filter. */
  acceptAll(input: TrackChangesAcceptAllInput, options?: RevisionGuardOptions): Receipt;
  /** Reject all tracked changes matching the requested bulk filter. */
  rejectAll(input: TrackChangesRejectAllInput, options?: RevisionGuardOptions): Receipt;
  /**
   * Accept or reject a tracked-change selection range. Adapters
   * that have not been updated to handle `kind: 'range'` may return a
   * `CAPABILITY_UNAVAILABLE` failure receipt; the document-api executor
   * surfaces that to callers without falling back to the legacy id/all
   * paths because their semantics are not equivalent.
   */
  decideRange?(
    input: { decision: 'accept' | 'reject' } & TrackChangesRangeInput,
    options?: RevisionGuardOptions,
  ): Receipt;
}

/** Public surface for trackChanges on DocumentApi. */
export interface TrackChangesApi {
  list(input?: TrackChangesListInput): TrackChangesListResult;
  get(input: TrackChangesGetInput): TrackChangeInfo;
  decide(input: ReviewDecideInput, options?: RevisionGuardOptions): Receipt;
}

/**
 * Execute wrappers below are the canonical interception point for input
 * normalization and validation before delegating to the adapter.
 */
export function executeTrackChangesList(
  adapter: TrackChangesAdapter,
  input?: TrackChangesListInput,
): TrackChangesListResult {
  return adapter.list(input);
}

export function executeTrackChangesGet(adapter: TrackChangesAdapter, input: TrackChangesGetInput): TrackChangeInfo {
  const raw = input as unknown;
  if (typeof raw !== 'object' || raw == null) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'trackChanges.get input must be a non-null object.', {
      value: raw,
    });
  }
  const { id } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'trackChanges.get id must be a non-empty string.', {
      field: 'id',
      value: id,
    });
  }
  return adapter.get(input);
}

/**
 * Executes the consolidated `trackChanges.decide` operation by routing to the
 * appropriate adapter method based on the discriminated input.
 *
 * Accepting/rejecting changes is a resolution action, not a content mutation -
 * changeMode and dryRun are not applicable, so this accepts
 * {@link RevisionGuardOptions} rather than `MutationOptions`.
 */
export function executeTrackChangesDecide(
  adapter: TrackChangesAdapter,
  rawInput: ReviewDecideInput,
  options?: RevisionGuardOptions,
): Receipt {
  // Dynamic invoke callers may pass arbitrary values: validate before narrowing.
  const raw = rawInput as unknown;

  if (typeof raw !== 'object' || raw == null) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'trackChanges.decide input must be a non-null object.', {
      value: raw,
    });
  }

  const input = raw as Record<string, unknown>;

  if (input.decision !== 'accept' && input.decision !== 'reject') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `trackChanges.decide decision must be "accept" or "reject", got "${String(input.decision)}".`,
      { field: 'decision', value: input.decision },
    );
  }

  if (typeof input.target !== 'object' || input.target == null) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'trackChanges.decide target must be an object with { id }, { kind: "range", range }, or { scope: "all" }.',
      { field: 'target', value: input.target },
    );
  }

  const target = input.target as Record<string, unknown>;
  const decision = input.decision as 'accept' | 'reject';
  const rawStory = target.story;

  if (rawStory !== undefined && rawStory !== 'all') {
    validateStoryLocator(rawStory, 'target.story');
  }

  const story = rawStory as StoryLocator | undefined;
  const bulkStory = rawStory as StoryLocator | 'all' | undefined;

  if ((target.scope === 'all' || target.kind === 'all') && (target.id !== undefined || target.kind === 'id')) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'trackChanges.decide target must specify exactly one of { id }, { kind: "range", range }, or { scope: "all" }.',
      { field: 'target', value: input.target },
    );
  }

  if (target.kind === 'range') {
    if (target.id !== undefined || target.scope !== undefined) {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        'trackChanges.decide range targets must not include id or scope fields.',
        { field: 'target', value: input.target },
      );
    }
    if (rawStory === 'all') {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        'trackChanges.decide range targets do not support story: "all".',
        { field: 'target.story', value: rawStory },
      );
    }
    if (typeof adapter.decideRange !== 'function') {
      return {
        success: false,
        failure: {
          code: 'CAPABILITY_UNAVAILABLE',
          message: 'trackChanges.decide range targets are not supported by the active adapter.',
          details: { target: input.target },
        },
      };
    }
    const range = target.range as TextTarget;
    if (
      !range ||
      typeof range !== 'object' ||
      range.kind !== 'text' ||
      !Array.isArray(range.segments) ||
      range.segments.length === 0
    ) {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        'trackChanges.decide target.kind = "range" requires a non-empty TextTarget range.',
        { field: 'target.range', value: target.range },
      );
    }
    return adapter.decideRange({ decision, range, ...(story ? { story } : {}) }, options);
  }

  if (target.scope === 'all' || target.kind === 'all') {
    if (decision === 'accept') {
      return adapter.acceptAll({ ...(bulkStory ? { story: bulkStory } : {}) }, options);
    }
    return adapter.rejectAll({ ...(bulkStory ? { story: bulkStory } : {}) }, options);
  }

  if (target.kind === 'id' || target.id !== undefined) {
    if (rawStory === 'all') {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        'trackChanges.decide id targets do not support story: "all".',
        { field: 'target.story', value: rawStory },
      );
    }
    if (typeof target.id !== 'string' || target.id.length === 0) {
      throw new DocumentApiValidationError('INVALID_TARGET', 'trackChanges.decide id targets require a non-empty id.', {
        field: 'target',
        value: input.target,
      });
    }
    if (decision === 'accept') return adapter.accept({ id: target.id, ...(story ? { story } : {}) }, options);
    return adapter.reject({ id: target.id, ...(story ? { story } : {}) }, options);
  }

  throw new DocumentApiValidationError(
    'INVALID_TARGET',
    'trackChanges.decide target must have { id }, { kind: "range", range }, or { scope: "all" }.',
    { field: 'target', value: input.target },
  );
}
