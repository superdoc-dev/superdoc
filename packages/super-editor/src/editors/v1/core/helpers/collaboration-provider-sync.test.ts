import { describe, it, expect, vi } from 'vitest';
import { isCollaborationProviderSynced, onCollaborationProviderSynced } from './collaboration-provider-sync.js';

type SyncHandler = (synced?: boolean) => void;

function createProvider(overrides: Record<string, unknown> = {}) {
  const listeners: Record<string, Set<SyncHandler>> = {
    sync: new Set<SyncHandler>(),
    synced: new Set<SyncHandler>(),
  };

  const provider = {
    synced: false,
    isSynced: false,
    on: vi.fn((event: 'sync' | 'synced', handler: SyncHandler) => {
      listeners[event]?.add(handler);
    }),
    off: vi.fn((event: 'sync' | 'synced', handler: SyncHandler) => {
      listeners[event]?.delete(handler);
    }),
    emit(event: 'sync' | 'synced', value?: boolean) {
      listeners[event]?.forEach((handler) => handler(value));
    },
    ...overrides,
  };

  return provider;
}

describe('collaboration-provider-sync helper', () => {
  it('detects synced state from synced/isSynced flags', () => {
    expect(isCollaborationProviderSynced(null)).toBe(false);
    expect(isCollaborationProviderSynced(undefined)).toBe(false);
    expect(isCollaborationProviderSynced({ synced: true })).toBe(true);
    expect(isCollaborationProviderSynced({ isSynced: true })).toBe(true);
    expect(isCollaborationProviderSynced({ synced: false, isSynced: false })).toBe(false);
  });

  it('runs immediately when provider is already synced', () => {
    const provider = createProvider({ synced: true });
    const onSynced = vi.fn();

    const cleanup = onCollaborationProviderSynced(provider, onSynced);

    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(provider.on).not.toHaveBeenCalled();
    cleanup();
  });

  it('waits for sync(true) and ignores sync(false)', () => {
    const provider = createProvider();
    const onSynced = vi.fn();

    onCollaborationProviderSynced(provider, onSynced);

    provider.emit('sync', false);
    expect(onSynced).not.toHaveBeenCalled();

    provider.emit('sync', true);
    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(provider.synced).toBe(true);
    expect(provider.isSynced).toBe(true);
  });

  it('runs when synced event fires', () => {
    const provider = createProvider();
    const onSynced = vi.fn();

    onCollaborationProviderSynced(provider, onSynced);
    provider.emit('synced');

    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it('cleanup removes listeners and prevents callback', () => {
    const provider = createProvider();
    const onSynced = vi.fn();

    const cleanup = onCollaborationProviderSynced(provider, onSynced);
    cleanup();
    provider.emit('synced');
    provider.emit('sync', true);

    expect(onSynced).not.toHaveBeenCalled();
  });

  it('proceeds immediately if provider has no event API', () => {
    const onSynced = vi.fn();

    onCollaborationProviderSynced({ synced: false, isSynced: false }, onSynced);

    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it('only calls onSynced once when both synced and sync events fire', () => {
    const provider = createProvider();
    const onSynced = vi.fn();

    onCollaborationProviderSynced(provider, onSynced);

    provider.emit('synced');
    provider.emit('sync', true);

    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it('catches race where provider syncs during listener registration', () => {
    const provider = createProvider();
    const onSynced = vi.fn();

    // Simulate: provider state changes while on() registers listeners
    const originalOn = provider.on.getMockImplementation()!;
    provider.on = vi.fn((event: 'sync' | 'synced', handler: SyncHandler) => {
      originalOn(event, handler);
      provider.synced = true;
    });

    onCollaborationProviderSynced(provider, onSynced);

    expect(onSynced).toHaveBeenCalledTimes(1);
  });
});
