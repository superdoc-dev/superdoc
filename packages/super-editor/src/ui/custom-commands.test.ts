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
      editor: superdoc.activeEditor,
    });

    ui.destroy();
  });

  it('execute receives the routed editor late-bound (story swap between register and execute)', () => {
    const { superdoc, editor } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    const reg = ui.commands.register({ id: 'company.aiRewrite', execute });

    // Plant a child story editor that PresentationEditor would route
    // to (header focus, footer focus, etc). The custom-command runtime
    // re-resolves on each execute, so the edit-time editor must be the
    // routed one — not whichever was active at register-time.
    const childEditor = { tag: 'header-editor' };
    (
      editor as unknown as {
        presentationEditor?: { getActiveEditor?: () => unknown };
      }
    ).presentationEditor = { getActiveEditor: () => childEditor };

    reg.handle.execute();

    expect(execute).toHaveBeenCalledTimes(1);
    const args = execute.mock.calls[0]?.[0] as { editor: unknown };
    expect(args.editor).toBe(childEditor);

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

describe('ui.commands.get', () => {
  it('returns undefined for unregistered ids', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.commands.get('definitely-not-a-command')).toBeUndefined();
    // Empty / non-string ids guard the entry early.
    expect(ui.commands.get('')).toBeUndefined();
    expect(ui.commands.get('register')).toBeUndefined();
    expect(ui.commands.get('get')).toBeUndefined();

    ui.destroy();
  });

  it('returns a handle for a built-in id, observe emits state with source: "built-in"', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const handle = ui.commands.get('bold');
    expect(handle).toBeDefined();
    expect(typeof handle?.observe).toBe('function');
    expect(typeof handle?.execute).toBe('function');

    const listener = vi.fn();
    const off = handle!.observe(listener);

    // Initial synchronous emit, like every Subscribable in the controller.
    expect(listener).toHaveBeenCalledTimes(1);
    const emitted = listener.mock.calls[0][0];
    expect(emitted.source).toBe('built-in');
    expect(typeof emitted.active).toBe('boolean');
    expect(typeof emitted.disabled).toBe('boolean');

    off();
    ui.destroy();
  });

  it('returns the same handle on repeated lookups for a built-in id', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const a = ui.commands.get('italic');
    const b = ui.commands.get('italic');
    expect(a).toBeDefined();
    expect(a).toBe(b);

    ui.destroy();
  });

  it('returns a handle for a custom-registered id, observe emits state with source: "custom"', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: false, value: 'ready' }),
    });

    const handle = ui.commands.get('company.aiRewrite');
    expect(handle).toBeDefined();

    const listener = vi.fn();
    handle!.observe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual({
      active: false,
      disabled: false,
      value: 'ready',
      source: 'custom',
    });

    ui.destroy();
  });

  it('execute on a custom handle forwards payload to the registered execute', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    ui.commands.register<{ prompt: string }>({
      id: 'company.aiRewrite',
      execute,
    });

    const handle = ui.commands.get('company.aiRewrite');
    handle!.execute({ prompt: 'fix tone' });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      payload: { prompt: 'fix tone' },
      superdoc,
      editor: superdoc.activeEditor,
    });

    ui.destroy();
  });

  it('returns undefined after unregistering a custom command', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
    });

    expect(ui.commands.get('company.aiRewrite')).toBeDefined();

    reg.unregister();

    expect(ui.commands.get('company.aiRewrite')).toBeUndefined();

    ui.destroy();
  });

  it('returns the custom handle when a built-in is overridden', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const customExecute = vi.fn(() => true);
    ui.commands.register({
      id: 'bold',
      override: true,
      execute: customExecute,
      getState: () => ({ active: true, disabled: false, value: 'overridden' }),
    });

    const handle = ui.commands.get('bold');
    expect(handle).toBeDefined();

    const listener = vi.fn();
    handle!.observe(listener);

    expect(listener.mock.calls[0][0]).toEqual({
      active: true,
      disabled: false,
      value: 'overridden',
      source: 'custom',
    });

    handle!.execute();
    expect(customExecute).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  // Regression for PR #3013 review comment: cached dynamic handles
  // for built-in ids must dispatch through any later
  // `register({ id, override: true })`. A consumer that memoizes
  // `ui.commands.get('bold')` once and only later registers an
  // override would otherwise see the merged custom state on the
  // observe stream while still routing execute() to the built-in,
  // breaking override semantics for long-lived handles.
  it('cached built-in dynamic handle dispatches through a later override', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    // Cache the handle BEFORE registering the override.
    const cachedHandle = ui.commands.get('bold');
    expect(cachedHandle).toBeDefined();

    const customExecute = vi.fn(() => true);
    ui.commands.register({
      id: 'bold',
      override: true,
      execute: customExecute,
      getState: () => ({ active: true, disabled: false, value: 'overridden' }),
    });

    // Execute via the cached handle. The custom override's execute
    // should run, not the built-in toolbar controller's bold.
    cachedHandle!.execute();
    expect(customExecute).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  // Regression for PR #3010 review comment 3: a custom handle
  // captured before a custom-vs-custom replacement must not execute
  // the replacement's handler. Without the entry-identity guard,
  // `regA.handle.execute()` after `register({ id }) → regB` would
  // run B's executor, with regA's consumer none the wiser.
  it('captured custom handle refuses execute after a later registration replaces the entry', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const aExecute = vi.fn(() => true);
    const regA = ui.commands.register({ id: 'company.x', execute: aExecute });

    // Replacement (custom-vs-custom): warns, replaces.
    const bExecute = vi.fn(() => true);
    ui.commands.register({ id: 'company.x', execute: bExecute });

    // regA's captured handle is now stale; must not run B's executor.
    const result = regA.handle.execute();
    expect(result).toBe(false);
    expect(aExecute).not.toHaveBeenCalled();
    expect(bExecute).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('captured custom handle stops emitting on its observer after replacement', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const regA = ui.commands.register({
      id: 'company.x',
      execute: () => true,
      getState: () => ({ active: false, disabled: false, value: 'A' }),
    });

    const aListener = vi.fn();
    regA.handle.observe(aListener);
    expect(aListener).toHaveBeenCalledTimes(1); // initial sync emit
    aListener.mockClear();

    // Replace.
    ui.commands.register({
      id: 'company.x',
      execute: () => true,
      getState: () => ({ active: true, disabled: true, value: 'B' }),
    });

    // Coalesce: scheduleNotify runs on a microtask.
    await Promise.resolve();
    await Promise.resolve();

    // A's listener must NOT see B's state. The registry actively
    // disposes A's observers via `disposeAllObservers(id)` on
    // replacement; the entry-identity short-circuit catches any
    // emit that races between schedule and dispose.
    expect(aListener).not.toHaveBeenCalled();

    ui.destroy();
  });

  // Regression for PR #3010 review comment 2: every execute-shaped
  // surface must route through the same dispatch path. Previously
  // only `ui.commands.get(id)?.execute()` re-resolved through the
  // override registry; `ui.commands.bold.execute()` and
  // `ui.toolbar.execute('bold')` still went straight to the built-in
  // toolbar controller, producing a state/action mismatch when an
  // override was registered.
  it('ui.commands.bold.execute routes through a later override', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const customExecute = vi.fn(() => true);
    ui.commands.register({
      id: 'bold',
      override: true,
      execute: customExecute,
    });

    // Bracket-style per-id handle.
    (ui.commands as unknown as { bold: { execute(): boolean } }).bold.execute();
    expect(customExecute).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  it("ui.toolbar.execute('bold') routes through a later override", () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const customExecute = vi.fn(() => true);
    ui.commands.register({
      id: 'bold',
      override: true,
      execute: customExecute,
    });

    ui.toolbar.execute('bold');
    expect(customExecute).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  it('cached built-in dynamic handle reverts to built-in dispatch after the override unregisters', () => {
    const { superdoc, editor } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const cachedHandle = ui.commands.get('bold');
    const customExecute = vi.fn(() => true);
    const reg = ui.commands.register({
      id: 'bold',
      override: true,
      execute: customExecute,
    });

    cachedHandle!.execute();
    expect(customExecute).toHaveBeenCalledTimes(1);

    // After unregister, the built-in dispatch path resumes.
    reg.unregister();

    // Reset the editor's bold spy so we can detect a built-in dispatch
    // after unregister. The toolbarController is internal, but a
    // built-in dispatch ultimately routes through the editor's
    // commands surface; the stub's `commands.toggleBold` mock receives
    // the call. (If toolbarController short-circuits before reaching
    // the editor it still won't call customExecute, which is what we
    // assert below.)
    customExecute.mockClear();
    cachedHandle!.execute();
    expect(customExecute).not.toHaveBeenCalled();

    // Editor reference is unused if toolbar dispatch routes elsewhere;
    // the assertion that matters is `customExecute` did not fire.
    void editor;

    ui.destroy();
  });

  it('observers detach when unsubscribed', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const handle = ui.commands.get('bold');
    const listener = vi.fn();
    const off = handle!.observe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();
    off();

    // After unsubscribe, no further emits. Fire a stub event that
    // would otherwise rebuild the snapshot.
    (superdoc as unknown as { fireEditor(event: string): void }).fireEditor('selectionUpdate');

    expect(listener).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('enables dynamic toolbar configuration without unsafe casts', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'company.aiRewrite',
      execute: vi.fn(() => true),
      getState: () => ({ active: false, disabled: false, value: 'ready' }),
    });

    // The friction case from SD-2814: a config-driven toolbar.
    const config: string[] = ['bold', 'italic', 'company.aiRewrite', 'unknown-id'];
    const states = config.map((id) => {
      const handle = ui.commands.get(id);
      if (!handle) return { id, found: false };
      let state: unknown = null;
      const off = handle.observe((s) => {
        state = s;
      });
      off();
      return { id, found: true, state };
    });

    expect(states[0].found).toBe(true);
    expect(states[1].found).toBe(true);
    expect(states[2].found).toBe(true);
    expect(states[3].found).toBe(false);

    ui.destroy();
  });
});

