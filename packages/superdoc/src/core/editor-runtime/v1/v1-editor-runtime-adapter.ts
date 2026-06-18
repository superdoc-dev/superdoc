// Real v1 editor runtime adapter.
//
// This is a BEHAVIOR-PRESERVING adapter, not a rewrite. It wraps the existing
// v1 `Editor` and (once ready) its visible `PresentationEditor`, and exposes
// them through the shell-owned `EditorRuntime` contract so shared shell
// consumers can move behind runtime capabilities. v1 continues to own ProseMirror
// state, hidden-editor focus, input events, position mapping, toolbar state,
// link handling, images, tables, header/footer sessions, drag/drop, and IME.
//
// Boundary rules (the runtime contract, enforced by `../import-boundary.test.ts`):
// This module lives under `core/editor-runtime/`, which is import-scanned.
//     It therefore NEVER imports `@superdoc/super-editor`, the concrete v1
//     `Editor`/`PresentationEditor`, ProseMirror, or any v2/Document-API
//     internals. Instead it talks to the v1 surfaces through the minimal
//     STRUCTURAL interfaces below. The concrete v1 instances are injected by the
//     shell (`SuperDoc.vue`), which is free to reference v1 types directly.
// Position tokens are opaque. The adapter keeps the non-serializable PM
//     position in an adapter-private map keyed by `tokenId`; the shell only ever
//     holds the opaque {@link EditorRuntimePositionToken}.
//
// IME note : the adapter must NOT touch the hidden editor's
// composition/input bridge. IME stays owned by the existing PM composition path
// inside `EditorInputManager`; this adapter only reads state, forwards focus,
// and dispatches through the existing `editor.commands` surface.

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
  EditorRuntimeSelectionSnapshot,
  EditorRuntimeSnapshot,
  EditorRuntimeState,
  EditorRuntimeToolbarState,
  EditorRuntimeUnsubscribe,
} from '../index.js';

// ---------------------------------------------------------------------------
// Minimal STRUCTURAL v1 surfaces (no concrete v1 imports  -  boundary rule)
// ---------------------------------------------------------------------------

