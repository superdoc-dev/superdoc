// Fake v2 runtime conformance fixture.
//
// Proves the editor-runtime contract is implementable by a v2-shaped runtime
// WITHOUT importing the concrete v2 host (`create-v2-editor-host.ts`),
// `SDPosition`/`SDRange`, or Document API internals. It mirrors the current v2
// host outcome posture  -  committed / history-committed / history-noop /
// receipt-failure / named rejection  -  onto the neutral contract codes, and shows
// `author-required` gating plus the `blocked`/`review-ready` lifecycle states.
//
// The "SDPosition" here is a plain shell-local object kept in an adapter-private
// map keyed by `tokenId`. The shell only ever holds the opaque token.

import type {
  EditorRuntime,
  EditorRuntimeCapabilities,
  EditorRuntimeCommand,
  EditorRuntimeCommandResult,
  EditorRuntimeEvent,
  EditorRuntimeFocusOptions,
  EditorRuntimeId,
  EditorRuntimeLayoutSnapshot,
  EditorRuntimeListener,
  EditorRuntimeNavigationTarget,
  EditorRuntimePositionToken,
  EditorRuntimeSelectionSnapshot,
  EditorRuntimeSnapshot,
  EditorRuntimeState,
  EditorRuntimeToolbarState,
  EditorRuntimeUnsubscribe,
} from '../index.js';

/** Adapter-private fake "SDPosition". Never exposed to the shell. */
interface FakeSdPosition {
  readonly blockId: string;
  readonly blockOffset: number;
}

export interface FakeV2RuntimeOptions {
  id?: EditorRuntimeId;
  documentId?: string;
  root?: HTMLElement;
  /** Initial lifecycle state; defaults to `review-ready` like a freshly opened host. */
  initialState?: EditorRuntimeState;
  /** When false, comment mutation rejects with `author-required`. */
  authorPresent?: boolean;
  /**
   * When true, `getLegacyEditorProjection()` returns `null` instead of a
   * v2-shaped facade. Proves the shell fails closed for a non-null active
   * runtime that exposes NO legacy projection at all (distinct from the
   * `commands: null` facade case).
   */
  nullLegacyProjection?: boolean;
}

function fallbackRoot(): HTMLElement {
  if (typeof document !== 'undefined') return document.createElement('div');
  return {} as HTMLElement;
}