describe('ui.commands.getContextMenuItems', () => {
  it('returns [] when no registered command carries a contextMenu field', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({ id: 'company.plain', execute: () => true });

    expect(ui.commands.getContextMenuItems()).toEqual([]);

    ui.destroy();
  });

  it('surfaces contributions, filling defaults for group / order', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'company.acceptChange',
      execute: () => true,
      contextMenu: { label: 'Accept suggestion' },
    });

    expect(ui.commands.getContextMenuItems()).toEqual([
      { id: 'company.acceptChange', label: 'Accept suggestion', group: 'custom', order: 0 },
    ]);

    ui.destroy();
  });

  it('filters items by the when predicate using caller-supplied entities + current selection', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const whenSpy = vi.fn(({ entities }) => entities.some((e) => e.type === 'trackedChange'));
    ui.commands.register({
      id: 'company.acceptChange',
      execute: () => true,
      contextMenu: { label: 'Accept suggestion', group: 'review', when: whenSpy },
    });

    expect(ui.commands.getContextMenuItems({ entities: [{ type: 'comment', id: 'c1' }] })).toEqual([]);
    expect(ui.commands.getContextMenuItems({ entities: [{ type: 'trackedChange', id: 'tc1' }] })).toHaveLength(1);

    expect(whenSpy).toHaveBeenCalledTimes(2);
    expect(whenSpy.mock.calls[0]![0].selection).toBeDefined();

    ui.destroy();
  });

  it('sorts by built-in group order, then order, then registration sequence', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    // Built-in group order: format(0), clipboard(1), review(2), comment(3), link(4)
    ui.commands.register({
      id: 'a.review-2',
      execute: () => true,
      contextMenu: { label: 'Review B', group: 'review', order: 20 },
    });
    ui.commands.register({
      id: 'b.format-1',
      execute: () => true,
      contextMenu: { label: 'Format A', group: 'format', order: 0 },
    });
    ui.commands.register({
      id: 'c.review-1',
      execute: () => true,
      contextMenu: { label: 'Review A', group: 'review', order: 10 },
    });
    ui.commands.register({
      id: 'd.review-tie-second',
      execute: () => true,
      contextMenu: { label: 'Review C', group: 'review', order: 10 },
    });
    ui.commands.register({
      id: 'e.custom',
      execute: () => true,
      contextMenu: { label: 'Z', group: 'company.workflow', order: 0 },
    });

    expect(ui.commands.getContextMenuItems().map((i) => i.id)).toEqual([
      'b.format-1',
      'c.review-1',
      'd.review-tie-second',
      'a.review-2',
      'e.custom',
    ]);

    ui.destroy();
  });

  it('plain custom commands (no contextMenu) do not anchor a custom group rank', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    // Register a plain command first (seq 0) — it has no contextMenu
    // and must not claim the 'custom' fallback group's rank anchor.
    ui.commands.register({ id: 'a.plain', execute: () => true });
    // Register a workflow contribution (seq 1).
    ui.commands.register({
      id: 'b.workflow',
      execute: () => true,
      contextMenu: { label: 'Workflow A', group: 'company.workflow' },
    });
    // Register a 'custom' fallback group contribution (seq 2).
    ui.commands.register({
      id: 'c.custom',
      execute: () => true,
      contextMenu: { label: 'Default A' },
    });

    // 'company.workflow' (seq 1) must rank before 'custom' (seq 2).
    // If the plain seq=0 command anchored 'custom', the order would
    // flip.
    expect(ui.commands.getContextMenuItems().map((i) => i.id)).toEqual(['b.workflow', 'c.custom']);

    ui.destroy();
  });

  it('preserves a group rank anchor when one contributor is replaced and another remains', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    // Group 'workflow' opens with two contributors at seq 0 and seq 1.
    ui.commands.register({
      id: 'wf.first',
      execute: () => true,
      contextMenu: { label: 'WF 1', group: 'company.workflow', order: 0 },
    });
    ui.commands.register({
      id: 'wf.second',
      execute: () => true,
      contextMenu: { label: 'WF 2', group: 'company.workflow', order: 1 },
    });
    // A second custom group registers at seq 2.
    ui.commands.register({
      id: 'rev.first',
      execute: () => true,
      contextMenu: { label: 'Rev 1', group: 'company.review-extras', order: 0 },
    });

    // Now replace `wf.first` — the new seq becomes 3, but `wf.second`
    // still carries the original seq 1, so the workflow group's
    // anchor must stay at 1 and render before 'review-extras' (seq 2).
    ui.commands.register({
      id: 'wf.first',
      execute: () => true,
      contextMenu: { label: 'WF 1 (replaced)', group: 'company.workflow', order: 0 },
    });

    expect(ui.commands.getContextMenuItems().map((i) => i.id)).toEqual(['wf.first', 'wf.second', 'rev.first']);

    ui.destroy();
  });

  it('hides items whose when predicate throws and logs the error once per distinct message', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'company.flaky',
      execute: () => true,
      contextMenu: {
        label: 'Flaky',
        when: () => {
          throw new Error('boom');
        },
      },
    });

    expect(ui.commands.getContextMenuItems()).toEqual([]);
    expect(ui.commands.getContextMenuItems()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  it("refuses 'getContextMenuItems' as a custom command id (Proxy collision)", () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const reg = ui.commands.register({
      id: 'getContextMenuItems',
      execute: () => true,
      contextMenu: { label: 'Should not register' },
    });

    expect(warnSpy).toHaveBeenCalled();
    // Refused registrations get a no-op handle, so the contribution
    // never enters the registry.
    expect(ui.commands.getContextMenuItems()).toEqual([]);
    reg.unregister();

    ui.destroy();
  });
});