/** Event on/off surface shared by the v1 `Editor` and `PresentationEditor`. */
export interface V1EventTargetLike {
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

/** The subset of the PM document the adapter reads (selected-text only). */
export interface V1DocLike {
  textBetween(from: number, to: number, blockSeparator?: string, leafText?: string): string;
}

/** The subset of the PM editor state the adapter reads. */
export interface V1EditorStateLike {
  doc: V1DocLike;
  selection: { from: number; to: number; empty?: boolean };
}

/** The subset of the v1 `Editor` the adapter delegates to. */
export interface V1EditorLike extends V1EventTargetLike {
  options?: { documentId?: string; documentMode?: string };
  state?: V1EditorStateLike;
  view?: { focus(): void };
  commands?: Record<string, (...args: unknown[]) => unknown>;
  focus?(): void;
  exportDocx?(params?: unknown): Promise<unknown>;
  setDocumentMode?(mode: EditorRuntimeDocumentMode): void;
  /** Present on the v2 facade as `2`; absent/`1` for the real v1 editor. */
  editorVersion?: 1 | 2;
}

/** The subset of the v1 `PresentationEditor` the adapter delegates to. */
export interface V1PresentationEditorLike extends V1EventTargetLike {
  focus?(): void;
  setZoom?(zoom: number): void;
  scrollToPosition?(pos: number, options?: Record<string, unknown>): boolean;
  setDocumentMode?(mode: EditorRuntimeDocumentMode): void;
}

export interface V1EditorRuntimeAdapterOptions {
  /** Registry-unique runtime id (minted by the shell). */
  readonly id: EditorRuntimeId;
  /** Document id this runtime backs. */
  readonly documentId: string;
  /** Shell-owned host wrapper element (NOT painter DOM). */
  readonly root: HTMLElement;
  /** The live v1 editor, available from `onEditorCreate`. */
  readonly editor: V1EditorLike;
  /**
   * Called exactly once when the runtime tears down (the wrapped editor emits
   * `destroy`, or `dispose()` is called). The shell wires this to
   * `superdoc.unregisterEditorRuntime(id)` so active-state policy stays with the
   * registry  -  the adapter never nulls or promotes active editor state itself
   *.
   */
  readonly onUnregister?: (id: EditorRuntimeId) => void;
  /**
   * Global v1 zoom forwarder. v1 zoom is GLOBAL in current implementation (the shell calls the
   * static `PresentationEditor.setGlobalZoom`), so the per-runtime `setZoom`
   * forwards here rather than claiming isolated per-root zoom. When
   * omitted, `setZoom` falls back to the attached presentation editor instance.
   */
  readonly setGlobalZoom?: (factor: number) => void;
}

// ---------------------------------------------------------------------------
// Coarse command kind → v1 command name mapping
// ---------------------------------------------------------------------------
//
// The adapter delegates dispatch to the existing `editor.commands` surface; it
// does NOT reimplement ProseMirror commands. Only the coarse kinds the shared
// shell needs are mapped here. Detailed comment/tracked-change/AI command
// signatures stay on the legacy projection until the editor runtime boundary.

const COMMAND_NAME_BY_KIND: Partial<Record<EditorRuntimeCommandKind, string>> = {
  'text.insert': 'insertContent',
  'text.replace': 'insertContent',
  'text.paste': 'insertContent',
  'history.undo': 'undo',
  'history.redo': 'redo',
  'structural.splitBlock': 'splitBlock',
  'formatting.applyMark': 'toggleMark',
};

// Directional delete is intentionally not mapped yet. Real v1 Backspace/Delete
// run direction-specific keymap chains; delegating both kinds to deleteSelection
// would advertise behavior this adapter cannot faithfully provide.

const SUPPORTED_COMMAND_KINDS = Object.keys(COMMAND_NAME_BY_KIND) as EditorRuntimeCommandKind[];

const ZOOM_MIN = 25;
const ZOOM_MAX = 400;

function isHistoryKind(kind: EditorRuntimeCommandKind): boolean {
  return kind === 'history.undo' || kind === 'history.redo';
}

function normalizeDocumentMode(mode: unknown): EditorRuntimeDocumentMode {
  return mode === 'suggesting' || mode === 'viewing' ? mode : 'editing';
}

function readyStateForMode(
  mode: EditorRuntimeDocumentMode,
): Extract<EditorRuntimeState, 'review-ready' | 'editing-ready'> {
  return mode === 'viewing' ? 'review-ready' : 'editing-ready';
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Wrap the live v1 editor (and, once ready, its presentation editor) in the
 * shell-owned {@link EditorRuntime} contract.
 *
 * Returns the runtime plus an `attachPresentationEditor` hook the shell calls at
 * `onEditorReady`. The adapter is "pending" (state `opening`) until then.
 */
export function createV1EditorRuntimeAdapter(options: V1EditorRuntimeAdapterOptions): {
  runtime: EditorRuntime;
  attachPresentationEditor(presentationEditor: V1PresentationEditorLike): void;
} {
  const { id, documentId, root, editor, onUnregister, setGlobalZoom } = options;

  let presentationEditor: V1PresentationEditorLike | null = null;
  let state: EditorRuntimeState = 'opening';
  let documentMode = normalizeDocumentMode(editor.options?.documentMode);
  let disposed = false;
  let unregistered = false;

  // Adapter-private opaque-token store. Maps `tokenId` → PM position. The shell
  // only ever sees the opaque token, never the number.
  const positions = new Map<string, number>();
  let tokenSeq = 0;
  // Staleness discriminator: bumped on every document-changing v1 event (and as
  // a dispatch fallback) so previously minted tokens reject with
  // `stale-position-token` after the doc moves.
  let revision = 0;
  // Bounds token-map growth from repeated selection snapshots within a single
  // revision: identical PM positions reuse the same minted token instead of
  // accumulating a fresh entry per `getSelectionSnapshot()` read. Cleared on
  // every invalidation alongside `positions`.
  const currentRevisionTokenCache = new Map<number, EditorRuntimePositionToken>();

  const listeners = new Set<EditorRuntimeListener>();

  // PE event handlers retained so dispose() can detach exactly what it attached.
  let paginationHandler: ((payload: unknown) => void) | null = null;
  let zoomHandler: ((payload: unknown) => void) | null = null;

  // Minimal layout snapshot state, fed by PE events (the runtime contract
  // layout/pagination snapshot"). v1 zoom is global; we mirror the last value.
  let pageCount = 0;
  let zoomPercent = 100;

  function emit(event: EditorRuntimeEvent): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch {
        /* a subscriber error must not break the adapter */
      }
    }
  }

