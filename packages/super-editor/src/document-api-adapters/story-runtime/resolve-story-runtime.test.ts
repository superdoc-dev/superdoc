import { describe, it, test, expect, mock, beforeEach } from 'bun:test';
/**
 * Regression tests for story runtime cache invalidation.
 *
 * Validates that cached story runtimes are automatically invalidated when
 * underlying parts are mutated (e.g., notes-part-changed event).
 */

import type { Editor } from '../../core/Editor.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = {
  buildStoryKey: mock((locator: any) => {
    if (locator.storyType === 'footnote') return `fn:${locator.noteId}`;
    if (locator.storyType === 'endnote') return `en:${locator.noteId}`;
    if (locator.storyType === 'body') return 'body';
    return `unknown:${JSON.stringify(locator)}`;
  }),
  resolveNoteRuntime: mock(),
  resolveHeaderFooterSlotRuntime: mock(),
  resolveHeaderFooterPartRuntime: mock(),
  isHeaderFooterPartId: mock((partId: string) => /^word\/(header|footer)\d+\.xml$/.test(partId)),
  initRevision: mock(),
  trackRevisions: mock(),
  restoreRevision: mock(),
  getStoryRevisionStore: mock(() => null),
  getStoryRevision: mock(() => '0'),
  incrementStoryRevision: mock(),
};

mock.module('./story-key.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./story-key.js')>();
  return {
    ...original,
    buildStoryKey: mocks.buildStoryKey,
  };
});

mock.module('./note-story-runtime.js', () => ({
  resolveNoteRuntime: mocks.resolveNoteRuntime,
}));

mock.module('./header-footer-story-runtime.js', () => ({
  resolveHeaderFooterSlotRuntime: mocks.resolveHeaderFooterSlotRuntime,
  resolveHeaderFooterPartRuntime: mocks.resolveHeaderFooterPartRuntime,
}));

mock.module('../../core/parts/adapters/header-footer-part-descriptor.js', () => ({
  isHeaderFooterPartId: mocks.isHeaderFooterPartId,
}));

mock.module('../plan-engine/revision-tracker.js', () => ({
  initRevision: mocks.initRevision,
  trackRevisions: mocks.trackRevisions,
  restoreRevision: mocks.restoreRevision,
}));

mock.module('./story-revision-store.js', () => ({
  getStoryRevisionStore: mocks.getStoryRevisionStore,
  getStoryRevision: mocks.getStoryRevision,
  incrementStoryRevision: mocks.incrementStoryRevision,
}));

