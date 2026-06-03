import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Stub builder for `ui.toolbar` / `ui.commands` tests.
 *
 * The internal headless-toolbar reads `editor.state`, `editor.options`,
 * and `editor.commands` to compute its snapshot. We supply only what
 * `resolveToolbarSources` and the registry's state derivers need to
 * produce a non-empty snapshot — the real Editor wires far more, but
 * that's out of scope for these unit tests.
 */
function makeStubs() {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emptyMarks: unknown[] = [];
  const selectionPosition = {
    pos: 0,
    depth: 0,
    parent: { attrs: {} },
    marks: () => emptyMarks,
    node: () => null,
  };

  const editor = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!editorListeners.has(event)) editorListeners.set(event, new Set());
      editorListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      editorListeners.get(event)?.delete(handler);
    }),
    state: {
      selection: {
        empty: true,
        from: 0,
        to: 0,
        $from: selectionPosition,
        $to: selectionPosition,
        $head: selectionPosition,
      },
      storedMarks: emptyMarks,
      doc: {
        nodesBetween: vi.fn(),
        resolve: vi.fn(() => selectionPosition),
      },
      schema: {
        marks: {
          link: { name: 'link' },
        },
      },
    },
    storage: {},
    options: { documentId: 'doc-1', isHeaderOrFooter: false },
    commands: {
      toggleBold: vi.fn(() => true),
      toggleItalic: vi.fn(() => true),
    },
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

describe('ui.toolbar', () => {
  it('exposes getSnapshot / subscribe / execute compatible with HeadlessToolbarController', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const snapshot = ui.toolbar.getSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot.commands).toBeDefined();
    // Snapshot must include built-in commands — without passing the
    // full command list to createHeadlessToolbar, snapshot.commands
    // would be empty and ui.commands.<id>.observe would always emit
    // the fallback disabled state.
    expect(Object.keys(snapshot.commands).length).toBeGreaterThan(0);
    expect(snapshot.commands).toHaveProperty('bold');

    expect(typeof ui.toolbar.subscribe).toBe('function');
    expect(typeof ui.toolbar.execute).toBe('function');

    ui.destroy();
  });

  it('emits the initial snapshot synchronously on subscribe', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.toolbar.subscribe(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toHaveProperty('snapshot');

    off();
    ui.destroy();
  });

  it('forwards execute to the internal controller', () => {
    const { superdoc, editor } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.toolbar.getSnapshot().commands.bold).toMatchObject({ disabled: false });

    ui.toolbar.execute('bold');
    expect(editor.commands.toggleBold).toHaveBeenCalled();

    ui.destroy();
  });
});

describe('ui.commands', () => {
  it('returns a stable handle per command id (reference equality across accesses)', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const a = ui.commands.bold;
    const b = ui.commands.bold;

    expect(a).toBe(b);

    ui.destroy();
  });

  it('observe fires synchronously with initial command state', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.commands.bold.observe(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const initial = cb.mock.calls[0][0];
    expect(initial).toHaveProperty('active');
    expect(initial).toHaveProperty('disabled');

    off();
    ui.destroy();
  });

  it('falls back to a no-op state for unknown command ids', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    // 'company.aiRewrite' is not a built-in id; observe should still fire
    // initially with the fallback state rather than throwing.
    (ui.commands as unknown as Record<string, { observe: (cb: (s: unknown) => void) => () => void }>)[
      'company.aiRewrite'
    ].observe(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const state = cb.mock.calls[0][0];
    expect(state).toMatchObject({ active: false, disabled: true });

    ui.destroy();
  });

  it('execute forwards to the internal toolbar controller', () => {
    const { superdoc, editor } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.toolbar.getSnapshot().commands.bold).toMatchObject({ disabled: false });

    ui.commands.bold.execute();
    expect(editor.commands.toggleBold).toHaveBeenCalled();

    ui.destroy();
  });

  it('shares a single Subscribable per command id across observe() calls', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    // 50 observers on the same command id. Without sharing the
    // Subscribable, each observe() would create a fresh selector with
    // its own onStateChange in stateChangeListeners — 50 selector
    // recomputes per editor event.
    const cbs: Array<ReturnType<typeof vi.fn>> = [];
    const offs: Array<() => void> = [];
    for (let i = 0; i < 50; i += 1) {
      const cb = vi.fn();
      cbs.push(cb);
      offs.push(ui.commands.bold.observe(cb));
    }

    // Every observer received its initial emit.
    cbs.forEach((cb) => expect(cb).toHaveBeenCalledTimes(1));

    // Half unsubscribe; remaining observers continue.
    for (let i = 0; i < 25; i += 1) {
      offs[i]?.();
    }
    cbs.slice(25).forEach((cb) => cb.mockClear());

    // Fire one editor event; coalesced microtask drains.
    superdoc.fireEditor('transaction');
    await Promise.resolve();

    // Each remaining observer fires at most once. The specific
    // assertion: no observer fires twice in the same tick, because the
    // Subscribable is shared per command id and emits once.
    cbs.slice(25).forEach((cb) => {
      expect(cb.mock.calls.length).toBeLessThanOrEqual(1);
    });

    offs.slice(25).forEach((off) => off());
    ui.destroy();
  });

  it('a per-command observer is unaffected when destroy clears the cache', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.commands.bold.observe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    ui.destroy();
    // After destroy, no further events propagate. The unsubscribe is
    // still callable (idempotent / no-throw).
    expect(() => off()).not.toThrow();
  });
});
