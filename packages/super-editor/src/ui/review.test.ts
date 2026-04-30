import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Stub builder for `ui.review` tests. Models the merged feed shape
 * — `editor.doc.comments.list()` + `editor.doc.trackChanges.list()`
 * + `editor.doc.trackChanges.decide()` + selection routing.
 */
function makeStubs(
  initial: {
    comments?: Array<{ id: string; commentId: string; text?: string; status?: 'open' | 'resolved' }>;
    trackedChanges?: Array<{
      id: string;
      type?: 'insert' | 'delete' | 'format';
      excerpt?: string;
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
    // Mirror the production discovery-item shape: canonical id is on
    // `id`, set from the underlying commentId by the adapter. There is
    // no `commentId` field on `DiscoveryItem<CommentDomain>` itself.
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
    // Self-reference assigned below so toolbar source resolution sees
    // the same routed editor as the rest of the stub.
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

describe('ui.review — snapshot', () => {
  it('merges comments and tracked changes into one feed with dense documentOrder', () => {
    const { superdoc } = makeStubs({
      comments: [
        { id: 'c1', commentId: 'c1' },
        { id: 'c2', commentId: 'c2' },
      ],
      trackedChanges: [
        { id: 'tc1', type: 'insert' },
        { id: 'tc2', type: 'delete' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.review.getSnapshot();
    expect(snap.items).toHaveLength(4);
    expect(snap.items.map((i) => ({ kind: i.kind, id: i.id, order: i.documentOrder }))).toEqual([
      { kind: 'comment', id: 'c1', order: 0 },
      { kind: 'comment', id: 'c2', order: 1 },
      { kind: 'change', id: 'tc1', order: 2 },
      { kind: 'change', id: 'tc2', order: 3 },
    ]);

    ui.destroy();
  });

  it('openCount counts every tracked change + every non-resolved comment', () => {
    const { superdoc } = makeStubs({
      comments: [
        { id: 'c1', commentId: 'c1' },
        { id: 'c2', commentId: 'c2', status: 'resolved' },
        { id: 'c3', commentId: 'c3' },
      ],
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.review.getSnapshot().openCount).toBe(4); // 2 open comments + 2 changes

    ui.destroy();
  });

  it('activeId mirrors selection.activeCommentIds[0] when on a comment', () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
      activeCommentIds: ['c1'],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.review.getSnapshot().activeId).toBe('c1');

    ui.destroy();
  });

  it('activeId falls back to selection.activeChangeIds[0] when no active comment', () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
      activeChangeIds: ['tc1'],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.review.getSnapshot().activeId).toBe('tc1');

    ui.destroy();
  });

  it('subscribe fires once with the initial snapshot', () => {
    const { superdoc } = makeStubs({ comments: [{ id: 'c1', commentId: 'c1' }] });
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.review.subscribe(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0] as { snapshot: { items: unknown[] } };
    expect(arg.snapshot.items).toHaveLength(1);

    off();
    ui.destroy();
  });
});

describe('ui.review — decide actions route through editor.doc.trackChanges.*', () => {
  it('accept(id) routes to decide({ decision: "accept", target: { id } })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.review.accept('tc1');

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'accept', target: { id: 'tc1' } });
    ui.destroy();
  });

  it('reject(id) routes to decide({ decision: "reject", target: { id } })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.review.reject('tc1');

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'reject', target: { id: 'tc1' } });
    ui.destroy();
  });

  it('acceptAll() routes to decide({ scope: "all" })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.review.acceptAll();

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'accept', target: { scope: 'all' } });
    ui.destroy();
  });

  it('rejectAll() routes to decide({ scope: "all" })', () => {
    const { superdoc, mocks } = makeStubs({ trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }] });
    const ui = createSuperDocUI({ superdoc });

    ui.review.rejectAll();

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'reject', target: { scope: 'all' } });
    ui.destroy();
  });
});