const { resolveStoryRuntime, invalidateStoryRuntime } = await import('./resolve-story-runtime.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EventHandler = (...args: unknown[]) => void;

function makeHostEditor(): Editor & { _emit: (event: string, payload?: unknown) => void } {
  const listeners = new Map<string, EventHandler[]>();

  const editor = {
    state: { doc: { content: { size: 10 } } },
    commands: {},
    on(event: string, handler: EventHandler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    },
    _emit(event: string, payload?: unknown) {
      for (const handler of listeners.get(event) ?? []) {
        handler(payload);
      }
    },
  } as any;

  return editor;
}

function makeNoteRuntime(storyKey: string) {
  const dispose = mock();
  return {
    locator: { kind: 'story', storyType: 'footnote', noteId: storyKey.split(':')[1] },
    storyKey,
    editor: { on: mock(), state: { doc: { content: { size: 5 } } } } as any,
    kind: 'note' as const,
    dispose,
    _dispose: dispose,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Restore default mock implementations (restoreAllMocks clears them).
  mocks.buildStoryKey.mockImplementation((locator: any) => {
    if (locator.storyType === 'footnote') return `fn:${locator.noteId}`;
    if (locator.storyType === 'endnote') return `en:${locator.noteId}`;
    if (locator.storyType === 'body') return 'body';
    return `unknown:${JSON.stringify(locator)}`;
  });
  mocks.isHeaderFooterPartId.mockImplementation((partId: string) => /^word\/(header|footer)\d+\.xml$/.test(partId));
  mocks.getStoryRevisionStore.mockReturnValue(null);
  mocks.getStoryRevision.mockReturnValue('0');
});

// ---------------------------------------------------------------------------
// Cache invalidation via notes-part-changed event
// ---------------------------------------------------------------------------

describe('resolveStoryRuntime — cache invalidation on part change', () => {
  it('invalidates footnote runtimes when notes-part-changed fires', () => {
    const hostEditor = makeHostEditor();
    const runtime = makeNoteRuntime('fn:1');
    mocks.resolveNoteRuntime.mockReturnValue(runtime);

    // First call: creates and caches the runtime
    const first = resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'footnote',
      noteId: '1',
    });
    expect(first).toBe(runtime);

    // Simulate a part mutation that rebuilds converter data
    const freshRuntime = makeNoteRuntime('fn:1');
    mocks.resolveNoteRuntime.mockReturnValue(freshRuntime);

    hostEditor._emit('notes-part-changed', { partId: 'footnotes' });

    // The old runtime should have been disposed
    expect(runtime._dispose).toHaveBeenCalled();

    // Second call: should create a new runtime (cache was invalidated)
    const second = resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'footnote',
      noteId: '1',
    });
    expect(second).toBe(freshRuntime);
    expect(second).not.toBe(first);
  });

  it('invalidates endnote runtimes when notes-part-changed fires', () => {
    const hostEditor = makeHostEditor();
    const runtime = makeNoteRuntime('en:1');
    runtime.locator = { kind: 'story', storyType: 'endnote', noteId: '1' } as any;
    mocks.buildStoryKey.mockReturnValueOnce('en:1');
    mocks.resolveNoteRuntime.mockReturnValue(runtime);

    resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'endnote',
      noteId: '1',
    });

    hostEditor._emit('notes-part-changed', { partId: 'endnotes' });

    // Endnote runtime should also be invalidated
    expect(runtime._dispose).toHaveBeenCalled();
  });

  it('does not invalidate body runtime when notes-part-changed fires', () => {
    const hostEditor = makeHostEditor();

    // Resolve body runtime first
    const body = resolveStoryRuntime(hostEditor);
    expect(body.kind).toBe('body');

    // Fire notes-part-changed
    hostEditor._emit('notes-part-changed', { partId: 'footnotes' });

    // Body should still be cached
    const bodyAgain = resolveStoryRuntime(hostEditor);
    expect(bodyAgain).toBe(body);
  });
});

// ---------------------------------------------------------------------------
// Cache invalidation via partChanged event (header/footer)
// ---------------------------------------------------------------------------

