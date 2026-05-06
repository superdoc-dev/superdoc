/**
 * Shared types for the unified document-wide history coordinator.
 *
 * Design at a glance:
 *   - Each editable surface (body, header/footer, …) registers as a
 *     `HistoryParticipant` with its own local PM/Yjs history engine.
 *   - The coordinator observes local history snapshots and maintains a global
 *     ordered queue of `GlobalHistoryEntry` records — one per local history
 *     event, not per transaction.
 */

/** Surfaces recognised by the document-wide history queue. */
export type DocumentHistorySurface = 'body' | 'header' | 'footer' | 'note' | 'endnote';

/** Depths of the local undo/redo stacks, read from a participant's backend. */
export type ParticipantHistorySnapshot = {
  undoDepth: number;
  redoDepth: number;
};

/** Best-effort classification for the most recent participant-local history change. */
export type ParticipantHistoryChangeKind = 'edit' | 'undo' | 'redo' | 'unknown';

/**
 * One entry in the global ordered history queue.
 *
 * `seq` is monotonic and strictly increasing, giving a total cross-surface
 * ordering independent of surface identity or pointer wiring.
 */
export type GlobalHistoryEntry = {
  seq: number;
  participantKey: string;
  surface: DocumentHistorySurface;
};

/** Snapshot of document-wide history state for UI consumers. */
export type DocumentHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  /** Lengths of the global stacks — useful for debugging and tests. */
  undoDepth: number;
  redoDepth: number;
};

/** Reason codes for diagnostic purge/unregister events. */
export type PurgeReason = 'unregister' | 'external-invalidation' | 'capacity-eviction' | 'stale-replay' | 'destroyed';

/**
 * Payload emitted when the cross-surface UX cue should be shown.
 *
 * Phase 1 specifies a lightweight message such as "Undid change in Header" —
 * we emit structured data and let the host render the cue (toast, aria-live,
 * status bar, …) in whatever style it prefers.
 */
export type UnifiedHistoryCueEvent = {
  action: 'undo' | 'redo';
  surface: DocumentHistorySurface;
  participantKey: string;
};

/**
 * Adapter that bridges one editor's native history backend (PM or Yjs) to the
 * coordinator. Each adapter owns the subscription to its editor's transaction
 * stream and the rules for reading stack depths.
 */
export interface HistorySnapshotAdapter {
  getSnapshot(): ParticipantHistorySnapshot;
  undo(): boolean;
  redo(): boolean;
  /**
   * Returns the most recent locally observed change kind, if the adapter can
   * classify it. Adapters should clear the stored hint when this is read so a
   * later unrelated transaction does not reuse stale metadata.
   */
  consumePendingChangeKind?(): ParticipantHistoryChangeKind;
  /**
   * Fires after any history-relevant change (typically editor transactions).
   * Returns an unsubscribe function.
   */
  subscribe(onChange: () => void): () => void;
}

/** A single history participant registered with the coordinator. */
export interface HistoryParticipant {
  key: string;
  surface: DocumentHistorySurface;
  adapter: HistorySnapshotAdapter;
  /**
   * Optional hook invoked by the coordinator after a successful undo/redo
   * replay against this participant. Note and endnote participants use this
   * to commit the updated editor state back to the canonical OOXML part and
   * to request a presentation-editor rerender — work the body participant
   * does not need because its PM state is already the rendered source.
   */
  flushAfterReplay?: (action: 'undo' | 'redo') => void;
  /**
   * Optional hook invoked when external state invalidates this participant's
   * editor. Called immediately before the coordinator removes its global
   * entries. Participants can use this to release resources they own
   * outside the adapter itself.
   */
  onInvalidated?: () => void;
}
