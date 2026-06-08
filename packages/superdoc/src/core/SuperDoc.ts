import '../style.css';

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { markRaw, toRaw } from 'vue';
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider';

import { DOCX, PDF, HTML, getActorIdentityKey, normalizeActorEmail } from '@superdoc/common';
import { SuperToolbar, createZip, seedEditorStateToYDoc, onCollaborationProviderSynced } from '@superdoc/super-editor';
import { SuperComments } from '../components/CommentsLayer/commentsList/super-comments-list.js';
import { resolveFitWidthOptions } from '../composables/use-viewport-fit.js';
import { createSuperdocVueApp } from './create-app.js';
import { shuffleArray } from '@superdoc/common/collaboration/awareness';
import { createDownload, cleanName } from './helpers/export.js';
import { initSuperdocYdoc, initCollaborationComments, makeDocumentsCollaborative } from './collaboration/helpers.js';
import { setupAwarenessHandler } from './collaboration/collaboration.js';
import { overwriteRoomComments, overwriteRoomLockState } from './collaboration/room-overwrite.js';
import { normalizeDocumentEntry } from './helpers/file.js';
import { isAllowed } from './collaboration/permissions.js';
import { Whiteboard } from './whiteboard/Whiteboard';
import { WhiteboardRenderer } from './whiteboard/WhiteboardRenderer';
import { SurfaceManager } from './surface-manager.js';
import { createDeprecatedEditorProxy } from '../helpers/deprecation.js';
import { normalizeTrackChangesConfig } from './helpers/normalize-track-changes-config.js';
import { normalizeCommentsUiPolicy } from '../helpers/comment-small-screen.js';
import { EditorRuntimeRegistry } from './editor-runtime/editor-runtime-registry.js';

const DEFAULT_USER = Object.freeze({
  id: null,
  name: 'Default SuperDoc user',
  email: null,
});

// 24 visually distinct hex colors for awareness cursor assignment.
// Large enough to minimize collisions (~4% for two users) while staying
// within y-prosemirror's hex-only color format requirement.
const DEFAULT_AWARENESS_PALETTE = Object.freeze([
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F1948A',
  '#82E0AA',
  '#F8C471',
  '#AED6F1',
  '#D7BDE2',
  '#A3E4D7',
  '#F0B27A',
  '#AEB6BF',
  '#E74C3C',
  '#2ECC71',
  '#3498DB',
  '#E67E22',
  '#1ABC9C',
  '#9B59B6',
  '#34495E',
  '#F39C12',
]);

// TS-native type imports for the types this file annotates against.
// The corresponding payload shapes for the SuperDocEventMap are
// declared as interfaces below.
import type {
  AwarenessState,
  AwarenessUser,
  CanPerformPermissionParams,
  CollaborationProvider,
  Config,
  ContentControlActiveChangePayload,
  ContentControlClickPayload,
  DocumentMode,
  Editor,
  EditorUpdateEvent,
  ExportParams,
  InternalConfig,
  Modules,
  NavigableAddress,
  RuntimeDocument,
  SearchMatch,
  SuperDocAwarenessUpdatePayload,
  SuperDocCommentsUpdatePayload,
  SuperDocEditorPayload,
  SuperDocExceptionPayload,
  SuperDocExceptionStorePayload,
  SuperDocFontsApi,
  SuperDocLockedPayload,
  SuperDocReadyPayload,
  SuperDocState,
  SuperDocViewportChangePayload,
  SuperDocViewportMetrics,
  SuperDocZoomMode,
  SuperDocZoomPayload,
  SuperDocZoomState,
  SurfaceHandle,
  SurfaceRequest,
  UpgradeToCollaborationOptions,
  User,
} from './types/index.js';
import type {
  Comment,
  FontsResolvedPayload,
  FontsChangedPayload,
  FontResolutionRecord,
  ListDefinitionsPayload,
  PresentationEditor,
} from '@superdoc/super-editor';
import type { EditorRuntime, EditorRuntimeId } from './editor-runtime/index.js';
import type { EditorRuntimeRegistryUnsubscribe } from './editor-runtime/editor-runtime-registry.js';
import type * as Y from 'yjs';
// `Whiteboard` is already imported as a value above (line 19); reuse it
// as a type here without a separate `import type` declaration.
import type { WhiteboardData } from './whiteboard/Whiteboard.js';

type ActiveEditor = Editor & {
  editorVersion?: 1 | 2;
};

// Internal-only event payload shapes (consumer-facing payloads are
// exported from `core/types/index.ts` and imported above).
interface SuperDocWhiteboardPayload {
  whiteboard: Whiteboard;
}
interface SuperDocFormattingMarksPayload {
  showFormattingMarks: boolean;
  superdoc: SuperDoc;
}
interface SuperDocDocumentModeChangePayload {
  documentMode: DocumentMode;
}
interface SuperDocPaginationPayload {
  totalPages: number;
  superdoc: SuperDoc;
}
interface SuperDocContentErrorPayload {
  error: unknown;
  editor: Editor;
}

/**
 * SuperDoc lifecycle event registry. Keys are event names emitted via
 * `this.emit(...)`; each value is the tuple of arguments. Used as the
 * generic parameter of `EventEmitter<SuperDocEventMap>` so `superdoc.on`
 * / `superdoc.emit` reject unknown event names at compile time.
 */
interface SuperDocEventMap {
  ready: [SuperDocReadyPayload];
  editorBeforeCreate: [SuperDocEditorPayload];
  editorCreate: [SuperDocEditorPayload];
  editorDestroy: [];
  'pdf:document-ready': [];
  'sidebar-toggle': [boolean];
  zoomChange: [SuperDocZoomPayload];
  'formatting-marks-change': [SuperDocFormattingMarksPayload];
  'document-mode-change': [SuperDocDocumentModeChangePayload];
  'editor-update': [EditorUpdateEvent];
  'content-error': [SuperDocContentErrorPayload];
  'fonts-resolved': [FontsResolvedPayload];
  'fonts-changed': [FontsChangedPayload];
  'pagination-update': [SuperDocPaginationPayload];
  'list-definitions-change': [ListDefinitionsPayload];
  'comments-update': [SuperDocCommentsUpdatePayload];
  'content-control:active-change': [ContentControlActiveChangePayload];
  'content-control:click': [ContentControlClickPayload];
  'collaboration-ready': [SuperDocEditorPayload];
  'awareness-update': [SuperDocAwarenessUpdatePayload];
  locked: [SuperDocLockedPayload];
  'whiteboard:init': [SuperDocWhiteboardPayload];
  'whiteboard:ready': [SuperDocWhiteboardPayload];
  'whiteboard:change': [WhiteboardData];
  'whiteboard:enabled': [boolean];
  'whiteboard:tool': [string];
  exception: [SuperDocExceptionPayload];
  'viewport-change': [SuperDocViewportChangePayload];
}
// Notes on the event map above:
//
// `exception` is typed as `SuperDocExceptionPayload`, a union of the three
// shapes the runtime currently emits today: `{ error, stage, document }`
// from `superdoc-store.js` document-init failures, `{ error, document }`
// from the catch in `restoreUnsavedChanges()`, and `{ error, editor?,
// code?, documentId? }` from `SuperDoc.vue` editor lifecycle. Normalizing
// these is tracked as a separate follow-up; the union types the current
// reality so consumers can narrow with `'stage' in payload` etc.
//
// `fonts-resolved` uses a listener-transport pattern: SuperDoc never
// emits it directly. `SuperDoc.vue:719` reads
// `superdoc.listeners('fonts-resolved')[0]` and threads it into the new
// editor's `onFontsResolved` option. Cleanup of this transport (relay
// through SuperDoc instead) is a follow-up; typing it here matches the
// current consumer-visible contract.

/**
 * Whether a runtime's legacy editor projection is a v1, command-capable surface
 * the legacy shell (toolbar, `search`, `goToSearchResult`, `activeEditor`) can
 * drive. v2-shaped scaffolding (`editorVersion === 2`), null projections, and
 * projections whose `commands` are not object-like are UNSUPPORTED and must
 * fail closed so stale v1 surfaces never stay bound to the wrong editor.
 *
 * @param projection The runtime's `getLegacyEditorProjection()` result.
 */
function isCommandCapableV1LegacyProjection(projection: unknown): projection is ActiveEditor {
  if (!projection || typeof projection !== 'object') return false;
  const candidate = projection as { editorVersion?: number; commands?: unknown };
  if (candidate.editorVersion === 2) return false;
  return Boolean(candidate.commands) && typeof candidate.commands === 'object';
}

/**
 * SuperDoc class
 * Expects a config object
 *
 * @class
 */
export class SuperDoc extends EventEmitter<SuperDocEventMap> {
  static allowedTypes = [DOCX, PDF, HTML];

  #destroyed = false;

  #isUpgrading = false;

  /** Aborts an in-flight upgrade (sync wait or ready wait). */
  #abortUpgrade: (() => void) | null = null;

  #mountWrapper: HTMLDivElement | null = null;

  #surfaceManager;
  /**
   * Build-time SuperDoc version string. Initialized to `'0.0.0'` so the
   * field is structurally assigned before the constructor runs, then
   * overwritten with the injected `__APP_VERSION__` constant inside
   * `#init` (the existing `@ts-expect-error` keeps the injected global
   * out of the JSDoc type graph). Consumers reading `superdoc.version`
   * immediately after `new SuperDoc(...)` see the real version because
   * `#init` runs synchronously through the overwrite before returning.
   */
  version = '0.0.0';

  /**
   * Local copy of the shared users list. Initialized to `[]` so direct
   * reads (`superdoc.users`) are stable before the async `#init`
   * re-seeds from `config.users`. Pre-ready `addSharedUser` /
   * `removeSharedUser` mutations would be silently overwritten by the
   * re-seed, so those methods guard with `#requireReady('addSharedUser')`
   * and throw a clear lifecycle error instead.
   */
  users: User[] = [];

  /** Yjs document for collaboration; set in `#init` when collaboration is enabled, otherwise undefined. */
  ydoc: Y.Doc | undefined;

  /**
   * Provider for the SuperDoc-level collaboration room (separate from
   * per-document providers). Widened to `CollaborationProvider` to match
   * the runtime, which stores whatever provider the consumer passed via
   * `Config.modules.collaboration.provider`. Consumers needing Hocuspocus-
   * specific members must narrow before use.
   *
   */
  provider: CollaborationProvider | undefined;

  /**
   * Whiteboard instance, created by `#initWhiteboard()` after the
   * collaboration await. Initialized to `null` so consumers reading
   * `superdoc.whiteboard` before the `whiteboard:init` event fires get
   * a stable null, not `undefined`.
   */
  whiteboard: Whiteboard | null = null;

  /**
   * Awareness palette assigned to local users when no explicit color is set.
   * Defaults to an empty array so `#assignUserColor` falls back to the
   * built-in `DEFAULT_AWARENESS_PALETTE`.
   */
  colors: string[] = [];

  /**
   * Pinia stores and Vue runtime references. Populated by `#initVueApp`
   * inside the async `#init`, which runs *after* `await #initCollaboration`,
   * so these fields are `undefined` between `new SuperDoc(config)`
   * returning and the `ready` event firing. Typed as `T | undefined` so
   * @ts-check forces every access path to either narrow or use the
   * `#requireSuperdocStore` / `#requireCommentsStore` helpers below
   * (which throw a clear "wait for ready" error). SD-2916 PR-B closed
   * the delayed-init soundness gap.
   *
   * `@private` is a TypeScript-surface hide, not runtime privacy: the
   * fields still exist on the runtime instance and internal callers
   * across the package keep working. Consumers can no longer reach into
   * them via `.d.ts`, which collapses the Pinia type graph from the
   * public surface (SD-3213f). The headless-toolbar host contract was
   * refactored in the same PR to replace raw store reach with the
   * narrow methods `getPresentationEditorForDocument(documentId)` and
   * `getComment(commentId)` below, so SuperDoc instances satisfy
   * `HeadlessToolbarSuperdocHost` directly without exposing
   * `superdocStore` publicly.
   *
   * @private
   */
  private declare superdocStore: ReturnType<typeof createSuperdocVueApp>['superdocStore'] | undefined;

  /**
   * @private
   */
  private declare commentsStore: ReturnType<typeof createSuperdocVueApp>['commentsStore'] | undefined;

  /**
   * @private
   */
  private declare highContrastModeStore: ReturnType<typeof createSuperdocVueApp>['highContrastModeStore'] | undefined;

  /**
   * Internal mount handle for the `SuperComments` Vue component, created
   * lazily by `addCommentsList()` and torn down by `removeCommentsList()`.
   * Not consumer API: `SuperComments` is not publicly exported, no docs
   * or examples reference `superdoc.commentsList`, and the inner fields
   * (`element`, `superdoc` backref, `container` Vue ComponentPublicInstance)
   * are internal mount state.
   *
   * Typed as `SuperComments | null | undefined` so the runtime states
   * stay type-clean: `undefined` before `addCommentsList()` runs (e.g.
   * when the viewer role skips initialization; see SuperDoc.test.js
   * for the assertion), `SuperComments` after `addCommentsList()`, and
   * `null` after `removeCommentsList()` tears down. No initializer, to
   * match the convention used by the adjacent `@private` store fields.
   *
   * @private
   */
  // `declare` (no runtime initializer): the legacy JS code only sets
  // `this.commentsList` when role !== 'viewer', and a test asserts the
  // field is `undefined` in the viewer path. An `= null` initializer
  // would create an own runtime property up front and flip that to `null`.
  // `private`: matches the original `@private` JSDoc; not part of the
  // SuperDoc public type surface (consumer-typecheck fixture asserts this).
  private declare commentsList: SuperComments | null;