describe('resolveStoryRuntime — cache invalidation on header/footer part change', () => {
  function makeHfRuntime(storyKey: string) {
    const dispose = mock();
    return {
      locator: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' } as any,
      storyKey,
      editor: { on: mock(), state: { doc: { content: { size: 5 } } } } as any,
      kind: 'headerFooter' as const,
      dispose,
      _dispose: dispose,
    };
  }

  it('invalidates header/footer runtimes when partChanged fires for a header part', () => {
    const hostEditor = makeHostEditor();
    const runtime = makeHfRuntime('hf:part:rId7');
    mocks.buildStoryKey.mockReturnValueOnce('hf:part:rId7');
    mocks.resolveHeaderFooterPartRuntime.mockReturnValue(runtime);

    // First call: creates and caches the runtime
    const first = resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: 'rId7',
    } as any);
    expect(first).toBe(runtime);

    // Simulate a part mutation on a header part
    const freshRuntime = makeHfRuntime('hf:part:rId7');
    mocks.buildStoryKey.mockReturnValueOnce('hf:part:rId7');
    mocks.resolveHeaderFooterPartRuntime.mockReturnValue(freshRuntime);

    hostEditor._emit('partChanged', {
      parts: [{ partId: 'word/header1.xml', operation: 'mutate', changedPaths: [] }],
      source: 'collab-sync',
    });

    // The old runtime should have been disposed
    expect(runtime._dispose).toHaveBeenCalled();

    // Second call: should create a new runtime (cache was invalidated)
    const second = resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: 'rId7',
    } as any);
    expect(second).toBe(freshRuntime);
    expect(second).not.toBe(first);
  });

  it('invalidates header/footer runtimes when partChanged fires for a footer part', () => {
    const hostEditor = makeHostEditor();
    const runtime = makeHfRuntime('hf:part:rId9');
    runtime.storyKey = 'hf:part:rId9';
    mocks.buildStoryKey.mockReturnValueOnce('hf:part:rId9');
    mocks.resolveHeaderFooterPartRuntime.mockReturnValue(runtime);

    resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: 'rId9',
    } as any);

    hostEditor._emit('partChanged', {
      parts: [{ partId: 'word/footer2.xml', operation: 'mutate', changedPaths: [] }],
      source: 'collab-sync',
    });

    expect(runtime._dispose).toHaveBeenCalled();
  });

  it('does not invalidate header/footer runtimes when partChanged fires for a non-hf part', () => {
    const hostEditor = makeHostEditor();
    const runtime = makeHfRuntime('hf:part:rId7');
    mocks.buildStoryKey.mockReturnValueOnce('hf:part:rId7').mockReturnValueOnce('hf:part:rId7');
    mocks.resolveHeaderFooterPartRuntime.mockReturnValue(runtime);

    resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: 'rId7',
    } as any);

    // Fire partChanged for a non-header/footer part (e.g., styles)
    hostEditor._emit('partChanged', {
      parts: [{ partId: 'word/styles.xml', operation: 'mutate', changedPaths: [] }],
      source: 'collab-sync',
    });

    // Header/footer runtime should NOT be invalidated
    expect(runtime._dispose).not.toHaveBeenCalled();

    // Cache should still return the same runtime (no buildStoryKey call needed — cache hit)
    const second = resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: 'rId7',
    } as any);
    expect(second).toBe(runtime);
  });

  it('does not invalidate body or note runtimes when partChanged fires for a header part', () => {
    const hostEditor = makeHostEditor();

    // Cache a body runtime
    const body = resolveStoryRuntime(hostEditor);

    // Cache a footnote runtime
    const noteRuntime = makeNoteRuntime('fn:1');
    mocks.resolveNoteRuntime.mockReturnValue(noteRuntime);
    resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'footnote',
      noteId: '1',
    });

    // Fire partChanged for a header part
    hostEditor._emit('partChanged', {
      parts: [{ partId: 'word/header1.xml', operation: 'mutate', changedPaths: [] }],
      source: 'collab-sync',
    });

    // Body and note runtimes should not be disposed
    expect(noteRuntime._dispose).not.toHaveBeenCalled();

    // Body should still be cached
    const bodyAgain = resolveStoryRuntime(hostEditor);
    expect(bodyAgain).toBe(body);
  });
});

// ---------------------------------------------------------------------------
// invalidateStoryRuntime — explicit invalidation
// ---------------------------------------------------------------------------

describe('invalidateStoryRuntime', () => {
  it('invalidates a specific cached runtime', () => {
    const hostEditor = makeHostEditor();
    const runtime = makeNoteRuntime('fn:42');
    mocks.resolveNoteRuntime.mockReturnValue(runtime);

    resolveStoryRuntime(hostEditor, {
      kind: 'story',
      storyType: 'footnote',
      noteId: '42',
    });

    const result = invalidateStoryRuntime(hostEditor, 'fn:42');

    expect(result).toBe(true);
    expect(runtime._dispose).toHaveBeenCalled();
  });

  it('returns false when no cache exists for the editor', () => {
    const hostEditor = makeHostEditor();
    const result = invalidateStoryRuntime(hostEditor, 'fn:1');
    expect(result).toBe(false);
  });
});
