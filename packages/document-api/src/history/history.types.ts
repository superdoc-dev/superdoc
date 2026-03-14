import type { OperationId } from '../contract/types.js';

/**
 * Snapshot of the editor's undo/redo history state.
 */
export interface HistoryState {
  /** Number of undo steps available. */
  undoDepth: number;
  /** Number of redo steps available. */
  redoDepth: number;
  /** Whether undo is possible (shorthand for undoDepth > 0). */
  canUndo: boolean;
  /** Whether redo is possible (shorthand for redoDepth > 0). */
  canRedo: boolean;
  /**
   * Operation IDs that bypass PM history (out-of-band mutations).
   * Their effects cannot be undone via history.undo.
   */
  historyUnsafeOperations: readonly OperationId[];
}

/** Machine-readable reason for a history no-op. */
export type HistoryNoopReason = 'EMPTY_UNDO_STACK' | 'EMPTY_REDO_STACK' | 'NO_EFFECT';

/**
 * Result of a history.undo or history.redo action.
 * Mirrors PlanReceipt's revision shape for consistency.
 */
export interface HistoryActionResult {
  /** True if the action had no effect (empty stack). */
  noop: boolean;
  /** Machine-readable reason when noop is true. */
  reason?: HistoryNoopReason;
  /** Revision bookends matching PlanReceipt.revision shape. */
  revision: {
    before: string;
    after: string;
  };
}
