import type {
  EditorRuntime,
  EditorRuntimeCapabilities,
  EditorRuntimeCommand,
  EditorRuntimeCommandKind,
  EditorRuntimeCommandResult,
  EditorRuntimeDocumentMode,
  EditorRuntimeEvent,
  EditorRuntimeExportOptions,
  EditorRuntimeFocusOptions,
  EditorRuntimeId,
  EditorRuntimeLayoutSnapshot,
  EditorRuntimeListener,
  EditorRuntimeNavigationTarget,
  EditorRuntimePositionToken,
  EditorRuntimeRejectionCode,
  EditorRuntimeSelectionSnapshot,
  EditorRuntimeSnapshot,
  EditorRuntimeState,
  EditorRuntimeToolbarState,
  EditorRuntimeUnsubscribe,
} from '../index.js';

type HostLifecycleState = 'opening' | 'blocked' | 'ready' | 'saving' | 'disposed' | 'failed';

type HostCommandKind =
  | 'text.insert'
  | 'text.replace'
  | 'text.deleteBackward'
  | 'text.deleteForward'
  | 'text.pastePlain'
  | 'history.undo'
  | 'history.redo'
  | 'structural.enter'
  | 'structural.listIndent'
  | 'structural.listOutdent'
  | 'comments.createFromSelection'
  | 'review.commentReply'
  | 'review.commentEdit'
  | 'review.commentResolve'
  | 'review.commentReopen'
  | 'review.commentDelete'
  | 'review.trackedChangeDecide';

interface HostCommandSupportRecordLike {
  readonly command: HostCommandKind | string;
  readonly status: 'supported' | 'unsupported';
}

interface HostSelectionStateLike {
  readonly anchor: unknown;
  readonly focus: unknown;
}

interface HostSelectionControllerLike {
  getSnapshot(): HostSelectionStateLike | null;
  subscribe(listener: (snapshot: HostSelectionStateLike | null) => void): () => void;
}

interface HostHandlesLike {
  readonly editing: {
    readonly selection: HostSelectionControllerLike;
  } | null;
}

interface HostEditableSubsetSnapshotLike {
  readonly editingMounted: boolean;
  readonly commands: readonly HostCommandSupportRecordLike[];
}

interface HostSnapshotLike {
  readonly state: HostLifecycleState;
  readonly documentMode: EditorRuntimeDocumentMode;
  readonly reason?: string;
  readonly detail?: string;
  readonly commentCommandsReason?: 'author-required' | null;
  readonly editableSubset: HostEditableSubsetSnapshotLike;
}

interface HostDispatchRejectionLike {
  readonly code: string;
  readonly detail?: string;
}

type HostDispatchResultLike =
  | { readonly status: 'committed'; readonly receipt?: unknown }
  | { readonly status: 'history-committed'; readonly result?: unknown }
  | { readonly status: 'history-noop'; readonly result?: { readonly reason?: string } }
  | { readonly status: 'receipt-failure'; readonly failure?: unknown }
  | { readonly status: 'rejected'; readonly rejection: HostDispatchRejectionLike };

type HostCommandLike =
  | { readonly kind: 'text.insert'; readonly text: string }
  | { readonly kind: 'text.replace'; readonly text: string }
  | { readonly kind: 'text.deleteBackward' }
  | { readonly kind: 'text.deleteForward' }
  | { readonly kind: 'text.pastePlain'; readonly text: string }
  | { readonly kind: 'history.undo' }
  | { readonly kind: 'history.redo' }
  | { readonly kind: 'structural.enter' }
  | { readonly kind: 'structural.listIndent' }
  | { readonly kind: 'structural.listOutdent' }
  | { readonly kind: 'comments.createFromSelection'; readonly text: string }
  | { readonly kind: 'review.commentReply'; readonly parentCommentId: string; readonly text: string }
  | { readonly kind: 'review.commentEdit'; readonly commentId: string; readonly text: string }
  | { readonly kind: 'review.commentResolve'; readonly commentId: string }
  | { readonly kind: 'review.commentReopen'; readonly commentId: string }
  | { readonly kind: 'review.commentDelete'; readonly commentId: string }
  | {
      readonly kind: 'review.trackedChangeDecide';
      readonly input: {
        readonly decision: 'accept' | 'reject';
        readonly target: { readonly id: string } | { readonly scope: 'all' };
      };
    };

