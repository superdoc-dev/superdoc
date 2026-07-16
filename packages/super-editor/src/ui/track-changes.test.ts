import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';
import { buildTrackedChangeCanonicalIdMap } from '../editors/v1/document-api-adapters/helpers/tracked-change-resolver.js';
import { resolveStoryRuntime } from '../editors/v1/document-api-adapters/story-runtime/resolve-story-runtime.js';

vi.mock('../editors/v1/document-api-adapters/helpers/tracked-change-resolver.js', async (importActual) => {
  const actual =
    await importActual<typeof import('../editors/v1/document-api-adapters/helpers/tracked-change-resolver.js')>();
  return {
    ...actual,
    buildTrackedChangeCanonicalIdMap: vi.fn(),
  };
});
const mockBuildTrackedChangeCanonicalIdMap = vi.mocked(buildTrackedChangeCanonicalIdMap);

vi.mock('../editors/v1/document-api-adapters/story-runtime/resolve-story-runtime.js', async (importActual) => {
  const actual =
    await importActual<typeof import('../editors/v1/document-api-adapters/story-runtime/resolve-story-runtime.js')>();
  return {
    ...actual,
    resolveStoryRuntime: vi.fn(),
  };
});
const mockResolveStoryRuntime = vi.mocked(resolveStoryRuntime);

beforeEach(() => {
  mockBuildTrackedChangeCanonicalIdMap.mockReturnValue(new Map());
  mockResolveStoryRuntime.mockReset();
});

/**
 * Stub builder for `ui.trackChanges` tests. Models
 * `editor.doc.trackChanges.list()` + `editor.doc.trackChanges.decide()`
 * + selection routing.
 */
function makeStubs(
  initial: {
    comments?: Array<{ id: string; commentId: string; text?: string; status?: 'open' | 'resolved' }>;
    trackedChanges?: Array<{
      id: string;
      type?: 'insert' | 'delete' | 'format';
      excerpt?: string;
      author?: string;
      authorEmail?: string;
      authorImage?: string;
      story?: unknown;
    }>;
    activeCommentIds?: string[];
    activeChangeIds?: string[];
  } = {},
) {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  let commentsList = initial.comments ?? [];
  let changesList = initial.trackedChanges ?? [];

  const listComments = vi.fn(() => ({
    evaluatedRevision: 'r1',
    total: commentsList.length,
    items: commentsList.map((c) => ({
      id: c.commentId,
      handle: { ref: `comment:${c.commentId}`, refStability: 'stable' as const, targetKind: 'comment' as const },
      address: { kind: 'entity' as const, entityType: 'comment' as const, entityId: c.commentId },
      status: c.status ?? ('open' as const),
      text: c.text,
    })),
    page: { limit: 50, offset: 0, returned: commentsList.length },
  }));
  const listChanges = vi.fn((_query?: unknown) => ({
    evaluatedRevision: 'r1',
    total: changesList.length,
    items: changesList.map((tc) => ({
      id: tc.id,
      handle: {
        ref: `tracked-change:${tc.id}`,
        refStability: 'stable' as const,
        targetKind: 'trackedChange' as const,
      },
      address: {
        kind: 'entity' as const,
        entityType: 'trackedChange' as const,
        entityId: tc.id,
        ...(tc.story != null ? { story: tc.story } : {}),
      },
      type: tc.type ?? ('insert' as const),
      excerpt: tc.excerpt,
      author: tc.author,
      authorEmail: tc.authorEmail,
      authorImage: tc.authorImage,
    })),
    page: { limit: 50, offset: 0, returned: changesList.length },
  }));
  const decide = vi.fn((_input: unknown) => ({ success: true as const }));
  const navigateTo = vi.fn(async (_target: unknown, _options?: unknown) => true);
  const setActiveTrackChangeIds = vi.fn((_ids: readonly string[]) => true);
  const setDocumentMode = vi.fn();

  const editor: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    doc: unknown;
    presentationEditor: {
      navigateTo: typeof navigateTo;
      getActiveEditor: () => unknown;
      setActiveTrackChangeIds: typeof setActiveTrackChangeIds;
      visibleHost?: HTMLElement;
    };
  } = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!editorListeners.has(event)) editorListeners.set(event, new Set());
      editorListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      editorListeners.get(event)?.delete(handler);
    }),
    doc: {
      selection: {
        current: vi.fn(() => ({
          empty: true,
          text: '',
          target: null,
          activeCommentIds: initial.activeCommentIds ?? [],
          activeChangeIds: initial.activeChangeIds ?? [],
        })),
      },
      comments: { list: listComments, create: vi.fn(), patch: vi.fn(), delete: vi.fn() },
      trackChanges: { list: listChanges, decide },
    },
    presentationEditor: undefined as never,
  };
  editor.presentationEditor = { navigateTo, getActiveEditor: () => editor, setActiveTrackChangeIds };

  const superdoc: SuperDocLike & {
    fireEditor(event: string, ...args: unknown[]): void;
    fireSuperdoc(event: string, ...args: unknown[]): void;
    setComments(next: typeof commentsList): void;
    setTrackedChanges(next: typeof changesList): void;
    setActiveSelection(
      commentIds?: string[],
      changeIds?: string[],
      target?: { segments: Array<{ blockId: string; range: { start: number; end: number } }> } | null,
    ): void;
  } = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
    setDocumentMode: setDocumentMode as never,
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
    setComments(next) {
      commentsList = next;
    },
    setTrackedChanges(next) {
      changesList = next;
    },
    setActiveSelection(commentIds = [], changeIds = [], target = null) {
      (editor.doc.selection.current as unknown as () => unknown) = vi.fn(() => ({
        empty: commentIds.length === 0 && changeIds.length === 0,
        text: '',
        target,
        activeCommentIds: commentIds,
        activeChangeIds: changeIds,
      }));
    },
  };

  return {
    superdoc,
    editor,
    mocks: { listComments, listChanges, decide, navigateTo, setActiveTrackChangeIds, setDocumentMode },
  };
}