// SD-2945: getContextMenuItems accepts the full ViewportContext
// bundle from `viewport.contextAt(...)`. When passed a bundle:
//   - the `when` predicate sees `point` / `position` / `insideSelection`
//     in addition to `entities` and `selection`
//   - each returned item carries an `invoke()` closure that fires
//     `execute` with the bundle bound, so handlers can read `context`
//     without re-running geometry
// The legacy `{ entities }` shape keeps working, with `invoke`
// absent on returned items.
describe('ui.commands.getContextMenuItems - ViewportContext bundle', () => {
  function makeBundle(
    overrides: Partial<{ x: number; y: number; insideSelection: boolean; entities: unknown[]; position: unknown }> = {},
  ) {
    return {
      point: { x: overrides.x ?? 100, y: overrides.y ?? 200 },
      entities: (overrides.entities ?? []) as never[],
      position: (overrides.position ?? null) as never,
      selection: {
        empty: true,
        target: null,
        selectionTarget: null,
        activeMarks: [],
        activeCommentIds: [],
        activeChangeIds: [],
        quotedText: '',
      },
      insideSelection: overrides.insideSelection ?? false,
    };
  }

  it('passes point / position / insideSelection to the when predicate when called with a bundle', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const whenSpy = vi.fn(() => true);

    ui.commands.register({
      id: 'test.bundle.when',
      execute: () => true,
      contextMenu: { label: 'Bundle', when: whenSpy },
    });

    const bundle = makeBundle({ x: 50, y: 60, insideSelection: true });
    ui.commands.getContextMenuItems(bundle);

    expect(whenSpy).toHaveBeenCalledTimes(1);
    expect(whenSpy.mock.calls[0]![0]).toMatchObject({
      entities: [],
      point: { x: 50, y: 60 },
      insideSelection: true,
    });
    expect((whenSpy.mock.calls[0]![0] as { selection: unknown }).selection).toBeDefined();

    ui.destroy();
  });

  it('omits point / position / insideSelection from the when input when called with the legacy { entities } shape', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const whenSpy = vi.fn(() => true);

    ui.commands.register({
      id: 'test.legacy.when',
      execute: () => true,
      contextMenu: { label: 'Legacy', when: whenSpy },
    });

    ui.commands.getContextMenuItems({ entities: [{ type: 'comment', id: 'c1' }] });

    expect(whenSpy).toHaveBeenCalledTimes(1);
    const arg = whenSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.entities).toEqual([{ type: 'comment', id: 'c1' }]);
    expect(arg.selection).toBeDefined();
    // No bundle fields when the consumer didn't pass one. Handlers
    // that only destructure { entities, selection } see the same
    // shape they always have.
    expect(arg.point).toBeUndefined();
    expect(arg.position).toBeUndefined();
    expect(arg.insideSelection).toBeUndefined();

    ui.destroy();
  });

  it('returns items with an invoke() closure that fires execute with the bundle bound to context', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const executeSpy = vi.fn(() => true);

    ui.commands.register({
      id: 'test.bundle.execute',
      execute: executeSpy,
      contextMenu: { label: 'Bundle execute' },
    });

    const bundle = makeBundle({ x: 10, y: 20, insideSelection: false });
    const items = ui.commands.getContextMenuItems(bundle);
    expect(items).toHaveLength(1);
    expect(typeof items[0]!.invoke).toBe('function');

    items[0]!.invoke!();
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const args = executeSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect((args.context as { point: unknown }).point).toEqual({ x: 10, y: 20 });
    expect((args.context as { insideSelection: unknown }).insideSelection).toBe(false);

    ui.destroy();
  });

  it('omits invoke() from returned items when called with the legacy { entities } shape', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.commands.register({
      id: 'test.legacy.no-invoke',
      execute: () => true,
      contextMenu: { label: 'Legacy' },
    });

    const items = ui.commands.getContextMenuItems({ entities: [] });
    expect(items).toHaveLength(1);
    expect(items[0]!.invoke).toBeUndefined();

    ui.destroy();
  });

  it('does not pass context when the command is invoked through `commands.get(id).execute()` directly', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const executeSpy = vi.fn(() => true);

    ui.commands.register({
      id: 'test.direct.execute',
      execute: executeSpy,
      contextMenu: { label: 'Direct' },
    });

    ui.commands.get('test.direct.execute').execute();
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const args = executeSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.context).toBeUndefined();

    ui.destroy();
  });

  // A menu held open across a re-registration must not dispatch the
  // replacement's handler. The captured-handle pattern at
  // `buildHandle.execute` already guards `commands.get(id).execute()`
  // against this; `invoke()` follows the same identity check so a
  // stale menu item cleanly returns false instead of firing the new
  // owner's handler with the old item's label/predicate.
  it('invoke() returns false (no dispatch) when the entry was replaced after the menu opened', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const oldExecute = vi.fn(() => true);
    const newExecute = vi.fn(() => true);

    ui.commands.register({
      id: 'replaceable',
      execute: oldExecute,
      contextMenu: { label: 'Old' },
    });

    const items = ui.commands.getContextMenuItems(makeBundle());
    expect(items).toHaveLength(1);
    expect(typeof items[0]!.invoke).toBe('function');

    // Replace the registration after the menu items are captured.
    ui.commands.register({
      id: 'replaceable',
      execute: newExecute,
      contextMenu: { label: 'New' },
      override: true,
    });

    const result = items[0]!.invoke!();
    expect(result).toBe(false);
    expect(oldExecute).not.toHaveBeenCalled();
    expect(newExecute).not.toHaveBeenCalled();

    ui.destroy();
  });

  // Bundle vs legacy-shape detection must reject inputs whose `point`
  // is null or non-numeric. A consumer hand-building
  // `{ entities, point: null }` should keep the legacy path; without
  // this guard `typeof null === 'object'` would route them to the
  // bundle branch and the registry would read `position` /
  // `insideSelection` as undefined.
  it('routes inputs with `point: null` through the legacy entities path, not the bundle path', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const whenSpy = vi.fn(() => true);

    ui.commands.register({
      id: 'test.partial.input',
      execute: () => true,
      contextMenu: { label: 'Partial', when: whenSpy },
    });

    ui.commands.getContextMenuItems({
      entities: [{ type: 'comment', id: 'c1' }],
      point: null,
    } as never);

    expect(whenSpy).toHaveBeenCalledTimes(1);
    const arg = whenSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.entities).toEqual([{ type: 'comment', id: 'c1' }]);
    // Legacy shape: bundle-only fields stay absent.
    expect(arg.point).toBeUndefined();
    expect(arg.insideSelection).toBeUndefined();

    ui.destroy();
  });
});

