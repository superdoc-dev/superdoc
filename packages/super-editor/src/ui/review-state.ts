// Authoritative v2 review-state adapter.
//
// Owns the single `activeReviewTarget`, holds a local review-target history
// stack and pending-action map, applies committed receipts through the frozen
// C1 invalidation order, and routes review commands through a minimal async
// executor contract. 004 and 005 later wire this adapter into a real review
// shell and the runtime command matrix; 003 itself is review-shell-free and
// PM-free, so it can be exercised against fake executors and synthetic DOM
// hosts.
//
// (§ 3 Review State Model, § 5 Implementation Work, § 9 Adversarial Review
// Hardening) for the binding contract this file implements.

import type {
  AffectedRef,
  AffectedRefRemapping,
  CommentAddress,
  CommentsCreateInput,
  CommentsDeleteInput,
  CommentsPatchInput,
  HistoryActionResult,
  Receipt,
  ReceiptSuccess,
  ReviewDecideInput,
  StoryLocator,
  TrackedChangeAddress,
} from '@superdoc/document-api';
import { matchReviewTargetAgainstReceipt, type ReviewTargetDiagnostic } from './review-target.js';

// ---------------------------------------------------------------------------
// Public review-shell rejection codes
// ---------------------------------------------------------------------------

/**
 * Review-shell interaction rejection codes. These describe UI-layer focus and
 * action gating outcomes; they are distinct from the frozen
 * `ReceiptFailureCode` union and never widen it.
 */
export type SDReviewInteractionRejectionCode =
  | 'review-surface-read-only'
  | 'review-target-invalidated'
  | 'review-command-unavailable'
  | 'comment-anchor-create-deferred'
  | 'comment-anchor-move-deferred';