interface HostPageMetricsSnapshotLike {
  readonly pages: readonly unknown[];
  readonly zoom: {
    readonly percent: number;
  };
}

interface HostSetZoomResultLike {
  readonly status: 'ok' | 'rejected';
  readonly reason?: string;
}

interface HostFocusHandleLike {
  focus?(options?: unknown): boolean | void | Promise<boolean | void>;
}

interface HostMountHandleLike {
  readonly focus: HostFocusHandleLike | null;
}

interface ModeAwareHostLike {
  getSnapshot(): HostSnapshotLike;
  subscribe(listener: (snapshot: HostSnapshotLike) => void): () => void;
  getDocumentMode(): EditorRuntimeDocumentMode;
  setDocumentMode(mode: EditorRuntimeDocumentMode): void;
  dispatch(command: HostCommandLike): Promise<HostDispatchResultLike>;
  save(options?: { format?: 'docx' }): Promise<ArrayBuffer>;
  dispose(): Promise<void>;
  getHandles(): HostHandlesLike;
  getPageMetricsSnapshot(): HostPageMetricsSnapshotLike;
  subscribePageMetrics?(listener: (snapshot: HostPageMetricsSnapshotLike) => void): () => void;
  setZoom(percent: number): HostSetZoomResultLike;
}

export interface V2EditorRuntimeAdapterOptions {
  readonly id: EditorRuntimeId;
  readonly documentId: string;
  readonly root: HTMLElement;
  readonly host: ModeAwareHostLike;
  readonly onUnregister?: (id: EditorRuntimeId) => void;
}

const TEXT_AND_STRUCTURE_COMMANDS: readonly EditorRuntimeCommandKind[] = [
  'text.insert',
  'text.replace',
  'text.deleteBackward',
  'text.deleteForward',
  'text.paste',
  'history.undo',
  'history.redo',
  'structural.splitBlock',
  'structural.indent',
  'structural.outdent',
];

const REVIEW_COMMANDS: readonly EditorRuntimeCommandKind[] = [
  'comments.create',
  'comments.resolve',
  'comments.reopen',
  'comments.delete',
  'comments.reply',
  'comments.edit',
  'trackedChanges.accept',
  'trackedChanges.reject',
  'trackedChanges.acceptAll',
  'trackedChanges.rejectAll',
];

const ALWAYS_SUPPORTED_COMMANDS: readonly EditorRuntimeCommandKind[] = ['trackedChanges.setAuthoringMode'];

function mapLifecycleState(snapshot: HostSnapshotLike): EditorRuntimeState {
  if (snapshot.state !== 'ready') return snapshot.state;
  return snapshot.documentMode === 'viewing' ? 'review-ready' : 'editing-ready';
}

function commandKindForSupport(kind: EditorRuntimeCommandKind): HostCommandKind | null {
  switch (kind) {
    case 'text.insert':
      return 'text.insert';
    case 'text.replace':
      return 'text.replace';
    case 'text.deleteBackward':
      return 'text.deleteBackward';
    case 'text.deleteForward':
      return 'text.deleteForward';
    case 'text.paste':
      return 'text.pastePlain';
    case 'history.undo':
      return 'history.undo';
    case 'history.redo':
      return 'history.redo';
    case 'structural.splitBlock':
      return 'structural.enter';
    case 'structural.indent':
      return 'structural.listIndent';
    case 'structural.outdent':
      return 'structural.listOutdent';
    case 'comments.create':
      return 'comments.createFromSelection';
    case 'comments.resolve':
      return 'review.commentResolve';
    case 'comments.reopen':
      return 'review.commentReopen';
    case 'comments.delete':
      return 'review.commentDelete';
    case 'comments.reply':
      return 'review.commentReply';
    case 'comments.edit':
      return 'review.commentEdit';
    case 'trackedChanges.accept':
    case 'trackedChanges.reject':
    case 'trackedChanges.acceptAll':
    case 'trackedChanges.rejectAll':
      return 'review.trackedChangeDecide';
    default:
      return null;
  }
}