function withElementFromPoint(hit: Element | null, run: () => void) {
  const docAny = document as unknown as { elementFromPoint?: (x: number, y: number) => Element | null };
  const original = docAny.elementFromPoint;
  docAny.elementFromPoint = () => hit;
  try {
    run();
  } finally {
    if (original) docAny.elementFromPoint = original;
    else delete docAny.elementFromPoint;
  }
}

describe('ui.trackChanges — snapshot', () => {
  it('items mirror trackChanges.list() in document order', () => {
    const { superdoc } = makeStubs({
      trackedChanges: [
        { id: 'tc1', type: 'insert' },
        { id: 'tc2', type: 'delete' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.trackChanges.getSnapshot();
    expect(snap.items.map((i) => i.id)).toEqual(['tc1', 'tc2']);
    expect(snap.total).toBe(2);

    ui.destroy();
  });

  it('reads the active-editor Document API when toolbar routing has no routed editor', () => {
    const { superdoc, editor } = makeStubs({
      trackedChanges: [
        { id: 'tc-active-1', type: 'insert' },
        { id: 'tc-active-2', type: 'delete' },
      ],
    });
    editor.presentationEditor = null as never;

    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().items.map((item) => item.id)).toEqual(['tc-active-1', 'tc-active-2']);

    ui.destroy();
  });

  it('items expose the full change record under .change', () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1', type: 'insert', excerpt: 'hi' }],
    });
    const ui = createSuperDocUI({ superdoc });

    const item = ui.trackChanges.getSnapshot().items[0]!;
    expect(item.id).toBe('tc1');
    expect(item.change.type).toBe('insert');
    expect(item.change.excerpt).toBe('hi');

    ui.destroy();
  });

  it('resolves per-author colors onto items and ordered authors', () => {
    const { superdoc } = makeStubs({
      trackedChanges: [
        { id: 'tc1', type: 'insert', author: 'Alice Reviewer', authorEmail: 'alice@example.test' },
        { id: 'tc2', type: 'delete', author: 'Bob Reviewer' },
        { id: 'tc3', type: 'format', author: 'Alice Reviewer', authorEmail: 'alice@example.test' },
      ],
    });
    superdoc.config = {
      documentMode: 'editing',
      modules: {
        trackChanges: {
          authorColors: {
            overrides: { 'alice@example.test': '#123456' },
            resolve: (author) => (author.name === 'Bob Reviewer' ? '#654321' : undefined),
          },
        },
      },
    };
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.trackChanges.getSnapshot();

    expect(snap.items.map((item) => item.authorColor)).toEqual(['#123456', '#654321', '#123456']);
    expect(snap.items.map((item) => item.change.authorColor)).toEqual(['#123456', '#654321', '#123456']);
    expect(snap.authors).toEqual([
      { name: 'Alice Reviewer', email: 'alice@example.test', image: undefined, color: '#123456' },
      { name: 'Bob Reviewer', email: undefined, image: undefined, color: '#654321' },
    ]);

    ui.destroy();
  });

  it('comments do not appear in trackChanges items', () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    const ids = ui.trackChanges.getSnapshot().items.map((i) => i.id);
    expect(ids).toEqual(['tc1']);

    ui.destroy();
  });

  it('activeId mirrors selection.activeChangeIds[0]', () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
      activeChangeIds: ['tc2'],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    ui.destroy();
  });

  it('activeId stays null when only comments are active', () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
      activeCommentIds: ['c1'],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe(null);

    ui.destroy();
  });

  it('subscribe fires once with the initial snapshot', () => {
    const { superdoc } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.trackChanges.subscribe(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0] as { snapshot: { items: unknown[] } };
    expect(arg.snapshot.items).toHaveLength(1);

    off();
    ui.destroy();
  });
});