describe('ui.review — next/previous navigation', () => {
  it('next() advances activeId in document order', () => {
    const { superdoc } = makeStubs({
      comments: [
        { id: 'c1', commentId: 'c1' },
        { id: 'c2', commentId: 'c2' },
      ],
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.review.next()).toBe('c1');
    expect(ui.review.getSnapshot().activeId).toBe('c1');

    expect(ui.review.next()).toBe('c2');
    expect(ui.review.next()).toBe('tc1');
  });

  it('next() wraps from the last item to the first', () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    ui.review.next(); // c1
    ui.review.next(); // tc1
    expect(ui.review.next()).toBe('c1'); // wrap
  });

  it('previous() walks backward and wraps from first to last', () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }, { id: 'tc2' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.review.previous()).toBe('tc2'); // null → wrap to last
    expect(ui.review.previous()).toBe('tc1');
    expect(ui.review.previous()).toBe('c1');
    expect(ui.review.previous()).toBe('tc2'); // wrap
  });

  it('next() / previous() return null when the feed is empty', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.review.next()).toBe(null);
    expect(ui.review.previous()).toBe(null);
    expect(ui.review.getSnapshot().activeId).toBe(null);

    ui.destroy();
  });
});

describe('ui.review — scrollTo', () => {
  it('scrollTo(id) navigates to the right EntityAddress via the presentation editor', async () => {
    const { superdoc, mocks } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.review.scrollTo('c1');
    let target = mocks.navigateTo.mock.calls[0][0] as { kind: string; entityType: string; entityId: string };
    expect(target).toEqual({ kind: 'entity', entityType: 'comment', entityId: 'c1' });

    await ui.review.scrollTo('tc1');
    target = mocks.navigateTo.mock.calls[1][0] as { kind: string; entityType: string; entityId: string };
    expect(target).toEqual({ kind: 'entity', entityType: 'trackedChange', entityId: 'tc1' });

    ui.destroy();
  });
});

