/**
 * BatchHistoryAdapter
 *
 * A virtual history backend for coordinator-level batch entries — the
 * mechanism used by Phase 4 structural UI operations that bypass a
 * participant's native PM/Yjs history (blank header/footer slot
 * materialization, link-to-previous retargeting, note insertion via parts-
 * only paths, etc.).
 *
 * Each `withHistoryBatch()` call pushes one batch record here. The batch's
 * `undo` / `redo` callbacks are what the coordinator actually runs when it
 * reaches this adapter during replay — there is no underlying editor step.
 */

import type { HistorySnapshotAdapter, ParticipantHistorySnapshot } from './types.js';

export interface BatchHistoryRecord {
  /** Optional human-readable description (telemetry, not required). */
  label?: string;
  /** Invoked when the coordinator undoes this batch. Return false on failure. */
  undo: () => boolean | void;
  /** Invoked when the coordinator redoes this batch. Return false on failure. */
  redo: () => boolean | void;
}

export class BatchHistoryAdapter implements HistorySnapshotAdapter {
  readonly #done: BatchHistoryRecord[] = [];
  readonly #redone: BatchHistoryRecord[] = [];
  readonly #listeners = new Set<() => void>();

  record(batch: BatchHistoryRecord): void {
    this.#done.push(batch);
    this.#redone.length = 0;
    this.#notify();
  }

  getSnapshot(): ParticipantHistorySnapshot {
    return { undoDepth: this.#done.length, redoDepth: this.#redone.length };
  }

  undo(): boolean {
    const batch = this.#done.pop();
    if (!batch) return false;
    try {
      if (batch.undo() === false) {
        this.#done.push(batch);
        return false;
      }
    } catch {
      this.#done.push(batch);
      return false;
    }
    this.#redone.push(batch);
    this.#notify();
    return true;
  }

  redo(): boolean {
    const batch = this.#redone.pop();
    if (!batch) return false;
    try {
      if (batch.redo() === false) {
        this.#redone.push(batch);
        return false;
      }
    } catch {
      this.#redone.push(batch);
      return false;
    }
    this.#done.push(batch);
    this.#notify();
    return true;
  }

  subscribe(onChange: () => void): () => void {
    this.#listeners.add(onChange);
    return () => this.#listeners.delete(onChange);
  }

  #notify(): void {
    this.#listeners.forEach((listener) => listener());
  }
}
