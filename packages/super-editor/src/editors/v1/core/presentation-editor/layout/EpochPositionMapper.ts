import type { Transaction } from 'prosemirror-state';
import type { StepMap } from 'prosemirror-transform';

/**
 * Represents a document version identifier.
 *
 * @remarks
 * Epochs are monotonically increasing integers. Each document-changing transaction
 * increments the epoch by one.
 */
export type Epoch = number;

/**
 * Reasons why position mapping might fail.
 *
 * - `invalid_epoch`: The fromEpoch or toEpoch is not a valid finite number, or fromEpoch > toEpoch
 * - `epoch_too_old`: The fromEpoch is older than the oldest retained epoch (exceeds maxEpochsToKeep)
 * - `missing_stepmap`: A StepMap for a required epoch is missing (should not happen in normal operation)
 * - `deleted`: The position was deleted by a transaction step
 * - `invalid_pos`: The position is not a valid finite non-negative number
 */
export type MapPosFailureReason = 'invalid_epoch' | 'epoch_too_old' | 'missing_stepmap' | 'deleted' | 'invalid_pos';

/**
 * Result of attempting to map a position from one epoch to another.
 *
 * @remarks
 * A discriminated union that either contains the successfully mapped position or
 * a failure reason explaining why mapping failed.
 */
export type MapPosResult =
  | { ok: true; pos: number; fromEpoch: Epoch; toEpoch: Epoch }
  | { ok: false; reason: MapPosFailureReason; fromEpoch: Epoch; toEpoch: Epoch };

/**
 * Maps ProseMirror positions from past document epochs to the current epoch.
 *
 * @remarks
 * This class solves a critical problem in the layout-selection architecture: the layout engine
 * paints asynchronously, so DOM elements are tagged with positions from a past document epoch.
 * When the user interacts with the DOM (clicks, drags), we need to map those historical positions
 * to the current document state.
 *
 * The mapper maintains a sliding window of ProseMirror StepMaps (transform metadata) for recent
 * transactions. It can then apply these steps in sequence to map positions forward through time.
 *
 * Key design decisions:
 * - Epochs are simple monotonically increasing integers (not timestamps)
 * - Only document-changing transactions increment the epoch (no-op transactions are ignored)
 * - StepMaps are pruned in two ways:
 *   1. By age (maxEpochsToKeep, default 100)
 *   2. By layout completion (epochs older than the last painted layout are discarded)
 * - Mapping can fail for several reasons (position deleted, epoch too old, etc.)
 *
 * Typical usage pattern:
 * 1. Call recordTransaction() for each document change
 * 2. Call onLayoutComplete() when a layout is painted (enables aggressive pruning)
 * 3. Call mapPosFromLayoutToCurrent() to map DOM positions to current document positions
 */
export class EpochPositionMapper {
  #currentEpoch: Epoch = 0;
  #mapsByFromEpoch = new Map<Epoch, StepMap[]>();
  readonly #maxEpochsToKeep: number;

  /**
   * Creates a new EpochPositionMapper.
   *
   * @param options - Configuration options
   * @param options.maxEpochsToKeep - Maximum number of epoch transitions to retain, defaults to 100
   *
   * @remarks
   * The maxEpochsToKeep value is clamped to a minimum of 1 and floored to an integer.
   * This creates a sliding window of history - epochs older than (currentEpoch - maxEpochsToKeep)
   * are automatically pruned.
   *
   * A value of 100 epochs is usually sufficient since:
   * - Layouts typically complete within a few frames
   * - Once a layout completes, even older epochs are pruned aggressively
   * - Mapping from very old epochs is usually a sign of a stale layout
   */
  constructor(options?: { maxEpochsToKeep?: number }) {
    const maxEpochsToKeep = options?.maxEpochsToKeep ?? 100;
    this.#maxEpochsToKeep = Math.max(1, Math.floor(maxEpochsToKeep));
  }

  /**
   * Gets the current document epoch.
   *
   * @returns The current epoch number
   *
   * @remarks
   * The epoch starts at 0 and increments by 1 for each document-changing transaction.
   * No-op transactions (tr.docChanged === false) do not increment the epoch.
   */
  getCurrentEpoch(): Epoch {
    return this.#currentEpoch;
  }

  /**
   * Records a transaction's StepMaps and advances the epoch if the document changed.
   *
   * @param tr - The ProseMirror transaction to record
   *
   * @remarks
   * If the transaction did not change the document (tr.docChanged === false), this method
   * returns early without recording anything or incrementing the epoch.
   *
   * For document-changing transactions:
   * 1. Extracts the array of StepMaps from tr.mapping.maps
   * 2. Associates these maps with the current epoch (the "from" epoch)
   * 3. Increments the current epoch (the "to" epoch for this transition)
   * 4. Prunes old epochs that exceed the retention window
   *
   * StepMaps capture how positions are transformed by each step in the transaction,
   * including deletions, insertions, and replacements.
   */
  recordTransaction(tr: Transaction): void {
    if (!tr.docChanged) {
      return;
    }

    const fromEpoch = this.#currentEpoch;
    const maps = Array.isArray(tr.mapping?.maps) ? (tr.mapping.maps as StepMap[]) : [];
    this.#mapsByFromEpoch.set(fromEpoch, maps);
    this.#currentEpoch = fromEpoch + 1;
    this.#pruneByCurrentEpoch();
  }