describe('ui.trackChanges — point hit testing and active state', () => {
  it('getAt returns the public item for a rendered tracked-change DOM id', () => {
    mockBuildTrackedChangeCanonicalIdMap.mockReturnValue(new Map([['rendered-delete-230', 'word:trackDelete:230']]));
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'word:trackDelete:230', type: 'delete' }],
    });
    const host = document.createElement('div');
    const hit = document.createElement('span');
    hit.setAttribute('data-track-change-id', 'rendered-delete-230');
    host.appendChild(hit);
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    withElementFromPoint(hit, () => {
      const result = ui.trackChanges.getAt({ x: 10, y: 20 });

      expect(result?.id).toBe('word:trackDelete:230');
      expect(result?.item.id).toBe('word:trackDelete:230');
    });

    host.remove();
    ui.destroy();
  });

  it('getAt resolves rendered ids from non-body story editors', () => {
    const story = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-header' } as const;
    const storyEditor = { marker: 'story-editor' };
    mockBuildTrackedChangeCanonicalIdMap.mockImplementation((editor) =>
      editor === storyEditor
        ? new Map([
            ['rendered-header-230', 'word:trackInsert:header-230'],
            ['word:trackInsert:header-230', 'word:trackInsert:header-230'],
          ])
        : new Map(),
    );
    mockResolveStoryRuntime.mockReturnValue({
      locator: story,
      storyKey: 'hf:part:rId-header',
      editor: storyEditor,
      kind: 'headerFooterPart',
    } as never);
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'word:trackInsert:header-230', story }],
    });
    const host = document.createElement('div');
    const hit = document.createElement('span');
    hit.setAttribute('data-track-change-id', 'rendered-header-230');
    host.appendChild(hit);
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    withElementFromPoint(hit, () => {
      const result = ui.trackChanges.getAt({ x: 10, y: 20 });

      expect(result?.id).toBe('word:trackInsert:header-230');
      expect(result?.item.change.address.story).toEqual(story);
    });
    expect(mockResolveStoryRuntime).toHaveBeenCalledWith(expect.anything(), story);

    host.remove();
    ui.destroy();
  });

  it('getAt still resolves direct public ids when story runtime resolution throws', () => {
    const story = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-header' } as const;
    mockResolveStoryRuntime.mockImplementation(() => {
      throw new Error('story runtime unavailable');
    });
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'word:trackInsert:header-230', story }],
    });
    const host = document.createElement('div');
    const hit = document.createElement('span');
    hit.setAttribute('data-track-change-id', 'word:trackInsert:header-230');
    host.appendChild(hit);
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    withElementFromPoint(hit, () => {
      const result = ui.trackChanges.getAt({ x: 10, y: 20 });

      expect(result?.id).toBe('word:trackInsert:header-230');
      expect(result?.item.change.address.story).toEqual(story);
    });
    expect(mockResolveStoryRuntime).toHaveBeenCalled();

    host.remove();
    ui.destroy();
  });

  it('getAt resolves each non-body story runtime once per stable tracked-change slice', () => {
    const story = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-header' } as const;
    const storyEditor = { marker: 'story-editor' };
    mockBuildTrackedChangeCanonicalIdMap.mockImplementation((editor) =>
      editor === storyEditor
        ? new Map([
            ['rendered-header-230', 'word:trackInsert:header-230'],
            ['rendered-header-231', 'word:trackInsert:header-231'],
          ])
        : new Map(),
    );
    mockResolveStoryRuntime.mockReturnValue({
      locator: story,
      storyKey: 'hf:part:rId-header',
      editor: storyEditor,
      kind: 'headerFooterPart',
    } as never);
    const { superdoc } = makeStubs({
      trackedChanges: [
        { id: 'word:trackInsert:header-230', story },
        { id: 'word:trackInsert:header-231', story },
      ],
    });
    const host = document.createElement('div');
    const hit = document.createElement('span');
    hit.setAttribute('data-track-change-id', 'rendered-header-230');
    host.appendChild(hit);
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    withElementFromPoint(hit, () => {
      const result = ui.trackChanges.getAt({ x: 10, y: 20 });

      expect(result?.id).toBe('word:trackInsert:header-230');
    });
    expect(mockResolveStoryRuntime).toHaveBeenCalledTimes(1);

    host.remove();
    ui.destroy();
  });

  it('getAt preserves innermost tracked-change order', () => {
    mockBuildTrackedChangeCanonicalIdMap.mockReturnValue(
      new Map([
        ['raw-inner', 'tc-inner'],
        ['raw-outer', 'tc-outer'],
      ]),
    );
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc-inner' }, { id: 'tc-outer' }],
    });
    const host = document.createElement('div');
    const outer = document.createElement('span');
    const inner = document.createElement('span');
    outer.setAttribute('data-track-change-id', 'raw-outer');
    inner.setAttribute('data-track-change-id', 'raw-inner');
    outer.appendChild(inner);
    host.appendChild(outer);
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    withElementFromPoint(inner, () => {
      expect(ui.trackChanges.getAt({ x: 10, y: 20 })?.id).toBe('tc-inner');
    });

    host.remove();
    ui.destroy();
  });

  it('getAt returns null for invalid input, outside host, missing host, and stale mapped ids', () => {
    const { superdoc } = makeStubs({ trackedChanges: [{ id: 'tc-present' }] });
    const host = document.createElement('div');
    const outside = document.createElement('span');
    const stale = document.createElement('span');
    stale.setAttribute('data-track-change-id', 'raw-stale');
    document.body.append(host, outside);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost?: HTMLElement } }
    ).presentationEditor.visibleHost = host;
    mockBuildTrackedChangeCanonicalIdMap.mockReturnValue(new Map([['raw-stale', 'tc-missing']]));

    const ui = createSuperDocUI({ superdoc });
    expect(ui.trackChanges.getAt({} as never)).toBeNull();
    expect(ui.trackChanges.getAt({ x: 'a', y: 0 } as never)).toBeNull();
    withElementFromPoint(outside, () => {
      expect(ui.trackChanges.getAt({ x: 10, y: 20 })).toBeNull();
    });
    delete (superdoc.activeEditor as unknown as { presentationEditor: { visibleHost?: HTMLElement } })
      .presentationEditor.visibleHost;
    withElementFromPoint(stale, () => {
      expect(ui.trackChanges.getAt({ x: 10, y: 20 })).toBeNull();
    });
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost?: HTMLElement } }
    ).presentationEditor.visibleHost = host;
    host.appendChild(stale);
    withElementFromPoint(stale, () => {
      expect(ui.trackChanges.getAt({ x: 10, y: 20 })).toBeNull();
    });

    outside.remove();
    host.remove();
    ui.destroy();
  });

  it('getAt is read-only', () => {
    mockBuildTrackedChangeCanonicalIdMap.mockReturnValue(new Map([['raw-tc1', 'tc1']]));
    const { superdoc, editor, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const setTextSelection = vi.fn();
    (editor as unknown as { commands: { setTextSelection: typeof setTextSelection } }).commands = { setTextSelection };
    const host = document.createElement('div');
    const hit = document.createElement('span');
    hit.setAttribute('data-track-change-id', 'raw-tc1');
    host.appendChild(hit);
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    withElementFromPoint(hit, () => {
      expect(ui.trackChanges.getAt({ x: 10, y: 20 })?.id).toBe('tc1');
    });

    expect(mocks.navigateTo).not.toHaveBeenCalled();
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(setTextSelection).not.toHaveBeenCalled();
    host.remove();
    ui.destroy();
  });

  it('getAt falls back to direct public ids when alias resolution throws', () => {
    mockBuildTrackedChangeCanonicalIdMap.mockImplementation(() => {
      throw new Error('editor unavailable');
    });
    const { superdoc } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const host = document.createElement('div');
    const hit = document.createElement('span');
    hit.setAttribute('data-track-change-id', 'tc1');
    host.appendChild(hit);
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    withElementFromPoint(hit, () => {
      expect(ui.trackChanges.getAt({ x: 10, y: 20 })?.id).toBe('tc1');
    });

    host.remove();
    ui.destroy();
  });

  it('setActive sets, clears, validates ids, and notifies subscribers', async () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }] });
    const ui = createSuperDocUI({ superdoc });
    const cb = vi.fn();
    const off = ui.trackChanges.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    expect(ui.trackChanges.setActive('tc1')).toBe(true);
    await Promise.resolve();
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1]![0].snapshot.activeId).toBe('tc1');

    expect(ui.trackChanges.setActive('unknown')).toBe(false);
    await Promise.resolve();
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');
    expect(cb).toHaveBeenCalledTimes(2);

    expect(ui.trackChanges.setActive(null)).toBe(true);
    await Promise.resolve();
    expect(ui.trackChanges.getSnapshot().activeId).toBeNull();
    expect(cb).toHaveBeenCalledTimes(3);

    expect(mocks.navigateTo).not.toHaveBeenCalled();
    expect(mocks.decide).not.toHaveBeenCalled();
    off();
    ui.destroy();
  });

  it('setActive syncs rendered tracked-change aliases into presentation focus', () => {
    mockBuildTrackedChangeCanonicalIdMap.mockReturnValue(
      new Map([
        ['rendered-tc1', 'tc1'],
        ['preferred-tc1', 'tc1'],
      ]),
    );
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.setActive('tc1')).toBe(true);
    expect(mocks.setActiveTrackChangeIds).toHaveBeenLastCalledWith(['tc1', 'rendered-tc1', 'preferred-tc1']);

    expect(ui.trackChanges.setActive(null)).toBe(true);
    expect(mocks.setActiveTrackChangeIds).toHaveBeenLastCalledWith([]);

    ui.destroy();
  });

  it('setActive returns false when no editor is mounted', () => {
    const { superdoc } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    superdoc.activeEditor = null as never;
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.setActive('tc1')).toBe(false);
    expect(ui.trackChanges.setActive(null)).toBe(false);

    ui.destroy();
  });
});

