/**
 * Unit tests for `DocumentHistoryCoordinator`.
 *
 * The coordinator is deliberately backend-agnostic — every test here works
 * against an in-memory adapter that models a simple stack-based history. Real
 * PM/Yjs behavior is covered indirectly through the editor-history adapter
 * tests and by the behavior suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentHistoryCoordinator } from './DocumentHistoryCoordinator.js';
import type {
  DocumentHistorySurface,
  HistoryParticipant,
  ParticipantHistoryChangeKind,
  HistorySnapshotAdapter,
  ParticipantHistorySnapshot,
} from './types.js';

/**
 * In-memory participant adapter — `record()` models a new local edit,
 * `undo()` / `redo()` mutate the local stacks. Subscribers are notified on
 * every state transition so the coordinator can observe the delta.
 */
class FakeParticipantAdapter implements HistorySnapshotAdapter {
  readonly #done: string[] = [];
  readonly #redone: string[] = [];
  readonly #listeners = new Set<() => void>();
  #nextEditId = 0;
  #pendingChangeKind: ParticipantHistoryChangeKind = 'unknown';

  constructor(public readonly label: string) {}

  getSnapshot(): ParticipantHistorySnapshot {
    return { undoDepth: this.#done.length, redoDepth: this.#redone.length };
  }

  consumePendingChangeKind(): ParticipantHistoryChangeKind {
    const changeKind = this.#pendingChangeKind;
    this.#pendingChangeKind = 'unknown';
    return changeKind;
  }

  subscribe(onChange: () => void): () => void {
    this.#listeners.add(onChange);
    return () => this.#listeners.delete(onChange);
  }

  record(): string {
    this.#nextEditId += 1;
    const id = `${this.label}:${this.#nextEditId}`;
    this.#done.push(id);
    this.#redone.length = 0;
    this.#pendingChangeKind = 'edit';
    this.#notify();
    return id;
  }

  undo(): boolean {
    const step = this.#done.pop();
    if (!step) return false;
    this.#redone.push(step);
    this.#pendingChangeKind = 'undo';
    this.#notify();
    return true;
  }

  redo(): boolean {
    const step = this.#redone.pop();
    if (!step) return false;
    this.#done.push(step);
    this.#pendingChangeKind = 'redo';
    this.#notify();
    return true;
  }

  #notify(): void {
    this.#listeners.forEach((listener) => listener());
  }
}

const buildParticipant = (
  key: string,
  surface: DocumentHistorySurface,
): { participant: HistoryParticipant; adapter: FakeParticipantAdapter } => {
  const adapter = new FakeParticipantAdapter(key);
  return { participant: { key, surface, adapter }, adapter };
};

