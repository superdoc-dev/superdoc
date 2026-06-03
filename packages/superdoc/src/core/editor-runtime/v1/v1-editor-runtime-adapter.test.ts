// V1EditorRuntimeAdapter unit tests.
//
// These use v1-LIKE fakes (no real Editor / PresentationEditor) so the adapter
// contract is proven in isolation before broad behavior tests. The fakes are
// structurally typed against the adapter's `V1EditorLike` / `V1PresentationEditorLike`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createV1EditorRuntimeAdapter,
  type V1EditorLike,
  type V1PresentationEditorLike,
} from './v1-editor-runtime-adapter.js';
import type { EditorRuntimeCommand } from '../index.js';

// --- v1-like fakes ----------------------------------------------------------

interface FakeEditorOptions {
  documentId?: string;
  selectedText?: string;
  selectionFrom?: number;
  selectionTo?: number;
  commands?: Record<string, (...args: unknown[]) => unknown>;
  exportResult?: unknown;
}

function createFakeEditor(opts: FakeEditorOptions = {}) {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const from = opts.selectionFrom ?? 0;
  const to = opts.selectionTo ?? opts.selectedText?.length ?? 0;
  const focusSpy = vi.fn();
  const viewFocusSpy = vi.fn();

  const editor: V1EditorLike & {
    emit(event: string, ...args: unknown[]): void;
    listenerCount(event: string): number;
    focusSpy: typeof focusSpy;
    viewFocusSpy: typeof viewFocusSpy;
  } = {
    options: { documentId: opts.documentId ?? 'doc-1' },
    editorVersion: 1,
    state: {
      doc: {
        textBetween: (f: number, t: number, sep?: string) => {
          // Slice the configured selected text for the default range; otherwise
          // return a deterministic marker so tests can assert delegation.
          if (f === from && t === to) return opts.selectedText ?? '';
          return `between(${f},${t},${sep ?? ''})`;
        },
      },
      selection: { from, to, empty: from === to },
    },
    view: { focus: viewFocusSpy },
    commands: opts.commands ?? {},
    focus: focusSpy,
    async exportDocx() {
      return opts.exportResult ?? new ArrayBuffer(8);
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event, ...args) {
      for (const h of Array.from(handlers.get(event) ?? [])) h(...args);
    },
    listenerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },
    focusSpy,
    viewFocusSpy,
  };
  return editor;
}

function createFakePresentationEditor() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const focusSpy = vi.fn();
  const setZoomSpy = vi.fn();
  const scrollSpy = vi.fn(() => true);

  const pe: V1PresentationEditorLike & {
    emit(event: string, ...args: unknown[]): void;
    listenerCount(event: string): number;
    focusSpy: typeof focusSpy;
    setZoomSpy: typeof setZoomSpy;
    scrollSpy: typeof scrollSpy;
  } = {
    focus: focusSpy,
    setZoom: setZoomSpy,
    scrollToPosition: scrollSpy,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event, ...args) {
      for (const h of Array.from(handlers.get(event) ?? [])) h(...args);
    },
    listenerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },
    focusSpy,
    setZoomSpy,
    scrollSpy,
  };
  return pe;
}

function makeRoot(): HTMLElement {
  if (typeof document !== 'undefined') return document.createElement('div');
  return {} as HTMLElement;
}

// --- tests ------------------------------------------------------------------

describe('V1EditorRuntimeAdapter  -  lifecycle', () => {
  it('starts pending (opening) and reports v1 identity', () => {
    const editor = createFakeEditor({ documentId: 'doc-A' });
    const { runtime } = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-A',
      root: makeRoot(),
      editor,
    });

    expect(runtime.id).toBe('rt-1');
    expect(runtime.kind).toBe('v1');
    expect(runtime.documentId).toBe('doc-A');
    expect(runtime.getSnapshot().state).toBe('opening');
    // Pending: layout/navigation not yet supported, dispatch closed.
    const caps = runtime.getCapabilities();
    expect(caps.layout.supported).toBe(false);
    expect(caps.commands.canDispatch).toBe(false);
    expect(caps.persistence.canSave).toBe(false);
    expect(caps.persistence.canExportDocx).toBe(true);
  });

  it('attaches the presentation editor at onEditorReady and becomes editing-ready', () => {
    const editor = createFakeEditor();
    const pe = createFakePresentationEditor();
    const { runtime, attachPresentationEditor } = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });

    const events: string[] = [];
    runtime.subscribe((e) => events.push(e.type));

    attachPresentationEditor(pe);

    expect(runtime.getSnapshot().state).toBe('editing-ready');
    expect(runtime.getCapabilities().layout.supported).toBe(true);
    expect(runtime.getCapabilities().commands.canDispatch).toBe(true);
    expect(runtime.getCapabilities().navigation.supported).toBe(true);
    expect(events).toContain('state-change');
    expect(events).toContain('capabilities-change');
    // Subscribed to PE layout signals.
    expect(pe.listenerCount('paginationUpdate')).toBe(1);
    expect(pe.listenerCount('zoomChange')).toBe(1);
  });

  it('getLegacyEditorProjection returns the ORIGINAL v1 editor instance', () => {
    const editor = createFakeEditor();
    const { runtime } = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    expect(runtime.getLegacyEditorProjection?.()).toBe(editor);
  });
});