describe('ui.trackChanges — decide actions route through editor.doc.trackChanges.*', () => {
  it('accept(id) routes to decide({ decision: "accept", target: { id } })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.accept('tc1');

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'accept', target: { id: 'tc1' } });
    ui.destroy();
  });

  it('reject(id) routes to decide({ decision: "reject", target: { id } })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.reject('tc1');

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'reject', target: { id: 'tc1' } });
    ui.destroy();
  });

  it('acceptAll() routes to decide({ scope: "all" })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.acceptAll();

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'accept', target: { scope: 'all' } });
    ui.destroy();
  });

  it('rejectAll() routes to decide({ scope: "all" })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.rejectAll();

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'reject', target: { scope: 'all' } });
    ui.destroy();
  });

  it('accept(id) refuses synchronously in read-only mode before calling doc.trackChanges.decide', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    superdoc.config = {
      documentMode: 'viewing',
      modules: { trackChanges: { enabled: false } },
    };
    const ui = createSuperDocUI({ superdoc });

    expect(() => ui.trackChanges.accept('tc1')).toThrow(/read-only mode/);
    expect(mocks.decide).not.toHaveBeenCalled();

    ui.destroy();
  });
});

describe('ui.trackChanges — next/previous navigation', () => {
  it('next() advances activeId in document order', () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.next()).toBe('tc1');
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    expect(ui.trackChanges.next()).toBe('tc2');
    expect(ui.trackChanges.next()).toBe('tc3');
  });

  it('next() wraps from the last item to the first', () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.next(); // tc1
    ui.trackChanges.next(); // tc2
    expect(ui.trackChanges.next()).toBe('tc1'); // wrap
  });

  it('previous() walks backward and wraps from first to last', () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.previous()).toBe('tc3'); // null → wrap to last
    expect(ui.trackChanges.previous()).toBe('tc2');
    expect(ui.trackChanges.previous()).toBe('tc1');
    expect(ui.trackChanges.previous()).toBe('tc3'); // wrap
  });

  it('next() / previous() return null when the feed is empty', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.next()).toBe(null);
    expect(ui.trackChanges.previous()).toBe(null);
    expect(ui.trackChanges.getSnapshot().activeId).toBe(null);

    ui.destroy();
  });

  it('navigateNext() advances, scrolls atomically, and uses instant behavior', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await expect(ui.trackChanges.navigateNext()).resolves.toEqual({ success: true });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');
    expect(mocks.navigateTo).toHaveBeenCalledWith(
      { kind: 'entity', entityType: 'trackedChange', entityId: 'tc1' },
      expect.objectContaining({ behavior: 'auto', block: 'center' }),
    );

    ui.destroy();
  });

  it('navigatePrevious() returns a failed receipt when the feed is empty', async () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    await expect(ui.trackChanges.navigatePrevious()).resolves.toEqual({ success: false });
    expect(mocks.navigateTo).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('navigateNext() restores the previous active item when presentation navigation returns false', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
      activeChangeIds: ['tc1'],
    });
    mocks.navigateTo.mockResolvedValueOnce(false);
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');
    await expect(ui.trackChanges.navigateNext()).resolves.toEqual({ success: false });
    expect(mocks.navigateTo).toHaveBeenCalledTimes(1);
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    ui.destroy();
  });

  it('navigatePrevious() restores the previous active item when presentation navigation returns false', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
      activeChangeIds: ['tc2'],
    });
    mocks.navigateTo.mockResolvedValueOnce(false);
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');
    await expect(ui.trackChanges.navigatePrevious()).resolves.toEqual({ success: false });
    expect(mocks.navigateTo).toHaveBeenCalledTimes(1);
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    ui.destroy();
  });
});