export interface SDReviewInteractionRejection {
  code: SDReviewInteractionRejectionCode;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Active review-target state
// ---------------------------------------------------------------------------

export type ActiveReviewTargetEntityType = 'comment' | 'trackedChange';

export type ActiveReviewTargetOrigin = 'document' | 'panel' | 'bubble' | 'history' | 'receipt' | 'shell';

/**
 * Authoritative review-focus object owned by the review shell. Held outside
 * any selection-driven UI compatibility mirror; mirrors may follow this
 * object one-way for legacy compatibility but never lead it.
 */
export interface ActiveReviewTarget {
  entityType: ActiveReviewTargetEntityType;
  entityId: string;
  origin: ActiveReviewTargetOrigin;
  /** Layout epoch captured when this target became active. */
  layoutEpoch: number;
  /** Story locator (when known). Comment targets default to body. */
  story?: StoryLocator;
  /** Diagnostics carried alongside the focus (e.g. from hit-test). */
  diagnostics?: readonly ReviewTargetDiagnostic[];
}

function toAddress(target: ActiveReviewTarget): CommentAddress | TrackedChangeAddress {
  if (target.entityType === 'comment') {
    return { kind: 'entity', entityType: 'comment', entityId: target.entityId };
  }
  return {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: target.entityId,
    ...(target.story ? { story: target.story } : { story: { kind: 'story', storyType: 'body' } }),
  };
}

function targetKey(target: { entityType: ActiveReviewTargetEntityType; entityId: string }): string {
  return `${target.entityType}:${target.entityId}`;
}

// ---------------------------------------------------------------------------
// Review commands
// ---------------------------------------------------------------------------

/**
 * Review commands supported by Phase 0. The set is closed: 003 routes only
 * these verbs through the executor; 005 owns the command matrix gate that
 * decides which subset is enabled at runtime.
 */
export type ReviewCommandKind =
  | 'comment.reply'
  | 'comment.edit'
  | 'comment.resolve'
  | 'comment.reopen'
  | 'comment.delete'
  | 'trackedChange.accept'
  | 'trackedChange.reject'
  | 'trackedChange.acceptAll'
  | 'trackedChange.rejectAll'
  | 'history.undo'
  | 'history.redo';

/**
 * Minimal async executor contract consumed by 003. It mirrors the frozen
 * C1 operation shapes; the real review host (004) wires this to its async
 * worker transport, while tests bind it to deterministic fakes.
 */
export interface ReviewShellCommandExecutor {
  comments: {
    create(input: CommentsCreateInput): Promise<Receipt>;
    patch(input: CommentsPatchInput): Promise<Receipt>;
    delete(input: CommentsDeleteInput): Promise<Receipt>;
  };
  trackChanges: {
    decide(input: ReviewDecideInput): Promise<Receipt>;
  };
  history: {
    undo(): Promise<HistoryActionResult>;
    redo(): Promise<HistoryActionResult>;
  };
}

export interface ReviewActionOk {
  status: 'ok';
  receipt: Receipt;
}

export interface ReviewHistoryOk {
  status: 'ok';
  result: HistoryActionResult;
}

export interface ReviewActionRejected {
  status: 'rejected';
  reason: SDReviewInteractionRejection;
}

export type ReviewActionResult = ReviewActionOk | ReviewActionRejected;
export type ReviewHistoryResult = ReviewHistoryOk | ReviewActionRejected;

// ---------------------------------------------------------------------------
// History stack
// ---------------------------------------------------------------------------

interface ReviewTargetHistoryEntry {
  txId: string;
  commandKind: ReviewCommandKind;
  beforeTarget: ActiveReviewTarget | null;
  afterTarget: ActiveReviewTarget | null;
  beforeInvalidated?: boolean;
  afterInvalidated?: boolean;
}

// ---------------------------------------------------------------------------
// Receipt-like application (push surface for 004/006)
// ---------------------------------------------------------------------------

export interface ApplyReceiptLikeInput {
  invalidatedRefs?: readonly AffectedRef[];
  remappedRefs?: readonly AffectedRefRemapping[];
  affectedStories?: readonly StoryLocator[];
  txId?: string;
  /** Local review provenance (only set when the receipt originated from a 003 command). */
  provenance?: {
    commandKind: ReviewCommandKind;
    beforeTarget: ActiveReviewTarget | null;
    requestedFollowFocus?: ActiveReviewTarget | null;
  };
}

// ---------------------------------------------------------------------------
// Adapter options + snapshot
// ---------------------------------------------------------------------------

export type DocumentInputEventKind =
  | 'beforeinput'
  | 'compositionstart'
  | 'compositionupdate'
  | 'compositionend'
  | 'paste'
  | 'drop'
  | 'dragover'
  | 'keydown';

export interface ReviewStateAdapterOptions {
  executor: ReviewShellCommandExecutor;
  /** Returns the currently painted layout epoch. Used to gate held-target actions. */
  getCurrentLayoutEpoch?: () => number | null;
  /** Returns whether a held target is still painted. Used by `onPaintEpochChange`. */
  isTargetPainted?: (target: ActiveReviewTarget) => boolean;
  /** Capability gate for review commands. 005 wires the real matrix. */
  isCommandAvailable?: (command: ReviewCommandKind) => boolean;
  /** Provider/layout invalidation forward hook. Called for shell-owned local receipts. */
  forwardStoryInvalidation?: (input: { stories: readonly StoryLocator[]; txId?: string }) => void;
  /** Notified after capability/history may have changed. Lets the shell refresh chrome. */
  notifyCapabilityRefresh?: () => void;
}

export interface ReviewStateSnapshot {
  activeReviewTarget: ActiveReviewTarget | null;
  lastInteractionRejection: SDReviewInteractionRejection | null;
  pendingTargets: ReadonlyMap<string, ReviewCommandKind>;
  undoDepth: number;
  redoDepth: number;
  nextUndoTxId: string | null;
  nextRedoTxId: string | null;
}

export type ReviewStateListener = (snapshot: ReviewStateSnapshot) => void;

// ---------------------------------------------------------------------------
// Provenance for undo / redo
// ---------------------------------------------------------------------------

export interface ReviewHistoryProvenance {
  /** Direction the history call is about to take. */
  direction: 'undo' | 'redo';
  /** Optional originating txId (set when 005 can identify the entry). */
  originTxId?: string;
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

export interface ReviewStateAdapter {
  /** Current authoritative target, or null when no review focus is held. */
  getActiveReviewTarget(): ActiveReviewTarget | null;
  /**
   * Set the authoritative target. The shell calls this in response to a
   * document-surface hit, panel selection, or bubble click. Returns null on
   * success or a rejection describing why the focus was refused.
   */
  setActiveReviewTarget(target: ActiveReviewTarget | null): SDReviewInteractionRejection | null;
  /** Clear the active target with the given rejection code as the reason. */
  clearActiveReviewTarget(reason?: SDReviewInteractionRejectionCode, detail?: string): void;

