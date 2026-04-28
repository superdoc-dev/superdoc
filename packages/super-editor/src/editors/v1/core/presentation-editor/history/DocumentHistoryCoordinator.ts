/**
 * DocumentHistoryCoordinator
 *
 * Observes each registered editable surface's local PM/Yjs history and maintains
 * one document-wide ordered undo/redo queue on top of them.
 *
 * Responsibilities:
 *   - Track participants by stable key.
 *   - Append one global entry per local history event (not per transaction).
 *   - Clear the global redo stack whenever a new local history event lands.
 *   - Route `undo()` / `redo()` to the participant whose local event is at the
 *     top of the global stack, suppressing re-recording while replay runs.
 *   - Provide a single `DocumentHistoryState` snapshot plus a change signal
 *     for UI consumers (toolbar, context menu, document API).
 *
 * Design notes:
 *   - Local backends remain authoritative for grouping, collab semantics, and
 *     step inversion. The coordinator only owns cross-surface ordering.
 *   - Suppression is a counter, not a boolean, so overlapping replays (e.g. a
 *     participant whose undo triggers a cascade) still clear correctly.
 *   - The global stack is hard-capped; old entries are purged from the bottom
 *     when the cap is exceeded, not truncated mid-stack.
 */

import type {
  DocumentHistoryState,
  DocumentHistorySurface,
  GlobalHistoryEntry,
  HistoryParticipant,
  ParticipantHistorySnapshot,
  PurgeReason,
  UnifiedHistoryCueEvent,
} from './types.js';
import { BatchHistoryAdapter, type BatchHistoryRecord } from './batch-history-adapter.js';

/**
 * Participant key used for coordinator-level batch entries (Phase 4
 * structural UI operations). Uses an 'internal:' prefix so it cannot
 * collide with story-runtime keys (which are 'body', 'fn:...', 'en:...',
 * 'hf:part:...').
 */
const BATCH_PARTICIPANT_KEY = 'internal:batch';

type ChangeListener = () => void;
type CueListener = (event: UnifiedHistoryCueEvent) => void;
type PurgeListener = (detail: { key: string; reason: PurgeReason }) => void;

type ParticipantRecord = {
  participant: HistoryParticipant;
  lastSnapshot: ParticipantHistorySnapshot;
  pinned: boolean;
  unsubscribe: () => void;
};

const DEFAULT_GLOBAL_HISTORY_CAP = 500;

/** Shallow snapshot equality — avoids spurious change emissions. */
const stateEquals = (a: DocumentHistoryState, b: DocumentHistoryState): boolean =>
  a.canUndo === b.canUndo && a.canRedo === b.canRedo && a.undoDepth === b.undoDepth && a.redoDepth === b.redoDepth;

export type DocumentHistoryCoordinatorOptions = {
  /** Maximum number of global history entries kept in memory. */
  capacity?: number;
  /**
   * Optional diagnostic hook — fired with surface/participant context when the
   * coordinator decides to purge entries. Used by integration tests and by
   * the future observability layer described in the plan.
   */
  onDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;
};

export class DocumentHistoryCoordinator {
  readonly #participants = new Map<string, ParticipantRecord>();
  readonly #doneStack: GlobalHistoryEntry[] = [];
  readonly #redoStack: GlobalHistoryEntry[] = [];
  readonly #changeListeners = new Set<ChangeListener>();
  readonly #cueListeners = new Set<CueListener>();
  readonly #purgeListeners = new Set<PurgeListener>();
  readonly #capacity: number;
  readonly #onDiagnostic: DocumentHistoryCoordinatorOptions['onDiagnostic'];

