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
    trackedChanges?: Array<{ id: string; type?: 'insert' | 'delete' | 'format'; excerpt?: string }>;
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
      id: c.id,
      handle: { ref: `comment:${c.commentId}`, refStability: 'stable' as const, targetKind: 'comment' as const },
      address: { kind: 'entity' as const, entityType: 'comment' as const, entityId: c.commentId },
      commentId: c.commentId,
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
      address: { kind: 'entity' as const, entityType: 'trackedChange' as const, entityId: tc.id },
      type: tc.type ?? ('insert' as const),
      excerpt: tc.excerpt,
    })),
    page: { limit: 50, offset: 0, returned: changesList.length },
  }));
  const decide = vi.fn((_input: unknown) => ({ success: true as const }));
  const scrollIntoView = vi.fn(async (_input: unknown) => ({ success: true as const }));
  const setDocumentMode = vi.fn();

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
      ranges: { scrollIntoView },
    },
  };

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

  return { superdoc, editor, mocks: { listComments, listChanges, decide, scrollIntoView, setDocumentMode } };
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

describe('ui.review — scrollTo + setRecording', () => {
  it('scrollTo(id) routes to ranges.scrollIntoView with the right entity type', async () => {
    const { superdoc, mocks } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1' }],
      trackedChanges: [{ id: 'tc1' }],
    });
    const ui = createSuperDocUI({ superdoc });

    await ui.review.scrollTo('c1');
    let arg = mocks.scrollIntoView.mock.calls[0][0] as { target: { entityType: string; entityId: string } };
    expect(arg.target).toEqual({ kind: 'entity', entityType: 'comment', entityId: 'c1' });

    await ui.review.scrollTo('tc1');
    arg = mocks.scrollIntoView.mock.calls[1][0] as { target: { entityType: string; entityId: string } };
    expect(arg.target).toEqual({ kind: 'entity', entityType: 'trackedChange', entityId: 'tc1' });

    ui.destroy();
  });

  it('setRecording(true) flips documentMode to suggesting (temporary path)', () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.review.setRecording(true);
    expect(mocks.setDocumentMode).toHaveBeenCalledWith('suggesting');

    ui.review.setRecording(false);
    expect(mocks.setDocumentMode).toHaveBeenCalledWith('editing');

    ui.destroy();
  });
});