describe('V1EditorRuntimeAdapter  -  teardown', () => {
  it('dispose() unregisters once, emits disposed, and detaches its own listeners only', () => {
    const editor = createFakeEditor();
    const pe = createFakePresentationEditor();
    const onUnregister = vi.fn();
    const { runtime, attachPresentationEditor } = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
      onUnregister,
    });
    attachPresentationEditor(pe);
    expect(editor.listenerCount('destroy')).toBe(1);

    const events: string[] = [];
    runtime.subscribe((e) => events.push(e.type));

    runtime.dispose();
    runtime.dispose(); // idempotent

    expect(onUnregister).toHaveBeenCalledTimes(1);
    expect(onUnregister).toHaveBeenCalledWith('rt-1');
    expect(events).toContain('disposed');
    expect(runtime.getSnapshot().state).toBe('disposed');
    // The adapter detaches its OWN editor + PE listeners; it never destroys
    // the editor/PresentationEditor  -  there is no destroy() call on the fakes.
    expect(editor.listenerCount('destroy')).toBe(0);
    expect(pe.listenerCount('paginationUpdate')).toBe(0);
    expect(pe.listenerCount('zoomChange')).toBe(0);
  });

  it('editor "destroy" event triggers unregister (host unmount path)', () => {
    const editor = createFakeEditor();
    const onUnregister = vi.fn();
    const { runtime } = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
      onUnregister,
    });

    editor.emit('destroy');

    expect(onUnregister).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().state).toBe('disposed');
  });
});

