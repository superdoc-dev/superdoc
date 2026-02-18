import type { Receipt, TrackChangeInfo, TrackChangesListQuery, TrackChangesListResult } from '../types/index.js';

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

export interface TrackChangesAdapter {
  /** List tracked changes matching the given query. */
  list(input?: TrackChangesListInput): TrackChangesListResult;
  /** Retrieve full information for a single tracked change. */
  get(input: TrackChangesGetInput): TrackChangeInfo;
  /** Accept a tracked change, applying it to the document. */
  accept(input: TrackChangesAcceptInput): Receipt;
  /** Reject a tracked change, reverting it from the document. */
  reject(input: TrackChangesRejectInput): Receipt;
  /** Accept all tracked changes in the document. */
  acceptAll(input: TrackChangesAcceptAllInput): Receipt;
  /** Reject all tracked changes in the document. */
  rejectAll(input: TrackChangesRejectAllInput): Receipt;
}

export type TrackChangesApi = TrackChangesAdapter;

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

export function executeTrackChangesAccept(adapter: TrackChangesAdapter, input: TrackChangesAcceptInput): Receipt {
  return adapter.accept(input);
}

export function executeTrackChangesReject(adapter: TrackChangesAdapter, input: TrackChangesRejectInput): Receipt {
  return adapter.reject(input);
}

export function executeTrackChangesAcceptAll(adapter: TrackChangesAdapter, input: TrackChangesAcceptAllInput): Receipt {
  return adapter.acceptAll(input);
}

export function executeTrackChangesRejectAll(adapter: TrackChangesAdapter, input: TrackChangesRejectAllInput): Receipt {
  return adapter.rejectAll(input);
}
