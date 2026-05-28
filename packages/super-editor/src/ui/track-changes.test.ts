import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

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
  const navigateTo = vi.fn(async (_target: unknown) => true);
  const setDocumentMode = vi.fn();

  const editor: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    doc: unknown;
    presentationEditor: {
      navigateTo: typeof navigateTo;
      getActiveEditor: () => unknown;
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
  editor.presentationEditor = { navigateTo, getActiveEditor: () => editor };

  const superdoc: SuperDocLike & {
    fireEditor(event: string, ...args: unknown[]): void;
    setComments(next: typeof commentsList): void;
    setTrackedChanges(next: typeof changesList): void;
    setActiveSelection(commentIds?: string[], changeIds?: string[]): void;
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
    setComments(next) {
      commentsList = next;
    },
    setTrackedChanges(next) {
      changesList = next;
    },
    setActiveSelection(commentIds = [], changeIds = []) {
      (editor.doc.selection.current as unknown as () => unknown) = vi.fn(() => ({
        empty: commentIds.length === 0 && changeIds.length === 0,
        text: '',
        target: null,
        activeCommentIds: commentIds,
        activeChangeIds: changeIds,
      }));
    },
  };

  return { superdoc, editor, mocks: { listComments, listChanges, decide, navigateTo, setDocumentMode } };
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
      { behavior: 'smooth', block: 'center' },
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
      { behavior: 'smooth', block: 'center' },
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