describe('ui.review — regression: comment row id sourced from discovery.id', () => {
  it('comment ReviewItem.id mirrors the discovery item id (not undefined commentId)', () => {
    const { superdoc } = makeStubs({
      comments: [
        { id: 'c1', commentId: 'c1' },
        { id: 'c2', commentId: 'c2' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    const ids = ui.review.getSnapshot().items.map((i) => i.id);
    // Without the fix every comment row would expose `id: undefined`
    // because `DiscoveryItem<CommentDomain>` has no `commentId` field.
    expect(ids).toEqual(['c1', 'c2']);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);

    // And navigation must work on those ids end-to-end.
    expect(ui.review.next()).toBe('c1');
    expect(ui.review.next()).toBe('c2');

    ui.destroy();
  });
});

describe('ui.review — regression: navigation persists past the selected item', () => {
  it('next() while the cursor is on the active item is not overwritten by the unchanged selection', async () => {
    const { superdoc } = makeStubs({
      comments: [
        { id: 'c1', commentId: 'c1' },
        { id: 'c2', commentId: 'c2' },
      ],
      trackedChanges: [{ id: 'tc1' }],
      activeCommentIds: ['c1'],
    });
    const ui = createSuperDocUI({ superdoc });

    // Selection lands on c1 → activeId mirrors selection
    expect(ui.review.getSnapshot().activeId).toBe('c1');

    // User clicks "Next" in the sidebar — selection has not moved (still on c1)
    expect(ui.review.next()).toBe('c2');
    expect(ui.review.getSnapshot().activeId).toBe('c2');

    // A subsequent recompute (e.g. typing emits transaction → selectionUpdate)
    // must NOT snap activeReviewId back to the selection-driven id, because
    // the selection has not moved since the last computeState.
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();
    expect(ui.review.getSnapshot().activeId).toBe('c2');

    superdoc.fireEditor('transaction');
    await Promise.resolve();
    expect(ui.review.getSnapshot().activeId).toBe('c2');

    ui.destroy();
  });
});

describe('ui.review — regression: tracked-changes-changed refreshes cache', () => {
  it('a tracked-changes-changed event surfaces fresh items in the next snapshot', async () => {
    const { superdoc } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.review.getSnapshot().items.map((i) => i.id)).toEqual(['tc1']);

    superdoc.setTrackedChanges([{ id: 'tc1' }, { id: 'tc2' }]);
    // The tracked-change index broadcasts `tracked-changes-changed`
    // (not `trackedChangesUpdate`) on every transaction that adds /
    // removes / invalidates changes. The controller listens to that
    // event so collaborator-driven mutations refresh the cache too.
    superdoc.fireEditor('tracked-changes-changed');
    await Promise.resolve();

    expect(ui.review.getSnapshot().items.map((i) => i.id)).toEqual(['tc1', 'tc2']);

    ui.destroy();
  });
});

describe('ui.review — regression: decide carries non-body story', () => {
  it('accept(id) on a header change includes target.story so the adapter routes correctly', () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-header', story: 'header:rId1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    ui.review.accept('tc-header');

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

    ui.review.reject('tc-footer');

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

    ui.review.accept('tc-body');

    expect(mocks.decide).toHaveBeenCalledWith({
      decision: 'accept',
      target: { id: 'tc-body' },
    });

    ui.destroy();
  });
});

describe('ui.review — regression: scrollTo carries non-body story', () => {
  it('scrollTo on a header change passes target.story to navigateTo', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-header', story: 'header:rId1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.review.scrollTo('tc-header');

    expect(mocks.navigateTo).toHaveBeenCalledTimes(1);
    expect(mocks.navigateTo).toHaveBeenCalledWith({
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: 'tc-header',
      story: 'header:rId1',
    });
    ui.destroy();
  });

  it('scrollTo on a body change omits target.story (parity with body-default)', async () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc-body' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.review.scrollTo('tc-body');

    expect(mocks.navigateTo).toHaveBeenCalledWith({
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: 'tc-body',
    });
    ui.destroy();
  });
});

describe('ui.review — regression: decisions route through the host editor', () => {
  it('accept(id) goes through superdoc.activeEditor (host) even when toolbar routing returns a child story editor', () => {
    const { superdoc, mocks } = makeStubs({
      trackedChanges: [{ id: 'tc1' }],
    });

    // Plant a child story editor that the toolbar source resolver
    // would return (simulating "focus is in a header"). Its decide
    // mock must NEVER be called — review decisions are document-wide
    // and must route through the host editor.
    const childDecide = vi.fn((_input: unknown) => ({ success: false as const }));
    const childEditor = {
      doc: { trackChanges: { decide: childDecide } },
    };
    const hostEditor = superdoc.activeEditor as unknown as {
      presentationEditor: { getActiveEditor: () => unknown };
    };
    hostEditor.presentationEditor.getActiveEditor = () => childEditor;

    const ui = createSuperDocUI({ superdoc });

    ui.review.accept('tc1');

    expect(mocks.decide).toHaveBeenCalledTimes(1); // host editor's decide
    expect(childDecide).not.toHaveBeenCalled(); // child editor's decide untouched

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

    ui.review.acceptAll();

    expect(mocks.decide).toHaveBeenCalledWith({ decision: 'accept', target: { scope: 'all' } });
    expect(childDecide).not.toHaveBeenCalled();

    ui.destroy();
  });
});

describe('ui.review — regression: subscribers are not re-fired on unrelated transactions', () => {
  it('a typing-only event (transaction without comments/trackedChanges change) does not re-fire ui.review subscribers', async () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.review.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1); // initial snapshot

    superdoc.fireEditor('transaction');
    await Promise.resolve();
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    // Memoization keeps the slice identity-stable when the source caches and
    // activeReviewId have not changed, so shallowEqual short-circuits.
    expect(cb).toHaveBeenCalledTimes(1);

    off();
    ui.destroy();
  });
});