describe('ui.trackChanges — scrollTo', () => {
  it('scrollTo(id) navigates to the right EntityAddress via the presentation editor', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.trackChanges.scrollTo('tc1');
    const target = mocks.navigateTo.mock.calls[0][0] as { kind: string; entityType: string; entityId: string };
    expect(target).toEqual({ kind: 'entity', entityType: 'trackedChange', entityId: 'tc1' });

    ui.destroy();
  });

  it('scrollTo(id) resolves to a failed receipt when presentation navigation rejects', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });
    mocks.navigateTo.mockRejectedValueOnce(new Error('boom'));
    const ui = createSuperDocUI({ superdoc });

    await expect(ui.trackChanges.scrollTo('tc1')).resolves.toEqual({ success: false });

    ui.destroy();
  });

  it('scrollTo(id) restores the previous active item when presentation navigation rejects', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
      activeChangeIds: ['tc1'],
    });
    mocks.navigateTo.mockRejectedValueOnce(new Error('boom'));
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');
    await expect(ui.trackChanges.scrollTo('tc2')).resolves.toEqual({ success: false });
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    ui.destroy();
  });

  it('scrollTo(id) restores the previous active item when presentation navigation returns false', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
      activeChangeIds: ['tc1'],
    });
    mocks.navigateTo.mockResolvedValueOnce(false);
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');
    await expect(ui.trackChanges.scrollTo('tc2')).resolves.toEqual({ success: false });
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    ui.destroy();
  });
});

