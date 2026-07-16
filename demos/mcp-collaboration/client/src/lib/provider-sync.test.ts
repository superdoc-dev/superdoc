import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  onCollaborationProviderSynced,
  type CollaborationSyncProvider,
} from './provider-sync';

type EventName = 'sync' | 'synced';
type EventHandler = (synced?: unknown) => void;

function providerStub(state: { synced?: boolean; isSynced?: boolean } = {}) {
  const listeners: Record<EventName, Set<EventHandler>> = {
    sync: new Set(),
    synced: new Set(),
  };
  const provider: CollaborationSyncProvider & {
    emit(event: EventName, synced?: unknown): void;
    listenerCount(): number;
  } = {
    ...state,
    on(event, handler) {
      listeners[event].add(handler);
    },
    off(event, handler) {
      listeners[event].delete(handler);
    },
    emit(event, synced) {
      for (const handler of listeners[event]) handler(synced);
    },
    listenerCount() {
      return listeners.sync.size + listeners.synced.size;
    },
  };
  return provider;
}

describe('collaboration provider sync', () => {
  it('recognizes both already-synced state fields', () => {
    for (const provider of [providerStub({ synced: true }), providerStub({ isSynced: true })]) {
      let calls = 0;
      onCollaborationProviderSynced(provider, () => calls++);
      assert.equal(calls, 1);
      assert.equal(provider.listenerCount(), 0);
    }
  });

  it('recognizes sync(true) and the no-argument synced event', () => {
    for (const [event, value] of [
      ['sync', true],
      ['synced', undefined],
    ] as const) {
      const provider = providerStub();
      let calls = 0;
      onCollaborationProviderSynced(provider, () => calls++);
      provider.emit(event, value);
      assert.equal(calls, 1);
      assert.equal(provider.listenerCount(), 0);
    }
  });

  it('ignores sync(false) and removes both listeners on cleanup', () => {
    const provider = providerStub();
    let calls = 0;
    const cleanup = onCollaborationProviderSynced(provider, () => calls++);

    provider.emit('sync', false);
    assert.equal(calls, 0);
    assert.equal(provider.listenerCount(), 2);

    cleanup();
    assert.equal(provider.listenerCount(), 0);
  });
});