  function mintToken(pmPos: number): EditorRuntimePositionToken {
    // Reuse the token already minted for this PM position in the current
    // revision. Repeated `getSelectionSnapshot()` reads on an unchanged
    // selection therefore cannot grow `positions` without bound.
    const cached = currentRevisionTokenCache.get(pmPos);
    if (cached) return cached;
    const tokenId = `v1-pos-${tokenSeq++}`;
    positions.set(tokenId, pmPos);
    const token: EditorRuntimePositionToken = { runtimeId: id, tokenId, revision };
    currentRevisionTokenCache.set(pmPos, token);
    return token;
  }

  /**
   * Single invalidation authority. Advancing the revision rejects every
   * previously minted token with `stale-position-token`, and clearing the token
   * stores releases the per-revision memory. Called from the v1 `update` event
   * (the primary signal across keyboard / toolbar / collaboration / document-API
   * edits) and as a `dispatch(...)` fallback when no `update` was observed.
   */
  function invalidatePositionTokens(): void {
    revision += 1;
    positions.clear();
    currentRevisionTokenCache.clear();
  }

  function resolveToken(
    token: EditorRuntimePositionToken,
  ): { ok: true; pos: number } | { ok: false; reason: 'wrong-runtime-token' | 'stale-position-token' } {
    if (token.runtimeId !== id) return { ok: false, reason: 'wrong-runtime-token' };
    if (token.revision !== revision || !positions.has(token.tokenId)) {
      return { ok: false, reason: 'stale-position-token' };
    }
    return { ok: true, pos: positions.get(token.tokenId)! };
  }

  function capabilities(): EditorRuntimeCapabilities {
    const hasPresentation = presentationEditor !== null;
    return {
      lifecycle: { canFocus: true, canDispose: true },
      selection: {
        canReadSelectedText: true,
        canReadSelectionSnapshot: true,
        canMintPositionTokens: true,
      },
      commands: {
        canDispatch: state === 'editing-ready',
        supportedCommands: SUPPORTED_COMMAND_KINDS,
      },
      layout: { supported: hasPresentation, hasSyncSnapshot: hasPresentation },
      zoom: { supported: true, min: ZOOM_MIN, max: ZOOM_MAX },
      navigation: {
        supported: hasPresentation && typeof presentationEditor?.scrollToPosition === 'function',
        targets: ['position'],
      },
      // v1 save is SuperDoc-level orchestration (collaboration save, comments,
      // download). The adapter must NOT bypass or double that, so it does not
      // claim editor-level save. Export IS editor-representable.
      persistence: { canSave: false, canExportDocx: true },
      // Comments / tracked changes / find-replace / AI / toolbar stay on the
      // legacy projection in current implementation; the editor runtime boundary migrates those shell consumers.
      // Omitting the optional groups here reports them as "not offered through
      // the runtime yet" rather than faking support the adapter can't honor.
    };
  }

  function snapshot(): EditorRuntimeSnapshot {
    return { id, kind: 'v1', documentId, state, documentMode, capabilities: capabilities() };
  }

  function setDocumentMode(mode: EditorRuntimeDocumentMode): void {
    if (disposed) return;
    const nextMode = normalizeDocumentMode(mode);
    if (nextMode === documentMode) return;
    documentMode = nextMode;
    presentationEditor?.setDocumentMode?.(documentMode);
    editor.setDocumentMode?.(documentMode);
    if (state === 'editing-ready' || state === 'review-ready') {
      const nextState = readyStateForMode(documentMode);
      if (nextState !== state) {
        state = nextState;
        emit({ type: 'state-change', state });
      }
      emit({ type: 'capabilities-change', capabilities: capabilities() });
    }
  }

  // --- command dispatch -----------------------------------------------------

  function invokeCommand(command: EditorRuntimeCommand, commandFn: (...args: unknown[]) => unknown): unknown {
    switch (command.kind) {
      case 'text.insert':
      case 'text.replace':
      case 'text.paste':
        return commandFn(command.text);
      case 'formatting.applyMark':
        return commandFn(command.mark, command.value);
      default:
        return commandFn();
    }
  }