describe('V1EditorRuntimeAdapter  -  command dispatch result mapping ', () => {
  function ready(commands: Record<string, (...args: unknown[]) => unknown>) {
    const editor = createFakeEditor({ commands });
    const pe = createFakePresentationEditor();
    const adapter = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    adapter.attachPresentationEditor(pe);
    return { ...adapter, editor };
  }

  it('missing command → rejected:command-unsupported', async () => {
    const { runtime } = ready({}); // no insertContent
    const result = await runtime.dispatch({ kind: 'text.insert', text: 'x' });
    expect(result).toEqual({ status: 'rejected', reason: 'command-unsupported', detail: 'insertContent' });
  });

  it('thrown command → rejected:command-failed', async () => {
    const { runtime } = ready({
      insertContent: () => {
        throw new Error('boom');
      },
    });
    const result = await runtime.dispatch({ kind: 'text.insert', text: 'x' });
    expect(result.status).toBe('rejected');
    expect(result).toMatchObject({ reason: 'command-failed', detail: 'boom' });
  });

  it('falsy/no-op command result → noop:no-effect', async () => {
    const { runtime } = ready({ insertContent: () => false });
    const result = await runtime.dispatch({ kind: 'text.insert', text: 'x' });
    expect(result).toEqual({ status: 'noop', reason: 'no-effect' });
  });

  it('truthy command result → committed with opaque receipt', async () => {
    const receipt = { changed: true };
    const { runtime } = ready({ insertContent: () => receipt });
    const result = await runtime.dispatch({ kind: 'text.insert', text: 'hi' });
    expect(result).toEqual({ status: 'committed', receipt });
  });

  it('delegates to the matching v1 command with mapped args', async () => {
    const insertContent = vi.fn(() => true);
    const toggleMark = vi.fn(() => true);
    const { runtime } = ready({ insertContent, toggleMark });
    await runtime.dispatch({ kind: 'text.insert', text: 'abc' });
    expect(insertContent).toHaveBeenCalledWith('abc');
    await runtime.dispatch({ kind: 'formatting.applyMark', mark: 'bold', value: true });
    expect(toggleMark).toHaveBeenCalledWith('bold', true);
  });

  it('does not advertise directional delete until it can forward to the v1 keymap chains', async () => {
    const deleteSelection = vi.fn(() => true);
    const { runtime } = ready({ deleteSelection });
    const supported = runtime.getCapabilities().commands.supportedCommands;

    expect(supported).not.toContain('text.deleteBackward');
    expect(supported).not.toContain('text.deleteForward');

    await expect(runtime.dispatch({ kind: 'text.deleteBackward' })).resolves.toEqual({
      status: 'rejected',
      reason: 'command-unsupported',
      detail: 'text.deleteBackward',
    });
    await expect(runtime.dispatch({ kind: 'text.deleteForward' })).resolves.toEqual({
      status: 'rejected',
      reason: 'command-unsupported',
      detail: 'text.deleteForward',
    });
    expect(deleteSelection).not.toHaveBeenCalled();
  });

  it('rejects positioned dispatch instead of ignoring the token and editing the current selection', async () => {
    const insertContent = vi.fn(() => true);
    const editor = createFakeEditor({
      selectedText: '',
      selectionFrom: 2,
      selectionTo: 2,
      commands: { insertContent },
    });
    const adapter = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    adapter.attachPresentationEditor(createFakePresentationEditor());
    const token = adapter.runtime.getSelectionSnapshot()!.anchor!;

    const result = await adapter.runtime.dispatch({ kind: 'text.insert', text: 'abc', at: token });

    expect(result).toEqual({
      status: 'rejected',
      reason: 'target-unsupported',
      detail: 'positioned v1 dispatch is deferred until selection/range placement is explicitly supported',
    });
    expect(insertContent).not.toHaveBeenCalled();
  });

  it('rejects range-positioned dispatch instead of replacing the current selection', async () => {
    const insertContent = vi.fn(() => true);
    const editor = createFakeEditor({
      selectedText: 'hi',
      selectionFrom: 2,
      selectionTo: 4,
      commands: { insertContent },
    });
    const adapter = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    adapter.attachPresentationEditor(createFakePresentationEditor());
    const token = adapter.runtime.getSelectionSnapshot()!.anchor!;

    const result = await adapter.runtime.dispatch({ kind: 'text.replace', text: 'abc', range: token });

    expect(result).toEqual({
      status: 'rejected',
      reason: 'target-unsupported',
      detail: 'positioned v1 dispatch is deferred until selection/range placement is explicitly supported',
    });
    expect(insertContent).not.toHaveBeenCalled();
  });

  it('history undo no-op vs committed maps to history-* statuses', async () => {
    const { runtime } = ready({ undo: () => false, redo: () => true });
    expect(await runtime.dispatch({ kind: 'history.undo' })).toEqual({
      status: 'history-noop',
      reason: 'nothing-to-undo',
    });
    expect(await runtime.dispatch({ kind: 'history.redo' })).toEqual({
      status: 'history-committed',
      result: true,
    });
  });

  it('rejects dispatch before the runtime is ready', async () => {
    const editor = createFakeEditor({ commands: { insertContent: () => true } });
    const { runtime } = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    const result = await runtime.dispatch({ kind: 'text.insert', text: 'x' });
    expect(result).toEqual({ status: 'rejected', reason: 'runtime-not-ready' });
  });
});

describe('V1EditorRuntimeAdapter  -  reads delegate to v1 state', () => {
  it('getSelectedText / getSelectionSnapshot read editor.state', () => {
    const editor = createFakeEditor({ selectedText: 'hello', selectionFrom: 1, selectionTo: 6 });
    const { runtime } = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    expect(runtime.getSelectedText()).toBe('hello');
    const snap = runtime.getSelectionSnapshot();
    expect(snap).toMatchObject({ isRange: true, isEmpty: false, text: 'hello' });
    expect(snap?.anchor?.runtimeId).toBe('rt-1');
    expect(snap?.focus?.runtimeId).toBe('rt-1');
  });
});