function historyNoopReason(
  kind: EditorRuntimeCommand['kind'],
  result: unknown,
): 'nothing-to-undo' | 'nothing-to-redo' | 'no-effect' {
  const rawReason = (result as { reason?: string } | null | undefined)?.reason;
  if (kind === 'history.undo') {
    return rawReason === 'NO_EFFECT' || rawReason === 'apply-rejected' ? 'no-effect' : 'nothing-to-undo';
  }
  return rawReason === 'NO_EFFECT' || rawReason === 'apply-rejected' ? 'no-effect' : 'nothing-to-redo';
}

function rejectionCode(code: string): EditorRuntimeRejectionCode {
  switch (code) {
    case 'host-saving':
      return 'host-saving';
    case 'document-readonly':
      return 'document-readonly';
    case 'selection-invalidated':
    case 'review-target-invalidated':
      return 'selection-invalidated';
    case 'review-command-unavailable':
      return 'review-command-unavailable';
    case 'review-surface-read-only':
      return 'document-readonly';
    case 'editing-selection-required':
      return 'selection-unsupported';
    case 'format-target-unsupported':
    case 'selection-target-unsupported':
    case 'input-target-unsupported':
    case 'composition-target-unsupported':
    case 'enter-context-unsupported':
    case 'boundary-merge-unsupported':
    case 'tracked-structural-edit-unsupported':
    case 'comment-anchor-create-unsupported':
    case 'comment-anchor-move-unsupported':
      return 'target-unsupported';
    case 'unsupported-command':
      return 'command-unsupported';
    case 'editing-mount-required':
    case 'host-not-ready':
    case 'host-disposed':
      return 'runtime-not-ready';
    default:
      return 'command-failed';
  }
}