  async function dispatch(command: EditorRuntimeCommand): Promise<EditorRuntimeCommandResult> {
    if (disposed || state === 'disposed') return { status: 'rejected', reason: 'runtime-not-ready' };
    if (state === 'saving') return { status: 'rejected', reason: 'host-saving' };
    if (documentMode === 'viewing') return { status: 'rejected', reason: 'document-readonly' };
    if (state !== 'editing-ready') return { status: 'rejected', reason: 'runtime-not-ready' };

    // Opaque-token round-trip + staleness for positioned commands.
    // v1's existing command surface mutates the current PM selection. Until a
    // explicit adapter support for selection/range placement through a v1
    // command, fail closed instead of validating a token and then ignoring it.
    const token = 'at' in command ? command.at : 'range' in command ? command.range : undefined;
    if (token) {
      const resolved = resolveToken(token);
      if (!resolved.ok) return { status: 'rejected', reason: resolved.reason };
      return {
        status: 'rejected',
        reason: 'target-unsupported',
        detail: 'positioned v1 dispatch is deferred until selection/range placement is explicitly supported',
      };
    }

    const name = COMMAND_NAME_BY_KIND[command.kind];
    if (!name) return { status: 'rejected', reason: 'command-unsupported', detail: command.kind };

    const commandFn = editor.commands?.[name];
    if (typeof commandFn !== 'function') {
      return { status: 'rejected', reason: 'command-unsupported', detail: name };
    }

    // The v1 `update` event is the primary invalidation authority. Capture the
    // revision before invoking so we can tell whether that event already fired
    // (synchronously) during this dispatch and avoid a redundant second bump.
    const revisionBeforeInvoke = revision;
    let result: unknown;
    try {
      result = invokeCommand(command, commandFn);
    } catch (err) {
      return { status: 'rejected', reason: 'command-failed', detail: errorMessage(err) };
    }

    const history = isHistoryKind(command.kind);
    const noChange = result === false || result === null || result === undefined;
    if (noChange) {
      if (history) {
        return {
          status: 'history-noop',
          reason: command.kind === 'history.undo' ? 'nothing-to-undo' : 'nothing-to-redo',
        };
      }
      return { status: 'noop', reason: 'no-effect' };
    }

    // Truthy mutation: a real edit happened, so previously minted tokens are now
    // stale. If the v1 `update` event already invalidated during the invoke
    // (revision advanced), don't double-bump; otherwise invalidate here as a
    // fallback so tokens stale even when no `update` event was observed.
    if (revision === revisionBeforeInvoke) {
      invalidatePositionTokens();
    }
    if (history) return { status: 'history-committed', result };
    return { status: 'committed', receipt: result };
  }

  // --- reads ----------------------------------------------------------------

  function selectedText(): string {
    const st = editor.state;
    if (!st) return '';
    return st.doc.textBetween(st.selection.from, st.selection.to, ' ');
  }

  function selectionSnapshot(): EditorRuntimeSelectionSnapshot | null {
    const st = editor.state;
    if (!st) return null;
    const { from, to } = st.selection;
    const text = st.doc.textBetween(from, to, ' ');
    const isEmpty = from === to;
    return {
      isRange: !isEmpty,
      isEmpty,
      text,
      anchor: mintToken(from),
      focus: mintToken(to),
    };
  }

  function layoutSnapshot(): EditorRuntimeLayoutSnapshot | null {
    if (!presentationEditor) return null;
    return { pageCount, currentPage: 1, zoom: zoomPercent };
  }

  function toolbarState(): EditorRuntimeToolbarState | null {
    // The v1 toolbar binds through the legacy projection (`setActiveEditor` →
    // `toolbar.setActiveEditor`), not through runtime events in current implementation. Report
    // an empty neutral snapshot rather than reaching into toolbar internals.
    return { activeMarks: [], disabled: [] };
  }

  // --- persistence / export -------------------------------------------------