  readonly #batchAdapter = new BatchHistoryAdapter();
  #suppressionCount = 0;
  #seq = 0;
  #lastEmittedState: DocumentHistoryState = {
    canUndo: false,
    canRedo: false,
    undoDepth: 0,
    redoDepth: 0,
  };
  /**
   * Set while the coordinator is driving a replay so we can emit the UX cue
   * at the right moment — after the target participant's local state has
   * actually updated, not before.
   */
  #activeReplay: { action: 'undo' | 'redo'; surface: DocumentHistorySurface; key: string } | null = null;
  /** The active (focused) surface, used to decide when the cross-surface cue should fire. */
  #activeSurface: DocumentHistorySurface = 'body';

  constructor(options: DocumentHistoryCoordinatorOptions = {}) {
    this.#capacity = Math.max(1, options.capacity ?? DEFAULT_GLOBAL_HISTORY_CAP);
    this.#onDiagnostic = options.onDiagnostic;

    // Batch participant is always registered — it carries the coordinator-
    // level undo steps for structural UI operations (Phase 4). Pinned so
    // it cannot be purged accidentally.
    this.register({
      key: BATCH_PARTICIPANT_KEY,
      surface: 'body',
      adapter: this.#batchAdapter,
    });
    this.setPinned(BATCH_PARTICIPANT_KEY, true);
  }

  /**
   * Record a coordinator-level batch step for a structural UI operation
   * that bypasses a participant's native PM/Yjs history.
   *
   * The provided `undo` / `redo` callbacks are what the coordinator runs
   * when it reaches this step during replay. They must be self-contained
   * and safe to re-run multiple times.
   *
   * Use this sparingly — content edits should still participate through
   * their local editor's history. `withHistoryBatch` is for operations
   * the user expects to undo that otherwise cannot create a PM step at all
   * (for example, blank header/footer slot materialization or a part-only
   * link-to-previous retargeting).
   */
  withHistoryBatch(batch: BatchHistoryRecord): void {
    this.#batchAdapter.record(batch);
  }

  // ---------------------------------------------------------------------------
  // Participant registration
  // ---------------------------------------------------------------------------

  /**
   * Registers (or re-registers) a participant. Idempotent: calling with the
   * same key replaces the previous registration without dropping global
   * entries — external callers can rebind an editor instance to the same key
   * without losing reachable history.
   */
  register(participant: HistoryParticipant, options: { pinned?: boolean } = {}): void {
    const existing = this.#participants.get(participant.key);
    if (existing) {
      existing.unsubscribe();
    }

    const lastSnapshot = participant.adapter.getSnapshot();
    const unsubscribe = participant.adapter.subscribe(() => this.#onParticipantTransaction(participant.key));
    this.#participants.set(participant.key, {
      participant,
      lastSnapshot,
      pinned: existing?.pinned ?? options.pinned ?? false,
      unsubscribe,
    });
    this.#onDiagnostic?.('unified-history: participant registered', {
      key: participant.key,
      surface: participant.surface,
      snapshot: lastSnapshot,
      replacedExisting: Boolean(existing),
    });
  }

  /**
   * Stop observing a participant without removing its global history entries.
   * Use this for temporary detach/rebind cases (e.g. note-session editors
   * going dormant). If the participant cannot be rebound, call `purge()`
   * instead.
   */
  unregister(key: string): void {
    const record = this.#participants.get(key);
    if (!record) return;
    record.unsubscribe();
    this.#participants.delete(key);
  }

  /**
   * Purge all global entries for a participant and stop observing it.
   *
   * Use this on irreversible disposal, external invalidation, or when the
   * capacity cap drops the last reachable entry for a dormant surface.
   */
  purge(key: string, reason: PurgeReason = 'unregister'): void {
    const record = this.#participants.get(key);
    if (record) {
      this.#invokeOnInvalidated(record);
      record.unsubscribe();
      this.#participants.delete(key);
    }
    this.#removeEntriesForKey(key);
    this.#notifyPurge(key, reason);
    this.#emitStateIfChanged();
  }

  #invokeOnInvalidated(record: ParticipantRecord): void {
    const hook = record.participant.onInvalidated;
    if (!hook) return;
    try {
      hook();
    } catch (error) {
      this.#onDiagnostic?.('unified-history: onInvalidated threw', {
        key: record.participant.key,
        error,
      });
    }
  }

  /** True while the coordinator still tracks the given participant key. */
  hasParticipant(key: string): boolean {
    return this.#participants.has(key);
  }

  /** Pin a participant so owning caches keep its editor alive while it has reachable history. */
  setPinned(key: string, pinned: boolean): void {
    const record = this.#participants.get(key);
    if (!record) return;
    record.pinned = pinned;
  }

  isPinned(key: string): boolean {
    const record = this.#participants.get(key);
    return Boolean(record?.pinned);
  }

  /** All participant keys that currently have at least one reachable global entry. */
  getReachableKeys(): Set<string> {
    const keys = new Set<string>();
    for (const entry of this.#doneStack) keys.add(entry.participantKey);
    for (const entry of this.#redoStack) keys.add(entry.participantKey);
    return keys;
  }

  // ---------------------------------------------------------------------------
  // Active-surface bookkeeping (used to decide when to emit the cross-surface cue)
  // ---------------------------------------------------------------------------

  setActiveSurface(surface: DocumentHistorySurface): void {
    this.#activeSurface = surface;
  }

  getActiveSurface(): DocumentHistorySurface {
    return this.#activeSurface;
  }

  // ---------------------------------------------------------------------------
  // Public state + commands
  // ---------------------------------------------------------------------------

  canUndo(): boolean {
    return this.#findExecutableEntry(this.#doneStack, 'undo') !== null;
  }

  canRedo(): boolean {
    return this.#findExecutableEntry(this.#redoStack, 'redo') !== null;
  }

  getState(): DocumentHistoryState {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoDepth: this.#doneStack.length,
      redoDepth: this.#redoStack.length,
    };
  }

  undo(): boolean {
    return this.#replay('undo');
  }

  redo(): boolean {
    return this.#replay('redo');
  }

  /**
   * Force the coordinator to re-read one participant's local history
   * snapshot and reconcile any newly-created or externally-consumed local
   * history step.
   *
   * Use this when a host layer already knows a specific participant just
   * processed a doc-changing transaction and wants to keep the global queue
   * in lockstep even if the participant's passive subscription path is not
   * the one that surfaced the event.
   */
  syncParticipant(key: string): void {
    this.#onParticipantTransaction(key);
  }

  // ---------------------------------------------------------------------------
  // Event subscriptions
  // ---------------------------------------------------------------------------

  onChange(listener: ChangeListener): () => void {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }

  onCue(listener: CueListener): () => void {
    this.#cueListeners.add(listener);
    return () => this.#cueListeners.delete(listener);
  }

  onPurge(listener: PurgeListener): () => void {
    this.#purgeListeners.add(listener);
    return () => this.#purgeListeners.delete(listener);
  }

  /**
   * Dispose the coordinator. Unsubscribes from every participant and clears
   * all listeners. After destroy() the instance is inert.
   */
  destroy(): void {
    for (const record of this.#participants.values()) {
      record.unsubscribe();
    }
    this.#participants.clear();
    this.#doneStack.length = 0;
    this.#redoStack.length = 0;
    this.#changeListeners.clear();
    this.#cueListeners.clear();
    this.#purgeListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Handles any transaction emitted by a participant's backend and updates
   * the global stacks based on the delta vs. the last observed snapshot.
   */
  #onParticipantTransaction(key: string): void {
    const record = this.#participants.get(key);
    if (!record) return;

    const previous = record.lastSnapshot;
    const current = record.participant.adapter.getSnapshot();
    record.lastSnapshot = current;
    this.#onDiagnostic?.('unified-history: participant transaction observed', {
      key,
      surface: record.participant.surface,
      previous,
      current,
      suppressionCount: this.#suppressionCount,
    });

    // Coordinator-driven replay is recorded explicitly in `#replay`, so we
    // skip passive bookkeeping while suppression is active.
    if (this.#suppressionCount > 0) return;

    const changeKind = record.participant.adapter.consumePendingChangeKind?.() ?? 'unknown';
    const undoIncreased = current.undoDepth > previous.undoDepth;
    const undoDecreased = current.undoDepth < previous.undoDepth;
    const redoIncreased = current.redoDepth > previous.redoDepth;
    const redoDecreased = current.redoDepth < previous.redoDepth;

    if (changeKind === 'undo') {
      this.#mirrorExternalUndo(record.participant, previous, current);
      return;
    }

    if (changeKind === 'redo') {
      this.#mirrorExternalRedo(record.participant, previous, current);
      return;
    }

    if (undoIncreased) {
      this.#recordLocalEdit(record.participant, current.undoDepth - previous.undoDepth);
      return;
    }

    // Local undo performed outside the coordinator (raw sub-editor call).
    // Drop the most recent matching global entry so the global stack stays
    // in step with what actually happened locally. The coordinator remains
    // a best-effort mirror for direct sub-editor history commands.
    if (undoDecreased) {
      this.#discardTopEntriesForKey(this.#doneStack, record.participant.key, previous.undoDepth - current.undoDepth);
    }

    // A participant-level redo that we could not classify, or a redo branch
    // cleared by some non-history-aware local edit. In both cases the safest
    // fallback is to drop only this participant's consumed redo entries.
    if (redoIncreased) {
      this.#appendReplayEntries(this.#redoStack, record.participant, current.redoDepth - previous.redoDepth);
      this.#emitStateIfChanged();
      return;
    }

    if (redoDecreased) {
      this.#discardTopEntriesForKey(this.#redoStack, record.participant.key, previous.redoDepth - current.redoDepth);
    }

    this.#emitStateIfChanged();
  }

  #recordLocalEdit(participant: HistoryParticipant, stepCount: number): void {
    this.#appendReplayEntries(this.#doneStack, participant, stepCount);
    // A new local edit always invalidates the document-wide redo branch.
    if (this.#redoStack.length > 0) this.#redoStack.length = 0;
    this.#onDiagnostic?.('unified-history: recorded local edit', {
      key: participant.key,
      surface: participant.surface,
      stepCount,
      state: this.getState(),
    });
    this.#emitStateIfChanged();
  }

  #mirrorExternalUndo(
    participant: HistoryParticipant,
    previous: ParticipantHistorySnapshot,
    current: ParticipantHistorySnapshot,
  ): void {
    const stepCount = previous.undoDepth - current.undoDepth;
    if (stepCount <= 0) return;

    const moved = this.#moveEntriesBetweenStacks(this.#doneStack, this.#redoStack, participant, stepCount);
    const unmatchedSteps = stepCount - moved;
    if (unmatchedSteps > 0) {
      this.#discardTopEntriesForKey(this.#doneStack, participant.key, unmatchedSteps);
    }

    this.#emitStateIfChanged();
  }

  #mirrorExternalRedo(
    participant: HistoryParticipant,
    previous: ParticipantHistorySnapshot,
    current: ParticipantHistorySnapshot,
  ): void {
    const stepCount = current.undoDepth - previous.undoDepth;
    if (stepCount <= 0) return;

    const moved = this.#moveEntriesBetweenStacks(this.#redoStack, this.#doneStack, participant, stepCount);
    const unmatchedSteps = stepCount - moved;
    if (unmatchedSteps > 0) {
      this.#appendReplayEntries(this.#doneStack, participant, unmatchedSteps);
    }

    this.#emitStateIfChanged();
  }

  /**
   * Locate the topmost entry whose participant is still registered and
   * actually has a local step available. Stale entries (pointing at a
   * destroyed participant, or at a step that was undone directly on the
   * sub-editor) are discarded as we walk down.
   */
  #findExecutableEntry(
    stack: GlobalHistoryEntry[],
    action: 'undo' | 'redo',
  ): { entry: GlobalHistoryEntry; record: ParticipantRecord } | null {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const entry = stack[i];
      const record = this.#participants.get(entry.participantKey);
      if (!record) continue;
      const snapshot = record.participant.adapter.getSnapshot();
      const canApply = action === 'undo' ? snapshot.undoDepth > 0 : snapshot.redoDepth > 0;
      if (canApply) {
        return { entry, record };
      }
    }
    return null;
  }

  #replay(action: 'undo' | 'redo'): boolean {
    const source = action === 'undo' ? this.#doneStack : this.#redoStack;
    const target = action === 'undo' ? this.#redoStack : this.#doneStack;
    const hit = this.#findExecutableEntry(source, action);
    if (!hit) return false;

    const { entry, record } = hit;
    this.#removeEntryExact(source, entry);
    this.#activeReplay = { action, surface: entry.surface, key: entry.participantKey };
    this.#suppressionCount += 1;

    let didRun = false;
    try {
      didRun = action === 'undo' ? record.participant.adapter.undo() : record.participant.adapter.redo();
    } catch (error) {
      this.#onDiagnostic?.('unified-history: adapter threw during replay', {
        action,
        key: entry.participantKey,
        error,
      });
    } finally {
      this.#suppressionCount = Math.max(0, this.#suppressionCount - 1);
      // Re-read the snapshot so the next passive change event sees the
      // post-replay baseline. Without this, the snapshot delta would look
      // like an unexpected decrement and we'd drop another global entry.
      record.lastSnapshot = record.participant.adapter.getSnapshot();
    }

    if (!didRun) {
      this.#onDiagnostic?.('unified-history: replay produced no local step', {
        action,
        key: entry.participantKey,
      });
      // Reinsert the entry so the global stack stays consistent with the
      // adapter's local state — an adapter that reports failure has
      // either rolled back its own stack (batch) or never moved it
      // (native participant whose editor is gone), so we should not
      // permanently drop the reachable history it still advertises.
      source.push(entry);
      this.#activeReplay = null;
      this.#emitStateIfChanged();
      return false;
    }

    target.push({ ...entry, seq: ++this.#seq });
    this.#enforceCapacity();
    this.#onDiagnostic?.('unified-history: replay applied', {
      action,
      key: entry.participantKey,
      surface: entry.surface,
      activeSurface: this.#activeSurface,
      state: this.getState(),
    });
    this.#emitCueIfCrossSurface(entry);
    this.#runFlushAfterReplay(record, action);
    this.#activeReplay = null;
    this.#emitStateIfChanged();
    return true;
  }

  /**
   * Invoke the participant's `flushAfterReplay` hook, if any. Note and
   * endnote participants wire this to commit the updated PM state back to
   * the canonical OOXML part and to request a presentation rerender — work
   * the body participant does not need because its PM state is already the
   * rendered source.
   */
  #runFlushAfterReplay(record: ParticipantRecord, action: 'undo' | 'redo'): void {
    const hook = record.participant.flushAfterReplay;
    if (!hook) return;
    try {
      hook(action);
    } catch (error) {
      this.#onDiagnostic?.('unified-history: flushAfterReplay threw', {
        key: record.participant.key,
        action,
        error,
      });
    }
  }

  #emitCueIfCrossSurface(entry: GlobalHistoryEntry): void {
    const replay = this.#activeReplay;
    if (!replay) return;
    if (entry.surface === this.#activeSurface) return;
    const cue: UnifiedHistoryCueEvent = {
      action: replay.action,
      surface: entry.surface,
      participantKey: entry.participantKey,
    };
    this.#cueListeners.forEach((listener) => {
      try {
        listener(cue);
      } catch (error) {
        this.#onDiagnostic?.('unified-history: cue listener threw', { error });
      }
    });
  }

  #removeEntriesForKey(key: string): void {
    this.#filterInPlace(this.#doneStack, (entry) => entry.participantKey !== key);
    this.#filterInPlace(this.#redoStack, (entry) => entry.participantKey !== key);
  }

  #discardTopEntriesForKey(stack: GlobalHistoryEntry[], key: string, count: number): number {
    const removed = this.#takeTopEntriesForKey(stack, key, count);
    return removed.length;
  }

  #moveEntriesBetweenStacks(
    source: GlobalHistoryEntry[],
    target: GlobalHistoryEntry[],
    participant: HistoryParticipant,
    count: number,
  ): number {
    const movedEntries = this.#takeTopEntriesForKey(source, participant.key, count);
    movedEntries.forEach((entry) => {
      target.push({
        ...entry,
        seq: ++this.#seq,
      });
    });
    this.#enforceCapacity();
    return movedEntries.length;
  }

  #takeTopEntriesForKey(stack: GlobalHistoryEntry[], key: string, count: number): GlobalHistoryEntry[] {
    const removed: GlobalHistoryEntry[] = [];
    if (count <= 0) return removed;

    for (let i = stack.length - 1; i >= 0 && removed.length < count; i -= 1) {
      if (stack[i].participantKey !== key) {
        continue;
      }
      removed.push(stack[i]);
      stack.splice(i, 1);
    }

    return removed;
  }

  #appendReplayEntries(stack: GlobalHistoryEntry[], participant: HistoryParticipant, count: number): void {
    for (let i = 0; i < count; i += 1) {
      stack.push({
        seq: ++this.#seq,
        participantKey: participant.key,
        surface: participant.surface,
      });
    }
    this.#enforceCapacity();
  }

  #removeEntryExact(stack: GlobalHistoryEntry[], entry: GlobalHistoryEntry): void {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].seq === entry.seq) {
        stack.splice(i, 1);
        return;
      }
    }
  }

  #enforceCapacity(): void {
    while (this.#doneStack.length + this.#redoStack.length > this.#capacity) {
      const victim = this.#doneStack.length > 0 ? this.#doneStack.shift() : this.#redoStack.shift();
      if (!victim) break;
      const stillReferenced = this.#isKeyReferenced(victim.participantKey);
      if (!stillReferenced) {
        this.#notifyPurge(victim.participantKey, 'capacity-eviction');
      }
      this.#onDiagnostic?.('unified-history: capacity eviction', {
        key: victim.participantKey,
        surface: victim.surface,
      });
    }
  }

  #isKeyReferenced(key: string): boolean {
    for (const entry of this.#doneStack) if (entry.participantKey === key) return true;
    for (const entry of this.#redoStack) if (entry.participantKey === key) return true;
    return false;
  }

  #filterInPlace<T>(array: T[], predicate: (value: T) => boolean): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < array.length; readIndex += 1) {
      const value = array[readIndex];
      if (predicate(value)) {
        array[writeIndex] = value;
        writeIndex += 1;
      }
    }
    array.length = writeIndex;
  }

  #emitStateIfChanged(): void {
    const next = this.getState();
    if (stateEquals(next, this.#lastEmittedState)) return;
    this.#lastEmittedState = next;
    this.#changeListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        this.#onDiagnostic?.('unified-history: change listener threw', { error });
      }
    });
  }

  #notifyPurge(key: string, reason: PurgeReason): void {
    this.#purgeListeners.forEach((listener) => {
      try {
        listener({ key, reason });
      } catch (error) {
        this.#onDiagnostic?.('unified-history: purge listener threw', { error });
      }
    });
  }
}
