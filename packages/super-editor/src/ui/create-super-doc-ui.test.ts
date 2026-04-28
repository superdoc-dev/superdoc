import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import { shallowEqual } from './equality.js';
import type { SuperDocLike } from './types.js';

/**
 * Builds a minimal stub of the SuperDoc instance + its activeEditor
 * with a controllable event bus and a settable selection. Every test
 * starts with a fresh stub so listener bookkeeping is isolated.
 */
function makeSuperdocStub(
  initial: {
    documentMode?: 'editing' | 'suggesting' | 'viewing';
    selection?: { empty: boolean; text?: string };
  } = {},
) {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  let selectionEmpty = initial.selection?.empty ?? true;
  let selectionText = initial.selection?.text ?? '';

  const editor = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!editorListeners.has(event)) editorListeners.set(event, new Set());
      editorListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      editorListeners.get(event)?.delete(handler);
    }),
    doc: {
      selection: {
        current: vi.fn((input?: { includeText?: boolean }) => ({
          empty: selectionEmpty,
          text: input?.includeText ? selectionText : undefined,
          target: null,
        })),
      },
    },
  };

  const superdoc: SuperDocLike & {
    fireEditor(event: string, ...args: unknown[]): void;
    fireSuperdoc(event: string, ...args: unknown[]): void;
    setSelection(empty: boolean, text?: string): void;
    setDocumentMode(mode: 'editing' | 'suggesting' | 'viewing'): void;
    swapEditor(next: typeof editor | null): void;
    editorListenerCount(event: string): number;
    superdocListenerCount(event: string): number;
  } = {
    activeEditor: editor,
    config: { documentMode: initial.documentMode ?? 'editing' },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!superdocListeners.has(event)) superdocListeners.set(event, new Set());
      superdocListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      superdocListeners.get(event)?.delete(handler);
    }),

    fireEditor(event: string, ...args: unknown[]) {
      editorListeners.get(event)?.forEach((handler) => handler(...args));
    },
    fireSuperdoc(event: string, ...args: unknown[]) {
      superdocListeners.get(event)?.forEach((handler) => handler(...args));
    },
    setSelection(empty: boolean, text = '') {
      selectionEmpty = empty;
      selectionText = text;
    },
    setDocumentMode(mode) {
      this.config!.documentMode = mode;
    },
    swapEditor(next) {
      this.activeEditor = next as never;
    },
    editorListenerCount(event: string) {
      return editorListeners.get(event)?.size ?? 0;
    },
    superdocListenerCount(event: string) {
      return superdocListeners.get(event)?.size ?? 0;
    },
  };

  return superdoc;
}

const flushMicrotasks = () => Promise.resolve();

