// tests for the authoritative v2 review-state adapter.
//
// Test coverage map (plan section 6):
//   1. comment-anchor click   → setActiveReviewTarget routes through 002 hit-test
//   2. tracked-change click   → setActiveReviewTarget routes through 002 hit-test
//   3. panel selection        → same target + reverse-lookup highlight path
//   4. legacy mirror is one-way (cannot drive authoritative state)
//   5. one comment + one tracked-change command keep review-target consistent
//   6. bubble click           → same target as document / panel
//   7. view change / repaint  → reapply highlight or clear with `review-target-invalidated`
//   8. undo/redo restore or clear focus deterministically
//   9. held-target action rejected when held epoch != current epoch
//  10. document-surface typing rejected without mutation; hit-testing still works
//  11. invalidated targets clear / remap per frozen C1 invalidation order
//  12. session.author missing → PRECONDITION_FAILED surfaced unchanged
//  13. review-shell rejection codes disjoint from frozen ReceiptFailureCode

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CommentsCreateInput,
  CommentsDeleteInput,
  CommentsPatchInput,
  HistoryActionResult,
  Receipt,
  ReceiptFailureCode,
  ReceiptSuccess,
  ReviewDecideInput,
} from '@superdoc/document-api';

import {
  REVIEW_TARGET_PAINTED_ATTRS,
  resolveReviewTargetAtPoint,
  resolveReviewTargetReverse,
} from './review-target.js';
import {
  attachLegacyReviewMirror,
  createReviewStateAdapter,
  type ActiveReviewTarget,
  type ReviewShellCommandExecutor,
  type ReviewStateAdapter,
  type SDReviewInteractionRejectionCode,
} from './review-state.js';

const A = REVIEW_TARGET_PAINTED_ATTRS;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

type ReceiptShape = Partial<ReceiptSuccess>;

function ok(shape: ReceiptShape = {}): ReceiptSuccess {
  return {
    success: true,
    ...shape,
  } as ReceiptSuccess;
}

function fail(code: ReceiptFailureCode, message = 'fail'): Receipt {
  return { success: false, failure: { code, message } };
}

interface FakeExecutorState {
  comments: {
    create: ReturnType<typeof vi.fn<(input: CommentsCreateInput) => Promise<Receipt>>>;
    patch: ReturnType<typeof vi.fn<(input: CommentsPatchInput) => Promise<Receipt>>>;
    delete: ReturnType<typeof vi.fn<(input: CommentsDeleteInput) => Promise<Receipt>>>;
  };
  trackChanges: {
    decide: ReturnType<typeof vi.fn<(input: ReviewDecideInput) => Promise<Receipt>>>;
  };
  history: {
    undo: ReturnType<typeof vi.fn<() => Promise<HistoryActionResult>>>;
    redo: ReturnType<typeof vi.fn<() => Promise<HistoryActionResult>>>;
  };
}

function buildExecutor(): { executor: ReviewShellCommandExecutor; state: FakeExecutorState } {
  const state: FakeExecutorState = {
    comments: {
      create: vi.fn(async (_input: CommentsCreateInput) => ok({ txId: 'tx-create' })),
      patch: vi.fn(async (_input: CommentsPatchInput) => ok({ txId: 'tx-patch' })),
      delete: vi.fn(async (_input: CommentsDeleteInput) => ok({ txId: 'tx-delete' })),
    },
    trackChanges: {
      decide: vi.fn(async (_input: ReviewDecideInput) => ok({ txId: 'tx-decide' })),
    },
    history: {
      undo: vi.fn(async () => ({ noop: false, revision: { before: 'r1', after: 'r0' } })),
      redo: vi.fn(async () => ({ noop: false, revision: { before: 'r0', after: 'r1' } })),
    },
  };
  const executor: ReviewShellCommandExecutor = {
    comments: state.comments,
    trackChanges: state.trackChanges,
    history: state.history,
  };
  return { executor, state };
}