describe('DocumentHistoryCoordinator', () => {
  let coordinator: DocumentHistoryCoordinator;

  beforeEach(() => {
    coordinator = new DocumentHistoryCoordinator();
  });

  afterEach(() => {
    coordinator.destroy();
  });

  describe('recording local edits', () => {
    it('appends exactly one global entry per local history event', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);

      body.adapter.record();
      body.adapter.record();

      expect(coordinator.getState().undoDepth).toBe(2);
      expect(coordinator.getState().canUndo).toBe(true);
      expect(coordinator.getState().canRedo).toBe(false);
    });

    it('preserves cross-surface ordering', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      header.adapter.record();
      body.adapter.record();

      coordinator.undo();
      expect(body.adapter.getSnapshot().undoDepth).toBe(1);
      expect(header.adapter.getSnapshot().undoDepth).toBe(1);

      coordinator.undo();
      expect(header.adapter.getSnapshot().undoDepth).toBe(0);

      coordinator.undo();
      expect(body.adapter.getSnapshot().undoDepth).toBe(0);

      expect(coordinator.canUndo()).toBe(false);
    });

    it('clears global redo when a new edit lands anywhere', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      coordinator.undo();
      expect(coordinator.getState().redoDepth).toBe(1);

      header.adapter.record();
      expect(coordinator.getState().redoDepth).toBe(0);
    });
  });

  describe('undo/redo replay', () => {
    it('reports the exact cross-surface redo sequence after an undo', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      header.adapter.record();

      expect(coordinator.undo()).toBe(true);
      expect(coordinator.getState().undoDepth).toBe(1);
      expect(coordinator.getState().redoDepth).toBe(1);

      expect(coordinator.redo()).toBe(true);
      expect(coordinator.getState().undoDepth).toBe(2);
      expect(coordinator.getState().redoDepth).toBe(0);
    });

    it('reproduces the plan repro: body -> header -> focus body (no edit) -> undo', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      header.adapter.record();
      coordinator.setActiveSurface('body'); // focus the body without editing
      expect(coordinator.undo()).toBe(true);

      // The header edit was the most recent — undoing walks that back first.
      expect(header.adapter.getSnapshot().undoDepth).toBe(0);
      expect(body.adapter.getSnapshot().undoDepth).toBe(1);
    });

    it('does not re-record coordinator-driven undo/redo as new global entries', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);

      body.adapter.record();
      coordinator.undo();
      coordinator.redo();

      expect(coordinator.getState().undoDepth).toBe(1);
      expect(coordinator.getState().redoDepth).toBe(0);
    });
  });

  describe('cross-surface cue', () => {
    it('emits a cue when the undone surface is not the active one', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      header.adapter.record();
      coordinator.setActiveSurface('body');

      const cueListener = vi.fn();
      coordinator.onCue(cueListener);

      coordinator.undo();

      expect(cueListener).toHaveBeenCalledOnce();
      expect(cueListener).toHaveBeenCalledWith({
        action: 'undo',
        surface: 'header',
        participantKey: 'hf:part:rId1',
      });
    });

    it('does not emit a cue when the active surface is the target', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);
      body.adapter.record();
      coordinator.setActiveSurface('body');

      const cueListener = vi.fn();
      coordinator.onCue(cueListener);

      coordinator.undo();
      expect(cueListener).not.toHaveBeenCalled();
    });
  });

  describe('change notifications', () => {
    it('emits onChange when state transitions', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);

      const listener = vi.fn();
      coordinator.onChange(listener);

      body.adapter.record();
      coordinator.undo();

      expect(listener).toHaveBeenCalled();
    });

    it('does not emit onChange when the state shape is unchanged', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);

      const listener = vi.fn();
      coordinator.onChange(listener);

      // Registering by itself should not cause a spurious change emission.
      coordinator.register(body.participant);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('purge + invalidation', () => {
    it('purges global entries for a destroyed participant', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      header.adapter.record();

      coordinator.purge('hf:part:rId1', 'destroyed');

      expect(coordinator.getState().undoDepth).toBe(1);
      expect(coordinator.canUndo()).toBe(true);
      coordinator.undo();
      expect(body.adapter.getSnapshot().undoDepth).toBe(0);
    });

    it('skips stale entries whose participant no longer has a reachable step', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);

      body.adapter.record();
      // Simulate a raw sub-editor undo the coordinator does not drive: the
      // snapshot shrinks and the coordinator removes the stale entry.
      body.adapter.undo();
      expect(coordinator.canUndo()).toBe(false);
    });

    it('preserves redo state when a participant is undone outside the coordinator', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      header.adapter.record();

      header.adapter.undo();

      expect(coordinator.getState().undoDepth).toBe(1);
      expect(coordinator.getState().redoDepth).toBe(1);
      expect(coordinator.canRedo()).toBe(true);
    });

    it('preserves unrelated redo entries when a participant redoes outside the coordinator', () => {
      const body = buildParticipant('body', 'body');
      const header = buildParticipant('hf:part:rId1', 'header');
      coordinator.register(body.participant);
      coordinator.register(header.participant);

      body.adapter.record();
      header.adapter.record();

      coordinator.undo();
      coordinator.undo();
      expect(coordinator.getState().redoDepth).toBe(2);

      body.adapter.redo();

      expect(coordinator.getState().undoDepth).toBe(1);
      expect(coordinator.getState().redoDepth).toBe(1);
      expect(coordinator.canRedo()).toBe(true);

      coordinator.redo();
      expect(header.adapter.getSnapshot().undoDepth).toBe(1);
      expect(coordinator.canRedo()).toBe(false);
    });
  });

  describe('pinning', () => {
    it('exposes pinned state via setPinned/isPinned', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);
      expect(coordinator.isPinned('body')).toBe(false);
      coordinator.setPinned('body', true);
      expect(coordinator.isPinned('body')).toBe(true);
    });
  });

  describe('capacity', () => {
    it('evicts oldest done entries when the global cap is exceeded', () => {
      coordinator = new DocumentHistoryCoordinator({ capacity: 2 });
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);

      body.adapter.record();
      body.adapter.record();
      body.adapter.record();

      expect(coordinator.getState().undoDepth).toBe(2);
    });
  });

  describe('withHistoryBatch', () => {
    it('records a coordinator-level step that undo/redo replays through the callbacks', () => {
      const undo = vi.fn();
      const redo = vi.fn();
      coordinator.withHistoryBatch({ undo, redo });

      expect(coordinator.getState().undoDepth).toBe(1);
      coordinator.undo();
      expect(undo).toHaveBeenCalledOnce();
      expect(coordinator.getState().undoDepth).toBe(0);
      expect(coordinator.getState().redoDepth).toBe(1);

      coordinator.redo();
      expect(redo).toHaveBeenCalledOnce();
      expect(coordinator.getState().undoDepth).toBe(1);
      expect(coordinator.getState().redoDepth).toBe(0);
    });

    it('interleaves with participant entries in insertion order', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);

      body.adapter.record();
      const undo = vi.fn();
      const redo = vi.fn();
      coordinator.withHistoryBatch({ undo, redo });

      coordinator.undo(); // undoes the batch first (last recorded)
      expect(undo).toHaveBeenCalledOnce();
      expect(body.adapter.getSnapshot().undoDepth).toBe(1);

      coordinator.undo(); // then undoes the body edit
      expect(body.adapter.getSnapshot().undoDepth).toBe(0);
    });

    it('leaves the batch entry on the done stack when undo() throws', () => {
      const undo = vi.fn(() => {
        throw new Error('replay failed');
      });
      const redo = vi.fn();
      coordinator.withHistoryBatch({ undo, redo });

      const result = coordinator.undo();
      expect(result).toBe(false);
      expect(coordinator.getState().undoDepth).toBe(1);
    });
  });

  describe('flushAfterReplay', () => {
    it('invokes the participant hook after successful replay', () => {
      const adapter = new FakeParticipantAdapter('note');
      const flushAfterReplay = vi.fn();
      coordinator.register({ key: 'fn:1', surface: 'note', adapter, flushAfterReplay });
      adapter.record();

      coordinator.undo();
      expect(flushAfterReplay).toHaveBeenCalledWith('undo');
      coordinator.redo();
      expect(flushAfterReplay).toHaveBeenCalledWith('redo');
      expect(flushAfterReplay).toHaveBeenCalledTimes(2);
    });
  });

  describe('onInvalidated', () => {
    it('fires exactly once per purge call', () => {
      const adapter = new FakeParticipantAdapter('note');
      const onInvalidated = vi.fn();
      coordinator.register({ key: 'fn:1', surface: 'note', adapter, onInvalidated });

      coordinator.purge('fn:1', 'external-invalidation');
      expect(onInvalidated).toHaveBeenCalledOnce();
    });
  });

  describe('suppression counter', () => {
    it('remains balanced across nested replays', () => {
      const body = buildParticipant('body', 'body');
      coordinator.register(body.participant);
      body.adapter.record();
      body.adapter.record();

      coordinator.undo();
      coordinator.undo();

      // After all replay finishes, a fresh local edit must still be recorded
      // as a new global entry — proof that suppression unwound cleanly.
      body.adapter.record();
      expect(coordinator.getState().undoDepth).toBe(1);
      expect(coordinator.getState().redoDepth).toBe(0);
    });
  });
});