  /** Subscribe to snapshot updates. */
  subscribe(listener: ReviewStateListener): () => void;
  /** Synchronous snapshot for chrome rendering. */
  getSnapshot(): ReviewStateSnapshot;

  // Review commands
  replyToComment(input: {
    parentCommentId: string;
    text: string;
    followFocus?: ActiveReviewTarget;
  }): Promise<ReviewActionResult>;
  editComment(input: { commentId: string; text: string }): Promise<ReviewActionResult>;
  resolveComment(input: { commentId: string }): Promise<ReviewActionResult>;
  reopenComment(input: { commentId: string }): Promise<ReviewActionResult>;
  deleteComment(input: { commentId: string }): Promise<ReviewActionResult>;
  decideTrackedChange(input: ReviewDecideInput): Promise<ReviewActionResult>;
  undo(provenance?: ReviewHistoryProvenance): Promise<ReviewHistoryResult>;
  redo(provenance?: ReviewHistoryProvenance): Promise<ReviewHistoryResult>;

  /**
   * Push receipt-like effects from 004/006 into the held target lifecycle.
   * Does not surface a UI failure; the originating receipt carries the
   * authoritative `ReceiptFailureCode` already.
   */
  applyReceiptLike(input: ApplyReceiptLikeInput): void;

  /**
   * Re-check the held target after a view change or repaint. Pass the
   * current painted epoch. Re-applies highlight if still painted, or
   * clears with `review-target-invalidated` if not.
   */
  onPaintEpochChange(epoch: number): void;

  /**
   * Returns true when the document-surface should block this input event.
   * Plain-text caret/selection movement is intentionally NOT in this list:
   * it can fall out as a compatibility side effect but it is not the
   * authoritative review state and is not a precondition for any action.
   */
  shouldBlockInputEvent(eventType: DocumentInputEventKind, event?: KeyboardEvent): boolean;

