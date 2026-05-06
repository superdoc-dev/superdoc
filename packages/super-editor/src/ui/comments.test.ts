import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Stub builder for `ui.comments` tests. Models the parts of the
 * editor's `doc.comments` / `doc.selection` / `doc.ranges` surface
 * the controller's comments domain reads or routes through.
 */
function makeStubs(
  initial: {
    comments?: Array<{ id: string; commentId: string; text?: string; status?: 'open' | 'resolved' }>;
    activeCommentIds?: string[];
    selectionTarget?: unknown;
  } = {},
) {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  let commentsList = initial.comments ?? [];
  const create = vi.fn((input: { target: unknown; text: string }) => ({
    success: true as const,
    inserted: [{ kind: 'entity', entityType: 'comment', entityId: `c-${commentsList.length + 1}` }],
    target: input.target,
    text: input.text,
  }));
  const patch = vi.fn((_input: { commentId: string; status?: string; text?: string }) => ({
    success: true as const,
  }));
  const del = vi.fn((_input: { commentId: string }) => ({ success: true as const }));
  const list = vi.fn(() => ({
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
  const navigateTo = vi.fn(async (_target: unknown) => true);

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
          empty: initial.selectionTarget == null,
          text: '',
          target: initial.selectionTarget ?? null,
          activeCommentIds: initial.activeCommentIds ?? [],
          activeChangeIds: [],
        })),
      },
      comments: { create, patch, delete: del, list },
    },
    // Self-reference assigned below so toolbar source resolution sees
    // the same routed editor as the rest of the stub.
    presentationEditor: undefined as never,
  };
  editor.presentationEditor = { navigateTo, getActiveEditor: () => editor };

  const superdoc: SuperDocLike & {
    fireEditor(event: string, ...args: unknown[]): void;
    setComments(next: typeof commentsList): void;
  } = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
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
  };

  return { superdoc, editor, mocks: { create, patch, delete: del, list, navigateTo } };
}

const flushMicrotasks = () => Promise.resolve();