  /**
   * Notifies the mapper that a layout has completed, enabling aggressive pruning of old StepMaps.
   *
   * @param layoutEpoch - The document epoch that was just painted to the DOM
   *
   * @remarks
   * Once a layout is painted, we should never see DOM interactions (clicks, selections) from
   * older epochs, because the DOM represents the layoutEpoch state. Therefore, we can safely
   * discard StepMaps for epochs strictly older than layoutEpoch.
   *
   * This is more aggressive than the sliding window pruning and helps keep memory usage low
   * even if maxEpochsToKeep is large.
   *
   * Pruning steps:
   * 1. Deletes all StepMaps with fromEpoch < layoutEpoch
   * 2. Runs the standard sliding window pruning (based on currentEpoch - maxEpochsToKeep)
   *
   * Safe to call multiple times with the same or increasing layoutEpoch values.
   */
  onLayoutComplete(layoutEpoch: Epoch): void {
    // Once a layout is painted, we should never see DOM positions from older epochs.
    // Drop StepMaps for epochs strictly older than the last painted epoch.
    for (const epoch of this.#mapsByFromEpoch.keys()) {
      if (epoch < layoutEpoch) {
        this.#mapsByFromEpoch.delete(epoch);
      }
    }
    this.#pruneByCurrentEpoch();
  }

  /**
   * Maps a position from a layout epoch to the current document epoch (simple result).
   *
   * @param pos - The position in the layout epoch's coordinate space
   * @param fromEpoch - The epoch when the layout was created
   * @param assoc - Association direction for ambiguous positions (-1 for left, 1 for right), defaults to 1
   * @returns The mapped position in current document coordinates, or null if mapping failed
   *
   * @remarks
   * This is a convenience wrapper around mapPosFromLayoutToCurrentDetailed() that returns
   * only the position (or null) without failure reason details.
   *
   * Use this when you only care whether mapping succeeded or failed, not why it failed.
   * For detailed failure diagnostics, use mapPosFromLayoutToCurrentDetailed().
   *
   * See mapPosFromLayoutToCurrentDetailed() for full documentation of the mapping algorithm.
   */
  mapPosFromLayoutToCurrent(pos: number, fromEpoch: Epoch, assoc: number = 1): number | null {
    const result = this.mapPosFromLayoutToCurrentDetailed(pos, fromEpoch, assoc);
    return result.ok ? result.pos : null;
  }

  /**
   * Maps a position from a layout epoch to the current document epoch with detailed failure information.
   *
   * @param pos - The position in the layout epoch's coordinate space
   * @param fromEpoch - The epoch when the layout was created
   * @param assoc - Association direction for ambiguous positions (-1 for left, 1 for right), defaults to 1
   * @returns A detailed result indicating success with the mapped position, or failure with a reason
   *
   * @remarks
   * This method applies a sequence of ProseMirror StepMaps to transform a position from a past
   * epoch to the current document state. The algorithm:
   *
   * 1. Validates inputs (pos and fromEpoch must be valid finite non-negative numbers)
   * 2. Handles the trivial case (fromEpoch === currentEpoch returns pos unchanged)
   * 3. Checks if fromEpoch is within the retention window
   * 4. Iterates through epochs from fromEpoch to currentEpoch:
   *    - Retrieves the StepMaps for each epoch transition
   *    - Applies each StepMap to transform the position
   *    - Detects if the position was deleted
   * 5. Returns the final mapped position or a failure reason
   *
   * The assoc parameter controls behavior at position boundaries:
   * - assoc = 1 (right): At insertion points, associates with content to the right
   * - assoc = -1 (left): At insertion points, associates with content to the left
   *
   * Failure reasons:
   * - `invalid_pos`: pos is not a valid finite non-negative number
   * - `invalid_epoch`: fromEpoch is invalid, negative, or greater than currentEpoch
   * - `epoch_too_old`: fromEpoch is older than the retention window
   * - `missing_stepmap`: A required StepMap is missing (indicates a bug)
   * - `deleted`: The position was deleted by a transaction
   *
   * Use this method when you need to diagnose why mapping failed (e.g., for logging or
   * fallback behavior). For simple success/failure, use mapPosFromLayoutToCurrent().
   */
  mapPosFromLayoutToCurrentDetailed(pos: number, fromEpoch: Epoch, assoc: number = 1): MapPosResult {
    const toEpoch = this.#currentEpoch;

    if (!Number.isFinite(pos) || pos < 0) {
      return { ok: false, reason: 'invalid_pos', fromEpoch, toEpoch };
    }
    if (!Number.isFinite(fromEpoch) || fromEpoch < 0) {
      return { ok: false, reason: 'invalid_epoch', fromEpoch, toEpoch };
    }
    if (fromEpoch > toEpoch) {
      return { ok: false, reason: 'invalid_epoch', fromEpoch, toEpoch };
    }
    if (fromEpoch === toEpoch) {
      return { ok: true, pos, fromEpoch, toEpoch };
    }

    const minKeptFromEpoch = Math.max(0, toEpoch - this.#maxEpochsToKeep);
    if (fromEpoch < minKeptFromEpoch) {
      return { ok: false, reason: 'epoch_too_old', fromEpoch, toEpoch };
    }

    let mapped = pos;
    for (let epoch = fromEpoch; epoch < toEpoch; epoch += 1) {
      const maps = this.#mapsByFromEpoch.get(epoch);
      if (!maps) {
        return { ok: false, reason: 'missing_stepmap', fromEpoch, toEpoch };
      }
      for (const map of maps) {
        const r = map.mapResult(mapped, assoc);
        if (r.deleted) {
          return { ok: false, reason: 'deleted', fromEpoch, toEpoch };
        }
        mapped = r.pos;
      }
    }

    return { ok: true, pos: mapped, fromEpoch, toEpoch };
  }

  #pruneByCurrentEpoch(): void {
    const minKeptFromEpoch = Math.max(0, this.#currentEpoch - this.#maxEpochsToKeep);
    for (const epoch of this.#mapsByFromEpoch.keys()) {
      if (epoch < minKeptFromEpoch) {
        this.#mapsByFromEpoch.delete(epoch);
      }
    }
  }
}
