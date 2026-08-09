import type { HistoryState, HistoryActionResult } from './history.types.js';

/**
 * Engine-specific adapter for history operations.
 */
export interface HistoryAdapter {
  get(): HistoryState;
  undo(): HistoryActionResult;
  redo(): HistoryActionResult;
}

/**
 * Public API shape for the history namespace on DocumentApi.
 */
export interface HistoryApi {
  get(): HistoryState;
  undo(): HistoryActionResult;
  redo(): HistoryActionResult;
}

/**
 * Reads undo/redo history state from the underlying adapter.
 *
 * @param adapter - Engine-specific history adapter.
 * @returns Current history state snapshot.
 */
export function executeHistoryGet(adapter: HistoryAdapter): HistoryState {
  return adapter.get();
}

/**
 * Executes an undo action via the underlying adapter.
 *
 * @param adapter - Engine-specific history adapter.
 * @returns Undo action result with noop + revision metadata.
 */
export function executeHistoryUndo(adapter: HistoryAdapter): HistoryActionResult {
  return adapter.undo();
}

/**
 * Executes a redo action via the underlying adapter.
 *
 * @param adapter - Engine-specific history adapter.
 * @returns Redo action result with noop + revision metadata.
 */
export function executeHistoryRedo(adapter: HistoryAdapter): HistoryActionResult {
  return adapter.redo();
}