export function createFakeV2Runtime(options: FakeV2RuntimeOptions = {}): EditorRuntime {
  const id: EditorRuntimeId = options.id ?? 'fake-v2';
  const documentId = options.documentId ?? 'doc-v2';
  const root = options.root ?? fallbackRoot();
  const authorPresent = options.authorPresent ?? true;
  const nullLegacyProjection = options.nullLegacyProjection ?? false;

  let state: EditorRuntimeState = options.initialState ?? 'review-ready';
  let epoch = 0; // staleness discriminator, like a v2 receipt epoch
  let zoomPercent = 100;
  const listeners = new Set<EditorRuntimeListener>();

  const positions = new Map<string, FakeSdPosition>();
  let tokenSeq = 0;

  function mintToken(pos: FakeSdPosition): EditorRuntimePositionToken {
    const tokenId = `v2-pos-${tokenSeq++}`;
    positions.set(tokenId, pos);
    // Structured-clone-safe payload carries only a presence marker, not internals.
    return { runtimeId: id, tokenId, revision: epoch, payload: { kind: 'sd-position' } };
  }

  function resolveToken(
    token: EditorRuntimePositionToken,
  ): { ok: true; pos: FakeSdPosition } | { ok: false; reason: 'wrong-runtime-token' | 'stale-position-token' } {
    if (token.runtimeId !== id) return { ok: false, reason: 'wrong-runtime-token' };
    if (token.revision !== epoch || !positions.has(token.tokenId)) {
      return { ok: false, reason: 'stale-position-token' };
    }
    return { ok: true, pos: positions.get(token.tokenId)! };
  }

  function emit(event: EditorRuntimeEvent): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }

  function ready(): boolean {
    return state === 'review-ready' || state === 'editing-ready';
  }

  function capabilities(): EditorRuntimeCapabilities {
    return {
      lifecycle: { canFocus: true, canDispose: true },
      selection: { canReadSelectedText: true, canReadSelectionSnapshot: true, canMintPositionTokens: true },
      commands: {
        canDispatch: ready(),
        // v2 initial supported supported subset (formatting is fail-closed today).
        supportedCommands: [
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
          'trackedChanges.setAuthoringMode',
        ],
      },
      layout: { supported: true, hasSyncSnapshot: true },
      zoom: { supported: true, min: 25, max: 400 },
      navigation: { supported: true, targets: ['position', 'page', 'comment'] },
      persistence: { canSave: true, canExportDocx: true },
      // v2 find/replace + AI are genuinely absent today: reported unsupported.
      findReplace: { supported: false, hasSyncSessionSnapshot: false, canReplace: false },
      ai: { supported: false },
      comments: { supported: true, canMutate: authorPresent },
      trackedChanges: { supported: true, canDecide: true, canToggleAuthoring: true },
      toolbar: { supported: true, emitsStateChange: true },
    };
  }

  function isCommentMutation(kind: EditorRuntimeCommand['kind']): boolean {
    return kind.startsWith('comments.');
  }

  return {
    id,
    kind: 'v2',
    documentId,
    root,

    getCapabilities: capabilities,
    getSnapshot(): EditorRuntimeSnapshot {
      return {
        id,
        kind: 'v2',
        documentId,
        state,
        reason: state === 'blocked' ? 'worker-mode-deferred' : undefined,
        capabilities: capabilities(),
      };
    },
    getLegacyEditorProjection() {
      // Null-projection variant: a v2-shaped runtime that exposes no legacy
      // projection at all. The shell must fail closed on this just like the
      // `commands: null` facade.
      if (nullLegacyProjection) return null;
      // v2 returns its facade with commands/state/view: null plus adapters.
      return { commands: null, state: null, view: null, editorVersion: 2 };
    },

    async focus(_options?: EditorRuntimeFocusOptions): Promise<boolean> {
      return ready();
    },
    async dispose(): Promise<void> {
      state = 'disposed';
      emit({ type: 'disposed' });
      listeners.clear();
      positions.clear();
    },

    async dispatch(command: EditorRuntimeCommand): Promise<EditorRuntimeCommandResult> {
      if (state === 'disposed') return { status: 'rejected', reason: 'runtime-not-ready' };
      if (state === 'saving') return { status: 'rejected', reason: 'host-saving' };
      if (!ready()) return { status: 'rejected', reason: 'runtime-not-ready' };

      if (!capabilities().commands.supportedCommands.includes(command.kind)) {
        return { status: 'rejected', reason: 'command-unsupported' };
      }

      const token = 'at' in command ? command.at : 'range' in command ? command.range : undefined;
      if (token) {
        const resolved = resolveToken(token);
        if (!resolved.ok) return { status: 'rejected', reason: resolved.reason };
      }

      if (isCommentMutation(command.kind) && !authorPresent) {
        return { status: 'rejected', reason: 'author-required' };
      }

      switch (command.kind) {
        case 'history.undo':
          if (epoch === 0) return { status: 'history-noop', reason: 'nothing-to-undo' };
          epoch -= 1;
          return { status: 'history-committed' };
        case 'history.redo':
          return { status: 'history-noop', reason: 'nothing-to-redo' };
        default: {
          // Mirror a v2 receipt commit; demonstrate receipt-failure path too.
          epoch += 1;
          if (command.kind === 'text.insert' && command.text === '__FORCE_RECEIPT_FAILURE__') {
            epoch -= 1;
            return { status: 'receipt-failure', failure: { code: 'PRECONDITION_FAILED' } };
          }
          return { status: 'committed', receipt: { epoch } };
        }
      }
    },

    getSelectedText(): string {
      return '';
    },
    getSelectionSnapshot(): EditorRuntimeSelectionSnapshot | null {
      if (!ready()) return null;
      return {
        isRange: false,
        isEmpty: true,
        text: '',
        anchor: mintToken({ blockId: 'b1', blockOffset: 0 }),
        focus: mintToken({ blockId: 'b1', blockOffset: 0 }),
      };
    },
    // v2 has no find/replace today: no getFindSessionSnapshot accessor.
    getToolbarState(): EditorRuntimeToolbarState | null {
      return { activeMarks: [], disabled: ['formatting.applyMark'] };
    },
    getLayoutSnapshot(): EditorRuntimeLayoutSnapshot | null {
      return { pageCount: 1, currentPage: 1, zoom: zoomPercent };
    },

    async save(): Promise<ArrayBuffer> {
      if (state === 'disposed') throw new Error('HostDisposedError');
      const prev = state;
      state = 'saving';
      emit({ type: 'state-change', state });
      state = prev;
      emit({ type: 'state-change', state });
      return new ArrayBuffer(0);
    },
    async exportDocx(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },

    async setZoom(percent: number): Promise<EditorRuntimeCommandResult> {
      if (percent < 25 || percent > 400) return { status: 'rejected', reason: 'target-unsupported' };
      zoomPercent = percent;
      emit({ type: 'layout-change', layout: { pageCount: 1, currentPage: 1, zoom: zoomPercent } });
      return { status: 'committed' };
    },
    async reveal(target: EditorRuntimeNavigationTarget): Promise<EditorRuntimeCommandResult> {
      if (target.kind === 'search-result') return { status: 'rejected', reason: 'capability-unsupported' };
      if (target.kind === 'position') {
        const resolved = resolveToken(target.position);
        if (!resolved.ok) return { status: 'rejected', reason: resolved.reason };
      }
      return { status: 'committed' };
    },

    subscribe(listener: EditorRuntimeListener): EditorRuntimeUnsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
