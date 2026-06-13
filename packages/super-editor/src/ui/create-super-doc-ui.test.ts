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
    documentFontOptions?: Array<{ logicalFamily: string; previewFamily: string }>;
    /** The `fonts` config the toolbar derives bundled activation from. Omit for the no-pack baseline. */
    fontsConfig?: {
      resolveAssetUrl?: unknown;
      assetBaseUrl?: string;
      bundled?: { include?: string[]; exclude?: string[] };
    };
  } = {},
) {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  let selectionEmpty = initial.selection?.empty ?? true;
  let selectionText = initial.selection?.text ?? '';
  let documentFontOptions = initial.documentFontOptions ?? [];

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
    setDocumentFontOptions(options: Array<{ logicalFamily: string; previewFamily: string }>): void;
    swapEditor(next: typeof editor | null): void;
    editorListenerCount(event: string): number;
    superdocListenerCount(event: string): number;
  } = {
    activeEditor: editor,
    config: { documentMode: initial.documentMode ?? 'editing', fonts: initial.fontsConfig },
    fonts: {
      getDocumentFontOptions: vi.fn(() => documentFontOptions),
    },
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
    setDocumentFontOptions(options) {
      documentFontOptions = options;
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

  it('defaults to the baseline font set when no pack is configured', () => {
    const superdoc = makeSuperdocStub({
      documentFontOptions: [
        { logicalFamily: 'Aptos', previewFamily: 'Aptos' },
        { logicalFamily: 'Calibri', previewFamily: 'Carlito' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());
    // No pack: the one-per-generic baseline plus the document's own fonts (Calibri is a document font).
    expect(ui.fonts.getOptions().map((o) => o.label)).toEqual([
      'Aptos',
      'Arial',
      'Calibri',
      'Courier New',
      'Times New Roman',
    ]);
  });

  it('exposes final font-family options for custom UI when the pack is configured', () => {
    const superdoc = makeSuperdocStub({
      fontsConfig: { assetBaseUrl: '/fonts/' },
      documentFontOptions: [
        { logicalFamily: 'Aptos', previewFamily: 'Aptos' },
        { logicalFamily: 'Bangla MN', previewFamily: 'Bangla MN' },
        { logicalFamily: 'Calibri', previewFamily: 'Carlito' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const options = ui.fonts.getOptions();
    const sizeOptions = ui.fonts.getSizeOptions();
    expect(options.map((option) => option.label)).toEqual([
      'Aptos',
      'Arial',
      'Arial Black',
      'Arial Narrow',
      'Bangla MN',
      'Baskerville Old Face',
      'Bookman Old Style',
      'Brush Script MT',
      'Calibri',
      'Century',
      'Century Gothic',
      'Comic Sans MS',
      'Cooper Black',
      'Courier New',
      'Garamond',
      'Georgia',
      'Gill Sans MT Condensed',
      'Helvetica',
      'Lucida Console',
      'Segoe UI',
      'Tahoma',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
    ]);
    expect(options.find((option) => option.label === 'Aptos')).toEqual({
      label: 'Aptos',
      value: 'Aptos',
      previewFamily: 'Aptos',
    });
    expect(options.every((option) => !('status' in option))).toBe(true);
    expect(sizeOptions.map((option) => option.value)).toEqual([
      '8pt',
      '9pt',
      '10pt',
      '11pt',
      '12pt',
      '14pt',
      '18pt',
      '24pt',
      '30pt',
      '36pt',
      '48pt',
      '60pt',
      '72pt',
      '96pt',
    ]);
    expect(ui.fonts.getSnapshot().sizeOptions).toBe(sizeOptions);
  });

  it('refreshes ui.fonts when fonts-changed fires', async () => {
    // Configured pack so the snapshot is the full set (the refresh behavior is the point here).
    const superdoc = makeSuperdocStub({ fontsConfig: { assetBaseUrl: '/fonts/' } });
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const observed: string[][] = [];
    ui.fonts.observe((snapshot) => {
      observed.push(snapshot.options.map((option) => option.label));
    });

    superdoc.setDocumentFontOptions([{ logicalFamily: 'Aptos', previewFamily: 'Aptos' }]);
    superdoc.fireSuperdoc('fonts-changed');
    await flushMicrotasks();

    expect(observed.at(0)).toEqual([
      'Arial',
      'Arial Black',
      'Arial Narrow',
      'Baskerville Old Face',
      'Bookman Old Style',
      'Brush Script MT',
      'Calibri',
      'Century',
      'Century Gothic',
      'Comic Sans MS',
      'Cooper Black',
      'Courier New',
      'Garamond',
      'Georgia',
      'Gill Sans MT Condensed',
      'Helvetica',
      'Lucida Console',
      'Segoe UI',
      'Tahoma',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
    ]);
    expect(observed.at(-1)).toEqual([
      'Aptos',
      'Arial',
      'Arial Black',
      'Arial Narrow',
      'Baskerville Old Face',
      'Bookman Old Style',
      'Brush Script MT',
      'Calibri',
      'Century',
      'Century Gothic',
      'Comic Sans MS',
      'Cooper Black',
      'Courier New',
      'Garamond',
      'Georgia',
      'Gill Sans MT Condensed',
      'Helvetica',
      'Lucida Console',
      'Segoe UI',
      'Tahoma',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
    ]);
  });

  it('refreshes ui.fonts for delimiter-colliding font names', async () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const observed: string[][] = [];
    ui.fonts.observe((snapshot) => {
      observed.push(snapshot.options.map((option) => option.label));
    });

    superdoc.setDocumentFontOptions([{ logicalFamily: 'Zulu', previewFamily: 'Preview:One|Zzz:Zzz:Two' }]);
    superdoc.fireSuperdoc('fonts-changed');
    await flushMicrotasks();
    expect(observed.at(-1)).toContain('Zulu');
    expect(observed.at(-1)).not.toContain('Zzz');

    superdoc.setDocumentFontOptions([
      { logicalFamily: 'Zulu', previewFamily: 'Preview:One' },
      { logicalFamily: 'Zzz', previewFamily: 'Two' },
    ]);
    superdoc.fireSuperdoc('fonts-changed');
    await flushMicrotasks();

    expect(observed.at(-1)).toContain('Zulu');
    expect(observed.at(-1)).toContain('Zzz');
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
      // SD-2812: derived alongside `target`. Single-segment selection
      // collapses to `start`/`end` on the same blockId.
      selectionTarget: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'p1', offset: 0 },
        end: { kind: 'text', blockId: 'p1', offset: 5 },
      },
      activeMarks: ['bold', 'italic'],
      activeCommentIds: ['c1'],
      activeChangeIds: ['tc1'],
      quotedText: 'Hello',
    });
  });

  // SD-2812: regression — selectionTarget mirrors the TextTarget for the
  // common single-block case AND the multi-block case (first segment's
  // start, last segment's end). Doc-api point/range ops accept this
  // shape directly so the consumer doesn't have to convert.
  it('state.selection.selectionTarget spans first..last segment for multi-block selections', () => {
    const superdoc = makeSuperdocStub();
    const target = {
      kind: 'text' as const,
      segments: [
        { blockId: 'p1', range: { start: 4, end: 10 } },
        { blockId: 'p2', range: { start: 0, end: 8 } },
        { blockId: 'p3', range: { start: 0, end: 3 } },
      ],
    };
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: false,
      text: 'spans three paragraphs',
      target,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.selection).get();
    expect(slice.selectionTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'p1', offset: 4 },
      end: { kind: 'text', blockId: 'p3', offset: 3 },
    });
  });

  // SD-2812 review (PR #3010): the lift must preserve the
  // `story` field on TextTarget. Mutation operations route from
  // target.story; dropping it would silently send an insert into
  // the body even when the cursor is in a header/footer/footnote.
  it('state.selection.selectionTarget preserves the story field for non-body selections', () => {
    const superdoc = makeSuperdocStub();
    const story = { type: 'header', id: 'header-1' };
    const target = {
      kind: 'text' as const,
      segments: [{ blockId: 'h1', range: { start: 2, end: 9 } }],
      story,
    };
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: false,
      text: 'in header',
      target,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.selection).get();
    expect(slice.selectionTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'h1', offset: 2, story },
      end: { kind: 'text', blockId: 'h1', offset: 9, story },
      story,
    });
  });

  // SD-2954: when the live selection resolver returns a TextTarget
  // without `story` (the resolver runs against the routed editor and
  // has no path back to the host's PresentationEditor), the
  // controller stamps the active story locator at the seam where
  // both editors are reachable. Without this stamping the live
  // selection slice carries body-scoped targets even when the user
  // is editing a header, and downstream doc-api ops route to body
  // and silently fail to find the block.
  it('state.selection.target gets the active story locator stamped when the resolver omits it', async () => {
    const headerStory = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' };

    const headerEditor = {
      on: vi.fn(),
      off: vi.fn(),
      state: { selection: { empty: false } },
      isEditable: true,
      doc: {
        selection: {
          current: vi.fn(() => ({
            empty: false,
            text: 'header text',
            // Resolver returns no story field. Controller must stamp it.
            target: { kind: 'text', segments: [{ blockId: 'h1', range: { start: 0, end: 4 } }] },
            activeMarks: [],
            activeCommentIds: [],
            activeChangeIds: [],
          })),
        },
      },
    };

    const presentationEditor: Record<string, unknown> = {
      on: vi.fn(),
      off: vi.fn(),
      isEditable: true,
      state: { selection: { empty: false } },
      // Body editor is the host; routed editor is the header.
      getActiveEditor: vi.fn(() => headerEditor),
      getActiveStoryLocator: vi.fn(() => headerStory),
      commands: {},
    };

    const bodyEditor = {
      on: vi.fn(),
      off: vi.fn(),
      state: { selection: { empty: true } },
      isEditable: true,
      doc: {
        selection: {
          current: vi.fn(() => ({
            empty: true,
            target: null,
            activeMarks: [],
            activeCommentIds: [],
            activeChangeIds: [],
          })),
        },
      },
    };
    (bodyEditor as unknown as { _presentationEditor: unknown })._presentationEditor = presentationEditor;
    (bodyEditor as unknown as { presentationEditor: unknown }).presentationEditor = presentationEditor;

    const superdoc = {
      activeEditor: bodyEditor as never,
      config: { documentMode: 'editing' as const },
      on: vi.fn(),
      off: vi.fn(),
    };

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.selection).get();
    expect(slice.target).toEqual({
      kind: 'text',
      segments: [{ blockId: 'h1', range: { start: 0, end: 4 } }],
      story: headerStory,
    });
    expect(slice.selectionTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'h1', offset: 0, story: headerStory },
      end: { kind: 'text', blockId: 'h1', offset: 4, story: headerStory },
      story: headerStory,
    });
  });

  // SD-2954 regression: `resolveToolbarSources` resolves the
  // PresentationEditor through three documented paths, the direct
  // `activeEditor.presentationEditor` field, the legacy
  // `activeEditor._presentationEditor` field, and the
  // `superdocStore.documents[].getPresentationEditor()` lookup.
  // `readActiveStoryLocator` reads the locator through the same
  // pipeline so all three paths surface the active story. Reading
  // `activeEditor.presentationEditor` directly would silently miss
  // the latter two and the new selection slice would stay
  // body-scoped on those mounts.
  it('state.selection.target picks up the active story via the legacy _presentationEditor field', () => {
    const headerStory = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-legacy' };

    const headerEditor = {
      on: vi.fn(),
      off: vi.fn(),
      state: { selection: { empty: false } },
      isEditable: true,
      doc: {
        selection: {
          current: vi.fn(() => ({
            empty: false,
            text: 'header text',
            target: { kind: 'text', segments: [{ blockId: 'h1', range: { start: 0, end: 4 } }] },
            activeMarks: [],
            activeCommentIds: [],
            activeChangeIds: [],
          })),
        },
      },
    };

    const presentationEditor: Record<string, unknown> = {
      on: vi.fn(),
      off: vi.fn(),
      isEditable: true,
      state: { selection: { empty: false } },
      getActiveEditor: vi.fn(() => headerEditor),
      getActiveStoryLocator: vi.fn(() => headerStory),
      commands: {},
    };

    // Mount only via the legacy `_presentationEditor` field. The new
    // selection state must still pick up the active story.
    const bodyEditor = {
      on: vi.fn(),
      off: vi.fn(),
      state: { selection: { empty: true } },
      isEditable: true,
      doc: {
        selection: {
          current: vi.fn(() => ({
            empty: true,
            target: null,
            activeMarks: [],
            activeCommentIds: [],
            activeChangeIds: [],
          })),
        },
      },
    };
    (bodyEditor as unknown as { _presentationEditor: unknown })._presentationEditor = presentationEditor;

    const superdoc = {
      activeEditor: bodyEditor as never,
      config: { documentMode: 'editing' as const },
      on: vi.fn(),
      off: vi.fn(),
    };

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.selection).get();
    expect(slice.target).toEqual({
      kind: 'text',
      segments: [{ blockId: 'h1', range: { start: 0, end: 4 } }],
      story: headerStory,
    });
  });

  it('state.selection.selectionTarget is null when target is null', () => {
    const superdoc = makeSuperdocStub();
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: true,
      text: '',
      target: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const slice = ui.select((state) => state.selection).get();
    expect(slice.target).toBeNull();
    expect(slice.selectionTarget).toBeNull();
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
      selectionTarget: null,
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
      selectionTarget: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'p1', offset: 0 },
        end: { kind: 'text', blockId: 'p1', offset: 3 },
      },
      activeMarks: ['bold'],
      activeCommentIds: ['c1'],
      activeChangeIds: [],
      quotedText: 'foo',
    });
  });

  it('ui.selection.capture returns a frozen snapshot for an addressable selection', () => {
    const superdoc = makeSuperdocStub();
    const target = {
      kind: 'text' as const,
      segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }],
    };
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: false,
      text: 'hello',
      target,
      activeMarks: ['italic'],
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const captured = ui.selection.capture();
    expect(captured).not.toBeNull();
    expect(captured!.target).toEqual(target);
    expect(captured!.selectionTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'p1', offset: 0 },
      end: { kind: 'text', blockId: 'p1', offset: 5 },
    });
    expect(captured!.activeMarks).toEqual(['italic']);
    expect(captured!.quotedText).toBe('hello');

    // Frozen: assigning a property must throw in strict mode.
    expect(Object.isFrozen(captured)).toBe(true);
  });

  // Regression for PR #3016 review: shallow Object.freeze leaves
  // nested fields (target, target.segments, activeMarks array)
  // mutable. A consumer that does
  // `captured.target.segments[0].range.start = 99` or
  // `captured.activeMarks.push('foo')` would otherwise corrupt the
  // shared memoized slice and feed bad targets into later
  // editor.doc.* calls.
  it('ui.selection.capture deep-freezes nested fields against consumer mutation', () => {
    const superdoc = makeSuperdocStub();
    const target = {
      kind: 'text' as const,
      segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }],
    };
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: false,
      text: 'hello',
      target,
      activeMarks: ['italic'],
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const captured = ui.selection.capture();
    expect(captured).not.toBeNull();

    // Top-level frozen.
    expect(Object.isFrozen(captured)).toBe(true);
    // Nested object: target itself.
    expect(Object.isFrozen(captured!.target)).toBe(true);
    // Nested arrays: segments and the marks list.
    expect(Object.isFrozen(captured!.target!.segments)).toBe(true);
    expect(Object.isFrozen(captured!.target!.segments[0])).toBe(true);
    expect(Object.isFrozen(captured!.target!.segments[0].range)).toBe(true);
    expect(Object.isFrozen(captured!.activeMarks)).toBe(true);
    expect(Object.isFrozen(captured!.selectionTarget)).toBe(true);
    expect(Object.isFrozen(captured!.selectionTarget!.start)).toBe(true);

    // Strict-mode mutation attempts throw. The test file is an ES
    // module so its top-level code is strict by default.
    expect(() => {
      (captured!.target!.segments[0].range as { start: number }).start = 99;
    }).toThrow();
    expect(() => {
      (captured!.activeMarks as string[]).push('bold');
    }).toThrow();

    // The shared snapshot the controller still holds is unaffected.
    const liveAgain = ui.selection.getSnapshot();
    expect(liveAgain.target?.segments[0].range.start).toBe(0);
    expect(liveAgain.activeMarks).toEqual(['italic']);
  });

  it('ui.selection.capture returns null when there is no addressable selection', () => {
    const superdoc = makeSuperdocStub();
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => ({
      empty: true,
      text: '',
      target: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    expect(ui.selection.capture()).toBeNull();
  });

  it('ui.selection.capture survives a later selection clear (use-case: sidebar composer keeps focus)', () => {
    const superdoc = makeSuperdocStub();
    const target = {
      kind: 'text' as const,
      segments: [{ blockId: 'p1', range: { start: 0, end: 4 } }],
    };
    let live: unknown = {
      empty: false,
      text: 'word',
      target,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
    };
    (superdoc.activeEditor as { doc: { selection: { current: unknown } } }).doc.selection.current = vi.fn(() => live);
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const captured = ui.selection.capture();
    expect(captured?.target).toEqual(target);

    // Composer takes focus: the live selection clears, but the
    // captured handle keeps the original target so a downstream
    // `editor.doc.comments.create({ target: captured.target })`
    // still has a valid anchor.
    live = { empty: true, text: '', target: null, activeMarks: [], activeCommentIds: [], activeChangeIds: [] };
    expect(ui.selection.getSnapshot().target).toBeNull();
    expect(captured!.target).toEqual(target);
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

describe('ui.zoom', () => {
  let teardown: Array<() => void> = [];

  afterEach(() => {
    teardown.forEach((fn) => fn());
    teardown = [];
  });

  const attachZoomSurface = (superdoc: ReturnType<typeof makeSuperdocStub>) => {
    const zoomHost = {
      state: {
        mode: 'manual' as 'manual' | 'fit-width',
        value: 100,
        fitZoom: null as number | null,
        min: 10,
        max: 100,
      },
      metrics: null as { availableWidth: number; documentWidth: number; fitZoom: number } | null,
      setZoom: vi.fn(),
      setZoomMode: vi.fn(),
    };
    superdoc.getZoomState = vi.fn(() => ({ ...zoomHost.state }));
    superdoc.getViewportMetrics = vi.fn(() => zoomHost.metrics);
    superdoc.setZoom = zoomHost.setZoom;
    superdoc.setZoomMode = zoomHost.setZoomMode;
    return zoomHost;
  };

  it('degrades to a static manual/100 snapshot when the host lacks the zoom surface', () => {
    const superdoc = makeSuperdocStub();
    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    expect(ui.zoom.getSnapshot()).toEqual({
      mode: 'manual',
      value: 100,
      fitZoom: null,
      min: 10,
      max: 100,
      metrics: null,
    });
    // Mutations are no-ops, not crashes.
    expect(() => ui.zoom.set(150)).not.toThrow();
    expect(() => ui.zoom.setMode('fit-width')).not.toThrow();
  });

  it('snapshots the host zoom state and metrics', () => {
    const superdoc = makeSuperdocStub();
    const zoomHost = attachZoomSurface(superdoc);
    zoomHost.state = { mode: 'fit-width', value: 84, fitZoom: 84, min: 25, max: 100 };
    zoomHost.metrics = { availableWidth: 685, documentWidth: 816, fitZoom: 84 };

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    expect(ui.zoom.getSnapshot()).toEqual({
      mode: 'fit-width',
      value: 84,
      fitZoom: 84,
      min: 25,
      max: 100,
      metrics: { availableWidth: 685, documentWidth: 816, fitZoom: 84 },
    });
  });

  it('observes mode-only transitions via zoomChange', async () => {
    const superdoc = makeSuperdocStub();
    const zoomHost = attachZoomSurface(superdoc);

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    teardown.push(ui.zoom.observe(cb));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].mode).toBe('manual');

    zoomHost.state = { ...zoomHost.state, mode: 'fit-width' };
    superdoc.fireSuperdoc('zoomChange', { zoom: 100, mode: 'fit-width' });
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0].mode).toBe('fit-width');
    expect(cb.mock.calls[1][0].value).toBe(100);
  });

  it('observes viewport metric updates via viewport-change', async () => {
    const superdoc = makeSuperdocStub();
    const zoomHost = attachZoomSurface(superdoc);

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    teardown.push(ui.zoom.observe(cb));
    expect(cb).toHaveBeenCalledTimes(1);

    zoomHost.state = { ...zoomHost.state, fitZoom: 74 };
    zoomHost.metrics = { availableWidth: 600, documentWidth: 816, fitZoom: 74 };
    superdoc.fireSuperdoc('viewport-change', zoomHost.metrics);
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0].fitZoom).toBe(74);
    expect(cb.mock.calls[1][0].metrics).toEqual({ availableWidth: 600, documentWidth: 816, fitZoom: 74 });
  });

  it('does not re-fire observers when zoom state is unchanged', async () => {
    const superdoc = makeSuperdocStub();
    attachZoomSurface(superdoc);

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    const cb = vi.fn();
    teardown.push(ui.zoom.observe(cb));
    expect(cb).toHaveBeenCalledTimes(1);

    // Unrelated recompute trigger with identical zoom state.
    superdoc.fireSuperdoc('document-mode-change', { documentMode: 'viewing' });
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('routes set and setMode to the host zoom surface', () => {
    const superdoc = makeSuperdocStub();
    const zoomHost = attachZoomSurface(superdoc);

    const ui = createSuperDocUI({ superdoc });
    teardown.push(() => ui.destroy());

    ui.zoom.set(125);
    expect(zoomHost.setZoom).toHaveBeenCalledWith(125);

    ui.zoom.setMode('fit-width');
    expect(zoomHost.setZoomMode).toHaveBeenCalledWith('fit-width');
  });
});
