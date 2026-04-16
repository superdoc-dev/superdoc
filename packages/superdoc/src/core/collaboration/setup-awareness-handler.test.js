import { describe, it, expect, vi } from 'vitest';

vi.mock('y-websocket', () => ({ WebsocketProvider: class {} }));
vi.mock('@hocuspocus/provider', () => ({ HocuspocusProvider: class {} }));
vi.mock('yjs', () => ({ Doc: class {} }));
vi.mock('@superdoc/common/collaboration/awareness', () => ({
  awarenessStatesToArray: vi.fn(() => [{ name: 'X' }]),
}));

import { setupAwarenessHandler } from './collaboration.js';

const makeAwareness = (overrides = {}) => {
  const listeners = new Map();
  return {
    setLocalStateField: vi.fn(),
    on: vi.fn((event, fn) => listeners.set(event, fn)),
    off: vi.fn(),
    getStates: vi.fn(() => new Map([[1, { user: { name: 'Alice' } }]])),
    _listeners: listeners,
    ...overrides,
  };
};

describe('setupAwarenessHandler', () => {
  it('warns and returns a no-op cleanup when provider has no awareness', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cleanup = setupAwarenessHandler({}, { emit: vi.fn() }, { name: 'A' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing awareness'));
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
    warn.mockRestore();
  });

  it('sets the local user state when setLocalStateField is available', () => {
    const awareness = makeAwareness();
    const user = { name: 'Alice', email: 'a@x.com' };
    setupAwarenessHandler({ awareness }, { emit: vi.fn() }, user);
    expect(awareness.setLocalStateField).toHaveBeenCalledWith('user', user);
  });

  it('skips setLocalStateField when user is falsy', () => {
    const awareness = makeAwareness();
    setupAwarenessHandler({ awareness }, { emit: vi.fn() }, null);
    expect(awareness.setLocalStateField).not.toHaveBeenCalled();
  });

  it('skips setLocalStateField when awareness has no such method', () => {
    const awareness = makeAwareness({ setLocalStateField: undefined });
    setupAwarenessHandler({ awareness }, { emit: vi.fn() }, { name: 'A' });
    // no throw
  });

  it('listens on change and invokes awarenessHandler on emission', () => {
    const awareness = makeAwareness();
    const emit = vi.fn();
    setupAwarenessHandler({ awareness }, { emit }, { name: 'A' });
    expect(awareness.on).toHaveBeenCalledWith('change', expect.any(Function));
    const handler = awareness._listeners.get('change');
    handler({ added: [1], removed: [] });
    expect(emit).toHaveBeenCalledWith('awareness-update', expect.objectContaining({ added: [1], removed: [] }));
  });

  it('cleanup removes the change listener when awareness.off is available', () => {
    const awareness = makeAwareness();
    const cleanup = setupAwarenessHandler({ awareness }, { emit: vi.fn() }, { name: 'A' });
    cleanup();
    expect(awareness.off).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('cleanup is a no-op when awareness.off is not a function', () => {
    const awareness = makeAwareness({ off: 'not-a-function' });
    const cleanup = setupAwarenessHandler({ awareness }, { emit: vi.fn() }, { name: 'A' });
    expect(() => cleanup()).not.toThrow();
  });
});
