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
  const scrollIntoView = vi.fn(async (_input: unknown) => ({ success: true as const }));

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
          empty: initial.selectionTarget == null,
          text: '',
          target: initial.selectionTarget ?? null,
          activeCommentIds: initial.activeCommentIds ?? [],
          activeChangeIds: [],
        })),
      },
      comments: { create, patch, delete: del, list },
      ranges: { scrollIntoView },
    },
  };

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

  return { superdoc, editor, mocks: { create, patch, delete: del, list, scrollIntoView } };
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

  it('scrollTo forwards to ranges.scrollIntoView with an EntityAddress', async () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    await ui.comments.scrollTo('c-42');

    expect(mocks.scrollIntoView).toHaveBeenCalledTimes(1);
    const arg = mocks.scrollIntoView.mock.calls[0][0] as {
      target: { kind: string; entityType: string; entityId: string };
    };
    expect(arg.target).toEqual({ kind: 'entity', entityType: 'comment', entityId: 'c-42' });

    ui.destroy();
  });
});