  /**
   * Internal Vue app handle created in `#initVueApp()` and used for
   * mount/unmount, `provide()`, and `config.globalProperties` setup.
   * Not consumer API: no docs or examples reference `superdoc.app`,
   * and the only cross-file reader (`SuperComments.createVueApp()`
   * at `super-comments-list.js:35`) is a `.js` file under
   * `checkJs: false`, so the `@private` boundary does not break
   * internal source compilation.
   *
   * Same SD-3213f-style TS surface hide as
   * `superdocStore` / `commentsStore` / `highContrastModeStore` /
   * `commentsList`; not runtime privacy.
   *
   * @private
   */
  private declare app: ReturnType<typeof createSuperdocVueApp>['app'] | undefined;

  /** Pinia store root for the SuperDoc Vue app. Set in `#initVueApp`. */
  pinia: ReturnType<typeof createSuperdocVueApp>['pinia'] | undefined;

  /** Count of editors that have signaled `editorCreate`. */
  readyEditors = 0;

  /** Outstanding async saves waiting for collaboration ack. */
  pendingCollaborationSaves = 0;

  // ─── Runtime fields populated by `#init` ──────────────────────────────
  // Declared with `declare` so TS knows the field shape without emitting a
  // runtime own-property initializer. Each is assigned during `#init`
  // (called synchronously from the constructor), so by the time any
  // external callsite reads them they exist.
  declare activeEditor: ActiveEditor | null;
  declare toolbar: SuperToolbar | null;
  declare toolbarElement: string | HTMLElement | undefined;
  declare userColorMap: Map<string, string>;
  declare colorIndex: number;
  declare isCollaborative: boolean;
  declare isLocked: boolean;
  declare lockedBy: User | null;
  declare isDev: boolean;
  declare superdocId: string;
  declare comments: unknown[];
  declare socket: HocuspocusProviderWebsocket | null;
  declare user: AwarenessUser;
  declare _cleanupAwareness: (() => void) | null;
  declare _commentsCollabInitialized: boolean;

  /**
   * SuperDoc-owned editor runtime registry. This is the internal place to ask
   * which mounted editor runtime is active and which runtime owns a DOM event
   * target. It stays private so it never widens the public SDK type surface.
   */
  readonly #editorRuntimeRegistry = new EditorRuntimeRegistry();

  /** Unsubscribe handle for the registry active-change bridge. */
  #editorRuntimeRegistryUnsub: EditorRuntimeRegistryUnsubscribe | null = null;

  /**
   * Re-entrancy guard. True while the registry active-change bridge is applying
   * a projection through `setActiveEditor(...)`, so that call applies the
   * projection directly instead of routing back into runtime activation (which
   * would recurse). The sole writer of `activeEditor` stays `setActiveEditor`.
   */
  #applyingRuntimeActiveChange = false;