describe('V1EditorRuntimeAdapter  -  opaque-token discipline', () => {
  it('rejects a wrong-runtime token and a stale token', async () => {
    const editor = createFakeEditor({
      selectedText: 'hi',
      selectionFrom: 1,
      selectionTo: 3,
      commands: { insertContent: () => true },
    });
    const pe = createFakePresentationEditor();
    const adapter = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    adapter.attachPresentationEditor(pe);
    const { runtime } = adapter;

    const snap = runtime.getSelectionSnapshot()!;
    const foreignToken = { ...snap.anchor!, runtimeId: 'rt-OTHER' };
    expect(await runtime.reveal({ kind: 'position', position: foreignToken })).toEqual({
      status: 'rejected',
      reason: 'wrong-runtime-token',
    });

    // A committed mutation bumps the revision, staling the earlier token.
    await runtime.dispatch({ kind: 'text.insert', text: 'x' });
    expect(await runtime.reveal({ kind: 'position', position: snap.anchor! })).toEqual({
      status: 'rejected',
      reason: 'stale-position-token',
    });
  });

  it('reveal(position) with a fresh token delegates to scrollToPosition', async () => {
    const editor = createFakeEditor({ selectedText: 'hi', selectionFrom: 2, selectionTo: 4 });
    const pe = createFakePresentationEditor();
    const adapter = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
    });
    adapter.attachPresentationEditor(pe);
    const snap = adapter.runtime.getSelectionSnapshot()!;
    const result = await adapter.runtime.reveal({ kind: 'position', position: snap.anchor! });
    expect(result).toEqual({ status: 'committed' });
    expect(pe.scrollSpy).toHaveBeenCalledWith(2);
  });

  it('non-position reveal targets are rejected with a named reason', async () => {
    const editor = createFakeEditor();
    const pe = createFakePresentationEditor();
    const adapter = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    adapter.attachPresentationEditor(pe);
    const result = await adapter.runtime.reveal({ kind: 'page', page: 2 });
    expect(result.status).toBe('rejected');
    expect(result).toMatchObject({ reason: 'target-unsupported' });
  });
});

describe('V1EditorRuntimeAdapter  -  token invalidation + bounding', () => {
  it('subscribes to the v1 update event on construction and detaches it on dispose', () => {
    const editor = createFakeEditor();
    const { runtime } = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    expect(editor.listenerCount('update')).toBe(1);
    runtime.dispose();
    expect(editor.listenerCount('update')).toBe(0);
  });

  it('stales tokens on an ordinary v1 update (not only runtime.dispatch)', async () => {
    const editor = createFakeEditor({ selectedText: 'hi', selectionFrom: 1, selectionTo: 3 });
    const pe = createFakePresentationEditor();
    const adapter = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    adapter.attachPresentationEditor(pe);
    const { runtime } = adapter;

    const snap = runtime.getSelectionSnapshot()!;
    // A plain document change WITHOUT runtime.dispatch (keyboard, toolbar,
    // collaboration, document API) must invalidate the previously minted token.
    editor.emit('update');

    expect(await runtime.reveal({ kind: 'position', position: snap.anchor! })).toEqual({
      status: 'rejected',
      reason: 'stale-position-token',
    });
  });

  it('mints a fresh, resolvable token after an update invalidation', async () => {
    const editor = createFakeEditor({ selectedText: 'hi', selectionFrom: 1, selectionTo: 3 });
    const pe = createFakePresentationEditor();
    const adapter = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    adapter.attachPresentationEditor(pe);
    const { runtime } = adapter;

    runtime.getSelectionSnapshot(); // mint pre-update tokens (now stale)
    editor.emit('update');

    const fresh = runtime.getSelectionSnapshot()!.anchor!;
    expect(await runtime.reveal({ kind: 'position', position: fresh })).toEqual({ status: 'committed' });
    expect(pe.scrollSpy).toHaveBeenCalledWith(1);
  });

  it('reuses identical position tokens within a revision so token storage stays bounded', () => {
    const editor = createFakeEditor({ selectedText: 'hi', selectionFrom: 1, selectionTo: 3 });
    const { runtime } = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });

    const first = runtime.getSelectionSnapshot()!;
    const second = runtime.getSelectionSnapshot()!;
    // Same selection + same revision → the same tokens are handed back, so
    // repeated snapshot reads cannot grow the adapter-private token map.
    expect(second.anchor!.tokenId).toBe(first.anchor!.tokenId);
    expect(second.focus!.tokenId).toBe(first.focus!.tokenId);

    // After a document change the cache resets and fresh tokens are minted.
    editor.emit('update');
    const third = runtime.getSelectionSnapshot()!;
    expect(third.anchor!.tokenId).not.toBe(first.anchor!.tokenId);
  });

  it('does not double-bump when an update fires during dispatch (fallback only when absent)', async () => {
    // Editor whose insertContent emits `update` synchronously, like the real v1
    // command path. A single token minted before the dispatch must end up stale,
    // and a token minted AFTER the dispatch must still resolve (only one bump).
    const editor = createFakeEditor({ selectedText: 'hi', selectionFrom: 1, selectionTo: 3 });
    editor.commands = {
      insertContent: () => {
        editor.emit('update');
        return true;
      },
    };
    const pe = createFakePresentationEditor();
    const adapter = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    adapter.attachPresentationEditor(pe);
    const { runtime } = adapter;

    const stale = runtime.getSelectionSnapshot()!.anchor!;
    await runtime.dispatch({ kind: 'text.insert', text: 'x' });
    expect(await runtime.reveal({ kind: 'position', position: stale })).toEqual({
      status: 'rejected',
      reason: 'stale-position-token',
    });

    const fresh = runtime.getSelectionSnapshot()!.anchor!;
    expect(await runtime.reveal({ kind: 'position', position: fresh })).toEqual({ status: 'committed' });
  });
});