describe('ui.trackChanges — regression: navigation persists past the selected change', () => {
  it('next() while the cursor is on the active change is not overwritten by the unchanged selection', async () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
      activeChangeIds: ['tc1'],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    expect(ui.trackChanges.next()).toBe('tc2');
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    superdoc.fireEditor('transaction');
    await Promise.resolve();
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    ui.destroy();
  });
});

describe('ui.trackChanges — regression: pending explicit navigation gates selection mirroring', () => {
  it('suppresses selection-driven activeId mirroring while navigation is pending without updating the baseline', async () => {
    let finishNavigation!: () => void;
    const navigationDone = new Promise<void>((resolve) => {
      finishNavigation = resolve;
    });
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
      activeChangeIds: ['tc1'],
    });
    mocks.navigateTo.mockImplementation(async () => {
      await navigationDone;
      return true;
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    const navigation = ui.trackChanges.navigateNext();
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    superdoc.setActiveSelection([], ['tc3']);
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    finishNavigation();
    await navigation;
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc3');

    ui.destroy();
  });

  it('older navigation completions do not clear the latest pending navigation', async () => {
    const resolvers: Array<() => void> = [];
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
    });
    mocks.navigateTo.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolvers.push(() => resolve(true));
        }),
    );
    const ui = createSuperDocUI({ superdoc });

    const first = ui.trackChanges.navigateNext();
    const second = ui.trackChanges.navigateNext();
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    superdoc.setActiveSelection([], ['tc3']);
    resolvers[0]!();
    await first;
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    resolvers[1]!();
    await second;
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc3');

    ui.destroy();
  });

  it('clears explicit navigation activeId when the user moves to a different empty selection', async () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.trackChanges.scrollTo('tc1');
    superdoc.setActiveSelection([], [], { segments: [{ blockId: 'p1', range: { start: 10, end: 10 } }] });
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    superdoc.setActiveSelection([], [], { segments: [{ blockId: 'p2', range: { start: 4, end: 4 } }] });
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBeNull();

    ui.destroy();
  });

  it('restores the saved empty-caret baseline when tracked-change navigation fails', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.trackChanges.scrollTo('tc1');
    superdoc.setActiveSelection([], [], { segments: [{ blockId: 'p1', range: { start: 10, end: 10 } }] });
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    mocks.navigateTo.mockResolvedValueOnce(false);
    await expect(ui.trackChanges.scrollTo('tc2')).resolves.toEqual({ success: false });
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    superdoc.setActiveSelection([], [], { segments: [{ blockId: 'p2', range: { start: 4, end: 4 } }] });
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().activeId).toBeNull();

    ui.destroy();
  });

  it('marks superseded scroll work as stale through the presentation navigation guard', async () => {
    const calls: Array<{
      options: { shouldContinue?: () => boolean };
      resolve: (value: boolean) => void;
    }> = [];
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }, { id: 'tc3' }],
    });
    mocks.navigateTo.mockImplementation(
      (_target, options) =>
        new Promise<boolean>((resolve) => {
          calls.push({ options: options as { shouldContinue?: () => boolean }, resolve });
        }),
    );
    const ui = createSuperDocUI({ superdoc });

    const first = ui.trackChanges.navigateNext();
    const second = ui.trackChanges.navigateNext();

    expect(calls).toHaveLength(2);
    expect(calls[0]!.options.shouldContinue?.()).toBe(false);
    expect(calls[1]!.options.shouldContinue?.()).toBe(true);

    calls[0]!.resolve(true);
    await expect(first).resolves.toEqual({ success: false });

    calls[1]!.resolve(true);
    await expect(second).resolves.toEqual({ success: true });

    ui.destroy();
  });

  it('setActive(id) cancels pending scroll navigation work', async () => {
    const calls: Array<{
      options: { shouldContinue?: () => boolean };
      resolve: (value: boolean) => void;
    }> = [];
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    mocks.navigateTo.mockImplementation(
      (_target, options) =>
        new Promise<boolean>((resolve) => {
          calls.push({ options: options as { shouldContinue?: () => boolean }, resolve });
        }),
    );
    const ui = createSuperDocUI({ superdoc });

    const scroll = ui.trackChanges.scrollTo('tc1');
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    expect(ui.trackChanges.setActive('tc2')).toBe(true);
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');
    expect(calls[0]!.options.shouldContinue?.()).toBe(false);

    calls[0]!.resolve(true);
    await expect(scroll).resolves.toEqual({ success: false });
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    ui.destroy();
  });

  it('next() cancels pending scroll navigation work before changing activeId', async () => {
    const calls: Array<{
      options: { shouldContinue?: () => boolean };
      resolve: (value: boolean) => void;
    }> = [];
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    mocks.navigateTo.mockImplementation(
      (_target, options) =>
        new Promise<boolean>((resolve) => {
          calls.push({ options: options as { shouldContinue?: () => boolean }, resolve });
        }),
    );
    const ui = createSuperDocUI({ superdoc });

    const scroll = ui.trackChanges.scrollTo('tc1');
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc1');

    expect(ui.trackChanges.next()).toBe('tc2');
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');
    expect(calls[0]!.options.shouldContinue?.()).toBe(false);

    calls[0]!.resolve(true);
    await expect(scroll).resolves.toEqual({ success: false });
    expect(ui.trackChanges.getSnapshot().activeId).toBe('tc2');

    ui.destroy();
  });
});