  /**
   * The active configuration. Typed as `InternalConfig` because `#init` runs
   * synchronously in the constructor and normalizes the consumer-provided
   * `Config` into the wider shape (`documents` filled, `modules` defaulted,
   * `user` spread with `DEFAULT_USER`, etc.). Any callsite reading
   * `this.config` runs after `#init`, so it sees the normalized shape.
   *
   * Public consumer input shape: `Config` (re-exported from `superdoc`).
   * Internal post-normalize shape: `InternalConfig`.
   */
  config: InternalConfig = {
    selector: '#superdoc',
    documentMode: 'editing',
    allowSelectionInViewMode: false,
    role: 'editor',
    document: {},
    documents: [],
    editorExtensions: [],

    colors: [],
    // `user` is intentionally not initialized here. `#init` always
    // normalizes `this.config.user` (spreading `DEFAULT_USER` over the
    // consumer-supplied user, or using `DEFAULT_USER` outright when the
    // consumer passes nothing). The previous `{ name: null, email: null }`
    // placeholder was overwritten unconditionally before any consumer
    // could observe it.
    users: [],

    // `user` and `layoutEngineOptions` are also set in `#init` (where `user`
    // is spread with `DEFAULT_USER` and `layoutEngineOptions` defaults to
    // `{}` if the consumer passes nothing). Initializing them here too keeps
    // the field literal satisfying `InternalConfig` directly, with no
    // pre-init gap.
    user: { ...DEFAULT_USER },
    layoutEngineOptions: {},

    modules: {}, // Optional: Modules to load. Use modules.ai.{your_key} to pass in your key

    // License key (resolved downstream; undefined means "not explicitly set")
    licenseKey: undefined,

    // Telemetry settings
    telemetry: { enabled: true },

    title: 'SuperDoc',
    conversations: [],
    isInternal: false,
    comments: { visible: false },

    // toolbar config
    toolbarGroups: ['left', 'center', 'right'],
    toolbarIcons: {},
    toolbarTexts: {},

    // UI font for SuperDoc surfaces (toolbar, comments UI, etc.)
    uiDisplayFallbackFont: 'Arial, Helvetica, sans-serif',

    isDev: false,

    disablePiniaDevtools: false,

    // Events
    onEditorBeforeCreate: () => null,
    onEditorCreate: () => null,
    onEditorDestroy: () => null,
    onContentError: () => null,
    onReady: () => null,
    onCommentsUpdate: () => null,
    onContentControlActiveChange: () => null,
    onContentControlClick: () => null,
    onAwarenessUpdate: () => null,
    onLocked: () => null,
    onPdfDocumentReady: () => null,
    onSidebarToggle: () => null,
    onCollaborationReady: () => null,
    onEditorUpdate: () => null,
    onCommentsListChange: () => null,
    onException: () => null,
    onListDefinitionsChange: () => null,
    onPaginationUpdate: () => null,
    onTransaction: () => null,
    // The following optional consumer-supplied fields are intentionally
    // NOT initialized here: `superdocId`, `format`, `toolbar` (selector),
    // `permissionResolver`, `onFontsResolved`, `handleImageUpload`,
    // `onTrackedChangeBubbleAccept`, `onTrackedChangeBubbleReject`.
    // For the first six, the public `Config` typedef declares them
    // optional; omitting them from the initializer keeps
    // `superdoc.config.<field>` as `undefined` post-init when the consumer
    // does not pass them, matching the typedef. The two
    // `onTrackedChangeBubble*` callbacks are not yet on the public `Config`
    // typedef (a typedef gap that predates this change); consumers pass
    // them and they are read with `typeof handler === 'function'` guards.
    // Bubble handler signature: `(comment, editor) => void`.
    // Image upload handler signature: `async (file) => url`.

    // Disable context menus (slash and right-click) globally
    disableContextMenu: false,

    // Document view options (OOXML ST_View compatible)
    // - 'print': Print Layout View - displays document as it prints (default)
    // - 'web': Web Page View - content reflows to fit container (mobile/accessibility)
    viewOptions: { layout: 'print' },

    // Internal: toggle layout-engine-powered PresentationEditor in dev shells
    useLayoutEngine: true,
  };
  constructor(config: Config) {
    super();

    if (!config.selector) {
      throw new Error('SuperDoc: selector is required');
    }

    const container = typeof config.selector === 'string' ? document.querySelector(config.selector) : config.selector;

    if (!(container instanceof HTMLElement)) {
      throw new Error('SuperDoc: selector must be a valid CSS selector string or DOM element');
    }

    // SurfaceManager must exist before `#init` returns control to the
    // caller — `openSurface()` can be called immediately after
    // construction while async init is still in flight. The manager's
    // constructor only stores the `getModuleConfig` thunk, so reading
    // `this.config.modules?.surfaces` lazily later works even though
    // `this.config` hasn't been merged with defaults yet.
    this.#surfaceManager = new SurfaceManager({
      getModuleConfig: () => this.config.modules?.surfaces,
    });

    this.#init(config, container);
  }
  async #init(config: Config, container: HTMLElement) {
    this.config = {
      ...this.config,
      ...config,
    };
    if (!this.config.comments || typeof this.config.comments !== 'object') {
      this.config.comments = { visible: false };
    } else if (typeof this.config.comments.visible !== 'boolean') {
      this.config.comments.visible = false;
    }
    normalizeTrackChangesConfig(this.config);

    // Defensive defaults so the `InternalConfig` runtime invariants hold
    // for every reachable code path. The class-field initializer seeds
    // both `documents: []` and `layoutEngineOptions` is filled in by
    // `normalizeTrackChangesConfig` above, but a consumer that explicitly
    // passes `{ documents: undefined }` or omits `layoutEngineOptions`
    // when track-changes hasn't initialized it yet would otherwise leave
    // these undefined and break later non-null casts.
    this.config.documents = this.config.documents || [];
    this.config.layoutEngineOptions = this.config.layoutEngineOptions || {};

    // Web layout behavior:
    // - Backward compatible default: web layout still uses PM rendering.
    // - Opt-in semantic path: allow layout engine only when flowMode === 'semantic'.
    const isWebLayout = this.config.viewOptions?.layout === 'web';
    const requestedFlowMode = this.config.layoutEngineOptions?.flowMode;
    const isSemanticFlow = requestedFlowMode === 'semantic';
    if (isWebLayout && this.config.useLayoutEngine && !isSemanticFlow) {
      console.warn(
        "[SuperDoc] Web layout uses PM fallback unless layoutEngineOptions.flowMode is set to 'semantic'. Automatically disabling layout engine.",
      );
      this.config.useLayoutEngine = false;
    }
    if (!isWebLayout && isSemanticFlow) {
      console.warn("[SuperDoc] flowMode 'semantic' is only valid with web layout. Coercing to 'paginated'.");
      this.config.layoutEngineOptions.flowMode = 'paginated';
    }

    const incomingUser = this.config.user;
    if (!incomingUser || typeof incomingUser !== 'object') {
      this.config.user = { ...DEFAULT_USER };
    } else {
      this.config.user = {
        ...DEFAULT_USER,
        ...incomingUser,
      };
      if (!this.config.user.name) {
        this.config.user.name = DEFAULT_USER.name;
      }
    }

    // Enable virtualization by default for better performance on large documents.
    // Only renders visible pages (~5) instead of all pages.
    if (!this.config.layoutEngineOptions.virtualization) {
      this.config.layoutEngineOptions.virtualization = {
        enabled: true,
        window: 5,
        overscan: 1,
      };
    }

    this.config.modules = this.config.modules || {};
    if (!Object.prototype.hasOwnProperty.call(this.config.modules, 'comments')) {
      this.config.modules.comments = {};
    }
    this.config.modules.comments = normalizeCommentsUiPolicy(this.config.modules.comments);

    this.config.colors = shuffleArray(this.config.colors as `#${string}`[]);
    this.userColorMap = new Map();
    this.colorIndex = 0;

    // @ts-expect-error - __APP_VERSION__ is injected at build time
    this.version = __APP_VERSION__;
    this.#log('🦋 [superdoc] Using SuperDoc version:', this.version);

    this.superdocId = config.superdocId || uuidv4();
    // Default to an empty palette when no colors are configured so downstream
    // assignment logic doesn't have to null-check on every access.
    this.colors = this.config.colors ?? [];

    // Preprocess document
    this.#initDocuments();

    // SurfaceManager is constructed in the constructor body (before
    // `#init` is called) so it exists for any `openSurface()` call
    // that lands while async init is still in flight.

    // Initialize collaboration if configured
    await this.#initCollaboration(this.config.modules);

    // Check if destroy() was called while we were initializing
    if (this.#destroyed) {
      this.#cleanupCollaboration();
      return;
    }

    // Apply csp nonce if provided
    if (this.config.cspNonce) this.#patchNaiveUIStyles();

    // --- One-time shell setup (survives upgrade) ---
    this.user = this.config.user;
    this.users = this.config.users || [];
    this.socket = null;
    this.isDev = this.config.isDev || false;

    this.activeEditor = null;
    this.comments = [];

    // Bridge active runtime changes onto the legacy `activeEditor` projection.
    // The registry never writes `activeEditor` directly; it surfaces the next
    // runtime's compatibility projection and SuperDoc routes that through
    // `setActiveEditor(...)` so existing toolbar side effects stay centralized.
    if (!this.#editorRuntimeRegistryUnsub) {
      this.#editorRuntimeRegistryUnsub = this.#editorRuntimeRegistry.subscribe((change) => {
        this.#applyActiveRuntimeChange(change.nextRuntimeId, change.legacyEditorProjection);
      });
    }

    this.isLocked = this.config.isLocked || false;
    this.lockedBy = this.config.lockedBy || null;

    // Mount wrapper created once — Vue apps mount into it on each runtime start
    const mountWrapper = document.createElement('div');
    mountWrapper.style.display = 'contents';
    container.appendChild(mountWrapper);
    this.#mountWrapper = mountWrapper;

    this.#initListeners();
    this.#initWhiteboard();
    this.#addToolbar();

    // Mount the runtime once the outer shell is ready.
    this.#startRuntime();
  }

  // ---------------------------------------------------------------------------
  // Runtime mount lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Mount the Vue app, stores, and editor runtime.
   */
  #startRuntime() {
    this.#initVueApp();
    this.readyEditors = 0;
    // `#initVueApp()` assigns `this.app`, but TS can't follow the side
    // effect; assert non-null here so the mount call type-checks.
    if (!this.app) {
      throw new Error('SuperDoc: #startRuntime called before #initVueApp populated this.app');
    }
    this.app.mount(this.#mountWrapper);
  }

  #initWhiteboard() {
    const config = this.config.modules?.whiteboard;
    const enabled = config !== false && (config?.enabled ?? false);

    this.whiteboard = new Whiteboard({
      Renderer: WhiteboardRenderer,
      superdoc: this,
      enabled,
    });
    this.emit('whiteboard:init', { whiteboard: this.whiteboard });
  }

  /**
   * Get the number of editors that are required for this superdoc
   * @returns The number of required editors
   */
  get requiredNumberOfEditors() {
    return this.#requireSuperdocStore('requiredNumberOfEditors').documents.filter(
      (d: RuntimeDocument) => d.type === DOCX,
    ).length;
  }

  /**
   * Snapshot of the current SuperDoc state. Always reflects the most
   * recent values from the Pinia store; consumers must re-read on
   * change rather than caching.
   *
   * @see {@link SuperDocState} for the public return shape. The runtime
   * still walks `RuntimeDocument[]` internally, but `state.documents`
   * is exposed as the public `Document[]` view - consumers should not
   * rely on the richer runtime fields (`getEditor`, etc.).
   */
  get state(): SuperDocState {
    return {
      documents: this.#requireSuperdocStore('state').documents,
      users: this.users,
    };
  }

  /**
   * Look up the PresentationEditor associated with a given documentId.
   * Returns null if no document matches or the document has no
   * presentation editor. Replaces the legacy
   * `superdoc.superdocStore.documents[].getPresentationEditor()` reach
   * for `superdoc/headless-toolbar` host routing (SD-3213f).
   *
   */
  getPresentationEditorForDocument(documentId: string): PresentationEditor | null {
    if (typeof documentId !== 'string' || documentId.length === 0) return null;
    const documents = this.superdocStore?.documents ?? [];
    const matched = documents.find((doc: RuntimeDocument) => doc?.getEditor?.()?.options?.documentId === documentId);
    return matched?.getPresentationEditor?.() ?? null;
  }

  /**
   * Look up a comment by id. Returns null if not found. Replaces the
   * legacy `superdoc.commentsStore.getComment(id)` reach for
   * `superdoc/headless-toolbar` helpers (SD-3213f). The return type is
   * intentionally wide (`Record<string, unknown> | null`) so the public
   * surface does not pull the Pinia comment model type graph.
   *
   */
  getComment(commentId: string) {
    if (typeof commentId !== 'string' || commentId.length === 0) return null;
    return this.commentsStore?.getComment?.(commentId) ?? null;
  }

  /**
   * Get the SuperDoc container element
   */
  get element() {
    if (typeof this.config.selector === 'string') {
      return document.querySelector(this.config.selector);
    }
    return this.config.selector;
  }

  #patchNaiveUIStyles() {
    const cspNonce = this.config.cspNonce;

    const originalCreateElement = document.createElement;
    /** @param tagName */
    document.createElement = function (tagName: string) {
      const element = originalCreateElement.call(this, tagName);
      if (tagName.toLowerCase() === 'style') {
        element.setAttribute('nonce', cspNonce as string);
      }
      return element;
    };
  }

  #initDocuments() {
    const doc = this.config.document;
    // Pass the narrowed `doc` to `Object.keys` so the `!!doc && typeof doc === 'object'`
    // gate carries through; refetching `this.config.document` re-widens to
    // `string | object | File | Blob | undefined` and trips the overload.
    const hasDocumentConfig = !!doc && typeof doc === 'object' && Object.keys(doc)?.length;
    const hasDocumentUrl = !!doc && typeof doc === 'string' && doc.length > 0;
    const hasDocumentFile = !!doc && typeof File === 'function' && doc instanceof File;
    const hasDocumentBlob = !!doc && doc instanceof Blob && !(doc instanceof File);
    const hasListOfDocuments = this.config.documents && this.config.documents?.length;
    if (hasDocumentConfig && hasListOfDocuments) {
      console.warn('🦋 [superdoc] You can only provide one of document or documents');
    }

    if (hasDocumentConfig) {
      // If an uploader-specific wrapper was passed, normalize it.
      const normalized = normalizeDocumentEntry(this.config.document);
      this.config.documents = [
        {
          id: uuidv4(),
          ...normalized,
        },
      ];
    } else if (hasDocumentUrl) {
      this.config.documents = [
        {
          id: uuidv4(),
          type: DOCX,
          url: this.config.document as string,
          name: 'document.docx',
        },
      ];
    } else if (hasDocumentFile) {
      const normalized = normalizeDocumentEntry(this.config.document);
      this.config.documents = [
        {
          id: uuidv4(),
          ...normalized,
        },
      ];
    } else if (hasDocumentBlob) {
      const normalized = normalizeDocumentEntry(this.config.document);
      this.config.documents = [
        {
          id: uuidv4(),
          ...normalized,
        },
      ];
    }

    // Also normalize any provided documents array entries (e.g., when consumer passes uploader wrappers directly)
    if (Array.isArray(this.config.documents) && this.config.documents.length > 0) {
      this.config.documents = this.config.documents.map((d) => {
        const normalized = normalizeDocumentEntry(d);

        if (!normalized || typeof normalized !== 'object') {
          return normalized;
        }

        const existingId =
          (typeof normalized === 'object' && 'id' in normalized && normalized.id) ||
          (d && typeof d === 'object' && 'id' in d && d.id);

        return {
          ...normalized,
          id: existingId || uuidv4(),
        };
      });
    }
  }

  #initVueApp() {
    const { app, pinia, superdocStore, commentsStore, highContrastModeStore } = createSuperdocVueApp({
      disablePiniaDevtools: Boolean(this.config.disablePiniaDevtools),
    });
    this.app = app;
    this.pinia = pinia;
    this.app.config.globalProperties.$config = this.config;
    this.app.config.globalProperties.$documentMode = this.config.documentMode;

    this.app.config.globalProperties.$superdoc = this;

    // Provide surface manager to Vue components via app-level provide
    this.app.provide('surfaceManager', this.#surfaceManager);

    this.superdocStore = superdocStore;
    this.commentsStore = commentsStore;
    this.highContrastModeStore = highContrastModeStore;
    if (typeof this.superdocStore.setExceptionHandler === 'function') {
      this.superdocStore.setExceptionHandler((payload: SuperDocExceptionStorePayload) =>
        this.emit('exception', payload),
      );
    }
    this.superdocStore.init(this.config);
    const commentsModuleConfig = this.config.modules.comments;
    // `commentsModuleConfig` is `false | object | undefined`. A truthy
    // check already rules out both `false` and `undefined`, so an
    // explicit `!== false` afterwards is redundant.
    this.commentsStore.init(commentsModuleConfig || {});
    if (this.isCollaborative) {
      initCollaborationComments(this);
    }
    this.#syncViewingVisibility();
  }

  /**
   * Register an optional `Config` callback as a listener for the matching
   * SuperDoc event. The event key constrains `K`, so TypeScript checks
   * that the consumer-typed `Config.onX` is assignable to
   * `SuperDocEventMap[event]` at the registration site. No-ops on
   * `undefined`, so optional callbacks do not register dead listeners.
   *
   * This catches most event/callback drift at registration sites; the
   * earlier `any → any` bridge let mismatches like `lockedBy: User` vs
   * runtime `User | null` ship undetected. It does not catch overly
   * wide callback types: `(p: {}) => void` is contravariantly
   * assignable to any narrower payload, so consumer fixtures still
   * need to lock the exact emitted payload shape per callback (see
   * `tests/consumer-typecheck/src/config-callback-payloads.ts`).
   */
  #onConfig<K extends keyof SuperDocEventMap>(
    event: K,
    listener: EventEmitter.EventListener<SuperDocEventMap, K> | undefined,
  ): void {
    if (listener) this.on(event, listener);
  }

  #initListeners() {
    this.#onConfig('editorBeforeCreate', this.config.onEditorBeforeCreate);
    this.#onConfig('editorCreate', this.config.onEditorCreate);
    this.#onConfig('editorDestroy', this.config.onEditorDestroy);
    this.#onConfig('ready', this.config.onReady);
    this.#onConfig('comments-update', this.config.onCommentsUpdate);
    this.#onConfig('content-control:active-change', this.config.onContentControlActiveChange);
    this.#onConfig('content-control:click', this.config.onContentControlClick);
    this.#onConfig('awareness-update', this.config.onAwarenessUpdate);
    this.#onConfig('locked', this.config.onLocked);
    this.#onConfig('pdf:document-ready', this.config.onPdfDocumentReady);
    this.#onConfig('sidebar-toggle', this.config.onSidebarToggle);
    this.#onConfig('collaboration-ready', this.config.onCollaborationReady);
    this.#onConfig('editor-update', this.config.onEditorUpdate);
    this.on('content-error', this.onContentError);
    this.#onConfig('exception', this.config.onException);
    this.#onConfig('list-definitions-change', this.config.onListDefinitionsChange);
    this.#onConfig('pagination-update', this.config.onPaginationUpdate);
    this.#onConfig('fonts-resolved', this.config.onFontsResolved);
    this.#onConfig('fonts-changed', this.config.onFontsChanged);
    this.#onConfig('zoomChange', this.config.onZoomChange);
    this.#onConfig('viewport-change', this.config.onViewportChange);
  }

  /**
   * Initialize collaboration if configured. Accepts the full
   * `Config.modules` block so it can read both the collaboration
   * subkey and the comments subkey at once.
   * @returns The processed documents with collaboration enabled. Caller awaits for side effects; the return value is informational.
   */
  async #initCollaboration(
    { collaboration: collaborationModuleConfig, comments: commentsConfig = {} }: Modules = {} as Modules,
  ) {
    if (!collaborationModuleConfig) return this.config.documents;

    // Check for external ydoc/provider (provider-agnostic mode)
    const { ydoc: externalYdoc, provider: externalProvider } = collaborationModuleConfig;

    if (externalYdoc && externalProvider) {
      // If no documents provided, create a default blank document
      if (!this.config.documents || this.config.documents.length === 0) {
        this.config.documents = [
          {
            id: uuidv4(),
            type: DOCX,
            name: 'document.docx',
          },
        ];
      }

      this.#attachExternalCollaboration(externalYdoc, externalProvider);

      // Initialize comments sync (will be re-initialized in #initVueApp if
      // store is recreated, but the initial subscription must happen here
      // so comments are available by the time the store is initialized).
      initCollaborationComments(this);

      return this.config.documents;
    }

    // Flag this superdoc as collaborative.
    this.isCollaborative = true;

    // Fallback: internal provider creation.
    // Start a socket for all documents and general metaMap for this SuperDoc
    if (collaborationModuleConfig.providerType === 'hocuspocus') {
      this.config.socket = new HocuspocusProviderWebsocket({
        url: collaborationModuleConfig.url as string,
      });
    }

    // Initialize collaboration for documents
    const processedDocuments = makeDocumentsCollaborative(this);

    // Optionally, initialize separate superdoc sync - for comments, view, etc.
    if (
      commentsConfig &&
      commentsConfig.useInternalExternalComments &&
      !commentsConfig.suppressInternalExternalComments
    ) {
      const sdResult = initSuperdocYdoc(this);
      if (!sdResult) {
        throw new Error(
          'SuperDoc: `modules.comments.useInternalExternalComments` requires `superdocId` to be set in the config.',
        );
      }
      this.ydoc = markRaw(sdResult.ydoc);
      this.provider = markRaw(sdResult.provider);
    } else {
      this.ydoc = markRaw(processedDocuments[0].ydoc);
      this.provider = markRaw(processedDocuments[0].provider);
    }

    // Initialize comments sync, if enabled
    initCollaborationComments(this);

    return processedDocuments;
  }

  // ---------------------------------------------------------------------------
  // Collaboration attachment / detachment
  // ---------------------------------------------------------------------------

  /**
   * Attach an external ydoc/provider pair to this instance and all documents.
   *
   * Shared by constructor-time initialization and late upgrade.
   * Does NOT initialize collaboration comments — that happens in `#initVueApp()`
   * or explicitly after this call during construction.
   *
   */
  #attachExternalCollaboration(ydoc: Y.Doc, provider: CollaborationProvider) {
    this.isCollaborative = true;

    // Reset comments observer flag so a new observer is created for the new ydoc
    this._commentsCollabInitialized = false;

    // Mark as raw to prevent Vue's deep reactive traversal from hitting
    // circular references inside Y.js internals (causes stack overflow).
    this.ydoc = markRaw(ydoc);
    this.provider = markRaw(provider);

    this.#assignUserColor();
    const internalConfig = this.config;
    this._cleanupAwareness = setupAwarenessHandler(provider, this, internalConfig.user);

    internalConfig.documents.forEach((doc: RuntimeDocument) => {
      doc.ydoc = ydoc;
      doc.provider = provider;
      doc.role = this.config.role;
    });
  }

  /**
   * Undo `#attachExternalCollaboration()` so the instance can fall back
   * to non-collaborative mode (used during best-effort rollback).
   */
  #detachCollaboration() {
    // Remove the awareness listener so the discarded provider cannot emit
    // awareness-update events into this SuperDoc instance after rollback.
    if (typeof this._cleanupAwareness === 'function') {
      this._cleanupAwareness();
      this._cleanupAwareness = null;
    }

    this.isCollaborative = false;
    this._commentsCollabInitialized = false;
    this.ydoc = undefined;
    this.provider = undefined;
    const cfg = this.config;
    delete cfg.modules.collaboration;

    cfg.documents.forEach((doc: RuntimeDocument) => {
      delete doc.ydoc;
      delete doc.provider;
    });
  }

  /**
   * Assign a deterministic color to the local user for awareness broadcasts.
   *
   * Without this, y-prosemirror's cursor plugin defaults to orange (#ffa500),
   * causing color flickering. The color is derived from a hash of the user's
   * identity so different users get different colors.
   */
  #assignUserColor() {
    // `#init` always populates `this.config.user` (defaults to DEFAULT_USER
    // when the consumer didn't pass one). The guard is here for the
    // strictNullChecks contract on the public Config.user typedef, which
    // must stay optional because consumers should not be required to pass
    // a user up front.
    const user = this.config.user;
    if (!user || user.color) return;

    const palette = this.colors.length > 0 ? this.colors : DEFAULT_AWARENESS_PALETTE;
    const userKey = user.id || user.email || user.name || '';
    let hash = 5381;
    for (let i = 0; i < userKey.length; i++) {
      hash = ((hash << 5) + hash) ^ userKey.charCodeAt(i);
    }
    user.color = palette[Math.abs(hash) % palette.length];
  }

  // ---------------------------------------------------------------------------
  // Late collaboration upgrade
  // ---------------------------------------------------------------------------

  /**
   * Upgrade a local SuperDoc instance into collaboration by overwriting
   * the supplied room with the current local document and comment state,
   * then attaching collaboration to the live editor instance in place.
   *
   * This is a **destructive promotion**: the target room is authoritatively
   * overwritten with the caller's current local state. It is NOT the API
   * for joining an existing room without changing its content.
   *
   * Currently limited to:
   * - A single DOCX document
   * - External `{ ydoc, provider }` collaboration
   * - Overwrite-and-upgrade only (no merge semantics)
   *
   * @returns Resolves once the collaborative runtime is ready
   */
  async upgradeToCollaboration({ ydoc, provider }: UpgradeToCollaborationOptions): Promise<void> {
    this.#validateUpgradePrerequisites({ ydoc, provider });
    this.#isUpgrading = true;

    try {
      const sourceEditor = this.#resolveSourceEditor();

      await this.#waitForProviderSync(provider);
      this.#assertNotDestroyed();

      // --- Seed the room authoritatively (while editor is still local) ---
      seedEditorStateToYDoc(sourceEditor, ydoc);
      overwriteRoomComments(ydoc, this.#requireCommentsStore('upgradeToCollaboration').commentsList);
      overwriteRoomLockState(ydoc, { isLocked: this.isLocked ?? false, lockedBy: this.lockedBy ?? null });

      // --- Attach collaboration config (awareness, flags, config.documents) ---
      this.config.modules.collaboration = { ydoc, provider };
      this.#attachExternalCollaboration(ydoc, provider);

      // --- Update live store documents in place (no Vue unmount) ---
      this.#setStoreDocumentCollaboration(ydoc, provider);

      // --- Hot-swap collaboration into the live editor ---
      const editorInstance = this.#resolveUpgradeTarget();
      try {
        editorInstance.attachCollaboration({ ydoc, collaborationProvider: provider });
      } catch (attachError) {
        // Rollback: undo config/store/awareness mutations.
        // The editor rolled back its own options and cleaned up side effects.
        this.#rollbackCollaborationAttach();
        throw attachError;
      }

      // --- Wait for collaborationReady so cursors and UI are fully wired ---
      // The collaborationReady event fires asynchronously after attachCollaboration
      // returns (via initSyncListener → setTimeout). The returned promise only
      // resolves once the editor is fully collaborative.
      //
      // If the wait times out or is aborted by destroy(), we do NOT rollback.
      // The attach succeeded — the editor IS collaborative. The timeout only
      // means secondary setup (cursors, presence) is delayed. Rejecting or
      // rolling back would strand the instance in a worse state.
      await this.#waitForCollaborationReady(editorInstance);

      // If destroy() fired during the readiness wait, bail out before
      // registering any new listeners/observers against the dead instance.
      if (this.#destroyed) return;

      // --- Wire collaboration comments (from Yjs, not DOCX re-import) ---
      initCollaborationComments(this);
    } finally {
      this.#abortUpgrade = null;
      this.#isUpgrading = false;
    }
  }

  /**
   * Throw if the instance has been destroyed. Used as a checkpoint after
   * async waits inside upgradeToCollaboration().
   */
  #assertNotDestroyed() {
    if (this.#destroyed) {
      throw new Error('SuperDoc: instance was destroyed during upgrade');
    }
  }

  /**
   * Return the superdoc store, throwing a clear lifecycle error if
   * `#initVueApp` hasn't populated it yet. Use from public methods
   * that genuinely require the runtime to be ready (state-reading,
   * mutation, export, focus). Pre-ready safe-no-op paths
   * (`getPresentationEditorForDocument`, `navigateTo`, `getZoom`,
   * etc.) keep their existing optional-chain pattern instead.
   *
   * SD-2916 PR-B: `superdocStore` is typed `T | undefined` so every
   * non-optional access goes through this helper, which makes the
   * "instance not yet ready" failure mode explicit instead of a
   * generic TypeError on `.documents`.
   *
   * @param methodName The public method name surfaced in
   *   the error so consumers know which call needed the ready state.
   */
  #requireSuperdocStore(methodName: string) {
    if (!this.superdocStore) {
      throw new Error(
        `SuperDoc: ${methodName} requires the instance to be ready; wait for the "ready" event before calling.`,
      );
    }
    return this.superdocStore;
  }

  /**
   * Counterpart to `#requireSuperdocStore` for the comments store.
   * Used by paths that read `commentsStore.commentsList` or other
   * non-optional store members. Pre-ready safe paths (`getComment`,
   * `setActiveComment`, etc.) keep their existing `?.` pattern.
   *
   */
  #requireCommentsStore(methodName: string) {
    if (!this.commentsStore) {
      throw new Error(
        `SuperDoc: ${methodName} requires the instance to be ready; wait for the "ready" event before calling.`,
      );
    }
    return this.commentsStore;
  }

  /**
   * Lightweight readiness guard for fields whose only access is
   * mutation (e.g. `users` via `addSharedUser`/`removeSharedUser`).
   * The store fields are the most reliable "ready" proxy since they
   * are the last things `#init` populates.
   *
   */
  #requireReady(methodName: string) {
    if (!this.superdocStore) {
      throw new Error(
        `SuperDoc: ${methodName} requires the instance to be ready; wait for the "ready" event before calling.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Late-upgrade helpers
  // ---------------------------------------------------------------------------

  /**
   * Set ydoc/provider on live store document composables.
   * Each composable uses shallowRef for these fields (use-document.js:28-29),
   * so we assign to `.value` directly. Vue's reactive proxy auto-unwraps
   * shallowRefs on property access, so we must use `toRaw()` to reach the
   * underlying ref objects.
   *
   */
  #setStoreDocumentCollaboration(ydoc: Y.Doc | null, provider: CollaborationProvider | null) {
    const storeDocs = this.superdocStore?.documents;
    if (!Array.isArray(storeDocs)) return;
    for (const doc of storeDocs) {
      const raw = toRaw(doc);
      if (raw.ydoc && typeof raw.ydoc === 'object' && 'value' in raw.ydoc) {
        raw.ydoc.value = ydoc;
      }
      if (raw.provider && typeof raw.provider === 'object' && 'value' in raw.provider) {
        raw.provider.value = provider;
      }
    }
  }

  /**
   * Resolve the editor instance that supports `attachCollaboration`.
   * Prefers PresentationEditor (has cursor/layout support); falls back to raw Editor.
   *
   */
  #resolveUpgradeTarget() {
    const storeDocs = this.superdocStore?.documents;
    if (!storeDocs?.length) {
      throw new Error('SuperDoc: no store documents available for upgrade');
    }
    const target = storeDocs[0].getPresentationEditor?.() || storeDocs[0].getEditor?.();
    if (!target?.attachCollaboration) {
      throw new Error('SuperDoc: editor does not support attachCollaboration');
    }
    return target;
  }

  /**
   * Undo config/store/awareness mutations if `editor.attachCollaboration()` fails.
   * The editor itself is still in local mode (the throw happened before or during
   * reconfigure), so we only need to undo the SuperDoc-layer changes.
   */
  #rollbackCollaborationAttach() {
    this.#detachCollaboration();
    this.#setStoreDocumentCollaboration(null, null);
  }

  /**
   * Wait for the backing editor to emit `collaborationReady` after a live
   * attach. Resolves immediately if the editor has already fired the event.
   *
   * This wait is **non-fatal**: if it times out or is aborted by `destroy()`,
   * the promise still resolves (not rejects). The attach already succeeded,
   * so the editor IS collaborative. A timeout only means secondary setup
   * (cursors, presence) is delayed — rolling back would be worse.
   *
   */
  #waitForCollaborationReady(editorInstance: Editor | PresentationEditor) {
    const TIMEOUT_MS = 10_000;

    // PresentationEditor wraps Editor; get the underlying editor for event
    // listening. PresentationEditor exposes a `get editor(): Editor`
    // accessor; plain Editor has no such property, so the runtime `??`
    // fallback returns the instance itself in that case. The structural
    // `{ editor? }` cast names the lookup without claiming the field
    // exists on the Editor arm of the union.
    const editor = ((editorInstance as { editor?: Editor }).editor ?? editorInstance) as Editor;

    // If collaborationReady already fired (options flag set by collaboration extension)
    if (editor.options?.collaborationIsReady) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (typeof editor.off === 'function') editor.off('collaborationReady', onReady);
      };

      const timer = setTimeout(() => {
        cleanup();
        console.warn(
          '[SuperDoc] collaborationReady did not fire within 10 s after collaboration attach. Continuing — collaboration is active but cursor/presence setup may be delayed.',
        );
        resolve(undefined);
      }, TIMEOUT_MS);

      const onReady = () => {
        cleanup();
        resolve(undefined);
      };

      // Allow destroy() to abort this wait immediately.
      this.#abortUpgrade = () => {
        cleanup();
        resolve(undefined);
      };

      if (typeof editor.on === 'function') {
        editor.on('collaborationReady', onReady);
      } else {
        cleanup();
        resolve(undefined);
      }
    });
  }

  /**
   * Wait for the provider to report synced, with a timeout.
   *
   * Mirrors the timeout + cleanup pattern from Editor.replaceFile() so a
   * provider that exposes on/off but never emits sync cannot hang forever.
   * destroy() can abort this wait early via #abortUpgrade.
   *
   */
  #waitForProviderSync(provider: CollaborationProvider) {
    const SYNC_TIMEOUT_MS = 10_000;

    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      // Initial no-op; reassigned below to the real cleanup once the
      // sync observer is registered.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      let syncCleanup = () => {};

      const settle = () => {
        settled = true;
        clearTimeout(timer);
        syncCleanup();
      };

      syncCleanup = onCollaborationProviderSynced(provider, () => {
        if (settled) return;
        settle();
        resolve();
      });

      if (!settled) {
        timer = setTimeout(() => {
          settle();
          reject(
            new Error(
              `SuperDoc: collaboration provider did not sync within ${SYNC_TIMEOUT_MS} ms. ` +
                `The provider exposes on/off but never emitted sync(true) or synced.`,
            ),
          );
        }, SYNC_TIMEOUT_MS);
      }

      // Allow destroy() to abort the sync wait immediately
      this.#abortUpgrade = () => {
        if (settled) return;
        settle();
        reject(new Error('SuperDoc: instance was destroyed during upgrade'));
      };
    });
  }

  /**
   * Validate that the instance is in a valid state for a collaboration upgrade.
   * Throws descriptive errors for each invalid condition.
   *
   * @param options
   */
  #validateUpgradePrerequisites({ ydoc, provider }: UpgradeToCollaborationOptions) {
    if (this.#destroyed) {
      throw new Error('SuperDoc: cannot upgrade a destroyed instance');
    }
    if (this.#isUpgrading) {
      throw new Error('SuperDoc: upgrade already in progress');
    }
    if (this.isCollaborative) {
      throw new Error('SuperDoc: instance is already collaborative');
    }
    if (!ydoc || !provider) {
      throw new Error('SuperDoc: upgradeToCollaboration() requires both ydoc and provider');
    }

    const cfg = this.config;
    const docxDocs = cfg.documents.filter((d: RuntimeDocument) => d.type === DOCX);
    if (docxDocs.length === 0) {
      throw new Error('SuperDoc: no DOCX document found for upgrade');
    }
    if (docxDocs.length > 1) {
      throw new Error('SuperDoc: upgradeToCollaboration() only supports a single DOCX document');
    }
    if (cfg.documents.length !== docxDocs.length) {
      throw new Error('SuperDoc: upgradeToCollaboration() only supports single-DOCX instances');
    }
  }

  /**
   * Resolve the source editor from the DOCX document entry.
   *
   * @returns The editor instance for the source document
   * @throws {Error} If the editor is not yet created
   */
  #resolveSourceEditor() {
    // Upstream `#assertCanUpgrade` already verified at least one DOCX
    // document exists; cast the find result to assert non-null without
    // changing runtime behavior.
    const docxDoc = this.config.documents.find((d: RuntimeDocument) => d.type === DOCX) as RuntimeDocument;
    const storeDoc = this.#requireSuperdocStore('upgradeToCollaboration').documents.find(
      (d: RuntimeDocument) => d.id === docxDoc.id,
    );
    const editor = storeDoc?.getEditor?.();

    if (!editor) {
      throw new Error('SuperDoc: source editor not yet created — wait for the ready event before upgrading');
    }
    return editor;
  }

  /**
   * Add a user to the shared users list. Requires the instance to be
   * ready; pre-ready mutations would be silently overwritten by the
   * `this.users = this.config.users || []` re-seed inside `#init`.
   *
   * @param user The user to add
   */
  addSharedUser(user: User) {
    this.#requireReady('addSharedUser');
    const userKey = getActorIdentityKey({ actor: user });
    if (userKey && this.users.some((u) => getActorIdentityKey({ actor: u }) === userKey)) return;
    this.users.push(user);
  }

  /**
   * Remove a user from the shared users list. Requires the instance
   * to be ready for the same reason as `addSharedUser`. Accepts
   * either a user-like object or a legacy email string.
   *
   * @param userOrEmail The user or email of the user to remove
   */
  removeSharedUser(userOrEmail: User | string) {
    this.#requireReady('removeSharedUser');
    const legacyEmail = typeof userOrEmail === 'string' ? normalizeActorEmail(userOrEmail) : '';
    const targetKey =
      typeof userOrEmail === 'string' ? `email:${legacyEmail}` : getActorIdentityKey({ actor: userOrEmail });

    this.users = this.users.filter((u) => {
      const existingKey = getActorIdentityKey({ actor: u });
      if (targetKey) return existingKey !== targetKey;
      if (legacyEmail) return normalizeActorEmail(u.email) !== legacyEmail;
      return true;
    });
  }

  /**
   * Forward the editor's raw content-error to the consumer callback,
   * enriching with documentId and the source file. `error` is widened
   * to `unknown` because super-editor's emitters do not normalize to
   * `Error` consistently (e.g. `insertContentAt` forwards the original
   * caught value).
   *
   */
  onContentError({ error, editor }: { error: unknown; editor: Editor }) {
    const { documentId } = editor.options;
    // The errored editor came from `superdocStore.documents`, so the find
    // by its `documentId` is expected to hit. Cast the find result to a
    // RuntimeDocument to assert non-null at the consumer callback.
    const doc = this.#requireSuperdocStore('onContentError').documents.find(
      (d: RuntimeDocument) => d.id === documentId,
    ) as RuntimeDocument;
    // `onContentError` is typed as optional on the public Config typedef
    // because consumers don't have to wire a handler. The class field
    // initializer installs a `() => null` default, but `#init` spreads
    // the consumer-supplied config over it (`{ ...this.config, ...config }`),
    // so an explicit `onContentError: undefined` can still strip the
    // default. The optional chain keeps the call safe in that case.
    //
    // `documentId` is `string` on the public callback (runtime-guaranteed
    // by `#initDocuments`). `Document.id` is typed as optional, so cast
    // at this dispatch site to express the runtime invariant without
    // forcing a TS-only check in the hot error path.
    this.config.onContentError?.({
      error,
      editor,
      documentId: doc.id as string,
      file: doc.data,
    });
  }

  /**
   * Triggered when the PDF document is ready
   */
  broadcastPdfDocumentReady() {
    this.emit('pdf:document-ready');
  }

  /**
   * Triggered when the superdoc is ready
   */
  broadcastReady() {
    if (this.readyEditors === this.requiredNumberOfEditors) {
      this.emit('ready', { superdoc: this });
    }
  }

  /**
   * Triggered before an editor is created
   * @param editor The editor that is about to be created
   */
  broadcastEditorBeforeCreate(editor: Editor) {
    this.emit('editorBeforeCreate', { editor: createDeprecatedEditorProxy(editor) });
  }

  /**
   * Triggered when an editor is created
   * @param editor The editor that was created
   */
  broadcastEditorCreate(editor: Editor) {
    this.readyEditors++;
    this.broadcastReady();
    this.#wireFontsChangedRelay(editor);
    this.emit('editorCreate', { editor: createDeprecatedEditorProxy(editor) });
  }

  /** Editors whose `fonts-changed` we already relay, so a repeated create wires once. */
  #fontsRelayEditors = new WeakSet<Editor>();

  /**
   * Relay an editor's authoritative `fonts-changed` up to the SuperDoc surface, so
   * `superdoc.on('fonts-changed')` / `onFontsChanged` fire without the legacy
   * `fonts-resolved` SuperDoc.vue listener-transport. Two robustness rules the happy
   * path missed: (1) guard `editor.on` - test stubs and pre-layout editors lack it;
   * (2) the PresentationEditor may have emitted its first report BEFORE this relay
   * subscribed (a fast or swapped document), so replay the cached payload once on wire,
   * matching what `superdoc.fonts.getReport()` returns for the active document. Wired at
   * most once per editor (a create can fire twice).
   */
  #wireFontsChangedRelay(editor: Editor): void {
    if (!editor || typeof editor.on !== 'function') return;
    if (this.#fontsRelayEditors.has(editor)) return;
    this.#fontsRelayEditors.add(editor);
    editor.on('fonts-changed', (payload) => {
      if (this.#fontReportSurfaces(editor)) this.#deliverFontsChanged(payload);
    });
    // Replay the editor's already-emitted report once on wire (a fast or swapped document may
    // have emitted before this relay subscribed), under the SAME active-editor rule as the
    // live path so creating an inactive editor cannot replay a stale report into the cache.
    const cached = editor.presentationEditor?.getLastFontsChangedPayload?.();
    if (cached && this.#fontReportSurfaces(editor)) this.#deliverFontsChanged(cached);
  }

  /**
   * Whether a wired editor's font report may surface on the SuperDoc instance. Only the
   * active editor's report surfaces; before any editor is marked active, the sole editor's
   * does. After a document swap an old editor can still emit `fonts-changed` (e.g. a
   * timed-out font finishing later) or be re-created with a cached payload - the payload has
   * no document id to disambiguate, so surfacing it would poison the `onReport` cache for the
   * new document. Both the live event and the cached replay gate on this single rule.
   */
  #fontReportSurfaces(editor: Editor): boolean {
    return !this.activeEditor || editor === this.activeEditor;
  }

  /** Last font report delivered on this instance, so `fonts.onReport` can replay it. */
  #lastFontsChangedPayload: FontsChangedPayload | null = null;

  /** Cache then emit a font report, so a later `onReport` subscriber gets the current one. */
  #deliverFontsChanged(payload: FontsChangedPayload): void {
    this.#lastFontsChangedPayload = payload;
    this.emit('fonts-changed', payload);
  }

  /**
   * Triggered when an editor is destroyed
   */
  broadcastEditorDestroy() {
    this.emit('editorDestroy');
  }

  /**
   * Triggered when the comments sidebar is toggled
   */
  broadcastSidebarToggle(isOpened: boolean) {
    this.emit('sidebar-toggle', isOpened);
  }

  /** @param args */
  #log(...args: unknown[]) {
    (console.debug ? console.debug : console.log)('🦋 🦸‍♀️ [superdoc]', ...args);
  }

  #fontsApi: SuperDocFontsApi | null = null;

  /**
   * Read-only font surface: the substitution- and load-aware report for the active
   * editor's document. Pulls on demand (the same report streams via `fonts-changed`).
   * Stable identity; the closures always read the current `activeEditor`. Returns empty
   * arrays when no editor is active or layout mode is off.
   */
  get fonts(): SuperDocFontsApi {
    if (!this.#fontsApi) {
      this.#fontsApi = {
        getReport: () => this.activeEditor?.presentationEditor?.getFontReport() ?? [],
        getMissingFonts: () => this.activeEditor?.presentationEditor?.getMissingFonts() ?? [],
        getDocumentFonts: () => [
          // Deduped by logical family: the report can now carry multiple FACE rows per family.
          ...new Set(
            (this.activeEditor?.presentationEditor?.getFontReport() ?? []).map((record) => record.logicalFamily),
          ),
        ],
        onReport: (callback) => {
          // Snapshot-then-subscribe: the report may already have resolved (it fires during
          // load, before a consumer subscribes - and a document swap creates a fresh editor),
          // so deliver the current one immediately, then stream future changes. The active
          // editor is the source of truth for "current": use ITS cached report so a snapshot
          // matches `getReport()` for the active document. The instance-level cache can hold a
          // PRIOR document's payload after an active-editor switch, so it is only a fallback
          // for when no editor is active. When an active editor exists but has not produced a
          // report yet, deliver nothing (the subscription catches its first one) rather than
          // replaying a stale prior-editor payload. Returns an unsubscribe.
          const activeEditor = this.activeEditor;
          const current = activeEditor
            ? (activeEditor.presentationEditor?.getLastFontsChangedPayload?.() ?? null)
            : (this.#lastFontsChangedPayload ?? null);
          if (current) callback(current);
          this.on('fonts-changed', callback);
          return () => this.off('fonts-changed', callback);
        },
        // Active-editor scoped like the read methods, but these are WRITES. Route through the
        // document font controller; with no active editor, fail loudly rather than silently no-op.
        map: (mappings) => {
          const pe = this.activeEditor?.presentationEditor;
          if (!pe) throw new Error('superdoc.fonts.map requires an active editor');
          pe.mapFonts(mappings);
        },
        unmap: (families) => {
          const pe = this.activeEditor?.presentationEditor;
          if (!pe) throw new Error('superdoc.fonts.unmap requires an active editor');
          pe.unmapFonts(families);
        },
        add: (families) => {
          const pe = this.activeEditor?.presentationEditor;
          if (!pe) throw new Error('superdoc.fonts.add requires an active editor');
          pe.addFonts(Array.isArray(families) ? families : [families]);
        },
        preload: (families) => {
          const pe = this.activeEditor?.presentationEditor;
          if (!pe) throw new Error('superdoc.fonts.preload requires an active editor');
          return pe.preloadFonts(families);
        },
      };
    }
    return this.#fontsApi;
  }

  /**
   * Clear the legacy `activeEditor` projection and detach the v1 toolbar. Used
   * when active state clears and when an active runtime is unsupported for the
   * v1 shell path (v2-shaped, null, or command-incapable projection).
   */
  #clearActiveEditorProjection() {
    this.activeEditor = null;
    if (this.toolbar?.setActiveEditor) {
      this.toolbar.setActiveEditor(null as unknown as Editor);
    } else if (this.toolbar) {
      this.toolbar.activeEditor = null;
    }
  }

  /**
   * Apply a v1 legacy projection to `activeEditor` and rebind the v1 toolbar.
   * This is the legacy assignment side effect, kept separate from the registry
   * routing in `setActiveEditor(...)` so the registry bridge can apply a
   * projection without re-entering activation.
   *
   * @param editor The v1 legacy editor projection.
   */
  #applyActiveEditorProjection(editor: ActiveEditor) {
    this.activeEditor = editor;
    if (editor?.editorVersion === 2) return;
    if (this.toolbar) {
      this.activeEditor.toolbar = this.toolbar;
      this.toolbar.setActiveEditor(editor);
    }
  }

  /**
   * Reconcile the legacy `activeEditor` projection with a registry active-runtime
   * change. SuperDoc owns the invariant that `activeEditor` is either the active
   * runtime's supported v1 projection, or `null` when the active runtime has no
   * supported legacy projection.
   *
   * @param nextRuntimeId The newly active runtime id, or `null` when cleared.
   * @param projection The next runtime's legacy projection, if any.
   */
  #applyActiveRuntimeChange(nextRuntimeId: EditorRuntimeId | null, projection: unknown) {
    this.#applyingRuntimeActiveChange = true;
    try {
      if (nextRuntimeId === null) {
        this.#clearActiveEditorProjection();
        return;
      }
      const runtime = this.#editorRuntimeRegistry.get(nextRuntimeId);
      if (runtime?.kind === 'v1' && isCommandCapableV1LegacyProjection(projection)) {
        this.setActiveEditor(projection);
      } else {
        // Fail closed: a non-v1 runtime, or a runtime with a v2-shaped / null /
        // command-incapable projection, must not leave a stale v1 editor or
        // toolbar bound.
        this.#clearActiveEditorProjection();
      }
    } finally {
      this.#applyingRuntimeActiveChange = false;
    }
  }

  /**
   * Resolve the registered v1 runtime id that owns a legacy editor, preferring
   * projection identity and falling back to document id only when it maps to
   * exactly one v1 runtime (never guess when more than one runtime shares a doc).
   *
   * @param editor The legacy editor to resolve a runtime for.
   * @returns The owning runtime id, or `null` when none can be resolved.
   */
  #resolveRuntimeIdForEditor(editor: ActiveEditor | null): EditorRuntimeId | null {
    if (!editor) return null;
    for (const runtime of this.#editorRuntimeRegistry.getAll()) {
      if (runtime.kind !== 'v1') continue;
      if (runtime.getLegacyEditorProjection?.() === editor) return runtime.id;
    }
    const documentId = editor.options?.documentId;
    if (typeof documentId === 'string' && documentId.length > 0) {
      const matches = this.#editorRuntimeRegistry
        .getAllByDocumentId(documentId)
        .filter((runtime) => runtime.kind === 'v1');
      if (matches.length === 1) return matches[0].id;
    }
    return null;
  }

  /**
   * Set the active editor (legacy entry point). When the editor maps to a
   * registered runtime this routes through the registry so the active runtime
   * and `activeEditor` cannot drift apart; the registry bridge then applies the
   * projection. Direct legacy assignment is used only before runtime
   * registration (startup) or when no owning runtime can be resolved.
   *
   * @param editor The editor to set as active
   */
  setActiveEditor(editor: ActiveEditor | null) {
    if (!isCommandCapableV1LegacyProjection(editor)) {
      this.#clearActiveEditorProjection();
      return;
    }
    if (!this.#applyingRuntimeActiveChange) {
      const runtimeId = this.#resolveRuntimeIdForEditor(editor);
      if (runtimeId !== null) {
        const wasAlreadyActive = this.#editorRuntimeRegistry.getActive()?.id === runtimeId;
        // Activate the owning runtime; the registry bridge applies the
        // projection (and rebinds the toolbar) for us.
        this.#editorRuntimeRegistry.setActive(runtimeId, 'set-active-editor');
        if (wasAlreadyActive) {
          // `setActive` is idempotent and emits no bridge event when the runtime
          // is already active. Re-apply the projection so legacy callers can
          // rebind surfaces that were intentionally detached (for example,
          // viewing mode keeps the active runtime but disables the toolbar).
          // Always use the runtime's canonical projection; document-id fallback
          // may have resolved from a same-document editor that is not the active
          // runtime's legacy projection.
          const projection = this.#editorRuntimeRegistry.get(runtimeId)?.getLegacyEditorProjection?.() ?? null;
          if (isCommandCapableV1LegacyProjection(projection)) {
            this.#applyActiveEditorProjection(projection);
          } else {
            this.#clearActiveEditorProjection();
          }
        }
        return;
      }
    }
    this.#applyActiveEditorProjection(editor);
  }

  /**
   * Register a mounted editor runtime with the shell-owned registry.
   *
   * @param runtime
   * @internal
   */
  private registerEditorRuntime(runtime: EditorRuntime): void {
    this.#editorRuntimeRegistry.register(runtime);
  }

  /**
   * Unregister a mounted editor runtime by id. If it was active, active state
   * clears and the registry does not auto-promote a different runtime.
   *
   * @param runtimeId
   * @returns Whether a runtime was removed.
   * @internal
   */
  private unregisterEditorRuntime(runtimeId: EditorRuntimeId): boolean {
    return this.#editorRuntimeRegistry.unregister(runtimeId);
  }

  /**
   * Return the active editor runtime, or null.
   *
   * @internal
   */
  private getActiveRuntime(): EditorRuntime | null {
    return this.#editorRuntimeRegistry.getActive();
  }

  /**
   * Select the active editor runtime, or clear it with null.
   *
   * @param runtimeId
   * @param reason
   * @internal
   */
  private setActiveRuntime(runtimeId: EditorRuntimeId | null, reason: string): void {
    this.#editorRuntimeRegistry.setActive(runtimeId, reason);
  }

  /**
   * Resolve which mounted runtime owns a DOM event target.
   *
   * @param target
   * @internal
   */
  private resolveRuntimeFromEventTarget(target: EventTarget | null): EditorRuntime | null {
    return this.#editorRuntimeRegistry.resolveFromEventTarget(target);
  }

  /**
   * Resolve and activate the runtime that owns a DOM event target.
   *
   * @param target
   * @param reason
   * @returns Whether a runtime was resolved and activated.
   * @internal
   */
  private activateRuntimeFromEventTarget(target: EventTarget | null, reason: string): boolean {
    const runtime = this.#editorRuntimeRegistry.resolveFromEventTarget(target);
    if (!runtime) return false;
    this.#editorRuntimeRegistry.setActive(runtime.id, reason);
    return true;
  }

  /**
   * Toggle the ruler visibility for SuperEditors
   *
   */
  toggleRuler() {
    // Guard before mutating `this.config.rulers` so a pre-ready call
    // throws without partially flipping the config.
    const store = this.#requireSuperdocStore('toggleRuler');
    this.config.rulers = !this.config.rulers;
    store.documents.forEach((doc: RuntimeDocument) => {
      // In Pinia store, refs are auto-unwrapped, so rulers is a plain boolean
      doc.rulers = this.config.rulers;
    });
  }

  /**
   * Determine whether the current configuration allows a given permission.
   * Used by downstream consumers (toolbar, context menu, commands) to keep
   * tracked-change affordances consistent with customer overrides.
   *
   * The `comment` and `trackedChange` fields on the input carry open
   * index signatures because the function forwards the full payload to
   * `isAllowed()`; tracked-change payloads from the editor include
   * `type`, `attrs`, `from`, `to`, `segments`, and consumer comment
   * shapes vary. The fields read directly here are documented on the
   * input type itself.
   *
   * @see {@link CanPerformPermissionParams} for the input shape.
   */
  canPerformPermission({
    permission,
    role = this.config.role,
    isInternal = this.config.isInternal,
    comment = null,
    trackedChange = null,
  }: CanPerformPermissionParams = {}): boolean {
    if (!permission) return false;

    let resolvedComment = comment ?? trackedChange?.comment ?? null;

    const commentId = trackedChange?.commentId || trackedChange?.id;
    if (!resolvedComment && commentId && this.commentsStore?.getComment) {
      const storeComment = this.commentsStore.getComment(commentId);
      const getValues = storeComment?.getValues;
      resolvedComment = typeof getValues === 'function' ? getValues.call(storeComment) : storeComment;
    }

    const context = {
      superdoc: this,
      currentUser: this.config.user,
      comment: resolvedComment ?? null,
      trackedChange: trackedChange ?? null,
    };

    return isAllowed(permission, role as string, isInternal as boolean, context);
  }

  #addToolbar() {
    const moduleConfig = this.config.modules?.toolbar || {};
    this.toolbarElement = this.config.modules?.toolbar?.selector || this.config.toolbar;
    this.toolbar = null;

    // Build excludeItems list - hide ruler button if rulers not configured or in web layout
    const excludeItems = [...(moduleConfig.excludeItems || [])];
    if (!this.config.rulers || this.config.viewOptions?.layout === 'web') {
      excludeItems.push('ruler');
    }

    const config = {
      selector: this.toolbarElement || null,
      isDev: this.isDev || false,
      // `Config.toolbarGroups` is the ordered list of group ids
      // (`['left', 'center', 'right']`). `modules.toolbar.groups` is the
      // separate `Record<string, string[]>` mapping group ids to item
      // ids and flows through the `...moduleConfig` spread below.
      // The earlier `groups || toolbarGroups` shorthand conflated the
      // two shapes and silently widened the toolbar's group-ordering
      // input to a record at runtime.
      toolbarGroups: this.config.toolbarGroups,
      role: this.config.role,
      icons: this.config.modules?.toolbar?.icons || this.config.toolbarIcons,
      texts: this.config.modules?.toolbar?.texts || this.config.toolbarTexts,
      fonts: this.config.modules?.toolbar?.fonts || null,
      hideButtons: this.config.modules?.toolbar?.hideButtons ?? true,
      responsiveToContainer: this.config.modules?.toolbar?.responsiveToContainer ?? false,
      documentMode: this.config.documentMode,
      superdoc: this,
      aiApiKey: this.config.modules?.ai?.apiKey,
      aiEndpoint: this.config.modules?.ai?.endpoint,
      uiDisplayFallbackFont: this.config.uiDisplayFallbackFont,
      ...moduleConfig,
      excludeItems, // Override moduleConfig.excludeItems with our computed list
    };

    this.toolbar = new SuperToolbar(config);

    // Toolbar bridge: forwards SuperToolbar's exception events into the
    // user's Config.onException callback. SuperToolbar's event types are
    // not aligned with SuperDocEventMap, so this is intentionally a
    // local cast rather than going through the typed `#onConfig` helper.
    // Truthy guard mirrors `#onConfig`: skip absent callbacks (consumer
    // passes `{ onException: undefined }` explicitly), but pass through
    // truthy non-function values so eventemitter3 throws loudly at
    // registration time.
    if (this.config.onException) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.toolbar.on('exception', this.config.onException as any);
    }
    // `this.toolbar` infers as `SuperToolbar | null` from the field's
    // first assignment in `#addToolbar` (the `null` placeholder a few
    // lines up). The closure registers after the SuperToolbar instance
    // is in place and reads `this.toolbar` at emission time, so under
    // normal flow it will see the live instance; the optional chain
    // is here to satisfy TS's typedef and to no-op if a future
    // `destroy()` ever clears the field.
    this.once('editorCreate', () => this.toolbar?.updateToolbarState());
  }

  /**
   * Add a comments list to the superdoc
   * Requires the comments module to be enabled
   * @param element The DOM element to render the comments list in
   */
  addCommentsList(element: HTMLElement) {
    if (!this.config?.modules?.comments || this.config.role === 'viewer') return;
    if (element) this.config.modules.comments.element = element;
    this.commentsList = new SuperComments(this.config.modules?.comments, this);
    if (this.config.onCommentsListChange) this.config.onCommentsListChange({ isRendered: true });
  }

  /**
   * Remove the comments list from the superdoc
   */
  removeCommentsList() {
    if (this.commentsList) {
      this.commentsList.close();
      this.commentsList = null;
      if (this.config.onCommentsListChange) this.config.onCommentsListChange({ isRendered: false });
    }
  }

  /**
   * Scroll the document to a given comment by id.
   *
   * @param commentId The comment id
   * @param [options]
   * @returns Whether a matching element was found
   */
  scrollToComment(commentId: string, options: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition } = {}) {
    const commentsConfig = this.config?.modules?.comments;
    // `commentsConfig` can be `false | object | undefined`; `!commentsConfig`
    // already covers both `false` and `undefined`, so the secondary
    // `=== false` check below is redundant.
    if (!commentsConfig) return false;
    if (!commentId || typeof commentId !== 'string') return false;

    const root = this.element || document;
    const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(commentId) : commentId.replace(/"/g, '\\"');
    const element = root.querySelector(`[data-comment-ids*="${escaped}"]`);
    if (!element) return false;

    const { behavior = 'smooth', block = 'start' } = options ?? {};
    element.scrollIntoView({ behavior, block });
    this.commentsStore?.setActiveComment?.(this, commentId);
    return true;
  }

  /**
   * Navigate to a block, bookmark, comment, or tracked change target.
   *
   * Story-aware navigation is currently supported for bookmark and tracked
   * change targets. Block and comment targets are body-only.
   *
   * @returns Whether the target was found and navigated to.
   */
  async navigateTo(target: NavigableAddress): Promise<boolean> {
    const storeDocs = this.superdocStore?.documents;
    if (!storeDocs?.length) return false;
    const presentationEditor = storeDocs[0].getPresentationEditor?.();
    if (!presentationEditor?.navigateTo) return false;
    return presentationEditor.navigateTo(target);
  }

  /**
   * Scroll to any document element by its ID.
   *
   * Pass any element ID — paragraph nodeId, comment entityId, or tracked
   * change entityId. The method resolves the element type automatically
   * and scrolls to it.
   *
   * @param elementId - The element's stable ID.
   * @returns Whether the element was found and scrolled to.
   *
   * @example
   * // Navigate to a paragraph by its nodeId
   * await superdoc.scrollToElement('5AF80E61');
   *
   * // Navigate to a comment by its entityId
   * await superdoc.scrollToElement('imported-25def254');
   */
  async scrollToElement(elementId: string): Promise<boolean> {
    const storeDocs = this.superdocStore?.documents;
    if (!storeDocs?.length) return false;
    const presentationEditor = storeDocs[0].getPresentationEditor?.();
    if (!presentationEditor?.scrollToElement) return false;
    return presentationEditor.scrollToElement(elementId);
  }

  /**
   * Toggle the custom context menu globally.
   * Updates both flow editors and PresentationEditor instances so downstream listeners can short-circuit early.
   */
  setDisableContextMenu(disabled = true) {
    const nextValue = Boolean(disabled);
    if (this.config.disableContextMenu === nextValue) return;
    this.config.disableContextMenu = nextValue;

    this.superdocStore?.documents?.forEach((doc: RuntimeDocument) => {
      const presentationEditor = doc.getPresentationEditor?.();
      if (presentationEditor?.setContextMenuDisabled) {
        presentationEditor.setContextMenuDisabled(nextValue);
      }
      const editor = doc.getEditor?.();
      if (editor?.setOptions) {
        editor.setOptions({ disableContextMenu: nextValue });
      }
    });
  }

  /**
   * SD-2454: Toggle bookmark bracket indicators (opt-in, off by default).
   * Matches Word's "Show bookmarks" option. Triggers a re-layout on change
   * because the brackets are visible characters participating in text flow.
   */
  setShowBookmarks(show = true) {
    const nextValue = Boolean(show);
    const layoutOptions = (this.config.layoutEngineOptions = this.config.layoutEngineOptions || {});
    if (layoutOptions.showBookmarks === nextValue) return;
    layoutOptions.showBookmarks = nextValue;

    this.superdocStore?.documents?.forEach((doc: RuntimeDocument) => {
      const presentationEditor = doc.getPresentationEditor?.();
      presentationEditor?.setShowBookmarks?.(nextValue);
    });
  }

  /**
   * Toggle nonprinting formatting marks (spaces, tabs, paragraph marks) in the
   * rendered layout. This is a view-only setting and is not exported to DOCX.
   */
  setShowFormattingMarks(show = true) {
    const nextValue = Boolean(show);
    const layoutOptions = (this.config.layoutEngineOptions = this.config.layoutEngineOptions || {});
    if (layoutOptions.showFormattingMarks === nextValue) return;
    layoutOptions.showFormattingMarks = nextValue;

    this.superdocStore?.documents?.forEach((doc: RuntimeDocument) => {
      const presentationEditor = doc.getPresentationEditor?.();
      presentationEditor?.setShowFormattingMarks?.(nextValue);
    });

    this.emit('formatting-marks-change', { showFormattingMarks: nextValue, superdoc: this });
    this.toolbar?.updateToolbarState?.();
  }

  /**
   * Toggle nonprinting formatting marks from their current state.
   */
  toggleFormattingMarks() {
    const currentValue = Boolean(this.config.layoutEngineOptions?.showFormattingMarks);
    this.setShowFormattingMarks(!currentValue);
  }

  /**
   * Set the document mode.
   */
  setDocumentMode(type: DocumentMode) {
    if (!type) return;

    // Guard before mutating `this.config.documentMode` so a pre-ready
    // call throws without partially advancing the mode and triggering
    // `#syncViewingVisibility` / tracked-change preference writes.
    this.#requireReady('setDocumentMode');

    type = type.toLowerCase() as DocumentMode;
    this.config.documentMode = type;
    this.#syncViewingVisibility();

    const types = {
      viewing: () => this.#setModeViewing(),
      editing: () => this.#setModeEditing(),
      suggesting: () => this.#setModeSuggesting(),
    };

    if (types[type]) {
      types[type]();
      this.emit('document-mode-change', { documentMode: type });
    }
  }

  /**
   * Set the document mode on a document's editor (PresentationEditor or Editor).
   * Tries PresentationEditor first, falls back to Editor for backward compatibility.
   * @param doc - The document object
   * @param mode - The document mode ('editing', 'viewing', 'suggesting')
   */
  #applyDocumentMode(doc: RuntimeDocument, mode: DocumentMode) {
    const presentationEditor = typeof doc.getPresentationEditor === 'function' ? doc.getPresentationEditor() : null;
    if (presentationEditor) {
      presentationEditor.setDocumentMode(mode);
      return;
    }
    const editor = typeof doc.getEditor === 'function' ? doc.getEditor() : null;
    if (editor) {
      editor.setDocumentMode(mode);
    }
  }

  /**
   * Force PresentationEditor instances to render a specific tracked-changes mode
   * or disable tracked-change metadata entirely.
   *
   * @param [preferences]
   */
  setTrackedChangesPreferences(preferences?: { mode?: 'review' | 'original' | 'final' | 'off'; enabled?: boolean }) {
    const normalized = preferences && Object.keys(preferences).length ? { ...preferences } : undefined;
    if (!this.config.layoutEngineOptions) {
      this.config.layoutEngineOptions = {};
    }
    this.config.layoutEngineOptions.trackedChanges = normalized;
    this.superdocStore?.documents?.forEach((doc: RuntimeDocument) => {
      const presentationEditor = typeof doc.getPresentationEditor === 'function' ? doc.getPresentationEditor() : null;
      if (presentationEditor?.setTrackedChangesOverrides) {
        presentationEditor.setTrackedChangesOverrides(normalized);
      }
    });
  }

  #setModeEditing() {
    if (this.config.role !== 'editor') return this.#setModeSuggesting();
    const store = this.#requireSuperdocStore('setDocumentMode');
    if (store.documents.length > 0) {
      const firstEditor = store.documents[0]?.getEditor();
      if (firstEditor) this.setActiveEditor(firstEditor);
    }

    // Enable tracked changes for editing mode
    this.setTrackedChangesPreferences({ mode: 'review', enabled: true });

    store.documents.forEach((doc: RuntimeDocument) => {
      doc.restoreComments?.();
      this.#applyDocumentMode(doc, 'editing');
    });
  }

  #setModeSuggesting() {
    if (!['editor', 'suggester'].includes(this.config.role ?? '')) return this.#setModeViewing();
    const store = this.#requireSuperdocStore('setDocumentMode');
    if (store.documents.length > 0) {
      const firstEditor = store.documents[0]?.getEditor();
      if (firstEditor) this.setActiveEditor(firstEditor);
    }

    // Enable tracked changes for suggesting mode
    this.setTrackedChangesPreferences({ mode: 'review', enabled: true });

    store.documents.forEach((doc: RuntimeDocument) => {
      doc.restoreComments?.();
      this.#applyDocumentMode(doc, 'suggesting');
    });
  }

  #setModeViewing() {
    // Capture the store at the top so a pre-ready call (either direct
    // or through `setDocumentMode`) throws before `setTrackedChangesPreferences`
    // mutates `config.layoutEngineOptions.trackedChanges`.
    const store = this.#requireSuperdocStore('setDocumentMode');

    // `this.toolbar` infers as `SuperToolbar | null` from the field's
    // first assignment in `#addToolbar` (the `null` placeholder before
    // the SuperToolbar is constructed). `#addToolbar` runs once during
    // init and unconditionally installs the instance, so by the time
    // mode changes are reachable the toolbar is non-null. The guard
    // keeps TS satisfied and stays a no-op if a future destroy/teardown
    // ever clears the field.
    if (this.toolbar?.setActiveEditor) {
      this.toolbar.setActiveEditor(null as unknown as Editor);
    } else if (this.toolbar) {
      this.toolbar.activeEditor = null;
    }

    const commentsVisible = this.config.comments?.visible === true;
    const trackChangesVisible = this.config.trackChanges?.visible === true;

    this.setTrackedChangesPreferences(
      trackChangesVisible ? { mode: 'review', enabled: true } : { mode: 'original', enabled: true },
    );

    // Clear comment positions to hide floating comment bubbles in viewing mode
    if (!commentsVisible && !trackChangesVisible) {
      this.commentsStore?.clearEditorCommentPositions?.();
    }

    store.documents.forEach((doc: RuntimeDocument) => {
      if (commentsVisible || trackChangesVisible) {
        doc.restoreComments?.();
      } else {
        doc.removeComments?.();
      }
      this.#applyDocumentMode(doc, 'viewing');
    });
  }

  #syncViewingVisibility() {
    const commentsVisible = this.config.comments?.visible === true;
    const trackChangesVisible = this.config.trackChanges?.visible === true;
    const isViewingMode = this.config.documentMode === 'viewing';
    const shouldRenderCommentsInViewing = commentsVisible || trackChangesVisible;
    if (this.commentsStore?.setViewingVisibility) {
      this.commentsStore.setViewingVisibility({
        documentMode: this.config.documentMode,
        commentsVisible,
        trackChangesVisible,
      });
    }

    const docs = this.superdocStore?.documents;
    if (Array.isArray(docs) && docs.length > 0) {
      docs.forEach((doc) => {
        const presentationEditor = typeof doc.getPresentationEditor === 'function' ? doc.getPresentationEditor() : null;
        if (presentationEditor?.setViewingCommentOptions) {
          presentationEditor.setViewingCommentOptions({
            emitCommentPositionsInViewing: isViewingMode && shouldRenderCommentsInViewing,
            enableCommentsInViewing: isViewingMode && commentsVisible,
          });
        }
      });
    }
  }
  /**
   * Search for text or regex in the active editor.
   *
   * Returns `undefined` when there is no active editor; otherwise
   * returns the array of matches the underlying search command produced
   * (possibly empty).
   *
   * @param text The text or regex to search for
   * @returns The search results, or `undefined` when there is no active editor
   *   or the active legacy projection exposes no `search` command (e.g. a
   *   v2-shaped runtime with `commands: null`).
   */
  search(text: string | RegExp): SearchMatch[] | undefined {
    const commands = this.activeEditor?.commands;
    const search = commands?.search;
    if (typeof search !== 'function') return undefined;
    return search.call(commands, text, { searchModel: 'visible' });
  }

  /**
   * Go to the next search result.
   *
   * Pass back a match returned by `superdoc.search()` unchanged; the
   * runtime resolves its current document position via the embedded
   * tracker ids.
   *
   * @param match The match object returned by `superdoc.search()`.
   * @returns Whether the command dispatched, or `undefined` when there is no
   *   active editor or the active legacy projection exposes no
   *   `goToSearchResult` command (e.g. a v2-shaped runtime with `commands:
   *   null`).
   */
  goToSearchResult(match: SearchMatch) {
    const commands = this.activeEditor?.commands;
    const goToSearchResult = commands?.goToSearchResult;
    if (typeof goToSearchResult !== 'function') return undefined;
    return goToSearchResult.call(commands, match);
  }

  /**
   * Get the current zoom level as a percentage (e.g., 100 for 100%)
   * @returns The current zoom level as a percentage
   * @example
   * const zoom = superdoc.getZoom(); // Returns 100, 150, 200, etc.
   */
  getZoom() {
    return this.superdocStore?.activeZoom ?? 100;
  }

  /**
   * Set the zoom level for all documents and switch the zoom mode to
   * `manual` (an explicit numeric zoom expresses intent to leave
   * `fit-width`; use `setZoomMode('fit-width')` to re-enter fitting).
   * Updates the centralized activeZoom state, which propagates to all
   * presentation editors, PDF viewers, and whiteboard layers via the Vue watcher.
   * @param percent - The zoom level as a percentage (e.g., 100, 150, 200)
   * @example
   * superdoc.setZoom(150); // Set zoom to 150%, mode becomes 'manual'
   * superdoc.setZoom(50);  // Set zoom to 50%
   */
  setZoom(percent: number) {
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
      console.warn('[SuperDoc] setZoom expects a positive number representing percentage');
      return;
    }
    // Before async init attaches the store there is nothing to write, and
    // emitting anyway would tell listeners about a zoom that never
    // happened. Use config.zoom.initial for pre-init zoom instead.
    if (!this.superdocStore) {
      console.warn('[SuperDoc] setZoom called before initialization; use config.zoom.initial for the starting zoom');
      return;
    }

    // Update store — SuperDoc.vue's activeZoom watcher propagates the zoom
    // to all PresentationEditor instances via PresentationEditor.setGlobalZoom().
    this.superdocStore.activeZoom = percent;
    this.superdocStore.zoomMode = 'manual';

    this.emit('zoomChange', { zoom: percent, mode: 'manual' });
  }

  /**
   * Switch the zoom mode. `fit-width` continuously re-fits the
   * document to the available container width (clamped by
   * `config.zoom.fitWidth`); `manual` holds the current value.
   * Switching to `fit-width` applies the fit immediately when
   * viewport metrics are available. Emits `zoomChange` (with the
   * current value) so zoom UIs observe mode-only transitions; a
   * same-mode call is a no-op.
   * @param mode - The zoom mode: `'manual'` or `'fit-width'`
   * @example
   * superdoc.setZoomMode('fit-width'); // start fitting to the container
   * superdoc.setZoomMode('manual');    // hold the current zoom value
   */
  setZoomMode(mode: SuperDocZoomMode) {
    if (mode !== 'manual' && mode !== 'fit-width') {
      console.warn("[SuperDoc] setZoomMode expects 'manual' or 'fit-width'");
      return;
    }
    // Before async init attaches the store the mode cannot persist, and
    // emitting anyway would advertise a mode change that never happened.
    // Use config.zoom.mode for the starting mode instead.
    if (!this.superdocStore) {
      console.warn('[SuperDoc] setZoomMode called before initialization; use config.zoom.mode for the starting mode');
      return;
    }
    if (this.superdocStore.zoomMode === mode) return;
    this.superdocStore.zoomMode = mode;
    this.emit('zoomChange', { zoom: this.getZoom(), mode });
  }

  /**
   * Get a snapshot of the current zoom state: mode, value, the latest
   * computed fit zoom (null before the first viewport measurement),
   * and the effective fit bounds.
   * @returns The current zoom state snapshot
   * @example
   * const { mode, value, fitZoom } = superdoc.getZoomState();
   */
  getZoomState(): SuperDocZoomState {
    // Same resolver the fit policy applies, so the reported bounds cannot
    // drift from the clamping behavior.
    const fit = resolveFitWidthOptions(this.config.zoom?.fitWidth);
    return {
      mode: this.superdocStore?.zoomMode ?? 'manual',
      value: this.superdocStore?.activeZoom ?? 100,
      fitZoom: this.superdocStore?.viewportMetrics?.fitZoom ?? null,
      min: fit.min,
      max: fit.max,
    };
  }

  /**
   * Get the latest viewport measurements: the width available to the
   * document, the document's base page width at 100% zoom, and the
   * unclamped fit zoom. Returns `null` until the first measurement
   * (editors still mounting). Subscribe to `viewport-change` (or pass
   * `Config.onViewportChange`) for updates.
   * @returns The latest viewport metrics, or `null` before the first measurement
   * @example
   * const metrics = superdoc.getViewportMetrics();
   * if (metrics) superdoc.setZoom(Math.min(100, metrics.fitZoom));
   */
  getViewportMetrics(): SuperDocViewportMetrics | null {
    return this.superdocStore?.viewportMetrics ?? null;
  }

  /**
   * Set the document to locked or unlocked
   */
  setLocked(lock = true): void {
    this.config.documents.forEach((doc: RuntimeDocument) => {
      // setLocked is a collaboration-only API; the surrounding flow only
      // calls it once each document has a Yjs doc attached. Cast away the
      // optional shape on the public Document typedef without changing
      // runtime behavior.
      const ydoc = doc.ydoc as Y.Doc;
      const metaMap = ydoc.getMap('meta');
      ydoc.transact(() => {
        metaMap.set('locked', lock);
        metaMap.set('lockedBy', this.user);
      });
    });
  }

  /**
   * Get the HTML content of all editors
   * @returns The HTML content of all editors
   */
  getHTML(options: Parameters<Editor['getHTML']>[0] = {}) {
    const editors: Editor[] = [];
    this.#requireSuperdocStore('getHTML').documents.forEach((doc: RuntimeDocument) => {
      const editor = doc.getEditor?.();
      if (editor) {
        editors.push(editor);
      }
    });

    return editors.map((editor) => editor.getHTML(options));
  }

  /**
   * Lock the current superdoc and emit the `locked` event.
   *
   * @param [isLocked] Whether the superdoc is locked. Defaults to `false`.
   * @param [lockedBy] The user who locked the superdoc, or `null`
   *   when unlocking (or when no user is known). Defaults to `null`.
   */
  lockSuperdoc(isLocked: boolean = false, lockedBy: User | null = null): void {
    this.isLocked = isLocked;
    this.lockedBy = lockedBy;
    this.#log('🦋 [superdoc] Locking superdoc:', isLocked, lockedBy, '\n\n\n');
    this.emit('locked', { isLocked, lockedBy });
  }

  /**
   * Export the superdoc to a file
   * @param params - Export configuration
   */
  async export(
    {
      exportType = ['docx'],
      commentsType = 'external',
      exportedName,
      additionalFiles = [],
      additionalFileNames = [],
      isFinalDoc = false,
      triggerDownload = true,
      fieldsHighlightColor = null,
    }: ExportParams = {} as ExportParams,
  ) {
    // Get the docx files first
    const baseFileName = exportedName ? cleanName(exportedName) : cleanName(this.config.title as string);
    const docxFiles = await this.exportEditorsToDOCX({ commentsType, isFinalDoc, fieldsHighlightColor });
    const blobsToZip = [...additionalFiles];
    const filenames = [...additionalFileNames];

    // If we are exporting docx files, add them to the zip
    if (exportType.includes('docx')) {
      docxFiles.forEach((blob) => {
        // exportDocx default overload returns Blob; the wider `string | Blob | null`
        // shows up only when callers opt into other export modes (not used here).
        blobsToZip.push(blob as Blob);
        filenames.push(`${baseFileName}.docx`);
      });
    }

    // If we only have one blob, just download it. Otherwise, zip them up.
    if (blobsToZip.length === 1) {
      if (triggerDownload) {
        return createDownload(blobsToZip[0], baseFileName, exportType[0]);
      }

      return blobsToZip[0];
    }

    const zip = await createZip(blobsToZip, filenames);

    if (triggerDownload) {
      return createDownload(zip, baseFileName, 'zip');
    }

    return zip;
  }

  /**
   * Export editors to DOCX format.
   * @param [options]
   */
  async exportEditorsToDOCX({
    commentsType,
    isFinalDoc,
    fieldsHighlightColor,
  }: { commentsType?: string; isFinalDoc?: boolean; fieldsHighlightColor?: string | null } = {}) {
    // The export's job is to pick the correct source of truth for
    // comments. There are three branches; the third had a latent
    // ambiguity that resurrected deleted comments and is the
    // reason this logic looks so fiddly.
    //
    // 1. `commentsType === 'clean'`: strip everything. Pass `[]`,
    //    which `Editor.exportDocx`'s
    //    `effectiveComments = comments ?? this.converter.comments ?? []`
    //    treats as authoritative-empty (`??` falls through on
    //    `null`/`undefined` only).
    //
    // 2. `modules.comments === false` (UI store NEVER hydrates).
    //    The store is not the source of truth because it never
    //    held comments at all. Pass `undefined` so the engine
    //    fallback to `converter.comments` fires and
    //    DOCX-imported comments survive the round-trip. This is
    //    the Custom UI story: consumers driving `ui.comments` from
    //    their own React tree shouldn't lose imports just because
    //    the built-in floating UI is hidden.
    //
    // 3. UI store IS hydrated (`modules.comments` truthy or
    //    omitted). The store is authoritative: a user who deleted
    //    every comment through the built-in UI ends up with an
    //    empty store, and the export MUST honor that as
    //    "no comments" rather than silently resurrect them from
    //    `converter.comments` (which the legacy delete path doesn't
    //    clear today; tracked separately under SD-2839). Pass
    //    whatever the store returns, including `[]`.
    let comments: unknown[] | undefined;
    const commentsModuleConfig = this.config?.modules?.comments;
    const uiStoreHydrated = commentsModuleConfig !== false;
    if (commentsType === 'clean') {
      comments = [];
    } else if (
      uiStoreHydrated &&
      this.commentsStore &&
      typeof this.commentsStore.translateCommentsForExport === 'function'
    ) {
      // UI store is the source of truth; trust whatever it says,
      // including an authoritative-empty array.
      comments = this.commentsStore.translateCommentsForExport();
      if (!Array.isArray(comments)) comments = [];
    }
    // else: UI store unhydrated → leave `comments` undefined and
    // let the engine's `converter.comments` fallback fire.

    const bridgedExportErrors = new WeakSet<object>();
    const rememberBridgedExportError = (payload: SuperDocExceptionPayload) => {
      if ('editor' in payload && payload.error && typeof payload.error === 'object') {
        bridgedExportErrors.add(payload.error);
      }
    };

    this.on('exception', rememberBridgedExportError);
    try {
      const docxPromises = this.#requireSuperdocStore('exportEditorsToDOCX').documents.map(
        async (doc: RuntimeDocument) => {
          if (!doc || doc.type !== DOCX) return null;

          const editor = typeof doc.getEditor === 'function' ? doc.getEditor() : null;
          const fallbackDocx = () => {
            if (!doc.data) return null;
            if (doc.data.type && doc.data.type !== DOCX) return null;
            return doc.data;
          };

          if (!editor) return fallbackDocx();

          try {
            const exported = await editor.exportDocx({
              isFinalDoc,
              comments: comments as import('@superdoc/super-editor').Comment[] | undefined,
              commentsType,
              fieldsHighlightColor,
            });
            if (exported) return exported;
          } catch (error) {
            if (!error || typeof error !== 'object' || !bridgedExportErrors.has(error)) {
              this.emit('exception', { error, document: doc });
            }
          }

          return fallbackDocx();
        },
      );

      const docxFiles = await Promise.all(docxPromises);
      // Type-predicate filter so callers see `Blob[]` instead of `(Blob | null)[]`.
      // `filter(Boolean)` narrows at runtime but not in the type system.
      return docxFiles.filter((file): file is Blob => file != null);
    } finally {
      this.off('exception', rememberBridgedExportError);
    }
  }

  /**
   * Request an immediate save from all collaboration documents
   * @returns Resolves when all documents have saved
   */
  async #triggerCollaborationSaves() {
    this.#log('🦋 [superdoc] Triggering collaboration saves');
    const store = this.#requireSuperdocStore('save');
    return new Promise<void>((resolve) => {
      store.documents.forEach((doc: RuntimeDocument, index: number) => {
        this.#log(`Before reset - Doc ${index}: pending = ${this.pendingCollaborationSaves}`);
        this.pendingCollaborationSaves = 0;
        if (doc.ydoc) {
          this.pendingCollaborationSaves++;
          this.#log(`After increment - Doc ${index}: pending = ${this.pendingCollaborationSaves}`);
          const metaMap = doc.ydoc.getMap('meta');
          metaMap.observe((event: Y.YMapEvent<unknown>) => {
            if (event.changes.keys.has('immediate-save-finished')) {
              this.pendingCollaborationSaves--;
              if (this.pendingCollaborationSaves <= 0) {
                resolve();
              }
            }
          });
          metaMap.set('immediate-save', true);
        }
      });
      this.#log(
        `FINAL pending = ${this.pendingCollaborationSaves}, but we have ${store.documents.filter((d: RuntimeDocument) => d.ydoc).length} docs!`,
      );
    });
  }

  /**
   * Save the superdoc if in collaboration mode. Resolves when all
   * collaboration documents have flushed their pending writes.
   */
  async save(): Promise<void> {
    const savePromises = [
      this.#triggerCollaborationSaves(),
      // this.exportEditorsToDOCX(),
    ];

    this.#log('🦋 [superdoc] Saving superdoc');
    await Promise.all(savePromises);
    this.#log('🦋 [superdoc] Save complete');
  }

  /**
   * Clean up collaboration resources (providers, ydocs, sockets)
   */
  #cleanupCollaboration() {
    // Remove the awareness listener so the provider cannot emit events
    // into a destroyed SuperDoc instance.
    if (typeof this._cleanupAwareness === 'function') {
      this._cleanupAwareness();
      this._cleanupAwareness = null;
    }

    const cfg = this.config;
    // `cancelWebsocketRetry` is set on `HocuspocusProviderWebsocket` only
    // while a reconnect timer is pending, and Hocuspocus clears it back to
    // `undefined` after firing. Destroy from the "already connected, no
    // pending retry" path lands here with the method absent, so the
    // optional chain on the method is required to avoid a `TypeError`.
    cfg.socket?.cancelWebsocketRetry?.();
    cfg.socket?.disconnect();
    cfg.socket?.destroy();

    this.ydoc?.destroy();
    this.provider?.disconnect?.();
    this.provider?.destroy?.();

    cfg.documents.forEach((doc: RuntimeDocument) => {
      doc.provider?.disconnect?.();
      doc.provider?.destroy?.();
      doc.ydoc?.destroy();
    });
  }

  // ---------------------------------------------------------------------------
  // Surface system — generic dialog/floating UI above document content
  // ---------------------------------------------------------------------------

  /**
   * Open a surface (dialog or floating) above the document content.
   *
   */
  openSurface<TResult = unknown>(request: SurfaceRequest): SurfaceHandle<TResult> {
    return this.#surfaceManager.open(request) as SurfaceHandle<TResult>;
  }

  /**
   * Close a surface by id, or the topmost surface if no id is given.
   */
  closeSurface(id?: string) {
    this.#surfaceManager.close(id);
  }

  /**
   * Destroy the superdoc instance
   */
  destroy() {
    // Mark as destroyed early to prevent in-flight init from mounting
    this.#destroyed = true;

    // Abort any in-flight upgrade (sync wait or ready wait) so it settles
    // immediately instead of hanging for the full timeout duration.
    if (this.#abortUpgrade) {
      this.#abortUpgrade();
      this.#abortUpgrade = null;
    }

    // Settle all active surfaces before Vue unmount
    if (this.#surfaceManager) {
      this.#surfaceManager.destroy();
    }

    this.toolbar?.destroy();

    // Unmount the app FIRST so editors are destroyed — this triggers each
    // extension's onDestroy() which cancels debounced Y.js writes and
    // unobserves Y.js maps. Only then is it safe to destroy the ydoc/provider.
    if (this.app) {
      this.#log('[superdoc] Unmounting app');
      // `superdocStore` is populated in `#initVueApp` alongside `this.app`,
      // so the guard above also asserts the store is ready.
      this.superdocStore?.reset();
      this.app.unmount();
      this.removeAllListeners();
      delete this.app.config.globalProperties.$config;
      delete this.app.config.globalProperties.$superdoc;
    }

    this.#cleanupCollaboration();

    this.#editorRuntimeRegistryUnsub?.();
    this.#editorRuntimeRegistryUnsub = null;
    this.#editorRuntimeRegistry.clear();

    // Remove the internal wrapper element from the user's container
    if (this.#mountWrapper) {
      this.#mountWrapper.remove();
      this.#mountWrapper = null;
    }
  }

  /**
   * Focus the active editor or the first editor in the superdoc
   */
  focus() {
    const runtime = this.getActiveRuntime();
    if (runtime?.getCapabilities().lifecycle.canFocus) {
      void runtime.focus().catch((err) => {
        console.warn('[SuperDoc] active editor runtime focus failed', err);
      });
      return;
    }
    if (this.activeEditor) {
      this.activeEditor.focus?.();
    } else {
      this.#requireSuperdocStore('focus').documents.find((doc: RuntimeDocument) => {
        const editor = doc.getEditor?.();
        if (!editor) return false;
        editor.focus?.();
        return true;
      });
    }
  }

  /**
   * Set the high contrast mode
   */
  setHighContrastMode(isHighContrast: boolean) {
    if (!this.activeEditor) return;
    // `setHighContrastMode` is typed as optional on Editor because the
    // method is only present once the editor's mount hooks run. By the
    // time this entry point is reachable the editor is fully constructed
    // and the method is installed, so the optional chain is a no-op.
    this.activeEditor.setHighContrastMode?.(isHighContrast);
    // `activeEditor` is only set after the editor's mount completes, which
    // happens after `#initVueApp` populates `highContrastModeStore`. The
    // `if (!this.activeEditor) return` above is the runtime guarantee;
    // the optional chain expresses that to TS without a redundant throw.
    this.highContrastModeStore?.setHighContrastMode(isHighContrast);
  }
}