  async function toArrayBuffer(value: unknown): Promise<ArrayBuffer> {
    if (value instanceof ArrayBuffer) return value;
    // Browser `exportDocx()` resolves to a Blob by default; normalize without
    // dropping options.
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value.arrayBuffer();
    // Node `Buffer` / typed-array path: copy the backing bytes into a fresh
    // ArrayBuffer slice so we never hand out a shared/oversized pool buffer.
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    }
    throw new Error('v1 runtime: exportDocx returned an unrepresentable value');
  }

  async function exportDocx(options?: EditorRuntimeExportOptions): Promise<ArrayBuffer> {
    if (typeof editor.exportDocx !== 'function') {
      throw new Error('v1 runtime: editor.exportDocx is unavailable');
    }
    // The neutral contract carries only an opaque `hint`; forward it as the v1
    // export params so callers can pass through current v1 options without the
    // adapter interpreting them. Default (no hint) yields the browser Blob path.
    const raw = await editor.exportDocx(options?.hint);
    return toArrayBuffer(raw);
  }

  async function save(): Promise<ArrayBuffer> {
    // v1 save is SuperDoc-level orchestration (collaboration save, comments,
    // download). The runtime must not bypass or double it.
    throw new Error(
      'v1 runtime: save is SuperDoc-level orchestration; use the SuperDoc save/export path (capabilities.persistence.canSave === false)',
    );
  }

  // --- zoom + navigation ----------------------------------------------------

  async function setZoom(percent: number): Promise<EditorRuntimeCommandResult> {
    if (disposed) return { status: 'rejected', reason: 'runtime-not-ready' };
    if (typeof percent !== 'number' || !Number.isFinite(percent)) {
      return { status: 'rejected', reason: 'target-unsupported', detail: 'zoom must be a finite number' };
    }
    if (percent < ZOOM_MIN || percent > ZOOM_MAX) {
      return {
        status: 'rejected',
        reason: 'target-unsupported',
        detail: `zoom out of range [${ZOOM_MIN}, ${ZOOM_MAX}]`,
      };
    }
    const factor = percent / 100;
    if (typeof setGlobalZoom === 'function') {
      setGlobalZoom(factor);
    } else if (typeof presentationEditor?.setZoom === 'function') {
      presentationEditor.setZoom(factor);
    } else {
      return { status: 'rejected', reason: 'capability-unsupported', detail: 'no zoom forwarder available' };
    }
    zoomPercent = percent;
    emit({ type: 'layout-change', layout: { pageCount, currentPage: 1, zoom: zoomPercent } });
    return { status: 'committed' };
  }

  async function reveal(target: EditorRuntimeNavigationTarget): Promise<EditorRuntimeCommandResult> {
    if (disposed) return { status: 'rejected', reason: 'runtime-not-ready' };
    if (target.kind !== 'position') {
      // page / comment / search-result navigation stays on the legacy shell
      // path in current implementation (the editor runtime boundary). Reject with a named reason instead of
      // pretending to support it.
      return {
        status: 'rejected',
        reason: 'target-unsupported',
        detail: `${target.kind} reveal deferred to the editor runtime boundary`,
      };
    }
    const resolved = resolveToken(target.position);
    if (!resolved.ok) return { status: 'rejected', reason: resolved.reason };
    const scrollTo = presentationEditor?.scrollToPosition;
    if (typeof scrollTo !== 'function') {
      return { status: 'rejected', reason: 'capability-unsupported', detail: 'presentation editor not ready' };
    }
    const ok = scrollTo.call(presentationEditor, resolved.pos);
    return ok ? { status: 'committed' } : { status: 'noop', reason: 'no-effect' };
  }

  // --- focus / lifecycle ----------------------------------------------------

  async function focus(_options?: EditorRuntimeFocusOptions): Promise<boolean> {
    if (disposed) return false;
    // Prefer the visible presentation editor's focus (drives the layout/input
    // bridge); fall back to the hidden editor's own focus path.
    if (typeof presentationEditor?.focus === 'function') {
      presentationEditor.focus();
      return true;
    }
    if (typeof editor.focus === 'function') {
      editor.focus();
      return true;
    }
    if (typeof editor.view?.focus === 'function') {
      editor.view.focus();
      return true;
    }
    return false;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    // Detach only the listeners the adapter itself attached. The v1
    // editor/PresentationEditor lifecycle is owned by the shell components;
    // the adapter never destroys them.
    if (typeof editor.off === 'function') {
      editor.off('destroy', handleEditorDestroy);
      editor.off('update', handleEditorUpdate);
    }
    if (presentationEditor) detachPresentationListeners(presentationEditor);

    state = 'disposed';
    emit({ type: 'disposed' });
    listeners.clear();
    positions.clear();
    currentRevisionTokenCache.clear();

    // Unregister from the registry exactly once; the registry owns active-state
    // policy (clear + no auto-promote). The adapter does not touch active state.
    if (!unregistered) {
      unregistered = true;
      onUnregister?.(id);
    }
  }

  function handleEditorDestroy(): void {
    dispose();
  }

  // The v1 `Editor` emits `update` only when the document actually changed
  // (selection-only changes emit `selectionUpdate`, not `update`), so this is
  // the precise document-mutation signal. Subscribing here invalidates tokens
  // for EVERY edit path — keyboard, toolbar, collaboration, document API — not
  // just edits routed through `runtime.dispatch(...)`.
  function handleEditorUpdate(): void {
    if (disposed) return;
    invalidatePositionTokens();
  }

  // --- presentation editor attach (onEditorReady) ---------------------------

  function detachPresentationListeners(pe: V1PresentationEditorLike): void {
    if (typeof pe.off !== 'function') return;
    if (paginationHandler) pe.off('paginationUpdate', paginationHandler);
    if (zoomHandler) pe.off('zoomChange', zoomHandler);
    paginationHandler = null;
    zoomHandler = null;
  }

  function attachPresentationEditor(pe: V1PresentationEditorLike): void {
    if (disposed) return;
    // Re-attach safety: detach a previous PE's listeners first.
    if (presentationEditor) detachPresentationListeners(presentationEditor);
    presentationEditor = pe;

    paginationHandler = (payload: unknown) => {
      const pages = (payload as { layout?: { pages?: unknown[] } } | undefined)?.layout?.pages;
      pageCount = Array.isArray(pages) ? pages.length : pageCount;
      emit({ type: 'layout-change', layout: { pageCount, currentPage: 1, zoom: zoomPercent } });
    };
    zoomHandler = (payload: unknown) => {
      const z = (payload as { zoom?: number } | undefined)?.zoom;
      if (typeof z === 'number' && Number.isFinite(z)) {
        // PresentationEditor emits a scale factor (1 = 100%).
        zoomPercent = Math.round(z * 100);
        emit({ type: 'layout-change', layout: { pageCount, currentPage: 1, zoom: zoomPercent } });
      }
    };

    if (typeof pe.on === 'function') {
      pe.on('paginationUpdate', paginationHandler);
      pe.on('zoomChange', zoomHandler);
    }

    // Pending → ready: the visible bridge is now available.
    const nextReadyState = readyStateForMode(documentMode);
    const wasReady = state === nextReadyState;
    state = nextReadyState;
    pe.setDocumentMode?.(documentMode);
    if (!wasReady) emit({ type: 'state-change', state });
    emit({ type: 'capabilities-change', capabilities: capabilities() });
  }

  // Subscribe to the editor's own teardown so the runtime unregisters when the
  // SuperEditor host unmounts (remount or SuperDoc destroy), and to `update` so
  // ordinary v1 document changes invalidate stale position tokens.
  if (typeof editor.on === 'function') {
    editor.on('destroy', handleEditorDestroy);
    editor.on('update', handleEditorUpdate);
  }

  const runtime: EditorRuntime = {
    id,
    kind: 'v1',
    documentId,
    root,

    getCapabilities: capabilities,
    getSnapshot: snapshot,
    setDocumentMode,
    getDocumentMode: () => documentMode,
    // The compatibility projection backing `SuperDoc.activeEditor`,
    // `doc.getEditor()`, and existing v1 callers. Returns the SAME v1
    // editor instance, carrying `commands` / `state` / `view` / `on` / `off`.
    getLegacyEditorProjection: () => editor,

    focus,
    dispose,

    dispatch,

    getSelectedText: selectedText,
    getSelectionSnapshot: selectionSnapshot,
    getToolbarState: toolbarState,
    getLayoutSnapshot: layoutSnapshot,

    save,
    exportDocx,

    setZoom,
    reveal,

    subscribe(listener: EditorRuntimeListener): EditorRuntimeUnsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return { runtime, attachPresentationEditor };
}