describe('ui.trackChanges — regression: tracked-changes-changed refreshes cache', () => {
  it('a tracked-changes-changed event surfaces fresh items in the next snapshot', async () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().items.map((i) => i.id)).toEqual(['tc1']);

    superdoc.setTrackedChanges([{ id: 'tc1' }, { id: 'tc2' }]);
    superdoc.fireEditor('tracked-changes-changed');
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().items.map((i) => i.id)).toEqual(['tc1', 'tc2']);

    ui.destroy();
  });

  it('editorCreate refreshes track changes after a late active editor attach', async () => {
    const { superdoc, editor } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });
    superdoc.activeEditor = null;
    const ui = createSuperDocUI({ superdoc });

    expect(ui.trackChanges.getSnapshot().items).toEqual([]);

    superdoc.activeEditor = editor as never;
    superdoc.fireSuperdoc('editorCreate', { editor });
    await Promise.resolve();

    expect(ui.trackChanges.getSnapshot().items.map((i) => i.id)).toEqual(['tc1']);

    ui.destroy();
  });
});

describe('ui.trackChanges — regression: decide carries non-body story', () => {
  it('accept(id) on a header change includes target.story so the adapter routes correctly', () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-header', story: 'header:rId1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.accept('tc-header');

    expect(mocks.decide).toHaveBeenCalledWith({
      decision: 'accept',
      target: { id: 'tc-header', story: 'header:rId1' },
    });

    ui.destroy();
  });

  it('reject(id) on a footer change includes target.story', () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-footer', story: 'footer:rId2' }],
    });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.reject('tc-footer');

    expect(mocks.decide).toHaveBeenCalledWith({
      decision: 'reject',
      target: { id: 'tc-footer', story: 'footer:rId2' },
    });

    ui.destroy();
  });

  it('accept(id) on a body change omits target.story (parity with body-default contract)', () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-body' }],
    });
    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.accept('tc-body');

    expect(mocks.decide).toHaveBeenCalledWith({
      decision: 'accept',
      target: { id: 'tc-body' },
    });

    ui.destroy();
  });
});