  /** Dispose the adapter. Clears the held target and disables further actions. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const PRINTABLE_KEY_RE = /^[\s\S]$/u;

function isPrintableKey(event: KeyboardEvent | undefined): boolean {
  if (!event) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const key = event.key ?? '';
  if (key.length !== 1) return false;
  return PRINTABLE_KEY_RE.test(key);
}

function buildInvalidatedReason(detail?: string): SDReviewInteractionRejection {
  return detail ? { code: 'review-target-invalidated', detail } : { code: 'review-target-invalidated' };
}

export function createReviewStateAdapter(options: ReviewStateAdapterOptions): ReviewStateAdapter {
  const {
    executor,
    getCurrentLayoutEpoch,
    isTargetPainted,
    isCommandAvailable,
    forwardStoryInvalidation,
    notifyCapabilityRefresh,
  } = options;

  let activeTarget: ActiveReviewTarget | null = null;
  let lastInteractionRejection: SDReviewInteractionRejection | null = null;
  const pending = new Map<string, ReviewCommandKind>();
  const undoStack: ReviewTargetHistoryEntry[] = [];
  const redoStack: ReviewTargetHistoryEntry[] = [];
  const listeners = new Set<ReviewStateListener>();
  let disposed = false;

  function snapshot(): ReviewStateSnapshot {
    return {
      activeReviewTarget: activeTarget,
      lastInteractionRejection,
      pendingTargets: new Map(pending),
      undoDepth: undoStack.length,
      redoDepth: redoStack.length,
      nextUndoTxId: undoStack[undoStack.length - 1]?.txId ?? null,
      nextRedoTxId: redoStack[redoStack.length - 1]?.txId ?? null,
    };
  }

  function emit(): void {
    if (listeners.size === 0) return;
    const snap = snapshot();
    for (const listener of listeners) {
      try {
        listener(snap);
      } catch {
        // Listener errors must not break receipt application.
      }
    }
  }

  function setTarget(target: ActiveReviewTarget | null): void {
    if (target === activeTarget) return;
    activeTarget = target;
    emit();
  }

  function sameRejection(a: SDReviewInteractionRejection | null, b: SDReviewInteractionRejection | null): boolean {
    return a?.code === b?.code && a?.detail === b?.detail;
  }

  function setLastInteractionRejection(reason: SDReviewInteractionRejection | null): void {
    if (sameRejection(lastInteractionRejection, reason)) {
      return;
    }
    lastInteractionRejection = reason;
    emit();
  }

  function rejectCommand(reason: SDReviewInteractionRejection): ReviewActionResult {
    setLastInteractionRejection(reason);
    return { status: 'rejected', reason };
  }

  function ensureNotDisposed(): SDReviewInteractionRejection | null {
    if (disposed) {
      return { code: 'review-surface-read-only', detail: 'adapter-disposed' };
    }
    return null;
  }

  function ensureCapability(command: ReviewCommandKind): SDReviewInteractionRejection | null {
    if (isCommandAvailable && !isCommandAvailable(command)) {
      return { code: 'review-command-unavailable', detail: command };
    }
    return null;
  }

  function checkHeldFreshness(target: ActiveReviewTarget | null): SDReviewInteractionRejection | null {
    if (!target) return null;
    if (!getCurrentLayoutEpoch) return null;
    const current = getCurrentLayoutEpoch();
    if (current == null || !Number.isFinite(current)) return null;
    if (current !== target.layoutEpoch) {
      return buildInvalidatedReason(`captured=${target.layoutEpoch};current=${current}`);
    }
    return null;
  }

  function tryClaimPending(
    target: { entityType: ActiveReviewTargetEntityType; entityId: string } | null,
    command: ReviewCommandKind,
  ): SDReviewInteractionRejection | null {
    if (!target) return null;
    const key = targetKey(target);
    if (pending.has(key)) {
      return { code: 'review-command-unavailable', detail: `pending:${pending.get(key)!}` };
    }
    pending.set(key, command);
    emit();
    return null;
  }

  function releasePending(target: { entityType: ActiveReviewTargetEntityType; entityId: string } | null): void {
    if (!target) return;
    const key = targetKey(target);
    if (pending.delete(key)) {
      emit();
    }
  }

  function pushHistoryEntry(entry: ReviewTargetHistoryEntry): void {
    undoStack.push({
      ...entry,
      beforeInvalidated: entry.beforeInvalidated ?? false,
      afterInvalidated: entry.afterInvalidated ?? false,
    });
    redoStack.length = 0;
    emit();
  }

  function rewriteTargetThroughRefEffects(
    target: ActiveReviewTarget | null,
    input: { invalidatedRefs?: readonly AffectedRef[]; remappedRefs?: readonly AffectedRefRemapping[] },
  ): ActiveReviewTarget | null {
    if (!target) return null;
    const match = matchReviewTargetAgainstReceipt({
      target: toAddress(target),
      invalidatedRefs: input.invalidatedRefs,
      remappedRefs: input.remappedRefs,
    });
    if (match.kind === 'preserved') {
      return target;
    }
    if (match.kind === 'invalidated') {
      return null;
    }
    return {
      ...target,
      entityType: match.to.entityType,
      entityId: match.to.entityId,
      ...(match.to.entityType === 'trackedChange'
        ? {
            story:
              'story' in match.to && match.to.story ? match.to.story : { kind: 'story', storyType: 'body' as const },
          }
        : {}),
    };
  }

  function rewriteHistoryEntriesFromRefEffects(input: {
    invalidatedRefs?: readonly AffectedRef[];
    remappedRefs?: readonly AffectedRefRemapping[];
  }): void {
    const stacks = [undoStack, redoStack];
    for (const stack of stacks) {
      for (const entry of stack) {
        const nextBefore = rewriteTargetThroughRefEffects(entry.beforeTarget, input);
        entry.beforeInvalidated = entry.beforeInvalidated || (entry.beforeTarget != null && nextBefore == null);
        entry.beforeTarget = nextBefore;

        const nextAfter = rewriteTargetThroughRefEffects(entry.afterTarget, input);
        entry.afterInvalidated = entry.afterInvalidated || (entry.afterTarget != null && nextAfter == null);
        entry.afterTarget = nextAfter;
      }
    }
  }

  function applyRefEffectsToHeldTarget(input: {
    invalidatedRefs?: readonly AffectedRef[];
    remappedRefs?: readonly AffectedRefRemapping[];
  }): { changed: boolean; cleared: boolean; remappedTo: CommentAddress | TrackedChangeAddress | null } {
    if (!activeTarget) return { changed: false, cleared: false, remappedTo: null };
    const match = matchReviewTargetAgainstReceipt({
      target: toAddress(activeTarget),
      invalidatedRefs: input.invalidatedRefs,
      remappedRefs: input.remappedRefs,
    });
    if (match.kind === 'preserved') {
      return { changed: false, cleared: false, remappedTo: null };
    }
    if (match.kind === 'invalidated') {
      lastInteractionRejection = buildInvalidatedReason('receipt-invalidated');
      setTarget(null);
      return { changed: true, cleared: true, remappedTo: null };
    }
    // Remapped: build a new ActiveReviewTarget while preserving origin.
    const next: ActiveReviewTarget = {
      entityType: match.to.entityType,
      entityId: match.to.entityId,
      origin: 'receipt',
      layoutEpoch: activeTarget.layoutEpoch,
      ...(match.to.entityType === 'trackedChange' && 'story' in match.to && match.to.story
        ? { story: match.to.story }
        : {}),
    };
    lastInteractionRejection = null;
    setTarget(next);
    return { changed: true, cleared: false, remappedTo: match.to };
  }

  function applyReceiptLikeInternal(input: ApplyReceiptLikeInput): void {
    rewriteHistoryEntriesFromRefEffects(input);
    // Step 1: ref-effect application against the held target (002 entity-match rule).
    applyRefEffectsToHeldTarget(input);
    // Step 2: forward story invalidation for 001/004 provider-layout refresh.
    if (forwardStoryInvalidation && input.affectedStories && input.affectedStories.length > 0) {
      forwardStoryInvalidation({ stories: input.affectedStories, txId: input.txId });
    }
    // Step 3: re-check capabilities/history.
    if (notifyCapabilityRefresh) {
      try {
        notifyCapabilityRefresh();
      } catch {
        // ignore
      }
    }
  }

  function provenanceFromReceipt(
    receipt: ReceiptSuccess,
    commandKind: ReviewCommandKind,
    beforeTarget: ActiveReviewTarget | null,
    requestedFollowFocus?: ActiveReviewTarget | null,
  ): void {
    setLastInteractionRejection(null);
    applyReceiptLikeInternal({
      invalidatedRefs: receipt.invalidatedRefs,
      remappedRefs: receipt.remappedRefs,
      affectedStories: receipt.affectedStories,
      txId: receipt.txId,
      provenance: { commandKind, beforeTarget, requestedFollowFocus: requestedFollowFocus ?? null },
    });

    // Follow-focus is opt-in: only the originating chrome can move focus to
    // an inserted reply or new review item. Otherwise the held target follows
    // receipt invalidation / remap rules (already applied above).
    if (requestedFollowFocus !== undefined) {
      setTarget(requestedFollowFocus);
    }

    // Push history entry only for local commands with a txId.
    if (receipt.txId) {
      pushHistoryEntry({
        txId: receipt.txId,
        commandKind,
        beforeTarget,
        afterTarget: activeTarget,
      });
    }
  }

  async function runCommentCommand<T extends ReviewCommandKind>(
    command: T,
    target: { entityType: ActiveReviewTargetEntityType; entityId: string } | null,
    requestedFollowFocus: ActiveReviewTarget | null | undefined,
    invoke: () => Promise<Receipt>,
  ): Promise<ReviewActionResult> {
    const disposedReason = ensureNotDisposed();
    if (disposedReason) return rejectCommand(disposedReason);
    const capability = ensureCapability(command);
    if (capability) return rejectCommand(capability);
    if (target) {
      const stale = checkHeldFreshness(
        activeTarget && targetKey(activeTarget) === targetKey(target) ? activeTarget : null,
      );
      if (stale) return rejectCommand(stale);
    }
    const claim = tryClaimPending(target, command);
    if (claim) return rejectCommand(claim);

    const beforeTarget = activeTarget;
    let receipt: Receipt;
    try {
      receipt = await invoke();
    } catch (err) {
      releasePending(target);
      return rejectCommand({
        code: 'review-command-unavailable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    releasePending(target);

    if (receipt.success) {
      provenanceFromReceipt(receipt, command, beforeTarget, requestedFollowFocus);
    }
    return { status: 'ok', receipt };
  }

  async function runTrackedChangeCommand(
    command: ReviewCommandKind,
    target: { entityType: ActiveReviewTargetEntityType; entityId: string } | null,
    invoke: () => Promise<Receipt>,
  ): Promise<ReviewActionResult> {
    const disposedReason = ensureNotDisposed();
    if (disposedReason) return rejectCommand(disposedReason);
    const capability = ensureCapability(command);
    if (capability) return rejectCommand(capability);
    if (target) {
      const stale = checkHeldFreshness(
        activeTarget && targetKey(activeTarget) === targetKey(target) ? activeTarget : null,
      );
      if (stale) return rejectCommand(stale);
    }
    const claim = tryClaimPending(target, command);
    if (claim) return rejectCommand(claim);

    const beforeTarget = activeTarget;
    let receipt: Receipt;
    try {
      receipt = await invoke();
    } catch (err) {
      releasePending(target);
      return rejectCommand({
        code: 'review-command-unavailable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    releasePending(target);

    if (receipt.success) {
      provenanceFromReceipt(receipt, command, beforeTarget, undefined);
    }
    return { status: 'ok', receipt };
  }

  function applyHistoryRefEffects(result: HistoryActionResult): void {
    rewriteHistoryEntriesFromRefEffects({
      invalidatedRefs: result.invalidatedRefs,
      remappedRefs: result.remappedRefs,
    });
    applyRefEffectsToHeldTarget({
      invalidatedRefs: result.invalidatedRefs,
      remappedRefs: result.remappedRefs,
    });
    if (forwardStoryInvalidation && result.affectedStories && result.affectedStories.length > 0) {
      forwardStoryInvalidation({ stories: result.affectedStories });
    }
    if (notifyCapabilityRefresh) {
      try {
        notifyCapabilityRefresh();
      } catch {
        // ignore
      }
    }
  }

  function restoreFromHistory(provenance: ReviewHistoryProvenance | undefined, result: HistoryActionResult): void {
    // 1. Always apply ref effects first so structural identity tracks the
    //    history transaction.
    applyHistoryRefEffects(result);

    // 2. If 005 supplied review provenance, restore the recorded focus.
    if (!provenance) {
      lastInteractionRejection = buildInvalidatedReason('history-provenance-missing');
      setTarget(null);
      return;
    }

    if (provenance.direction === 'undo') {
      const entry = provenance.originTxId
        ? (undoStack.find((e) => e.txId === provenance.originTxId) ?? null)
        : (undoStack[undoStack.length - 1] ?? null);
      if (!entry) {
        lastInteractionRejection = buildInvalidatedReason('history-entry-missing');
        setTarget(null);
        return;
      }
      // Move the entry from undo -> redo.
      const idx = undoStack.indexOf(entry);
      if (idx >= 0) {
        undoStack.splice(idx, 1);
        redoStack.push(entry);
      }
      if (entry.beforeTarget == null && entry.beforeInvalidated) {
        lastInteractionRejection = buildInvalidatedReason('history-entry-invalidated');
      } else {
        lastInteractionRejection = null;
      }
      setTarget(entry.beforeTarget);
      return;
    }

    // redo
    const entry = provenance.originTxId
      ? (redoStack.find((e) => e.txId === provenance.originTxId) ?? null)
      : (redoStack[redoStack.length - 1] ?? null);
    if (!entry) {
      lastInteractionRejection = buildInvalidatedReason('history-entry-missing');
      setTarget(null);
      return;
    }
    const idx = redoStack.indexOf(entry);
    if (idx >= 0) {
      redoStack.splice(idx, 1);
      undoStack.push(entry);
    }
    if (entry.afterTarget == null && entry.afterInvalidated) {
      lastInteractionRejection = buildInvalidatedReason('history-entry-invalidated');
    } else {
      lastInteractionRejection = null;
    }
    setTarget(entry.afterTarget);
  }

  const adapter: ReviewStateAdapter = {
    getActiveReviewTarget(): ActiveReviewTarget | null {
      return activeTarget;
    },

    setActiveReviewTarget(target: ActiveReviewTarget | null): SDReviewInteractionRejection | null {
      if (disposed) {
        const reason = { code: 'review-surface-read-only', detail: 'adapter-disposed' } as const;
        setLastInteractionRejection(reason);
        return reason;
      }
      if (!target) {
        setLastInteractionRejection(null);
        setTarget(null);
        return null;
      }
      // Verify entity type is supported (defensive: hit-test should never feed a
      // contentControl / placeholder address through here).
      if (target.entityType !== 'comment' && target.entityType !== 'trackedChange') {
        const reason = { code: 'review-command-unavailable', detail: 'unsupported-entity-type' } as const;
        setLastInteractionRejection(reason);
        return reason;
      }
      setLastInteractionRejection(null);
      setTarget(target);
      return null;
    },

    clearActiveReviewTarget(reason?: SDReviewInteractionRejectionCode, detail?: string): void {
      if (reason) {
        setLastInteractionRejection({ code: reason, detail });
      } else {
        setLastInteractionRejection(null);
      }
      setTarget(null);
    },

    subscribe(listener: ReviewStateListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): ReviewStateSnapshot {
      return snapshot();
    },

    async replyToComment(input): Promise<ReviewActionResult> {
      const target = { entityType: 'comment' as const, entityId: input.parentCommentId };
      return runCommentCommand('comment.reply', target, input.followFocus ?? undefined, () =>
        executor.comments.create({ parentCommentId: input.parentCommentId, text: input.text }),
      );
    },

    async editComment(input): Promise<ReviewActionResult> {
      const target = { entityType: 'comment' as const, entityId: input.commentId };
      return runCommentCommand('comment.edit', target, undefined, () =>
        executor.comments.patch({ commentId: input.commentId, text: input.text }),
      );
    },

    async resolveComment(input): Promise<ReviewActionResult> {
      const target = { entityType: 'comment' as const, entityId: input.commentId };
      return runCommentCommand('comment.resolve', target, undefined, () =>
        executor.comments.patch({ commentId: input.commentId, status: 'resolved' }),
      );
    },

    async reopenComment(input): Promise<ReviewActionResult> {
      const target = { entityType: 'comment' as const, entityId: input.commentId };
      return runCommentCommand('comment.reopen', target, undefined, () =>
        executor.comments.patch({ commentId: input.commentId, status: 'active' }),
      );
    },

    async deleteComment(input): Promise<ReviewActionResult> {
      const target = { entityType: 'comment' as const, entityId: input.commentId };
      return runCommentCommand(
        'comment.delete',
        target,
        undefined, // receipt invalidatedRefs path clears the held target when it points at the deleted comment.
        () => executor.comments.delete({ commentId: input.commentId }),
      );
    },

    async decideTrackedChange(input: ReviewDecideInput): Promise<ReviewActionResult> {
      const command: ReviewCommandKind = (() => {
        if (input.decision === 'accept') {
          return 'scope' in input.target ? 'trackedChange.acceptAll' : 'trackedChange.accept';
        }
        return 'scope' in input.target ? 'trackedChange.rejectAll' : 'trackedChange.reject';
      })();
      const target = 'id' in input.target ? { entityType: 'trackedChange' as const, entityId: input.target.id } : null;
      return runTrackedChangeCommand(command, target, () => executor.trackChanges.decide(input));
    },

    async undo(provenance?: ReviewHistoryProvenance): Promise<ReviewHistoryResult> {
      const disposedReason = ensureNotDisposed();
      if (disposedReason) return { status: 'rejected', reason: disposedReason };
      const capability = ensureCapability('history.undo');
      if (capability) return { status: 'rejected', reason: capability };
      if (!provenance?.originTxId) {
        return {
          status: 'rejected',
          reason: { code: 'review-command-unavailable', detail: 'review-provenance-missing' },
        };
      }
      let result: HistoryActionResult;
      try {
        result = await executor.history.undo();
      } catch (err) {
        return {
          status: 'rejected',
          reason: {
            code: 'review-command-unavailable',
            detail: err instanceof Error ? err.message : String(err),
          },
        };
      }
      if (result.noop) {
        return {
          status: 'rejected',
          reason: { code: 'review-command-unavailable', detail: 'review-history-noop' },
        };
      }
      if (!result.noop) {
        setLastInteractionRejection(null);
        restoreFromHistory(provenance, result);
      }
      return { status: 'ok', result };
    },

    async redo(provenance?: ReviewHistoryProvenance): Promise<ReviewHistoryResult> {
      const disposedReason = ensureNotDisposed();
      if (disposedReason) return { status: 'rejected', reason: disposedReason };
      const capability = ensureCapability('history.redo');
      if (capability) return { status: 'rejected', reason: capability };
      if (!provenance?.originTxId) {
        return {
          status: 'rejected',
          reason: { code: 'review-command-unavailable', detail: 'review-provenance-missing' },
        };
      }
      let result: HistoryActionResult;
      try {
        result = await executor.history.redo();
      } catch (err) {
        return {
          status: 'rejected',
          reason: {
            code: 'review-command-unavailable',
            detail: err instanceof Error ? err.message : String(err),
          },
        };
      }
      if (result.noop) {
        return {
          status: 'rejected',
          reason: { code: 'review-command-unavailable', detail: 'review-history-noop' },
        };
      }
      if (!result.noop) {
        setLastInteractionRejection(null);
        restoreFromHistory(provenance, result);
      }
      return { status: 'ok', result };
    },

    applyReceiptLike(input: ApplyReceiptLikeInput): void {
      if (disposed) return;
      applyReceiptLikeInternal(input);
    },

    onPaintEpochChange(epoch: number): void {
      if (disposed) return;
      if (!activeTarget) return;
      if (isTargetPainted && !isTargetPainted(activeTarget)) {
        lastInteractionRejection = buildInvalidatedReason('not-painted');
        setTarget(null);
        return;
      }
      if (!Number.isFinite(epoch)) return;
      // Refresh the captured epoch so subsequent freshness checks succeed.
      lastInteractionRejection = null;
      activeTarget = { ...activeTarget, layoutEpoch: epoch };
      emit();
    },

    shouldBlockInputEvent(eventType: DocumentInputEventKind, event?: KeyboardEvent): boolean {
      if (eventType === 'keydown') {
        // Only printable keys mutate the document body; allow navigation /
        // shortcuts to pass through for annotation hit-testing.
        return isPrintableKey(event);
      }
      return true;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      pending.clear();
      undoStack.length = 0;
      redoStack.length = 0;
      activeTarget = null;
      emit();
      listeners.clear();
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// One-way legacy compatibility mirror
// ---------------------------------------------------------------------------

/**
 * One-way compatibility mirror: forwards `activeReviewTarget` changes to the
 * legacy selection-driven `ui.comments.activeIds` / `ui.trackChanges.activeId`
 * surfaces. The returned subscription disposer does not unsubscribe the mirror
 * from listener-driven legacy state — the mirror is intentionally write-only.
 * If a legacy mirror tries to drive the authoritative target, that drive path
 * must be removed instead of being adapted to feed back into 003.
 */
export interface LegacyReviewMirrorSinks {
  setActiveComments?(ids: readonly string[]): void;
  setActiveTrackedChange?(id: string | null): void;
}

export function attachLegacyReviewMirror(adapter: ReviewStateAdapter, sinks: LegacyReviewMirrorSinks): () => void {
  const flush = (target: ActiveReviewTarget | null) => {
    if (!target) {
      sinks.setActiveComments?.([]);
      sinks.setActiveTrackedChange?.(null);
      return;
    }
    if (target.entityType === 'comment') {
      sinks.setActiveComments?.([target.entityId]);
      sinks.setActiveTrackedChange?.(null);
      return;
    }
    sinks.setActiveComments?.([]);
    sinks.setActiveTrackedChange?.(target.entityId);
  };

  flush(adapter.getActiveReviewTarget());
  return adapter.subscribe((snap) => flush(snap.activeReviewTarget));
}