export function createV2EditorRuntimeAdapter(options: V2EditorRuntimeAdapterOptions): {
  runtime: EditorRuntime;
  attachMountHandle(handle: HostMountHandleLike | null): void;
} {
  const { id, documentId, root, host, onUnregister } = options;

  let snapshot = host.getSnapshot();
  let didDispose = false;
  let unregistered = false;
  let mountedFocusHandle: HostMountHandleLike | null = null;
  let tokenRevision = 0;
  let tokenSeq = 0;
  let selectionUnsubscribe: (() => void) | null = null;
  let hostUnsubscribe: (() => void) | null = null;
  let pageMetricsUnsubscribe: (() => void) | null = null;
  let activeSelectionController: HostSelectionControllerLike | null = null;
  const positionTokens = new Map<string, unknown>();
  const listeners = new Set<EditorRuntimeListener>();

  function emit(event: EditorRuntimeEvent): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch {
        /* listener errors must not break the runtime */
      }
    }
  }

  function invalidatePositionTokens(): void {
    tokenRevision += 1;
    positionTokens.clear();
  }

  function mintToken(marker: unknown): EditorRuntimePositionToken {
    const tokenId = `v2-runtime-pos-${tokenSeq++}`;
    positionTokens.set(tokenId, marker);
    return { runtimeId: id, tokenId, revision: tokenRevision };
  }

  function resolveToken(
    token: EditorRuntimePositionToken,
  ): { ok: true } | { ok: false; reason: 'wrong-runtime-token' | 'stale-position-token' } {
    if (token.runtimeId !== id) return { ok: false, reason: 'wrong-runtime-token' };
    if (token.revision !== tokenRevision || !positionTokens.has(token.tokenId)) {
      return { ok: false, reason: 'stale-position-token' };
    }
    return { ok: true };
  }

  function selectionController(): HostSelectionControllerLike | null {
    return host.getHandles().editing?.selection ?? null;
  }

  function selectionSnapshot(): EditorRuntimeSelectionSnapshot | null {
    const current = selectionController()?.getSnapshot() ?? null;
    if (!current) return null;
    return {
      isRange: current.anchor !== current.focus,
      isEmpty: current.anchor === current.focus,
      text: '',
      anchor: mintToken(current.anchor),
      focus: mintToken(current.focus),
    };
  }

  function syncSelectionSubscription(): void {
    const next = selectionController();
    if (next === activeSelectionController) return;
    selectionUnsubscribe?.();
    selectionUnsubscribe = null;
    activeSelectionController = next;
    if (!next) return;
    selectionUnsubscribe = next.subscribe((current) => {
      invalidatePositionTokens();
      const mapped = current
        ? {
            isRange: current.anchor !== current.focus,
            isEmpty: current.anchor === current.focus,
            text: '',
            anchor: mintToken(current.anchor),
            focus: mintToken(current.focus),
          }
        : {
            isRange: false,
            isEmpty: true,
            text: '',
          };
      emit({ type: 'selection-change', selection: mapped });
    });
  }

  function supportedCommands(current: HostSnapshotLike): readonly EditorRuntimeCommandKind[] {
    if (current.state !== 'ready') return [];
    const supported = new Set(
      current.editableSubset.commands.filter((entry) => entry.status === 'supported').map((entry) => entry.command),
    );
    const runtimeKinds = [...TEXT_AND_STRUCTURE_COMMANDS, ...REVIEW_COMMANDS].filter((kind) => {
      const mapped = commandKindForSupport(kind);
      return mapped !== null && supported.has(mapped);
    });
    return [...runtimeKinds, ...ALWAYS_SUPPORTED_COMMANDS];
  }

  function capabilities(current: HostSnapshotLike = snapshot): EditorRuntimeCapabilities {
    const canFocus = current.state !== 'disposed';
    const availableCommands = supportedCommands(current);
    return {
      lifecycle: { canFocus, canDispose: true },
      selection: {
        canReadSelectedText: true,
        canReadSelectionSnapshot: true,
        canMintPositionTokens: true,
      },
      commands: {
        canDispatch: current.state === 'ready' && availableCommands.length > 0,
        supportedCommands: availableCommands,
      },
      layout: { supported: true, hasSyncSnapshot: true },
      zoom: { supported: true, min: 25, max: 400 },
      navigation: { supported: false, targets: [] },
      persistence: { canSave: true, canExportDocx: true },
      comments: {
        supported: true,
        canMutate: current.commentCommandsReason !== 'author-required',
      },
      trackedChanges: {
        supported: true,
        canDecide: current.state === 'ready',
        canToggleAuthoring: current.state === 'ready',
      },
    };
  }

  function currentLayoutSnapshot(): EditorRuntimeLayoutSnapshot {
    const pageMetrics = host.getPageMetricsSnapshot();
    return {
      pageCount: pageMetrics.pages.length,
      currentPage: 1,
      zoom: pageMetrics.zoom.percent,
    };
  }

  function runtimeSnapshot(current: HostSnapshotLike = snapshot): EditorRuntimeSnapshot {
    return {
      id,
      kind: 'v2',
      documentId,
      state: mapLifecycleState(current),
      documentMode: current.documentMode,
      reason: current.reason,
      capabilities: capabilities(current),
    };
  }

  function handleHostSnapshot(next: HostSnapshotLike): void {
    snapshot = next;
    invalidatePositionTokens();
    syncSelectionSubscription();
    emit({ type: 'state-change', state: mapLifecycleState(next) });
    emit({ type: 'capabilities-change', capabilities: capabilities(next) });
    if (next.state === 'disposed' && !didDispose) {
      didDispose = true;
      hostUnsubscribe?.();
      pageMetricsUnsubscribe?.();
      selectionUnsubscribe?.();
      selectionUnsubscribe = null;
      emit({ type: 'disposed' });
      listeners.clear();
      if (!unregistered) {
        unregistered = true;
        onUnregister?.(id);
      }
    }
  }

  hostUnsubscribe = host.subscribe(handleHostSnapshot);
  pageMetricsUnsubscribe =
    host.subscribePageMetrics?.(() => {
      emit({ type: 'layout-change', layout: currentLayoutSnapshot() });
    }) ?? null;
  syncSelectionSubscription();

  async function dispatch(command: EditorRuntimeCommand): Promise<EditorRuntimeCommandResult> {
    if (snapshot.state === 'disposed') return { status: 'rejected', reason: 'runtime-not-ready' };
    if (snapshot.state === 'saving') return { status: 'rejected', reason: 'host-saving' };
    if (snapshot.state !== 'ready') return { status: 'rejected', reason: 'runtime-not-ready' };

    const token = 'at' in command ? command.at : 'range' in command ? command.range : undefined;
    if (token) {
      const resolved = resolveToken(token);
      if (!resolved.ok) return { status: 'rejected', reason: resolved.reason };
      return {
        status: 'rejected',
        reason: 'target-unsupported',
        detail: 'positioned dispatch is deferred until the shared runtime can target host selections explicitly',
      };
    }

    if (command.kind === 'trackedChanges.setAuthoringMode') {
      host.setDocumentMode(command.mode === 'tracked' ? 'suggesting' : 'editing');
      invalidatePositionTokens();
      return { status: 'committed' };
    }

    let mapped: HostCommandLike | null = null;
    switch (command.kind) {
      case 'text.insert':
        mapped = { kind: 'text.insert', text: command.text };
        break;
      case 'text.replace':
        mapped = { kind: 'text.replace', text: command.text };
        break;
      case 'text.deleteBackward':
        mapped = { kind: 'text.deleteBackward' };
        break;
      case 'text.deleteForward':
        mapped = { kind: 'text.deleteForward' };
        break;
      case 'text.paste':
        mapped = { kind: 'text.pastePlain', text: command.text };
        break;
      case 'history.undo':
        mapped = { kind: 'history.undo' };
        break;
      case 'history.redo':
        mapped = { kind: 'history.redo' };
        break;
      case 'structural.splitBlock':
        mapped = { kind: 'structural.enter' };
        break;
      case 'structural.indent':
        mapped = { kind: 'structural.listIndent' };
        break;
      case 'structural.outdent':
        mapped = { kind: 'structural.listOutdent' };
        break;
      case 'comments.create':
        mapped = { kind: 'comments.createFromSelection', text: command.text };
        break;
      case 'comments.resolve':
        mapped = { kind: 'review.commentResolve', commentId: command.commentId };
        break;
      case 'comments.reopen':
        mapped = { kind: 'review.commentReopen', commentId: command.commentId };
        break;
      case 'comments.delete':
        mapped = { kind: 'review.commentDelete', commentId: command.commentId };
        break;
      case 'comments.reply':
        mapped = { kind: 'review.commentReply', parentCommentId: command.parentCommentId, text: command.text };
        break;
      case 'comments.edit':
        mapped = { kind: 'review.commentEdit', commentId: command.commentId, text: command.text };
        break;
      case 'trackedChanges.accept':
        mapped = {
          kind: 'review.trackedChangeDecide',
          input: { decision: 'accept', target: { id: command.id } },
        };
        break;
      case 'trackedChanges.reject':
        mapped = {
          kind: 'review.trackedChangeDecide',
          input: { decision: 'reject', target: { id: command.id } },
        };
        break;
      case 'trackedChanges.acceptAll':
        mapped = {
          kind: 'review.trackedChangeDecide',
          input: { decision: 'accept', target: { scope: 'all' } },
        };
        break;
      case 'trackedChanges.rejectAll':
        mapped = {
          kind: 'review.trackedChangeDecide',
          input: { decision: 'reject', target: { scope: 'all' } },
        };
        break;
      default:
        return { status: 'rejected', reason: 'command-unsupported', detail: command.kind };
    }

    const result = await host.dispatch(mapped);
    switch (result.status) {
      case 'committed':
        invalidatePositionTokens();
        return { status: 'committed', receipt: result.receipt };
      case 'history-committed':
        invalidatePositionTokens();
        return { status: 'history-committed', result: result.result };
      case 'history-noop':
        return {
          status: 'history-noop',
          reason: historyNoopReason(command.kind, result.result),
          result: result.result,
        };
      case 'receipt-failure':
        return { status: 'receipt-failure', failure: result.failure };
      case 'rejected':
        return {
          status: 'rejected',
          reason: rejectionCode(result.rejection.code),
          detail: result.rejection.detail,
        };
    }
  }

  async function focus(options?: EditorRuntimeFocusOptions): Promise<boolean> {
    if (didDispose || snapshot.state === 'disposed') return false;
    const focusController = mountedFocusHandle?.focus;
    if (focusController && typeof focusController.focus === 'function') {
      const focused = await focusController.focus({
        restoreSelection: options?.restoreSelection,
        preventScroll: options?.preventScroll,
      });
      return focused !== false;
    }
    if (typeof root.focus === 'function') {
      root.focus({ preventScroll: options?.preventScroll });
      return true;
    }
    return false;
  }

  async function dispose(): Promise<void> {
    if (didDispose) return;
    await host.dispose();
    if (!didDispose) {
      didDispose = true;
      hostUnsubscribe?.();
      pageMetricsUnsubscribe?.();
      selectionUnsubscribe?.();
      selectionUnsubscribe = null;
      emit({ type: 'disposed' });
      listeners.clear();
      if (!unregistered) {
        unregistered = true;
        onUnregister?.(id);
      }
    }
  }

  const runtime: EditorRuntime = {
    id,
    kind: 'v2',
    documentId,
    root,

    getCapabilities: () => capabilities(),
    getSnapshot: () => runtimeSnapshot(),
    setDocumentMode(mode) {
      host.setDocumentMode(mode);
    },
    getDocumentMode: () => host.getDocumentMode(),
    getLegacyEditorProjection: () => ({ editorVersion: 2, commands: null, state: null, view: null }),

    focus,
    dispose,

    dispatch,

    getSelectedText: () => '',
    getSelectionSnapshot: selectionSnapshot,
    getToolbarState(): EditorRuntimeToolbarState | null {
      return { activeMarks: [], disabled: ['formatting.applyMark', 'formatting.applyParagraph'] };
    },
    getLayoutSnapshot: currentLayoutSnapshot,

    save: () => host.save(),
    exportDocx: (_options?: EditorRuntimeExportOptions) => host.save({ format: 'docx' }),

    async setZoom(percent) {
      const result = host.setZoom(percent);
      if (result.status === 'ok') return { status: 'committed' };
      return {
        status: 'rejected',
        reason: result.reason === 'host-disposed' ? 'runtime-not-ready' : 'target-unsupported',
        detail: result.reason,
      };
    },
    async reveal(target: EditorRuntimeNavigationTarget) {
      if (target.kind === 'position') {
        const resolved = resolveToken(target.position);
        if (!resolved.ok) return { status: 'rejected', reason: resolved.reason };
      }
      return {
        status: 'rejected',
        reason: 'capability-unsupported',
        detail: `${target.kind} reveal is not exposed through the shared runtime yet`,
      };
    },

    subscribe(listener: EditorRuntimeListener): EditorRuntimeUnsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    runtime,
    attachMountHandle(handle) {
      mountedFocusHandle = handle;
      syncSelectionSubscription();
    },
  };
}