describe('ui.trackChanges — regression: scrollTo carries non-body story', () => {
  it('scrollTo on a header change passes target.story to navigateTo', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-header', story: 'header:rId1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.trackChanges.scrollTo('tc-header');

    expect(mocks.navigateTo).toHaveBeenCalledTimes(1);
    expect(mocks.navigateTo).toHaveBeenCalledWith(
      {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-header',
        story: 'header:rId1',
      },
      expect.objectContaining({ behavior: 'smooth', block: 'center' }),
    );
    ui.destroy();
  });

  it('scrollTo on a body change omits target.story (parity with body-default)', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-body' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.trackChanges.scrollTo('tc-body');

    expect(mocks.navigateTo).toHaveBeenCalledWith(
      {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-body',
      },
      expect.objectContaining({ behavior: 'smooth', block: 'center' }),
    );
    ui.destroy();
  });
});

describe('ui.trackChanges — regression: decisions route through the host editor', () => {
  it('accept(id) goes through superdoc.activeEditor (host) even when toolbar routing returns a child story editor', () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });

    const childDecide = vi.fn((_input: unknown) => ({ success: false as const }));
    const childEditor = {
      doc: { trackChanges: { decide: childDecide } },
    };
    const hostEditor = superdoc.activeEditor as unknown as {
      presentationEditor: { getActiveEditor: () => unknown };
    };
    hostEditor.presentationEditor.getActiveEditor = () => childEditor;

    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.accept('tc1');

    expect(mocks.decide).toHaveBeenCalledTimes(1);
    expect(childDecide).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('acceptAll() routes through the host editor too', () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    const childDecide = vi.fn((_input: unknown) => ({ success: false as const }));
    const hostEditor = superdoc.activeEditor as unknown as {
      presentationEditor: { getActiveEditor: () => unknown };
    };
    hostEditor.presentationEditor.getActiveEditor = () => ({
      doc: { trackChanges: { decide: childDecide } },
    });

    const ui = createSuperDocUI({ superdoc });

    ui.trackChanges.acceptAll();

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'accept', target: { scope: 'all' } });
    expect(childDecide).not.toHaveBeenCalled();

    ui.destroy();
  });
});

describe('ui.trackChanges — regression: subscribers are not re-fired on unrelated transactions', () => {
  it('a typing-only event does not re-fire ui.trackChanges subscribers', async () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.trackChanges.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    superdoc.fireEditor('transaction');
    await Promise.resolve();
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    expect(cb).toHaveBeenCalledTimes(1);

    off();
    ui.destroy();
  });
});