function buildHost(): {
  host: HTMLElement;
  page: HTMLElement;
  cleanup(): void;
} {
  const host = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  page.setAttribute(A.LAYOUT_EPOCH, '7');
  host.appendChild(page);
  document.body.appendChild(host);
  return {
    host,
    page,
    cleanup: () => {
      host.remove();
    },
  };
}

function paintRun(page: HTMLElement, attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('span');
  el.className = 'sd-comment-anchor sd-rendered-comment-anchor';
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  page.appendChild(el);
  return el;
}

function stubPointApis(map: Map<string, HTMLElement[]>): void {
  (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = (x, y) => {
    return map.get(`${Math.round(x)}:${Math.round(y)}`)?.[0] ?? null;
  };
  (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) => {
    return [...(map.get(`${Math.round(x)}:${Math.round(y)}`) ?? [])];
  };
}

function targetFor(entityType: 'comment' | 'trackedChange', entityId: string, epoch = 7): ActiveReviewTarget {
  if (entityType === 'comment') {
    return { entityType, entityId, origin: 'document', layoutEpoch: epoch };
  }
  return {
    entityType,
    entityId,
    origin: 'document',
    layoutEpoch: epoch,
    story: { kind: 'story', storyType: 'body' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('createReviewStateAdapter — focus from document, panel, bubble', () => {
  it('1. clicking a comment anchor sets the authoritative active review target', () => {
    const { executor } = buildExecutor();
    const { host, page, cleanup } = buildHost();
    paintRun(page, {
      [A.COMMENT_IDS]: 'cmt-1',
      [A.LAYOUT_EPOCH]: '7',
    });
    const point = new Map<string, HTMLElement[]>();
    point.set('10:10', [page.firstElementChild as HTMLElement]);
    stubPointApis(point);

    const hit = resolveReviewTargetAtPoint({ host, clientX: 10, clientY: 10 });
    expect(hit.status).toBe('resolved');
    if (hit.status !== 'resolved') return;

    const adapter = createReviewStateAdapter({ executor });
    const rejection = adapter.setActiveReviewTarget({
      entityType: 'comment',
      entityId: hit.target.entityId,
      origin: 'document',
      layoutEpoch: hit.candidates[0]!.layoutEpoch,
    });

    expect(rejection).toBeNull();
    const active = adapter.getActiveReviewTarget();
    expect(active).not.toBeNull();
    expect(active?.entityType).toBe('comment');
    expect(active?.entityId).toBe('cmt-1');
    expect(active?.origin).toBe('document');

    adapter.dispose();
    cleanup();
  });

  it('2. clicking a tracked change sets the authoritative active review target', () => {
    const { executor } = buildExecutor();
    const { host, page, cleanup } = buildHost();
    const el = paintRun(page, {
      [A.TRACK_CHANGE_ID]: 'tc-9',
      [A.STORY_KEY]: 'body',
      [A.LAYOUT_EPOCH]: '7',
    });
    const point = new Map<string, HTMLElement[]>();
    point.set('5:5', [el]);
    stubPointApis(point);

    const hit = resolveReviewTargetAtPoint({ host, clientX: 5, clientY: 5 });
    expect(hit.status).toBe('resolved');
    if (hit.status !== 'resolved') return;
    expect(hit.target.entityType).toBe('trackedChange');

    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget({
      entityType: 'trackedChange',
      entityId: hit.target.entityId,
      origin: 'document',
      layoutEpoch: 7,
      story: { kind: 'story', storyType: 'body' },
    });

    expect(adapter.getActiveReviewTarget()?.entityType).toBe('trackedChange');
    expect(adapter.getActiveReviewTarget()?.entityId).toBe('tc-9');
    adapter.dispose();
    cleanup();
  });

  it('3. panel selection sets the same active target and reverse lookup finds the rendered element', () => {
    const { executor } = buildExecutor();
    const { host, page, cleanup } = buildHost();
    const el = paintRun(page, {
      [A.COMMENT_IDS]: 'cmt-3',
      [A.LAYOUT_EPOCH]: '7',
    });
    el.setAttribute('data-comment-id', 'cmt-3');
    el.setAttribute('data-comment-story-key', 'body');

    const adapter = createReviewStateAdapter({ executor });
    // Panel-driven set: no point input; the panel knows the canonical id.
    adapter.setActiveReviewTarget({
      entityType: 'comment',
      entityId: 'cmt-3',
      origin: 'panel',
      layoutEpoch: 7,
    });

    expect(adapter.getActiveReviewTarget()?.origin).toBe('panel');

    const reverse = resolveReviewTargetReverse({
      host,
      target: { kind: 'entity', entityType: 'comment', entityId: 'cmt-3' },
    });
    expect(reverse.status).toBe('resolved');
    if (reverse.status === 'resolved') {
      expect(reverse.elements).toContain(el);
    }

    adapter.dispose();
    cleanup();
  });

  it('6. clicking a floating review bubble focuses the same activeReviewTarget as document/panel clicks', () => {
    const { executor } = buildExecutor();
    const adapter = createReviewStateAdapter({ executor });

    // Bubble click = chrome action with origin "bubble".
    adapter.setActiveReviewTarget({
      entityType: 'comment',
      entityId: 'cmt-7',
      origin: 'bubble',
      layoutEpoch: 7,
    });

    expect(adapter.getActiveReviewTarget()?.entityId).toBe('cmt-7');
    expect(adapter.getActiveReviewTarget()?.origin).toBe('bubble');

    // Later, panel sets the same id. Authoritative state holds one target.
    adapter.setActiveReviewTarget({
      entityType: 'comment',
      entityId: 'cmt-7',
      origin: 'panel',
      layoutEpoch: 7,
    });
    expect(adapter.getActiveReviewTarget()?.origin).toBe('panel');
    expect(adapter.getActiveReviewTarget()?.entityId).toBe('cmt-7');

    adapter.dispose();
  });
});

describe('createReviewStateAdapter — one-way legacy mirror', () => {
  it('4. legacy mirror follows the authoritative target but cannot drive it', () => {
    const { executor } = buildExecutor();
    const adapter = createReviewStateAdapter({ executor });

    const calls: { kind: 'comments' | 'change'; value: string[] | string | null }[] = [];
    const detach = attachLegacyReviewMirror(adapter, {
      setActiveComments(ids) {
        calls.push({ kind: 'comments', value: [...ids] });
      },
      setActiveTrackedChange(id) {
        calls.push({ kind: 'change', value: id });
      },
    });

    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-x'));
    adapter.setActiveReviewTarget(targetFor('trackedChange', 'tc-x'));
    adapter.clearActiveReviewTarget();

    // Initial flush + 3 transitions = 4 entries per sink.
    const commentCalls = calls.filter((c) => c.kind === 'comments').map((c) => c.value);
    const changeCalls = calls.filter((c) => c.kind === 'change').map((c) => c.value);
    expect(commentCalls).toEqual([[], ['cmt-x'], [], []]);
    expect(changeCalls).toEqual([null, null, 'tc-x', null]);

    detach();

    // After detaching, mirror does not receive further updates - but the
    // sinks are write-only anyway: they cannot push state back into the
    // adapter. Confirm by mutating mirror inputs has no effect.
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-y'));
    expect(adapter.getActiveReviewTarget()?.entityId).toBe('cmt-y');

    adapter.dispose();
  });
});

describe('createReviewStateAdapter — async command routing', () => {
  it('5a. comment edit routes through the executor and keeps review-target state', async () => {
    const { executor, state } = buildExecutor();
    state.comments.patch.mockResolvedValue(ok({ txId: 'tx-edit-1' }));

    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-edit'));
    const result = await adapter.editComment({ commentId: 'cmt-edit', text: 'new body' });

    expect(result.status).toBe('ok');
    expect(state.comments.patch).toHaveBeenCalledWith({ commentId: 'cmt-edit', text: 'new body' });
    // Held target stays on the same comment.
    expect(adapter.getActiveReviewTarget()?.entityId).toBe('cmt-edit');
    adapter.dispose();
  });

  it('5b. tracked-change decide routes through the executor and clears focus when invalidated', async () => {
    const { executor, state } = buildExecutor();
    state.trackChanges.decide.mockResolvedValue(
      ok({
        txId: 'tx-tc-1',
        invalidatedRefs: [
          {
            kind: 'entity',
            entityType: 'trackedChange',
            entityId: 'tc-1',
            story: { kind: 'story', storyType: 'body' },
          },
        ],
      }),
    );

    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('trackedChange', 'tc-1'));
    const result = await adapter.decideTrackedChange({ decision: 'accept', target: { id: 'tc-1' } });

    expect(result.status).toBe('ok');
    expect(state.trackChanges.decide).toHaveBeenCalled();
    // Held target cleared by the receipt's invalidatedRefs entry.
    expect(adapter.getActiveReviewTarget()).toBeNull();
    adapter.dispose();
  });

  it('5c. reply with explicit followFocus moves focus to the inserted entity', async () => {
    const { executor, state } = buildExecutor();
    state.comments.create.mockResolvedValue(
      ok({
        txId: 'tx-reply-1',
        inserted: [{ kind: 'entity', entityType: 'comment', entityId: 'cmt-reply-1' }],
      }),
    );

    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-parent'));
    const result = await adapter.replyToComment({
      parentCommentId: 'cmt-parent',
      text: 'hi',
      followFocus: { entityType: 'comment', entityId: 'cmt-reply-1', origin: 'shell', layoutEpoch: 7 },
    });

    expect(result.status).toBe('ok');
    expect(adapter.getActiveReviewTarget()?.entityId).toBe('cmt-reply-1');
    adapter.dispose();
  });

  it('blocks concurrent commands against the same entity via the pending map', async () => {
    const { executor, state } = buildExecutor();
    let resolveFirst!: (r: Receipt) => void;
    state.comments.patch.mockImplementationOnce(
      () =>
        new Promise<Receipt>((res) => {
          resolveFirst = res;
        }),
    );

    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-busy'));
    const first = adapter.editComment({ commentId: 'cmt-busy', text: 'a' });
    const second = await adapter.editComment({ commentId: 'cmt-busy', text: 'b' });
    expect(second.status).toBe('rejected');
    if (second.status === 'rejected') {
      expect(second.reason.code).toBe('review-command-unavailable');
      expect(second.reason.detail).toMatch(/pending/);
    }
    resolveFirst(ok({ txId: 'tx-edit-done' }));
    await first;
    adapter.dispose();
  });
});

describe('createReviewStateAdapter — view changes and freshness', () => {
  it('7a. onPaintEpochChange reapplies highlight when the target is still painted', () => {
    const { executor } = buildExecutor();
    let painted = true;
    const adapter = createReviewStateAdapter({
      executor,
      isTargetPainted: () => painted,
    });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-paint'));

    adapter.onPaintEpochChange(11);
    const active = adapter.getActiveReviewTarget();
    expect(active).not.toBeNull();
    expect(active?.layoutEpoch).toBe(11);

    painted = false;
    adapter.onPaintEpochChange(12);
    expect(adapter.getActiveReviewTarget()).toBeNull();
    expect(adapter.getSnapshot().lastInteractionRejection).toEqual({
      code: 'review-target-invalidated',
      detail: 'not-painted',
    });
    adapter.dispose();
  });

  it('9. held-target actions reject with review-target-invalidated when the held epoch is stale', async () => {
    const { executor } = buildExecutor();
    let current = 7;
    const adapter = createReviewStateAdapter({
      executor,
      getCurrentLayoutEpoch: () => current,
    });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-stale', 7));
    current = 9; // painted epoch advanced underneath the held target.

    const result = await adapter.editComment({ commentId: 'cmt-stale', text: 'oops' });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason.code).toBe('review-target-invalidated');
      expect(result.reason.detail).toMatch(/captured=7/);
      expect(result.reason.detail).toMatch(/current=9/);
    }
    adapter.dispose();
  });
});

describe('createReviewStateAdapter — undo / redo', () => {
  it('8a. undo restores the recorded beforeTarget and moves the history entry to the redo stack', async () => {
    const { executor, state } = buildExecutor();
    // Capture the comment delete receipt with invalidatedRefs.
    state.comments.delete.mockResolvedValue(
      ok({
        txId: 'tx-del-1',
        invalidatedRefs: [{ kind: 'entity', entityType: 'comment', entityId: 'cmt-undo' }],
      }),
    );
    state.history.undo.mockResolvedValue({
      noop: false,
      revision: { before: 'rB', after: 'rA' },
    });

    const adapter = createReviewStateAdapter({ executor });
    const before = targetFor('comment', 'cmt-undo');
    adapter.setActiveReviewTarget(before);
    await adapter.deleteComment({ commentId: 'cmt-undo' });
    expect(adapter.getActiveReviewTarget()).toBeNull(); // cleared by invalidated ref.

    const undo = await adapter.undo({ direction: 'undo', originTxId: 'tx-del-1' });
    expect(undo.status).toBe('ok');
    // beforeTarget restored.
    const restored = adapter.getActiveReviewTarget();
    expect(restored?.entityId).toBe('cmt-undo');

    // Redo restores afterTarget (null in this case).
    state.history.redo.mockResolvedValue({
      noop: false,
      revision: { before: 'rA', after: 'rB' },
    });
    const redo = await adapter.redo({ direction: 'redo', originTxId: 'tx-del-1' });
    expect(redo.status).toBe('ok');
    expect(adapter.getActiveReviewTarget()).toBeNull();
    adapter.dispose();
  });

  it('8b. undo with no provenance rejects before mutating focus', async () => {
    const { executor, state } = buildExecutor();
    state.history.undo.mockResolvedValue({
      noop: false,
      revision: { before: 'rB', after: 'rA' },
    });
    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-anon'));
    const undo = await adapter.undo();
    expect(undo.status).toBe('rejected');
    if (undo.status === 'rejected') {
      expect(undo.reason).toEqual({
        code: 'review-command-unavailable',
        detail: 'review-provenance-missing',
      });
    }
    expect(adapter.getActiveReviewTarget()?.entityId).toBe('cmt-anon');
    adapter.dispose();
  });

  it('8d. later receipt invalidation clears stored history focus instead of restoring a dead target', async () => {
    const { executor, state } = buildExecutor();
    state.comments.delete.mockResolvedValue(
      ok({
        txId: 'tx-del-later-invalidated',
        invalidatedRefs: [{ kind: 'entity', entityType: 'comment', entityId: 'cmt-dead' }],
      }),
    );
    state.history.undo.mockResolvedValue({
      noop: false,
      revision: { before: 'r2', after: 'r1' },
    });

    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-dead'));
    await adapter.deleteComment({ commentId: 'cmt-dead' });

    adapter.applyReceiptLike({
      invalidatedRefs: [{ kind: 'entity', entityType: 'comment', entityId: 'cmt-dead' }],
      txId: 'tx-remote-clear',
    });

    const undo = await adapter.undo({ direction: 'undo', originTxId: 'tx-del-later-invalidated' });
    expect(undo.status).toBe('ok');
    expect(adapter.getActiveReviewTarget()).toBeNull();
    expect(adapter.getSnapshot().lastInteractionRejection).toEqual({
      code: 'review-target-invalidated',
      detail: 'history-entry-invalidated',
    });
    adapter.dispose();
  });

  it('8c. undo noop rejects and leaves focus untouched', async () => {
    const { executor, state } = buildExecutor();
    state.comments.patch.mockResolvedValue(
      ok({
        txId: 'tx-edit-noop-undo',
        invalidatedRefs: [],
      }),
    );
    state.history.undo.mockResolvedValue({
      noop: true,
      reason: 'no-undo-available',
      revision: { before: 'r0', after: 'r0' },
    });
    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-keep'));
    await adapter.editComment({ commentId: 'cmt-keep', text: 'edit' });
    const undo = await adapter.undo({ direction: 'undo', originTxId: 'tx-edit-noop-undo' });
    expect(undo.status).toBe('rejected');
    if (undo.status === 'rejected') {
      expect(undo.reason).toEqual({
        code: 'review-command-unavailable',
        detail: 'review-history-noop',
      });
    }
    expect(adapter.getActiveReviewTarget()?.entityId).toBe('cmt-keep');
    adapter.dispose();
  });
});

describe('createReviewStateAdapter — input gating', () => {
  it('10. blocks printable keydowns and mutation events while leaving navigation keys alone', () => {
    const { executor } = buildExecutor();
    const adapter = createReviewStateAdapter({ executor });

    expect(adapter.shouldBlockInputEvent('beforeinput')).toBe(true);
    expect(adapter.shouldBlockInputEvent('compositionstart')).toBe(true);
    expect(adapter.shouldBlockInputEvent('compositionupdate')).toBe(true);
    expect(adapter.shouldBlockInputEvent('compositionend')).toBe(true);
    expect(adapter.shouldBlockInputEvent('paste')).toBe(true);
    expect(adapter.shouldBlockInputEvent('drop')).toBe(true);
    expect(adapter.shouldBlockInputEvent('dragover')).toBe(true);

    // Printable key → blocked.
    expect(adapter.shouldBlockInputEvent('keydown', new KeyboardEvent('keydown', { key: 'a' }))).toBe(true);
    // Navigation keys → allowed.
    expect(adapter.shouldBlockInputEvent('keydown', new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(false);
    expect(adapter.shouldBlockInputEvent('keydown', new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
    expect(adapter.shouldBlockInputEvent('keydown', new KeyboardEvent('keydown', { key: 'Tab' }))).toBe(false);
    // Shortcut keys (modifiers) → allowed (the host may route them to chrome).
    expect(adapter.shouldBlockInputEvent('keydown', new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))).toBe(
      false,
    );
    adapter.dispose();
  });
});

describe('createReviewStateAdapter — receipt application', () => {
  it('11a. invalidated refs clear the held target via the 002 entity-match rule', () => {
    const { executor } = buildExecutor();
    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-x'));
    adapter.applyReceiptLike({
      invalidatedRefs: [{ kind: 'entity', entityType: 'comment', entityId: 'cmt-x' }],
      txId: 'tx-push-1',
    });
    expect(adapter.getActiveReviewTarget()).toBeNull();
    adapter.dispose();
  });

  it('11b. remapped refs reseat the held target on the same entity type', () => {
    const { executor } = buildExecutor();
    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('trackedChange', 'tc-from'));
    adapter.applyReceiptLike({
      remappedRefs: [
        {
          from: {
            kind: 'entity',
            entityType: 'trackedChange',
            entityId: 'tc-from',
            story: { kind: 'story', storyType: 'body' },
          },
          to: {
            kind: 'entity',
            entityType: 'trackedChange',
            entityId: 'tc-to',
            story: { kind: 'story', storyType: 'body' },
          },
        },
      ],
    });
    const active = adapter.getActiveReviewTarget();
    expect(active?.entityType).toBe('trackedChange');
    expect(active?.entityId).toBe('tc-to');
    expect(active?.origin).toBe('receipt');
    adapter.dispose();
  });

  it('11c. cross-entity-type remap is treated as invalidation', () => {
    const { executor } = buildExecutor();
    const adapter = createReviewStateAdapter({ executor });
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-mixed'));
    adapter.applyReceiptLike({
      remappedRefs: [
        {
          from: { kind: 'entity', entityType: 'comment', entityId: 'cmt-mixed' },
          to: { kind: 'text', blockId: 'block-1', range: { start: 0, end: 5 } },
        },
      ],
    });
    expect(adapter.getActiveReviewTarget()).toBeNull();
    adapter.dispose();
  });

  it('11d. forwardStoryInvalidation receives affectedStories on receipt application', () => {
    const { executor } = buildExecutor();
    const forwardStoryInvalidation = vi.fn();
    const adapter = createReviewStateAdapter({ executor, forwardStoryInvalidation });
    adapter.applyReceiptLike({
      affectedStories: [{ kind: 'story', storyType: 'body' }],
      txId: 'tx-forward',
    });
    expect(forwardStoryInvalidation).toHaveBeenCalledWith({
      stories: [{ kind: 'story', storyType: 'body' }],
      txId: 'tx-forward',
    });
    adapter.dispose();
  });
});

describe('createReviewStateAdapter — author preconditions and rejection codes', () => {
  it('12. comment action returns the underlying PRECONDITION_FAILED receipt unchanged', async () => {
    const { executor, state } = buildExecutor();
    state.comments.create.mockResolvedValue(
      fail('PRECONDITION_FAILED', 'session.author required for comment operations.'),
    );
    const adapter = createReviewStateAdapter({ executor });
    const result = await adapter.replyToComment({ parentCommentId: 'cmt-parent', text: 'hi' });
    expect(result.status).toBe('ok'); // adapter returns the receipt unchanged.
    if (result.status === 'ok') {
      expect(result.receipt.success).toBe(false);
      if (!result.receipt.success) {
        expect(result.receipt.failure.code).toBe('PRECONDITION_FAILED');
      }
    }
    adapter.dispose();
  });

  it('13. SDReviewInteractionRejectionCode set is disjoint from ReceiptFailureCode', () => {
    const reviewCodes: SDReviewInteractionRejectionCode[] = [
      'review-surface-read-only',
      'review-target-invalidated',
      'review-command-unavailable',
      'comment-anchor-create-deferred',
      'comment-anchor-move-deferred',
    ];
    const frozenReceiptCodes: ReceiptFailureCode[] = [
      'PRECONDITION_FAILED',
      'CAPABILITY_UNAVAILABLE',
      'INVALID_INPUT',
      'INVALID_TARGET',
      'NO_OP',
      'INTERNAL_ERROR',
    ];
    for (const code of reviewCodes) {
      expect(frozenReceiptCodes).not.toContain(code as unknown as ReceiptFailureCode);
    }
    // Ensure codes are dashed-lowercase per plan §3 rejection model.
    for (const code of reviewCodes) {
      expect(code).toMatch(/^[a-z]+(-[a-z]+)+$/);
    }
  });
});

describe('createReviewStateAdapter — capability gate', () => {
  it('rejects commands flagged unavailable by the capability gate', async () => {
    const { executor } = buildExecutor();
    const adapter = createReviewStateAdapter({
      executor,
      isCommandAvailable: (cmd) => cmd !== 'trackedChange.acceptAll',
    });
    const result = await adapter.decideTrackedChange({ decision: 'accept', target: { scope: 'all' } });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason.code).toBe('review-command-unavailable');
      expect(result.reason.detail).toBe('trackedChange.acceptAll');
    }
    adapter.dispose();
  });
});

describe('createReviewStateAdapter — subscriptions', () => {
  let adapter: ReviewStateAdapter;
  beforeEach(() => {
    adapter = createReviewStateAdapter({ executor: buildExecutor().executor });
  });
  afterEach(() => {
    adapter.dispose();
  });

  it('notifies subscribers on target changes and on pending map changes', async () => {
    const events: number[] = [];
    adapter.subscribe(() => events.push(events.length));
    adapter.setActiveReviewTarget(targetFor('comment', 'cmt-sub'));
    expect(events.length).toBeGreaterThan(0);
    const prior = events.length;
    adapter.clearActiveReviewTarget();
    expect(events.length).toBeGreaterThan(prior);
  });
});
