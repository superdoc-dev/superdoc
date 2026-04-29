import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

function makeStubs() {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const editor = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!editorListeners.has(event)) editorListeners.set(event, new Set());
      editorListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      editorListeners.get(event)?.delete(handler);
    }),
    state: { selection: { empty: true, from: 0, to: 0 } },
    options: { documentId: 'doc-1', isHeaderOrFooter: false },
    commands: { toggleBold: vi.fn(() => true) },
    isEditable: true,
    doc: {
      selection: {
        current: vi.fn(() => ({ empty: true, text: '', target: null })),
      },
    },
  };

  const superdoc: SuperDocLike & {
    fireEditor(event: string, ...args: unknown[]): void;
    fireSuperdoc(event: string, ...args: unknown[]): void;
  } = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!superdocListeners.has(event)) superdocListeners.set(event, new Set());
      superdocListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      superdocListeners.get(event)?.delete(handler);
    }),
    fireEditor(event, ...args) {
      const handlers = editorListeners.get(event);
      if (!handlers) return;
      [...handlers].forEach((handler) => handler(...args));
    },
    fireSuperdoc(event, ...args) {
      const handlers = superdocListeners.get(event);
      if (!handlers) return;
      [...handlers].forEach((handler) => handler(...args));
    },
  };

  return { superdoc, editor };
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Mute and capture console output. Tests assert on the call shapes
  // explicitly; muting prevents the warnings from polluting the test
  // runner's stdout.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('ui.commands.register', () => {
  it('returns a registration object with handle / invalidate / unregister', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
    });

    expect(reg.handle).toBeDefined();
    expect(typeof reg.handle.observe).toBe('function');
    expect(typeof reg.handle.execute).toBe('function');
    expect(typeof reg.invalidate).toBe('function');
    expect(typeof reg.unregister).toBe('function');

    ui.destroy();
  });

  it('execute is called with payload and superdoc host', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    const reg = ui.commands.register<{ prompt: string }>({
      id: 'company.aiRewrite',
      execute,
    });

    reg.handle.execute({ prompt: 'fix tone' });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      payload: { prompt: 'fix tone' },
      superdoc,
    });

    ui.destroy();
  });

  it('observe fires once synchronously with current state', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: true, value: 42 }),
    });

    const listener = vi.fn();
    const off = reg.handle.observe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual({
      active: false,
      disabled: true,
      value: 42,
      source: 'custom',
    });

    off();
    ui.destroy();
  });

  it('observe re-fires when invalidate is called and state changes', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    let externalDisabled = true;
    const reg = ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: externalDisabled }),
    });

    const listener = vi.fn();
    reg.handle.observe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    externalDisabled = false;
    reg.invalidate();

    // Snapshot rebuild is microtask-coalesced.
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0].disabled).toBe(false);

    ui.destroy();
  });

  it('snapshot.commands carries source: "custom" for registered ids', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: false, value: 'ready' }),
    });

    const snapshot = ui.toolbar.getSnapshot();
    expect(snapshot.commands['company.aiRewrite']).toEqual({
      active: false,
      disabled: false,
      value: 'ready',
      source: 'custom',
    });

    ui.destroy();
  });

  it('snapshot.commands carries source: "built-in" for built-in ids', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const snapshot = ui.toolbar.getSnapshot();
    const bold = snapshot.commands.bold;
    expect(bold).toBeDefined();
    expect(bold.source).toBe('built-in');

    ui.destroy();
  });

  it('built-in collision warns and refuses by default', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const consumerExecute = vi.fn(() => true);
    const reg = ui.commands.register({
      id: 'bold',
      execute: consumerExecute,
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("'bold'");
    expect(warnSpy.mock.calls[0][0]).toContain('built-in');

    // Calling execute on the refused handle returns false and warns.
    const result = reg.handle.execute();
    expect(result).toBe(false);
    expect(consumerExecute).not.toHaveBeenCalled();

    // The bold snapshot entry stays a built-in.
    const snapshot = ui.toolbar.getSnapshot();
    expect(snapshot.commands.bold.source).toBe('built-in');

    ui.destroy();
  });

  it('built-in collision succeeds with override: true', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'bold',
      override: true,
      execute: vi.fn(() => true),
      getState: () => ({ active: true, disabled: false, value: 'overridden' }),
    });

    expect(warnSpy).not.toHaveBeenCalled();

    // The bold snapshot entry is now custom.
    const snapshot = ui.toolbar.getSnapshot();
    expect(snapshot.commands.bold).toEqual({
      active: true,
      disabled: false,
      value: 'overridden',
      source: 'custom',
    });

    reg.unregister();
    ui.destroy();
  });

  it('custom-vs-custom replacement warns and replaces', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const firstExecute = vi.fn(() => true);
    const secondExecute = vi.fn(() => true);

    ui.commands.register({ id: 'company.x', execute: firstExecute });
    expect(warnSpy).not.toHaveBeenCalled();

    const second = ui.commands.register({ id: 'company.x', execute: secondExecute });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Replacing');

    second.handle.execute();
    expect(secondExecute).toHaveBeenCalledTimes(1);
    expect(firstExecute).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('unregister is idempotent and removes the snapshot entry', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
    });

    expect(ui.toolbar.getSnapshot().commands['company.aiRewrite']).toBeDefined();

    reg.unregister();
    expect(ui.toolbar.getSnapshot().commands['company.aiRewrite']).toBeUndefined();

    // Calling twice is a no-op.
    expect(() => reg.unregister()).not.toThrow();

    ui.destroy();
  });

  it('getState throwing falls back to static state and logs once per unique error', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.broken',
      execute: vi.fn(() => true),
      getState: () => {
        throw new Error('boom');
      },
    });

    const snapshot = ui.toolbar.getSnapshot();
    expect(snapshot.commands['company.broken']).toEqual({
      active: false,
      disabled: false,
      value: undefined,
      source: 'custom',
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('boom');

    // Force a rebuild — same error message → no second log.
    reg.invalidate();
    ui.toolbar.getSnapshot();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  it('async execute resolves to a boolean', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register<{ url: string }>({
      id: 'company.upload',
      execute: async ({ payload }) => {
        // Simulate the upload completing.
        await Promise.resolve();
        return payload?.url ? true : false;
      },
    });

    const result = await reg.handle.execute({ url: 'https://example.com/cat.png' });
    expect(result).toBe(true);

    ui.destroy();
  });

  it('execute throwing returns false and logs', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.throws',
      execute: () => {
        throw new Error('execute boom');
      },
    });

    const result = reg.handle.execute();
    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("'company.throws'");

    ui.destroy();
  });

  it('omitting getState yields a static disabled-false snapshot entry', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'company.static',
      execute: vi.fn(() => true),
    });

    expect(ui.toolbar.getSnapshot().commands['company.static']).toEqual({
      active: false,
      disabled: false,
      value: undefined,
      source: 'custom',
    });

    ui.destroy();
  });

  // Regression: PR #3004 review.
  // Default payload generic must allow zero-arg execute. Without the
  // `void` default, `register({ id, execute: () => true })` returned a
  // handle whose `execute()` was a type error.
  it('register() without a payload generic permits zero-arg execute', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.refresh',
      execute: () => true,
    });

    // Type-level: no `<void>` generic needed. Runtime: returns boolean.
    expect(reg.handle.execute()).toBe(true);

    ui.destroy();
  });

  // Regression: PR #3004 review.
  // `snapshot.commands[id]` must be `UIToolbarCommandState | undefined`
  // so consumers can't crash on `.disabled` when the id isn't registered.
  it('snapshot.commands returns undefined for unregistered ids', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const snapshot = ui.toolbar.getSnapshot();
    const entry = snapshot.commands['company.never.registered'];
    expect(entry).toBeUndefined();
    // Safe-guard pattern is the documented one:
    expect(entry?.disabled).toBeUndefined();

    ui.destroy();
  });

  // Regression: PR #3004 review.
  // A custom command (mirroring built-ins like `link` / `text-color`) may
  // legitimately use `null` to mean "no current value". The previous
  // `derived?.value ?? STATIC_CUSTOM_STATE.value` collapsed null → undefined.
  it('preserves null returned from getState as a meaningful value', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'company.maybeLink',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: false, value: null }),
    });

    expect(ui.toolbar.getSnapshot().commands['company.maybeLink']?.value).toBe(null);

    ui.destroy();
  });

  // Regression: PR #3004 review.
  // After unregister, observers attached via `reg.handle.observe(...)`
  // must stop firing. Otherwise the subsequent rebuild emits the static
  // fallback `{ disabled: false }` and a button bound to the observer
  // would stay enabled even though the command is gone.
  it('observers stop firing after unregister', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.gated',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: false }),
    });

    const listener = vi.fn();
    reg.handle.observe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    reg.unregister();
    await Promise.resolve();
    await Promise.resolve();

    // No further emissions after unregister — the listener saw exactly
    // the initial-subscribe call and nothing else.
    expect(listener).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  // Regression: PR #3004 review (bot P1).
  // When consumer A registers an id and consumer B replaces it, A holds
  // a stale registration object whose `unregister()` would blindly call
  // `entries.delete(id)` and remove B's active registration. Identity
  // check on the captured entry must reject the stale call.
  it('A.unregister after B replaced is a no-op for the live registration', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const aExecute = vi.fn(() => true);
    const bExecute = vi.fn(() => true);

    const a = ui.commands.register({ id: 'company.x', execute: aExecute });
    const b = ui.commands.register({ id: 'company.x', execute: bExecute });

    a.unregister();

    // B is still live and dispatchable.
    expect(ui.toolbar.getSnapshot().commands['company.x']).toBeDefined();
    b.handle.execute();
    expect(bExecute).toHaveBeenCalledTimes(1);
    expect(aExecute).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('A.invalidate after B replaced is a no-op (does not re-emit B as A)', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const a = ui.commands.register({
      id: 'company.x',
      execute: vi.fn(() => true),
      getState: () => ({ active: true, disabled: false }),
    });
    const b = ui.commands.register({
      id: 'company.x',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: false }),
    });

    const listener = vi.fn();
    b.handle.observe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    // Stale invalidate from the prior owner — should NOT trigger a rebuild
    // for B's observer.
    a.invalidate();
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  // Regression: PR #3004 review (bot P2).
  // Replacement via `register` again should actively detach observers
  // attached to the prior registration, not just bust the cache.
  it('replacing a registration disposes observers attached to the prior one', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const a = ui.commands.register({
      id: 'company.y',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: false }),
    });

    const aListener = vi.fn();
    a.handle.observe(aListener);
    expect(aListener).toHaveBeenCalledTimes(1);

    // Replace.
    ui.commands.register({
      id: 'company.y',
      execute: vi.fn(() => true),
      getState: () => ({ active: true, disabled: true }),
    });

    await Promise.resolve();
    await Promise.resolve();

    // A's listener must NOT see the replacement's state — it was bound
    // to the prior registration's handle.
    expect(aListener).toHaveBeenCalledTimes(1);

    ui.destroy();
  });
});