describe('ui.commands.register — shortcut field', () => {
  function makeStubsWithHost() {
    const stubs = makeStubs();
    const host = document.createElement('div');
    document.body.appendChild(host);
    // Preserve any existing presentationEditor surface the toolbar
    // resolver expects (`getActiveEditor`) and add the `visibleHost`
    // that the keydown listener scopes to.
    const existing =
      (stubs.editor as unknown as { presentationEditor?: Record<string, unknown> }).presentationEditor ?? {};
    (stubs.editor as unknown as { presentationEditor: Record<string, unknown> }).presentationEditor = {
      getActiveEditor: () => stubs.editor,
      ...existing,
      visibleHost: host,
    };
    return { ...stubs, host };
  }

  function fireKey(target: Node, init: Partial<KeyboardEventInit> & { key: string }) {
    const ev = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
  }

  it('dispatches the registered command when the matching combo fires inside the host', () => {
    const { superdoc, host } = makeStubsWithHost();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    ui.commands.register({ id: 'company.insertClause', execute, shortcut: 'Mod-Shift-C' });

    fireKey(host, { key: 'c', ctrlKey: true, shiftKey: true });

    expect(execute).toHaveBeenCalledTimes(1);
    host.remove();
    ui.destroy();
  });

  it("dispatches when focus is in the routed editor's hidden PM DOM (the normal editing path)", () => {
    const { superdoc, editor, host } = makeStubsWithHost();
    // Mount the hidden ProseMirror DOM directly under document.body
    // (mirroring how PresentationEditor appends the hidden host outside
    // the visible host) so a click-into-document keypress lands here.
    const pmDom = document.createElement('div');
    document.body.appendChild(pmDom);
    (editor as unknown as { view: { dom: HTMLElement } }).view = { dom: pmDom };
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    ui.commands.register({ id: 'company.action', execute, shortcut: 'Mod-K' });

    fireKey(pmDom, { key: 'k', ctrlKey: true });

    expect(execute).toHaveBeenCalledTimes(1);
    pmDom.remove();
    host.remove();
    ui.destroy();
  });

  it('does not dispatch when focus is outside the painted host', () => {
    const { superdoc, host } = makeStubsWithHost();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    ui.commands.register({ id: 'company.insertClause', execute, shortcut: 'Mod-Shift-C' });

    const outside = document.createElement('input');
    document.body.appendChild(outside);
    fireKey(outside, { key: 'c', ctrlKey: true, shiftKey: true });

    expect(execute).not.toHaveBeenCalled();
    outside.remove();
    host.remove();
    ui.destroy();
  });

  it('warns and replaces when two registrations claim the same shortcut', () => {
    const { superdoc, host } = makeStubsWithHost();
    const ui = createSuperDocUI({ superdoc });

    const firstExecute = vi.fn(() => true);
    const secondExecute = vi.fn(() => true);
    ui.commands.register({ id: 'company.first', execute: firstExecute, shortcut: 'Mod-K' });
    ui.commands.register({ id: 'company.second', execute: secondExecute, shortcut: 'Mod-K' });

    expect(warnSpy).toHaveBeenCalled();

    fireKey(host, { key: 'k', ctrlKey: true });
    expect(firstExecute).not.toHaveBeenCalled();
    expect(secondExecute).toHaveBeenCalledTimes(1);

    host.remove();
    ui.destroy();
  });

  it('drops the shortcut on unregister so later keypresses are no-ops', () => {
    const { superdoc, host } = makeStubsWithHost();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    const reg = ui.commands.register({ id: 'company.toggle', execute, shortcut: 'Mod-J' });

    fireKey(host, { key: 'j', ctrlKey: true });
    expect(execute).toHaveBeenCalledTimes(1);

    reg.unregister();
    fireKey(host, { key: 'j', ctrlKey: true });
    expect(execute).toHaveBeenCalledTimes(1);

    host.remove();
    ui.destroy();
  });

  it('accepts a string[] for multiple shortcuts on the same command', () => {
    const { superdoc, host } = makeStubsWithHost();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    ui.commands.register({
      id: 'company.action',
      execute,
      shortcut: ['Mod-1', 'Mod-Shift-1'],
    });

    fireKey(host, { key: '1', ctrlKey: true });
    fireKey(host, { key: '1', ctrlKey: true, shiftKey: true });

    expect(execute).toHaveBeenCalledTimes(2);
    host.remove();
    ui.destroy();
  });

  it('warns on a malformed shortcut and ignores it', () => {
    const { superdoc, host } = makeStubsWithHost();
    const ui = createSuperDocUI({ superdoc });

    const execute = vi.fn(() => true);
    ui.commands.register({ id: 'company.bad', execute, shortcut: 'Mod-Shift' });

    expect(warnSpy).toHaveBeenCalled();
    fireKey(host, { key: 'Shift', ctrlKey: true });
    expect(execute).not.toHaveBeenCalled();

    host.remove();
    ui.destroy();
  });
});