describe('ui.comments — snapshot', () => {
  it('exposes the initial comments list synchronously', () => {
    const { superdoc, mocks } = makeStubs({
      comments: [
        { id: 'c1', commentId: 'c1', text: 'first' },
        { id: 'c2', commentId: 'c2', text: 'second' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.comments.getSnapshot();
    expect(snap.total).toBe(2);
    expect(snap.items.map((i) => i.commentId)).toEqual(['c1', 'c2']);
    expect(snap.activeIds).toEqual([]);

    expect(mocks.list).toHaveBeenCalled();
    ui.destroy();
  });

  it('subscribe fires once with the initial snapshot', () => {
    const { superdoc } = makeStubs({ comments: [{ id: 'c1', commentId: 'c1' }] });
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    const off = ui.comments.subscribe(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0] as { snapshot: { total: number } };
    expect(arg.snapshot.total).toBe(1);

    off();
    ui.destroy();
  });

  it('refreshes the cache on commentsUpdate and re-fires subscribers', async () => {
    const { superdoc } = makeStubs({ comments: [{ id: 'c1', commentId: 'c1' }] });
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    ui.comments.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    superdoc.setComments([
      { id: 'c1', commentId: 'c1' },
      { id: 'c2', commentId: 'c2', text: 'new' },
    ]);
    superdoc.fireEditor('commentsUpdate');
    await flushMicrotasks();

    expect(cb).toHaveBeenCalledTimes(2);
    const latest = cb.mock.calls[1][0] as { snapshot: { total: number; items: Array<{ commentId: string }> } };
    expect(latest.snapshot.total).toBe(2);
    expect(latest.snapshot.items.map((i) => i.commentId)).toEqual(['c1', 'c2']);

    ui.destroy();
  });

  it('mirrors selection.current().activeCommentIds into snapshot.activeIds', () => {
    const { superdoc } = makeStubs({ comments: [{ id: 'c1', commentId: 'c1' }], activeCommentIds: ['c1'] });
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.comments.getSnapshot();
    expect(snap.activeIds).toEqual(['c1']);

    ui.destroy();
  });

  it('clears the cache when comments.list() throws on refresh (no cross-document stale leakage)', async () => {
    const { superdoc, mocks } = makeStubs({
      comments: [
        { id: 'c1', commentId: 'c1', text: 'first' },
        { id: 'c2', commentId: 'c2', text: 'second' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    // Start with a populated snapshot.
    expect(ui.comments.getSnapshot().total).toBe(2);

    // Simulate a document/editor swap where the new editor's list()
    // throws transiently. The cache must reset to empty rather than
    // continue serving the old editor's items.
    mocks.list.mockImplementationOnce(() => {
      throw new Error('editor mid-swap');
    });
    superdoc.fireEditor('commentsUpdate');
    await flushMicrotasks();

    const snap = ui.comments.getSnapshot();
    expect(snap.total).toBe(0);
    expect(snap.items).toEqual([]);

    ui.destroy();
  });

  it('returns the same array reference for empty activeIds across snapshots (shallowEqual stability)', () => {
    // Pre-SD-2792 selection shape: no activeCommentIds. Without a
    // shared sentinel, `?? []` would allocate a fresh array each
    // computeState() call and trigger shallowEqual mismatch on the
    // comments snapshot — every selection event would re-fire
    // ui.comments.subscribe.
    const { superdoc, editor } = makeStubs({ comments: [{ id: 'c1', commentId: 'c1' }] });
    (editor.doc.selection.current as unknown as () => { empty: boolean; target: null }) = vi.fn(() => ({
      empty: true,
      target: null,
    }));
    const ui = createSuperDocUI({ superdoc });

    const a = ui.comments.getSnapshot().activeIds;
    const b = ui.comments.getSnapshot().activeIds;
    expect(a).toBe(b); // same reference

    ui.destroy();
  });

  it('does not re-fire ui.comments.subscribe when the resolver returns fresh-but-equal activeCommentIds arrays', async () => {
    // Post-SD-2792 the resolver returns `Array.from(new Set(...))` on
    // every call — fresh references even when the contents are
    // identical. Without slice-level memoization piping through the
    // comments slice, every keystroke / selectionUpdate would trip
    // shallowEqual and re-render every comment-aware sidebar.
    const { superdoc, editor } = makeStubs({ comments: [{ id: 'c1', commentId: 'c1' }] });
    (editor.doc.selection.current as unknown as () => unknown) = vi.fn(() => ({
      empty: true,
      target: null,
      activeMarks: [],
      activeCommentIds: ['c1'], // fresh array literal each call
      activeChangeIds: [],
    }));
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    ui.comments.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1); // initial

    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();
    superdoc.fireEditor('selectionUpdate');
    await Promise.resolve();

    expect(cb).toHaveBeenCalledTimes(1);
    ui.destroy();
  });

  it('refreshes the snapshot synchronously after own mutations (createFromSelection / resolve / delete)', () => {
    const target = { kind: 'text' as const, segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }] };
    const { superdoc, mocks } = makeStubs({
      comments: [{ id: 'c1', commentId: 'c1', text: 'first' }],
      selectionTarget: target,
    });
    const ui = createSuperDocUI({ superdoc });

    const cb = vi.fn();
    ui.comments.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    // Simulate the wrapper updating the comments store: as soon as
    // ui.comments.createFromSelection completes, list() must return
    // the new item. The own-mutation refresh re-reads list() so
    // subscribers see the post-mutation state without needing a
    // commentsUpdate event.
    superdoc.setComments([
      { id: 'c1', commentId: 'c1', text: 'first' },
      { id: 'c2', commentId: 'c2', text: 'second' },
    ]);
    ui.comments.createFromSelection({ text: 'second' });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    // getSnapshot reflects the new state synchronously after the
    // mutation (without needing a commentsUpdate event).
    expect(ui.comments.getSnapshot().total).toBe(2);

    // Same pattern for resolve.
    superdoc.setComments([
      { id: 'c1', commentId: 'c1', status: 'resolved' },
      { id: 'c2', commentId: 'c2', text: 'second' },
    ]);
    ui.comments.resolve('c1');
    expect(ui.comments.getSnapshot().items[0].status).toBe('resolved');

    // And for delete.
    superdoc.setComments([{ id: 'c2', commentId: 'c2', text: 'second' }]);
    ui.comments.delete('c1');
    expect(ui.comments.getSnapshot().total).toBe(1);

    ui.destroy();
  });

  it('falls back to [] when selection.current() predates SD-2792 (no activeCommentIds field)', () => {
    const { superdoc, editor } = makeStubs();
    // Override selection.current to return an SD-2668-shaped result
    // (no activeCommentIds). The controller must not crash.
    (editor.doc.selection.current as unknown as () => { empty: boolean; target: null }) = vi.fn(() => ({
      empty: true,
      target: null,
    }));
    const ui = createSuperDocUI({ superdoc });

    expect(ui.comments.getSnapshot().activeIds).toEqual([]);

    ui.destroy();
  });
});

describe('ui.comments — actions route through editor.doc.*', () => {
  it('createFromSelection forwards to comments.create with the selection target', () => {
    const target = { kind: 'text' as const, segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }] };
    const { superdoc, mocks } = makeStubs({ selectionTarget: target });
    const ui = createSuperDocUI({ superdoc });

    const receipt = ui.comments.createFromSelection({ text: 'Looks good' });

    expect(receipt.success).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ target, text: 'Looks good' });

    ui.destroy();
  });

  it('createFromSelection returns a NO_OP receipt when no selection target exists', () => {
    const { superdoc, mocks } = makeStubs(); // no selectionTarget
    const ui = createSuperDocUI({ superdoc });

    const receipt = ui.comments.createFromSelection({ text: 'orphan' });

    expect(receipt.success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('createFromCapture forwards the captured target even when live selection is gone', () => {
    const captured = {
      kind: 'text' as const,
      segments: [{ blockId: 'p1', range: { start: 7, end: 12 } }],
    };
    // Stubs intentionally have no live selectionTarget — mimics the
    // composer flow where focus has moved off the editor.
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const capture = {
      empty: false,
      target: captured,
      selectionTarget: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
      quotedText: 'hello',
    } as unknown as Parameters<typeof ui.comments.createFromCapture>[0];

    const receipt = ui.comments.createFromCapture(capture, { text: 'pinned' });

    expect(receipt.success).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ target: captured, text: 'pinned' });

    ui.destroy();
  });

  it('createFromCapture returns a NO_OP receipt when the capture has no target', () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const receipt = ui.comments.createFromCapture(
      { target: null } as unknown as Parameters<typeof ui.comments.createFromCapture>[0],
      { text: 'orphan' },
    );

    expect(receipt.success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('reply forwards to comments.create with parentCommentId set and no target', () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const receipt = ui.comments.reply('c-parent', { text: 'thanks!' });

    expect(receipt.success).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ parentCommentId: 'c-parent', text: 'thanks!' });
    // Reply must NOT carry a `target` — the doc-api adapter resolves
    // the parent's anchor itself. Sending one would either be ignored
    // or, worse, override the inherited address.
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty('target');

    ui.destroy();
  });

  it('reply returns a NO_OP receipt when text is empty or whitespace-only', () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const empty = ui.comments.reply('c-parent', { text: '' });
    expect(empty.success).toBe(false);

    const whitespace = ui.comments.reply('c-parent', { text: '   \n\t' });
    expect(whitespace.success).toBe(false);

    expect(mocks.create).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('reply refreshes the comments snapshot synchronously after the post', async () => {
    const { superdoc } = makeStubs({
      comments: [{ id: 'c-parent', commentId: 'c-parent', text: 'parent' }],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.comments.getSnapshot().items).toHaveLength(1);

    // Stub mutates list as if a reply was just persisted.
    superdoc.setComments([
      { id: 'c-parent', commentId: 'c-parent', text: 'parent' },
      { id: 'c-reply', commentId: 'c-reply', text: 'thanks', parentCommentId: 'c-parent' },
    ]);
    ui.comments.reply('c-parent', { text: 'thanks' });

    // refreshAndNotify should already have re-read the cache.
    expect(ui.comments.getSnapshot().items.map((i) => i.id)).toEqual(['c-parent', 'c-reply']);

    ui.destroy();
  });

  it('reply routes through the routed editor (header / footer focus stays scoped)', () => {
    // Same posture as createFromSelection / createFromCapture: replies
    // go through `resolveRoutedEditor` so a header-focused composer
    // posts in the header story, not the body. Mirrors the doc-api
    // contract: `comments.create` is story-scoped on the routed editor.
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.comments.reply('c-parent', { text: 'in scope' });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      parentCommentId: 'c-parent',
      text: 'in scope',
    });

    ui.destroy();
  });

  it('resolve forwards to comments.patch({ commentId, status: "resolved" })', () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.comments.resolve('c-42');

    expect(mocks.patch).toHaveBeenCalledWith({ commentId: 'c-42', status: 'resolved' });
    ui.destroy();
  });

  it('reopen forwards to comments.patch({ commentId, status: "active" })', () => {
    // Architecturally correct even though doc-api validation rejects
    // 'active' until SD-2789 lands. The route is what we're asserting.
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.comments.reopen('c-42');

    expect(mocks.patch).toHaveBeenCalledWith({ commentId: 'c-42', status: 'active' });
    ui.destroy();
  });

  it('delete forwards to comments.delete({ commentId })', () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    ui.comments.delete('c-42');

    expect(mocks.delete).toHaveBeenCalledWith({ commentId: 'c-42' });
    ui.destroy();
  });

  it('scrollTo navigates to the comment EntityAddress via the presentation editor', async () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    await ui.comments.scrollTo('c-42');

    expect(mocks.navigateTo).toHaveBeenCalledTimes(1);
    const target = mocks.navigateTo.mock.calls[0][0] as { kind: string; entityType: string; entityId: string };
    expect(target).toEqual({ kind: 'entity', entityType: 'comment', entityId: 'c-42' });

    ui.destroy();
  });
});
