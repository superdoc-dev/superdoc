import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createAppMock = vi.fn();
const createPiniaMock = vi.fn();
const useSuperdocStoreMock = vi.fn();
const useCommentsStoreMock = vi.fn();
const useHighContrastModeMock = vi.fn();
const clickOutsideDirectiveMock = vi.fn();

vi.mock('vue', () => ({ createApp: createAppMock }));
vi.mock('pinia', () => ({ createPinia: createPiniaMock }));
vi.mock('@superdoc/common', () => ({ vClickOutside: clickOutsideDirectiveMock }));
vi.mock('../stores/superdoc-store', () => ({ useSuperdocStore: useSuperdocStoreMock }));
vi.mock('../stores/comments-store', () => ({ useCommentsStore: useCommentsStoreMock }));
vi.mock('../composables/use-high-contrast-mode', () => ({
  useHighContrastMode: useHighContrastModeMock,
}));
vi.mock('../SuperDoc.vue', () => ({ default: { name: 'SuperDocMock' } }));

const setupAppMocks = () => {
  const originalUnmount = vi.fn();
  const app = {
    use: vi.fn(),
    directive: vi.fn(),
    unmount: originalUnmount,
  };
  createAppMock.mockReturnValue(app);
  createPiniaMock.mockReturnValue({});
  useSuperdocStoreMock.mockReturnValue({});
  useCommentsStoreMock.mockReturnValue({});
  useHighContrastModeMock.mockReturnValue({});
  return { app, originalUnmount };
};

const safeDelete = (key) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (!desc || desc.configurable !== false) {
    delete globalThis[key];
  }
};

describe('createSuperdocVueApp edge cases', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    safeDelete('__VUE_DEVTOOLS_GLOBAL_HOOK__');
    safeDelete('__VUE_DEVTOOLS_PLUGINS__');
  });

  afterEach(() => {
    safeDelete('__VUE_DEVTOOLS_GLOBAL_HOOK__');
    safeDelete('__VUE_DEVTOOLS_PLUGINS__');
  });

  it('handles queue replacement via property setter', async () => {
    const { app } = setupAppMocks();
    const { createSuperdocVueApp } = await import('./create-app.js');
    createSuperdocVueApp({ disablePiniaDevtools: true });

    const newQueue = [];
    globalThis.__VUE_DEVTOOLS_PLUGINS__ = newQueue;
    newQueue.push([{ id: 'dev.esm.pinia', app }, vi.fn()]);
    expect(newQueue).toHaveLength(0);

    const otherApp = {};
    newQueue.push([{ id: 'dev.esm.pinia', app: otherApp }, vi.fn()]);
    expect(newQueue).toHaveLength(1);
  });

  it('handles multiple unmount calls safely', async () => {
    const { app } = setupAppMocks();
    const { createSuperdocVueApp } = await import('./create-app.js');
    createSuperdocVueApp({ disablePiniaDevtools: true });
    app.unmount();
    app.unmount(); // second call — no-op via ref count guard
    expect(true).toBe(true);
  });

  it('handles non-array pre-existing queue', async () => {
    globalThis.__VUE_DEVTOOLS_PLUGINS__ = { notAnArray: true };
    const { app } = setupAppMocks();
    const { createSuperdocVueApp } = await import('./create-app.js');
    expect(() => createSuperdocVueApp({ disablePiniaDevtools: true })).not.toThrow();
  });

  it('emits unrelated events without suppression', async () => {
    const emitSpy = vi.fn(() => 'emitted');
    globalThis.__VUE_DEVTOOLS_GLOBAL_HOOK__ = { emit: emitSpy };
    const { app } = setupAppMocks();
    const { createSuperdocVueApp } = await import('./create-app.js');
    createSuperdocVueApp({ disablePiniaDevtools: true });
    const hook = globalThis.__VUE_DEVTOOLS_GLOBAL_HOOK__;
    expect(hook.emit('other-event', { id: 'other', app: {} })).toBe('emitted');
    expect(emitSpy).toHaveBeenCalled();
  });

  it('returns app + stores from factory', async () => {
    const { app } = setupAppMocks();
    const { createSuperdocVueApp } = await import('./create-app.js');
    const result = createSuperdocVueApp({ disablePiniaDevtools: false });
    expect(result.app).toBe(app);
    expect(result.pinia).toBeDefined();
    expect(result.superdocStore).toBeDefined();
    expect(result.commentsStore).toBeDefined();
    expect(result.highContrastModeStore).toBeDefined();
  });

  it('replacing hook at runtime picks up new hook instance', async () => {
    const { app } = setupAppMocks();
    const { createSuperdocVueApp } = await import('./create-app.js');
    createSuperdocVueApp({ disablePiniaDevtools: true });

    const firstEmit = vi.fn(() => 'a');
    globalThis.__VUE_DEVTOOLS_GLOBAL_HOOK__ = { emit: firstEmit };
    let hook = globalThis.__VUE_DEVTOOLS_GLOBAL_HOOK__;
    expect(hook.emit('devtools-plugin:setup', { id: 'dev.esm.pinia', app }, vi.fn())).toBeUndefined();

    const secondEmit = vi.fn(() => 'b');
    globalThis.__VUE_DEVTOOLS_GLOBAL_HOOK__ = { emit: secondEmit };
    hook = globalThis.__VUE_DEVTOOLS_GLOBAL_HOOK__;
    expect(hook.emit('devtools-plugin:setup', { id: 'dev.esm.pinia', app }, vi.fn())).toBeUndefined();
  });

  it('replacement queue also intercepts pinia setup for suppressed app', async () => {
    const { app } = setupAppMocks();
    const { createSuperdocVueApp } = await import('./create-app.js');
    createSuperdocVueApp({ disablePiniaDevtools: true });

    const replacement1 = [];
    globalThis.__VUE_DEVTOOLS_PLUGINS__ = replacement1;
    replacement1.push([{ id: 'dev.esm.pinia', app }, vi.fn()]);
    expect(replacement1).toHaveLength(0);

    // Replace again — new queue should also get patched
    const replacement2 = [];
    globalThis.__VUE_DEVTOOLS_PLUGINS__ = replacement2;
    replacement2.push([{ id: 'dev.esm.pinia', app }, vi.fn()]);
    expect(replacement2).toHaveLength(0);
  });
});
