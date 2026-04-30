import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Stub mirroring the controller test pattern. Adds `setDocumentMode`
 * and `export` so ui.document can route through them; both are vi.fn
 * so call counts and arguments are observable.
 */
function makeStubs(initialMode: 'editing' | 'suggesting' | 'viewing' = 'editing') {
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
    commands: {},
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
    setDocumentMode: ReturnType<typeof vi.fn>;
    export: ReturnType<typeof vi.fn>;
  } = {
    activeEditor: editor as never,
    config: { documentMode: initialMode },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!superdocListeners.has(event)) superdocListeners.set(event, new Set());
      superdocListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      superdocListeners.get(event)?.delete(handler);
    }),
    setDocumentMode: vi.fn((_mode: 'editing' | 'suggesting' | 'viewing') => {
      // Plain spy: don't mirror host behavior (mutate + emit) here.
      // Tests that need the controller to observe a mode change call
      // `fireSuperdoc('document-mode-change', { documentMode })`
      // explicitly, which keeps the spy's call list tight and avoids
      // accidentally re-entering the controller graph.
    }),
    export: vi.fn(async (_options?: unknown) => ({ ok: true })),
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
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('ui.document', () => {
  it('exposes the slice via getSnapshot with ready + mode mirrored from state', () => {
    const { superdoc } = makeStubs('suggesting');
    const ui = createSuperDocUI({ superdoc });

    expect(ui.document.getSnapshot()).toEqual({ ready: true, mode: 'suggesting' });

    ui.destroy();
  });

  it('subscribe fires once synchronously with the initial snapshot', () => {
    const { superdoc } = makeStubs('editing');
    const ui = createSuperDocUI({ superdoc });

    const listener = vi.fn();
    ui.document.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual({ snapshot: { ready: true, mode: 'editing' } });

    ui.destroy();
  });

  it('subscribe re-fires when document-mode-change fires from the host', async () => {
    const { superdoc } = makeStubs('editing');
    const ui = createSuperDocUI({ superdoc });

    const listener = vi.fn();
    ui.document.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    // Mirror SuperDoc's emit pattern: mutate config, then fire the
    // event the controller is bound to so the next snapshot reflects
    // the new mode.
    superdoc.config!.documentMode = 'viewing';
    superdoc.fireSuperdoc('document-mode-change', { documentMode: 'viewing' });
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0].snapshot).toEqual({ ready: true, mode: 'viewing' });

    ui.destroy();
  });

  it('subscribe does not re-fire on transactions that leave the slice unchanged', async () => {
    const { superdoc, editor } = makeStubs('editing');
    const ui = createSuperDocUI({ superdoc });

    const listener = vi.fn();
    ui.document.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    // Fire a typing-only transaction. ready/mode are both unchanged
    // so shallowEqual should short-circuit the subscriber. Without
    // the documentMemo, every transaction allocates a fresh slice
    // and re-fires listeners.
    const handlers = (editor.on as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0] === 'transaction')
      .map((c) => c[1]) as Array<() => void>;
    handlers.forEach((h) => h());
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);

    ui.destroy();
  });

  it('setMode forwards to superdoc.setDocumentMode with the passed mode', () => {
    const { superdoc } = makeStubs('editing');
    const ui = createSuperDocUI({ superdoc });

    ui.document.setMode('viewing');
    expect(superdoc.setDocumentMode).toHaveBeenCalledTimes(1);
    expect(superdoc.setDocumentMode).toHaveBeenCalledWith('viewing');

    ui.destroy();
  });

  it('setMode is a no-op when the host omits the setter', () => {
    const { superdoc } = makeStubs('editing');
    delete (superdoc as { setDocumentMode?: unknown }).setDocumentMode;
    const ui = createSuperDocUI({ superdoc });

    // Should not throw.
    expect(() => ui.document.setMode('viewing')).not.toThrow();

    ui.destroy();
  });

  it('setMode swallows host errors and reports to console.error', () => {
    const { superdoc } = makeStubs('editing');
    superdoc.setDocumentMode = vi.fn(() => {
      throw new Error('host explosion');
    }) as ReturnType<typeof vi.fn>;
    const ui = createSuperDocUI({ superdoc });

    expect(() => ui.document.setMode('viewing')).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain('ui.document.setMode failed');

    ui.destroy();
  });

  it('export forwards options to superdoc.export and returns its result', async () => {
    const { superdoc } = makeStubs('editing');
    const ui = createSuperDocUI({ superdoc });

    const result = await ui.document.export({ exportType: ['docx'], triggerDownload: false });
    expect(result).toEqual({ ok: true });
    expect(superdoc.export).toHaveBeenCalledTimes(1);
    expect(superdoc.export).toHaveBeenCalledWith({ exportType: ['docx'], triggerDownload: false });

    ui.destroy();
  });

  it('export throws a clear error when the host omits export()', async () => {
    const { superdoc } = makeStubs('editing');
    delete (superdoc as { export?: unknown }).export;
    const ui = createSuperDocUI({ superdoc });

    await expect(ui.document.export()).rejects.toThrow(/host SuperDoc instance does not implement export/);

    ui.destroy();
  });

  it('export propagates host rejections to the caller', async () => {
    const { superdoc } = makeStubs('editing');
    superdoc.export = vi.fn(async () => {
      throw new Error('export blew up');
    }) as ReturnType<typeof vi.fn>;
    const ui = createSuperDocUI({ superdoc });

    await expect(ui.document.export()).rejects.toThrow('export blew up');

    ui.destroy();
  });

  it('document slice on getSnapshot returns the same reference across reads when unchanged', () => {
    const { superdoc } = makeStubs('editing');
    const ui = createSuperDocUI({ superdoc });

    const a = ui.document.getSnapshot();
    const b = ui.document.getSnapshot();
    expect(a).toBe(b);

    ui.destroy();
  });

  it('document slice identity changes when ready or mode flips', async () => {
    const { superdoc } = makeStubs('editing');
    const ui = createSuperDocUI({ superdoc });

    const before = ui.document.getSnapshot();

    superdoc.config!.documentMode = 'viewing';
    superdoc.fireSuperdoc('document-mode-change', { documentMode: 'viewing' });
    await Promise.resolve();
    await Promise.resolve();
    const after = ui.document.getSnapshot();

    expect(before).not.toBe(after);
    expect(after.mode).toBe('viewing');

    ui.destroy();
  });
});
