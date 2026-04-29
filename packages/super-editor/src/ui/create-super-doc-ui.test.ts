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
      const handlers = editorListeners.get(event);
      if (!handlers) return;
      // Snapshot before iterating: handlers can mutate the registration
      // set (e.g., presentation re-routing, headless-toolbar rebinding
      // listeners on every change). A Set's forEach picks up newly-added
      // handlers mid-loop, which produces unbounded recursion. Real
      // editor event buses iterate a frozen list.
      [...handlers].forEach((handler) => handler(...args));
    },
    fireSuperdoc(event: string, ...args: unknown[]) {
      const handlers = superdocListeners.get(event);
      if (!handlers) return;
      [...handlers].forEach((handler) => handler(...args));
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

  it('does not leak controller-level listeners across select+subscribe+unsubscribe cycles', async () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    // 100 mount/unmount-shaped cycles. Without refcount, each select()
    // would leave its onStateChange wired to the controller forever
    // and re-run on every editor event.
    const selector = vi.fn((state) => state.documentMode);
    for (let i = 0; i < 100; i += 1) {
      const slice = ui.select(selector);
      const off = slice.subscribe(() => {});
      off();
    }

    // Reset to count only post-cycle invocations.
    selector.mockClear();

    // Fire one editor event and let the microtask drain.
    superdoc.fireEditor('transaction');
    await flushMicrotasks();

    // With the fix: 0 stale selectors fire. Without it: 100 would.
    expect(selector).toHaveBeenCalledTimes(0);
  });

  it('an active subscriber holds the controller listener; it detaches only on the last unsubscribe', async () => {
    const superdoc = makeSuperdocStub({ documentMode: 'editing' });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const selector = vi.fn((state) => state.documentMode);
    const slice = ui.select(selector);
    const off1 = slice.subscribe(() => {});
    const off2 = slice.subscribe(() => {});

    selector.mockClear();
    superdoc.setDocumentMode('suggesting');
    superdoc.fireSuperdoc('document-mode-change');
    await flushMicrotasks();

    // Both subscribers active: selector ran once for the event.
    expect(selector).toHaveBeenCalledTimes(1);

    off1();

    selector.mockClear();
    superdoc.setDocumentMode('viewing');
    superdoc.fireSuperdoc('document-mode-change');
    await flushMicrotasks();

    // One subscriber still active: selector still runs.
    expect(selector).toHaveBeenCalledTimes(1);

    off2();

    selector.mockClear();
    superdoc.setDocumentMode('editing');
    superdoc.fireSuperdoc('document-mode-change');
    await flushMicrotasks();

    // No subscribers: selector should not run.
    expect(selector).toHaveBeenCalledTimes(0);
  });

  it('get() refreshes the snapshot when no subscribers are attached', () => {
    const superdoc = makeSuperdocStub({ documentMode: 'editing' });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.documentMode);
    expect(slice.get()).toBe('editing');

    // No subscribers — controller listener isn't running. get() must
    // still return fresh state on the next call.
    superdoc.setDocumentMode('suggesting');
    expect(slice.get()).toBe('suggesting');
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

  it('routes selection through PresentationEditor.getActiveEditor() when active', async () => {
    // Body editor with one selection; routed (header) editor with another.
    const bodyListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const bodyEditor = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!bodyListeners.has(event)) bodyListeners.set(event, new Set());
        bodyListeners.get(event)!.add(handler);
      }),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        bodyListeners.get(event)?.delete(handler);
      }),
      state: { selection: { empty: true } },
      options: { documentId: 'doc-1', isHeaderOrFooter: false },
      isEditable: true,
      doc: { selection: { current: vi.fn(() => ({ empty: true, text: '', target: null })) } },
    };

    const headerListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const headerEditor = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!headerListeners.has(event)) headerListeners.set(event, new Set());
        headerListeners.get(event)!.add(handler);
      }),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        headerListeners.get(event)?.delete(handler);
      }),
      state: { selection: { empty: false } },
      options: { documentId: 'doc-1', isHeaderOrFooter: true, headerFooterType: 'header' },
      isEditable: true,
      doc: { selection: { current: vi.fn(() => ({ empty: false, text: 'header text', target: null })) } },
    };

    const presentationListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const presentationEditor: Record<string, unknown> = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!presentationListeners.has(event)) presentationListeners.set(event, new Set());
        presentationListeners.get(event)!.add(handler);
      }),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        presentationListeners.get(event)?.delete(handler);
      }),
      isEditable: true,
      state: { selection: { empty: false } },
      // Routed-editor pointer; the test flips this on activeSurfaceChange.
      getActiveEditor: vi.fn(() => bodyEditor),
      commands: {},
    };

    // Stamp the presentation editor onto the body editor so
    // resolveToolbarSources picks it up via the direct-owner path.
    (bodyEditor as unknown as { _presentationEditor: unknown })._presentationEditor = presentationEditor;

    const superdoc = {
      activeEditor: bodyEditor as never,
      config: { documentMode: 'editing' as const },
      on: vi.fn(),
      off: vi.fn(),
    };

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    ui.select((state) => state.selection.quotedText).subscribe(cb);

    // Initial selection comes from the routed (body) editor.
    expect(cb).toHaveBeenLastCalledWith('');

    // Route to the header editor and fire activeSurfaceChange.
    presentationEditor.getActiveEditor = vi.fn(() => headerEditor);
    const surfaceChangeHandlers = presentationListeners.get('activeSurfaceChange');
    expect(surfaceChangeHandlers && surfaceChangeHandlers.size).toBeGreaterThan(0);
    [...(surfaceChangeHandlers ?? [])].forEach((h) => h());
    await flushMicrotasks();

    // Selection now reflects the header editor's selection.
    expect(cb).toHaveBeenLastCalledWith('header text');

    // The header editor should have received .on() registrations
    // (transaction / selectionUpdate / etc.) when the controller
    // re-routed.
    expect(headerEditor.on).toHaveBeenCalled();
  });

  it('state.selection mirrors full SelectionInfo (target, activeMarks, activeCommentIds, activeChangeIds, quotedText)', () => {
    const superdoc = makeSuperdocStub();
    // Replace the default selection.current stub with one that returns
    // the full SelectionInfo shape.
    const target = {
      kind: 'text' as const,
      segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }],
    };
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: false,
      text: 'Hello',
      target,
      activeMarks: ['bold', 'italic'],
      activeCommentIds: ['c1'],
      activeChangeIds: ['tc1'],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.selection).get();
    expect(slice).toEqual({
      empty: false,
      target,
      activeMarks: ['bold', 'italic'],
      activeCommentIds: ['c1'],
      activeChangeIds: ['tc1'],
      quotedText: 'Hello',
    });
  });

  it('state.selection slice keeps identity stable across recomputes when the projection has not changed', async () => {
    const superdoc = makeSuperdocStub();
    const target = {
      kind: 'text' as const,
      segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }],
    };
    // Each call to selection.current returns FRESH arrays (mirrors the
    // resolver behavior — `activeMarks`/`activeCommentIds`/`activeChangeIds`
    // are produced per call, not memoized at the resolver level).
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: false,
      text: 'Hello',
      target,
      activeMarks: ['bold'],
      activeCommentIds: ['c1'],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    ui.select((state) => state.selection, shallowEqual).subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1); // initial

    // Fire two transactions that don't change the projection. Without
    // slice-level memoization, shallowEqual on the slice would flip on
    // every call because the inner arrays are fresh each time.
    superdoc.fireEditor('transaction');
    await flushMicrotasks();
    superdoc.fireEditor('transaction');
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('state.selection slice changes identity when activeMarks change (typing into bold)', async () => {
    const superdoc = makeSuperdocStub();
    let activeMarks: string[] = [];
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: true,
      text: '',
      target: null,
      activeMarks,
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    ui.select((state) => state.selection, shallowEqual).subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    activeMarks = ['bold'];
    superdoc.fireEditor('selectionUpdate');
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(2);
    const latestSlice = cb.mock.calls[1][0] as { activeMarks: string[] };
    expect(latestSlice.activeMarks).toEqual(['bold']);
  });

  it('state.selection falls back to safe defaults when selection.current is missing fields (legacy resolver)', () => {
    const superdoc = makeSuperdocStub();
    // Legacy / partial resolver: only `empty` + `text` fields present.
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: true,
      text: '',
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.selection).get();
    expect(slice).toEqual({
      empty: true,
      target: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
      quotedText: '',
    });
  });

  it('ui.selection.getSnapshot returns the current slice synchronously', () => {
    const superdoc = makeSuperdocStub();
    const target = {
      kind: 'text' as const,
      segments: [{ blockId: 'p1', range: { start: 0, end: 3 } }],
    };
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: false,
      text: 'foo',
      target,
      activeMarks: ['bold'],
      activeCommentIds: ['c1'],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const snap = ui.selection.getSnapshot();
    expect(snap).toEqual({
      empty: false,
      target,
      activeMarks: ['bold'],
      activeCommentIds: ['c1'],
      activeChangeIds: [],
      quotedText: 'foo',
    });
  });

  it('ui.selection.subscribe fires once with the initial snapshot then on changes', async () => {
    const superdoc = makeSuperdocStub();
    let activeMarks: string[] = [];
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: true,
      text: '',
      target: null,
      activeMarks,
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    const off = ui.selection.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1); // initial snapshot

    // No-op transaction: same projection, listener stays at one call.
    superdoc.fireEditor('selectionUpdate');
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);

    // Real change: caret enters bold → listener fires.
    activeMarks = ['bold'];
    superdoc.fireEditor('selectionUpdate');
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(2);
    const arg = cb.mock.calls[1][0] as { snapshot: { activeMarks: string[] } };
    expect(arg.snapshot.activeMarks).toEqual(['bold']);

    off();
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