describe('createSuperDocUI', () => {
  let teardown: Array<() => void> = [];

  afterEach(() => {
    teardown.forEach((fn) => fn());
    teardown = [];
  });

  it('emits the initial value synchronously on subscribe', () => {
    const superdoc = makeSuperdocStub({ documentMode: 'suggesting' });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.documentMode);
    const cb = vi.fn();
    slice.subscribe(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('suggesting');
  });

  it('exposes get() that snapshots without subscribing', () => {
    const superdoc = makeSuperdocStub({ documentMode: 'editing' });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.documentMode);
    expect(slice.get()).toBe('editing');
  });

  it('does not re-fire the listener when the selected slice is unchanged', async () => {
    const superdoc = makeSuperdocStub({ documentMode: 'editing' });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    ui.select((state) => state.documentMode).subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1); // initial

    // A transaction that doesn't change documentMode should not re-fire
    superdoc.fireEditor('transaction');
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('re-fires when the selected slice changes', async () => {
    const superdoc = makeSuperdocStub({ documentMode: 'editing' });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    ui.select((state) => state.documentMode).subscribe(cb);

    superdoc.setDocumentMode('suggesting');
    superdoc.fireSuperdoc('document-mode-change');
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith('suggesting');
  });

  it('coalesces bursts of source events to a single notification per microtask', async () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    ui.select((state) => state.selection.empty).subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    superdoc.setSelection(false, 'hello');
    // Simulate a multi-step transaction firing many events in the same tick
    superdoc.fireEditor('transaction');
    superdoc.fireEditor('selectionUpdate');
    superdoc.fireEditor('transaction');
    superdoc.fireEditor('commentsUpdate');
    await flushMicrotasks();

    // Initial + one coalesced rebuild = 2
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(false);
  });

  it('uses Object.is by default; shallowEqual lets object slices dedup', async () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    // Default Object.is: each rebuild creates a new object => listener fires
    const defaultCb = vi.fn();
    ui.select((state) => ({ empty: state.selection.empty })).subscribe(defaultCb);

    // shallowEqual: structurally identical slices dedup
    const shallowCb = vi.fn();
    ui.select((state) => ({ empty: state.selection.empty }), shallowEqual).subscribe(shallowCb);

    superdoc.fireEditor('transaction');
    await flushMicrotasks();

    expect(defaultCb).toHaveBeenCalledTimes(2); // initial + rebuild
    expect(shallowCb).toHaveBeenCalledTimes(1); // initial only
  });

  it('unsubscribe stops the individual listener but other subscribers keep firing', async () => {
    const superdoc = makeSuperdocStub({ documentMode: 'editing' });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.documentMode);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const off1 = slice.subscribe(cb1);
    slice.subscribe(cb2);

    off1();

    superdoc.setDocumentMode('viewing');
    superdoc.fireSuperdoc('document-mode-change');
    await flushMicrotasks();

    expect(cb1).toHaveBeenCalledTimes(1); // initial only
    expect(cb2).toHaveBeenCalledTimes(2); // initial + rebuild
  });

  it('destroy detaches all source listeners', () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });

    expect(superdoc.editorListenerCount('transaction')).toBeGreaterThan(0);
    expect(superdoc.superdocListenerCount('document-mode-change')).toBeGreaterThan(0);

    ui.destroy();

    expect(superdoc.editorListenerCount('transaction')).toBe(0);
    expect(superdoc.editorListenerCount('selectionUpdate')).toBe(0);
    expect(superdoc.editorListenerCount('commentsUpdate')).toBe(0);
    expect(superdoc.superdocListenerCount('editorCreate')).toBe(0);
    expect(superdoc.superdocListenerCount('document-mode-change')).toBe(0);
  });

  it('destroy stops further notifications even after a queued event', async () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    ui.select((state) => state.documentMode).subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    // Queue a microtask, then destroy before it runs
    superdoc.setDocumentMode('viewing');
    superdoc.fireSuperdoc('document-mode-change');
    ui.destroy();

    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('re-attaches editor listeners on editorCreate when the activeEditor swaps', async () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    ui.select((state) => state.selection.empty).subscribe(cb);

    // Swap to a new editor; old listeners should be torn down, new ones attached
    const oldEditorTransactionCount = superdoc.editorListenerCount('transaction');
    expect(oldEditorTransactionCount).toBeGreaterThan(0);

    const newEditor = {
      on: vi.fn(),
      off: vi.fn(),
      doc: {
        selection: {
          current: vi.fn(() => ({ empty: false, text: 'new', target: null })),
        },
      },
    };
    superdoc.swapEditor(newEditor as never);
    superdoc.fireSuperdoc('editorCreate');
    await flushMicrotasks();

    // The new editor should have received .on() calls for the same events
    expect(newEditor.on).toHaveBeenCalled();
    // And the slice should reflect the new editor's selection
    expect(cb).toHaveBeenLastCalledWith(false);
  });

  it('listener errors do not propagate to the editor or other subscribers', async () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.documentMode);
    const buggy = vi.fn(() => {
      throw new Error('listener boom');
    });
    const ok = vi.fn();
    slice.subscribe(buggy);
    slice.subscribe(ok);

    // Initial subscribe already invoked both; the error must not have
    // propagated out of subscribe()
    expect(buggy).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);

    superdoc.setDocumentMode('viewing');
    superdoc.fireSuperdoc('document-mode-change');
    await flushMicrotasks();

    expect(buggy).toHaveBeenCalledTimes(2);
    expect(ok).toHaveBeenCalledTimes(2);
  });
});