describe('V1EditorRuntimeAdapter  -  focus + zoom forwarding', () => {
  let editor: ReturnType<typeof createFakeEditor>;
  let pe: ReturnType<typeof createFakePresentationEditor>;

  beforeEach(() => {
    editor = createFakeEditor();
    pe = createFakePresentationEditor();
  });

  it('focus prefers the presentation editor, falls back to the hidden editor', async () => {
    const adapter = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    // No PE yet → falls back to editor.focus().
    expect(await adapter.runtime.focus()).toBe(true);
    expect(editor.focusSpy).toHaveBeenCalledTimes(1);

    adapter.attachPresentationEditor(pe);
    expect(await adapter.runtime.focus()).toBe(true);
    expect(pe.focusSpy).toHaveBeenCalledTimes(1);
  });

  it('setZoom forwards to the injected GLOBAL zoom forwarder as a factor', async () => {
    const setGlobalZoom = vi.fn();
    const adapter = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
      setGlobalZoom,
    });
    adapter.attachPresentationEditor(pe);
    const result = await adapter.runtime.setZoom(150);
    expect(result).toEqual({ status: 'committed' });
    expect(setGlobalZoom).toHaveBeenCalledWith(1.5);
    expect(adapter.runtime.getLayoutSnapshot()).toMatchObject({ zoom: 150 });
    // PE instance setZoom is NOT used when a global forwarder is present
    // (v1 zoom is global, not per-root).
    expect(pe.setZoomSpy).not.toHaveBeenCalled();
  });

  it('setZoom rejects out-of-range values', async () => {
    const adapter = createV1EditorRuntimeAdapter({
      id: 'rt-1',
      documentId: 'doc-1',
      root: makeRoot(),
      editor,
      setGlobalZoom: vi.fn(),
    });
    adapter.attachPresentationEditor(pe);
    expect((await adapter.runtime.setZoom(5)).status).toBe('rejected');
    expect((await adapter.runtime.setZoom(1000)).status).toBe('rejected');
  });
});

describe('V1EditorRuntimeAdapter  -  export normalization ', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exportDocx normalizes a Blob to ArrayBuffer', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const editor = createFakeEditor({ exportResult: blob });
    const { runtime } = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    const buf = await runtime.exportDocx();
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('exportDocx passes the opaque hint through as v1 export params', async () => {
    const exportSpy = vi.fn(async () => new ArrayBuffer(4));
    const editor = createFakeEditor();
    editor.exportDocx = exportSpy as unknown as V1EditorLike['exportDocx'];
    const { runtime } = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    await runtime.exportDocx({ hint: { isFinalDoc: true } });
    expect(exportSpy).toHaveBeenCalledWith({ isFinalDoc: true });
  });

  it('save() throws because v1 save is SuperDoc-level orchestration', async () => {
    const editor = createFakeEditor();
    const { runtime } = createV1EditorRuntimeAdapter({ id: 'rt-1', documentId: 'doc-1', root: makeRoot(), editor });
    await expect(runtime.save()).rejects.toThrow(/SuperDoc-level/);
  });
});
