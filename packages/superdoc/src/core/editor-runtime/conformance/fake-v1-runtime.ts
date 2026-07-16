// Fake v1 runtime conformance fixture.
//
// Proves the editor-runtime contract is implementable by a v1-shaped runtime
// WITHOUT importing ProseMirror, `@superdoc/super-editor`, `PresentationEditor`,
// or any other forbidden module. The real v1 adapter (the editor runtime boundary) will delegate to
// the existing v1 internals; this fixture only proves the contract is
// satisfiable and exercises the opaque-token discipline.
//
// The "PM position" here is a plain number kept in an adapter-private map keyed
// by `tokenId`. The shell never sees it; it only ever holds the opaque token.

import type {
  EditorRuntime,
  EditorRuntimeCapabilities,
  EditorRuntimeCommand,
  EditorRuntimeCommandKind,
  EditorRuntimeCommandResult,
  EditorRuntimeDocumentMode,
  EditorRuntimeEvent,
  EditorRuntimeFindSessionSnapshot,
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

export interface FakeV1RuntimeOptions {
  id?: EditorRuntimeId;
  documentId?: string;
  root?: HTMLElement;
  initialState?: EditorRuntimeState;
  initialDocumentMode?: EditorRuntimeDocumentMode;
}

const SUPPORTED_COMMAND_KINDS: readonly EditorRuntimeCommandKind[] = [
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
  'formatting.applyMark',
  'formatting.applyParagraph',
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
];

/** Minimal stand-in for an element when no DOM root is provided (node tests). */
function fallbackRoot(): HTMLElement {
  if (typeof document !== 'undefined') return document.createElement('div');
  // Node-only path: a structurally-typed stub is enough for the contract.
  return {} as HTMLElement;
}

export function createFakeV1Runtime(options: FakeV1RuntimeOptions = {}): EditorRuntime {
  const id: EditorRuntimeId = options.id ?? 'fake-v1';
  const documentId = options.documentId ?? 'doc-v1';
  const root = options.root ?? fallbackRoot();

  let state: EditorRuntimeState = options.initialState ?? 'editing-ready';
  let documentMode: EditorRuntimeDocumentMode = options.initialDocumentMode ?? 'editing';
  let revision = 0; // bumped on every mutation; tokens carry the revision they were minted at
  let zoomPercent = 100;
  const selectionText = 'hello';
  const listeners = new Set<EditorRuntimeListener>();

  // Adapter-private store of the non-serializable internal (a "PM position").
  const positions = new Map<string, number>();
  let tokenSeq = 0;

  function mintToken(pmPos: number): EditorRuntimePositionToken {
    const tokenId = `v1-pos-${tokenSeq++}`;
    positions.set(tokenId, pmPos);
    return { runtimeId: id, tokenId, revision };
  }

  /** Returns the resolved PM position, or a rejection reason if invalid. */
  function resolveToken(
    token: EditorRuntimePositionToken,
  ): { ok: true; pos: number } | { ok: false; reason: 'wrong-runtime-token' | 'stale-position-token' } {
    if (token.runtimeId !== id) return { ok: false, reason: 'wrong-runtime-token' };
    if (token.revision !== revision || !positions.has(token.tokenId)) {
      return { ok: false, reason: 'stale-position-token' };
    }
    return { ok: true, pos: positions.get(token.tokenId)! };
  }

  function emit(event: EditorRuntimeEvent): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch {
        /* listener errors must not break dispatch */
      }
    }
  }

  function capabilities(): EditorRuntimeCapabilities {
    return {
      lifecycle: { canFocus: true, canDispose: true },
      selection: { canReadSelectedText: true, canReadSelectionSnapshot: true, canMintPositionTokens: true },
      commands: {
        canDispatch: state !== 'disposed' && state !== 'saving' && documentMode !== 'viewing',
        supportedCommands: SUPPORTED_COMMAND_KINDS,
      },
      layout: { supported: true, hasSyncSnapshot: true },
      zoom: { supported: true, min: 25, max: 400 },
      navigation: { supported: true, targets: ['position', 'page', 'search-result'] },
      persistence: { canSave: true, canExportDocx: true },
      findReplace: { supported: true, hasSyncSessionSnapshot: true, canReplace: true },
      comments: { supported: true, canMutate: true },
      trackedChanges: { supported: true, canDecide: true, canToggleAuthoring: true },
      toolbar: { supported: true, emitsStateChange: true },
    };
  }

  return {
    id,
    kind: 'v1',
    documentId,
    root,

    getCapabilities: capabilities,
    getSnapshot(): EditorRuntimeSnapshot {
      return { id, kind: 'v1', documentId, state, documentMode, capabilities: capabilities() };
    },
    setDocumentMode(mode: EditorRuntimeDocumentMode): void {
      documentMode = mode;
    },
    getDocumentMode(): EditorRuntimeDocumentMode {
      return documentMode;
    },
    getLegacyEditorProjection() {
      // v1 returns its legacy editor here; the fixture returns an inert marker.
      return { legacy: 'v1-editor', commands: {}, state: {}, view: {} };
    },

    async focus(_options?: EditorRuntimeFocusOptions): Promise<boolean> {
      return true;
    },
    dispose(): void {
      state = 'disposed';
      emit({ type: 'disposed' });
      listeners.clear();
      positions.clear();
    },

    async dispatch(command: EditorRuntimeCommand): Promise<EditorRuntimeCommandResult> {
      if (state === 'disposed') return { status: 'rejected', reason: 'runtime-not-ready' };
      if (state === 'saving') return { status: 'rejected', reason: 'host-saving' };
      if (documentMode === 'viewing') return { status: 'rejected', reason: 'document-readonly' };

      // Demonstrate opaque-token round-trip + staleness for positioned commands.
      const token = 'at' in command ? command.at : 'range' in command ? command.range : undefined;
      if (token) {
        const resolved = resolveToken(token);
        if (!resolved.ok) return { status: 'rejected', reason: resolved.reason };
      }

      switch (command.kind) {
        case 'history.undo':
          if (revision === 0) return { status: 'history-noop', reason: 'nothing-to-undo' };
          revision -= 1;
          return { status: 'history-committed' };
        case 'history.redo':
          return { status: 'history-noop', reason: 'nothing-to-redo' };
        case 'text.insert':
        case 'text.replace':
        case 'text.paste':
          revision += 1;
          return { status: 'committed', receipt: { revision } };
        case 'text.deleteBackward':
        case 'text.deleteForward':
          revision += 1;
          return { status: 'committed', receipt: { revision } };
        case 'formatting.applyMark':
        case 'formatting.applyParagraph':
        case 'structural.splitBlock':
        case 'structural.indent':
        case 'structural.outdent':
        case 'comments.create':
        case 'comments.resolve':
        case 'comments.reopen':
        case 'comments.delete':
        case 'comments.reply':
        case 'comments.edit':
        case 'trackedChanges.accept':
        case 'trackedChanges.reject':
        case 'trackedChanges.acceptAll':
        case 'trackedChanges.rejectAll':
          revision += 1;
          return { status: 'committed', receipt: { revision } };
        case 'trackedChanges.setAuthoringMode':
          documentMode = command.mode === 'tracked' ? 'suggesting' : 'editing';
          return { status: 'committed', receipt: { revision } };
        default:
          return { status: 'rejected', reason: 'command-unsupported' };
      }
    },

    getSelectedText(): string {
      return selectionText;
    },
    getSelectionSnapshot(): EditorRuntimeSelectionSnapshot | null {
      const isEmpty = selectionText.length === 0;
      return {
        isRange: !isEmpty,
        isEmpty,
        text: selectionText,
        anchor: mintToken(1),
        focus: mintToken(1 + selectionText.length),
      };
    },
    getFindSessionSnapshot(): EditorRuntimeFindSessionSnapshot | null {
      return { active: false, query: '', matchCount: 0, activeMatchIndex: -1 };
    },
    getToolbarState(): EditorRuntimeToolbarState | null {
      return { activeMarks: [], disabled: [] };
    },
    getLayoutSnapshot(): EditorRuntimeLayoutSnapshot | null {
      return { pageCount: 1, currentPage: 1, zoom: zoomPercent };
    },

    async save(): Promise<ArrayBuffer> {
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
      if (target.kind === 'comment') return { status: 'rejected', reason: 'target-unsupported' };
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
