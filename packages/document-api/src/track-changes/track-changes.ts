import type { Receipt, TrackChangeInfo, TrackChangesListQuery, TrackChangesListResult } from '../types/index.js';
import type { RevisionGuardOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';

export type TrackChangesListInput = TrackChangesListQuery;

export interface TrackChangesGetInput {
  id: string;
}

export interface TrackChangesAcceptInput {
  id: string;
}

export interface TrackChangesRejectInput {
  id: string;
}

export type TrackChangesAcceptAllInput = Record<string, never>;

export type TrackChangesRejectAllInput = Record<string, never>;

// ---------------------------------------------------------------------------
// trackChanges.decide — consolidated accept/reject operation
// ---------------------------------------------------------------------------

export type ReviewDecideInput =
  | { decision: 'accept'; target: { id: string } }
  | { decision: 'reject'; target: { id: string } }
  | { decision: 'accept'; target: { scope: 'all' } }
  | { decision: 'reject'; target: { scope: 'all' } };

export interface TrackChangesAdapter {
  /** List tracked changes matching the given query. */
  list(input?: TrackChangesListInput): TrackChangesListResult;
  /** Retrieve full information for a single tracked change. */
  get(input: TrackChangesGetInput): TrackChangeInfo;
  /** Accept a tracked change, applying it to the document. */
  accept(input: TrackChangesAcceptInput, options?: RevisionGuardOptions): Receipt;
  /** Reject a tracked change, reverting it from the document. */
  reject(input: TrackChangesRejectInput, options?: RevisionGuardOptions): Receipt;
  /** Accept all tracked changes in the document. */
  acceptAll(input: TrackChangesAcceptAllInput, options?: RevisionGuardOptions): Receipt;
  /** Reject all tracked changes in the document. */
  rejectAll(input: TrackChangesRejectAllInput, options?: RevisionGuardOptions): Receipt;
}

/** Public surface for trackChanges on DocumentApi. */
export interface TrackChangesApi {
  list(input?: TrackChangesListInput): TrackChangesListResult;
  get(input: TrackChangesGetInput): TrackChangeInfo;
  decide(input: ReviewDecideInput, options?: RevisionGuardOptions): Receipt;
}

/**
 * Execute wrappers below are the canonical interception point for input
 * normalization and validation. Query-only operations currently pass through
 * directly. Mutation operations will gain validation as the API matures.
 * Keep the wrappers to preserve this extension surface.
 */
export function executeTrackChangesList(
  adapter: TrackChangesAdapter,
  input?: TrackChangesListInput,
): TrackChangesListResult {
  return adapter.list(input);
}

export function executeTrackChangesGet(adapter: TrackChangesAdapter, input: TrackChangesGetInput): TrackChangeInfo {
  return adapter.get(input);
}

export function executeTrackChangesAccept(
  adapter: TrackChangesAdapter,
  input: TrackChangesAcceptInput,
  options?: RevisionGuardOptions,
): Receipt {
  return adapter.accept(input, options);
}

export function executeTrackChangesReject(
  adapter: TrackChangesAdapter,
  input: TrackChangesRejectInput,
  options?: RevisionGuardOptions,
): Receipt {
  return adapter.reject(input, options);
}

export function executeTrackChangesAcceptAll(
  adapter: TrackChangesAdapter,
  input: TrackChangesAcceptAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  return adapter.acceptAll(input, options);
}

export function executeTrackChangesRejectAll(
  adapter: TrackChangesAdapter,
  input: TrackChangesRejectAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  return adapter.rejectAll(input, options);
}

/**
 * Executes the consolidated `trackChanges.decide` operation by routing to the
 * appropriate adapter method based on the discriminated input.
 */
export function executeTrackChangesDecide(
  adapter: TrackChangesAdapter,
  rawInput: ReviewDecideInput,
  options?: RevisionGuardOptions,
): Receipt {
  // Dynamic invoke callers may pass arbitrary values — validate before narrowing.
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
      'trackChanges.decide target must be an object with { id: string } or { scope: "all" }.',
      { field: 'target', value: input.target },
    );
  }

  const target = input.target as Record<string, unknown>;
  const isAll = target.scope === 'all';

  if (!isAll) {
    if (typeof target.id !== 'string' || target.id.length === 0) {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        'trackChanges.decide target must have { id: string } or { scope: "all" }.',
        { field: 'target', value: input.target },
      );
    }
  }

  if (input.decision === 'accept') {
    if (isAll) return adapter.acceptAll({} as TrackChangesAcceptAllInput, options);
    return adapter.accept({ id: target.id as string }, options);
  }

  if (isAll) return adapter.rejectAll({} as TrackChangesRejectAllInput, options);
  return adapter.reject({ id: target.id as string }, options);
}
