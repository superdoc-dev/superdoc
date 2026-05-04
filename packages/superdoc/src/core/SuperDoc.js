import '../style.css';

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { markRaw, toRaw } from 'vue';
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider';

import { DOCX, PDF, HTML } from '@superdoc/common';
import { SuperToolbar, createZip, seedEditorStateToYDoc, onCollaborationProviderSynced } from '@superdoc/super-editor';
import { SuperComments } from '../components/CommentsLayer/commentsList/super-comments-list.js';
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

const DEFAULT_USER = Object.freeze({
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

/** @typedef {import('./types/index.js').User} User */
/** @typedef {import('./types/index.js').Document} Document */
/** @typedef {import('./types/index.js').RuntimeDocument} RuntimeDocument */
/** @typedef {import('./types/index.js').Modules} Modules */
/** @typedef {import('./types/index.js').Editor} Editor */
/** @typedef {import('./types/index.js').DocumentMode} DocumentMode */
/** @typedef {import('./types/index.js').Config} Config */
/** @typedef {import('./types/index.js').InternalConfig} InternalConfig */
/** @typedef {import('./types/index.js').ExportParams} ExportParams */
/** @typedef {import('./types/index.js').UpgradeToCollaborationOptions} UpgradeToCollaborationOptions */
/** @typedef {import('./types/index.js').SurfaceRequest} SurfaceRequest */
/**
 * @template [T=unknown]
 * @typedef {import('./types/index.js').SurfaceHandle<T>} SurfaceHandle
 */
/** @typedef {import('./types/index.js').NavigableAddress} NavigableAddress */
/** @typedef {import('@superdoc/super-editor/ui').SuperDocLike} SuperDocLike */

/**
 * Config callbacks are optional on the public typedef because consumers do
 * not need to pass them. The fields wrapped by this helper (every callback
 * registered in `#initListeners` plus the toolbar `exception` listener)
 * default to `() => null` in the class-field initializer, so EventEmitter
 * receives a function in normal use. This helper is a runtime identity
 * cast: behavior is unchanged if that invariant is ever broken (e.g. a
 * consumer explicitly passes `undefined`), and EventEmitter sees the same
 * value it would have without the wrapper. Sites with a `null` default
 * (`onFontsResolved`, `onTrackedChangeBubbleAccept`, `onTrackedChangeBubbleReject`)
 * use a separate `if`-guard pattern instead of this helper.
 *
 * @param {((...args: any[]) => void) | undefined} listener
 * @returns {(...args: any[]) => void}
 */
function asEventListener(listener) {
  return /** @type {(...args: any[]) => void} */ (listener);
}

/**
 * SuperDoc class
 * Expects a config object
 *
 * @class
 * @extends EventEmitter
 * @implements {SuperDocLike}
 */
export class SuperDoc extends EventEmitter {
  /** @type {Array<string>} */
  static allowedTypes = [DOCX, PDF, HTML];

  /** @type {boolean} */
  #destroyed = false;

  /** @type {boolean} */
  #isUpgrading = false;

  /** @type {(() => void) | null} — aborts an in-flight upgrade (sync wait or ready wait) */
  #abortUpgrade = null;

  /** @type {HTMLDivElement | null} */
  #mountWrapper = null;

  /** @type {SurfaceManager} */
  #surfaceManager;
  /** @type {string} */
  version;

  /** @type {User[]} */
  users;

  /** @type {import('yjs').Doc | undefined} */
  ydoc;

  /**
   * Provider for the SuperDoc-level collaboration room (separate from
   * per-document providers). Widened to `CollaborationProvider` to match
   * the runtime, which stores whatever provider the consumer passed via
   * `Config.modules.collaboration.provider`. Consumers needing Hocuspocus-
   * specific members must narrow before use.
   *
   * @type {import('./types/index.js').CollaborationProvider | undefined}
   */
  provider;

  /** @type {Whiteboard | null} */
  whiteboard;

  /**
   * Awareness palette assigned to local users when no explicit color is set.
   * Defaults to an empty array so `#assignUserColor` falls back to the
   * built-in `DEFAULT_AWARENESS_PALETTE`.
   * @type {string[]}
   */
  colors = [];

  /**
   * Pinia stores and Vue runtime references. Populated by `#initVueApp`
   * inside the async `#init`, which runs *after* `await #initCollaboration`,
   * so these fields are briefly `undefined` between `new SuperDoc(config)`
   * returning and the `ready` event firing. The non-null JSDoc here matches
   * the existing pattern used for `users` / `version` / `whiteboard` and
   * assumes consumers wait for `ready` before dereferencing. SD-2916 tracks
   * the systematic soundness fix across all of these fields (declaring them
   * `T | undefined` and casting at internal post-init access sites).
   *
   * @type {ReturnType<typeof import('../stores/superdoc-store.js').useSuperdocStore>}
   */
  superdocStore;

  /** @type {ReturnType<typeof import('../stores/comments-store.js').useCommentsStore>} */
  commentsStore;

  /** @type {ReturnType<typeof import('../composables/use-high-contrast-mode.js').useHighContrastMode>} */
  highContrastModeStore;

  /** @type {import('vue').App} */
  app;

  /** @type {import('pinia').Pinia} */
  pinia;

  /** @type {number} Count of editors that have signaled `editorCreate`. */
  readyEditors = 0;

  /** @type {number} Outstanding async saves waiting for collaboration ack. */
  pendingCollaborationSaves = 0;

  /** @type {Config} */
  config = {
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

  /**
   * @param {Config} config
   */
  constructor(config) {
    super();

    if (!config.selector) {
      throw new Error('SuperDoc: selector is required');
    }

    const container = typeof config.selector === 'string' ? document.querySelector(config.selector) : config.selector;

    if (!(container instanceof HTMLElement)) {
      throw new Error('SuperDoc: selector must be a valid CSS selector string or DOM element');
    }

    this.#init(config, container);
  }

  /**
   * @param {Config} config
   * @param {HTMLElement} container
   */
  async #init(config, container) {
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

    this.config.colors = shuffleArray(/** @type {`#${string}`[]} */ (this.config.colors));
    /** @type {Map<unknown, unknown>} */
    this.userColorMap = new Map();
    this.colorIndex = 0;

    // @ts-expect-error - __APP_VERSION__ is injected at build time
    this.version = __APP_VERSION__;
    this.#log('🦋 [superdoc] Using SuperDoc version:', this.version);

    /** @type {string} */
    this.superdocId = config.superdocId || uuidv4();
    // Default to an empty palette when no colors are configured so downstream
    // assignment logic doesn't have to null-check on every access.
    this.colors = this.config.colors ?? [];

    // Preprocess document
    this.#initDocuments();

    // Surface manager must exist before the first await — openSurface()
    // can be called while async init is still in flight.
    this.#surfaceManager = new SurfaceManager({
      getModuleConfig: () => this.config.modules?.surfaces,
    });

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
    /** @type {unknown} */
    this.socket = null;
    this.isDev = this.config.isDev || false;

    /** @type {Editor | null | undefined} */
    this.activeEditor = null;
    /** @type {unknown[]} */
    this.comments = [];

    this.isLocked = this.config.isLocked || false;
    this.lockedBy = this.config.lockedBy || null;

    // Mount wrapper created once — Vue apps mount into it on each runtime start
    this.#mountWrapper = document.createElement('div');
    this.#mountWrapper.style.display = 'contents';
    container.appendChild(this.#mountWrapper);

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
    this.app.mount(this.#mountWrapper);
  }

  #initWhiteboard() {
    const config = this.config.modules?.whiteboard ?? {};
    const enabled = config.enabled ?? false;

    this.whiteboard = new Whiteboard({
      Renderer: WhiteboardRenderer,
      superdoc: this,
      enabled,
    });
    this.emit('whiteboard:init', { whiteboard: this.whiteboard });
  }

  /**
   * Get the number of editors that are required for this superdoc
   * @returns {number} The number of required editors
   */
  get requiredNumberOfEditors() {
    return this.superdocStore.documents.filter((d) => d.type === DOCX).length;
  }

  get state() {
    return {
      documents: this.superdocStore.documents,
      users: this.users,
    };
  }

  /**
   * Get the SuperDoc container element
   * @returns {HTMLElement | null}
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
    /** @param {string} tagName */
    document.createElement = function (tagName) {
      const element = originalCreateElement.call(this, tagName);
      if (tagName.toLowerCase() === 'style') {
        element.setAttribute('nonce', /** @type {string} */ (cspNonce));
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
          url: /** @type {string} */ (this.config.document),
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
      this.superdocStore.setExceptionHandler((/** @type {unknown} */ payload) => this.emit('exception', payload));
    }
    this.superdocStore.init(this.config);
    const commentsModuleConfig = /** @type {InternalConfig} */ (this.config).modules.comments;
    // `commentsModuleConfig` is `false | object | undefined`. A truthy
    // check already rules out both `false` and `undefined`, so an
    // explicit `!== false` afterwards is redundant.
    this.commentsStore.init(commentsModuleConfig || {});
    if (this.isCollaborative) {
      initCollaborationComments(this);
    }
    this.#syncViewingVisibility();
  }

  #initListeners() {
    this.on('editorBeforeCreate', asEventListener(this.config.onEditorBeforeCreate));
    this.on('editorCreate', asEventListener(this.config.onEditorCreate));
    this.on('editorDestroy', asEventListener(this.config.onEditorDestroy));
    this.on('ready', asEventListener(this.config.onReady));
    this.on('comments-update', asEventListener(this.config.onCommentsUpdate));
    this.on('awareness-update', asEventListener(this.config.onAwarenessUpdate));
    this.on('locked', asEventListener(this.config.onLocked));
    this.on('pdf:document-ready', asEventListener(this.config.onPdfDocumentReady));
    this.on('sidebar-toggle', asEventListener(this.config.onSidebarToggle));
    this.on('collaboration-ready', asEventListener(this.config.onCollaborationReady));
    this.on('editor-update', asEventListener(this.config.onEditorUpdate));
    this.on('content-error', this.onContentError);
    this.on('exception', asEventListener(this.config.onException));
    this.on('list-definitions-change', asEventListener(this.config.onListDefinitionsChange));
    this.on('pagination-update', asEventListener(this.config.onPaginationUpdate));

    if (this.config.onFontsResolved) {
      this.on('fonts-resolved', this.config.onFontsResolved);
    }
  }

  /**
   * Initialize collaboration if configured. Accepts the full
   * `Config.modules` block so it can read both the collaboration
   * subkey and the comments subkey at once.
   * @param {Modules} [modules]
   * @returns {Promise<Document[] | undefined>} The processed documents with collaboration enabled. Caller awaits for side effects; the return value is informational.
   */
  async #initCollaboration({ collaboration: collaborationModuleConfig, comments: commentsConfig = {} } = {}) {
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
        url: /** @type {string} */ (collaborationModuleConfig.url),
      });
    }

    // Initialize collaboration for documents
    const processedDocuments = makeDocumentsCollaborative(this);

    // Optionally, initialize separate superdoc sync - for comments, view, etc.
    if (commentsConfig.useInternalExternalComments && !commentsConfig.suppressInternalExternalComments) {
      const { ydoc: sdYdoc, provider: sdProvider } = initSuperdocYdoc(this);
      this.ydoc = markRaw(sdYdoc);
      this.provider = markRaw(sdProvider);
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
   * @param {import('yjs').Doc} ydoc
   * @param {import('./types/index.js').CollaborationProvider} provider
   */
  #attachExternalCollaboration(ydoc, provider) {
    this.isCollaborative = true;

    // Reset comments observer flag so a new observer is created for the new ydoc
    this._commentsCollabInitialized = false;

    // Mark as raw to prevent Vue's deep reactive traversal from hitting
    // circular references inside Y.js internals (causes stack overflow).
    this.ydoc = markRaw(ydoc);
    this.provider = markRaw(provider);

    this.#assignUserColor();
    this._cleanupAwareness = setupAwarenessHandler(provider, this, this.config.user);

    /** @type {InternalConfig} */ (this.config).documents.forEach((doc) => {
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
    const cfg = /** @type {InternalConfig} */ (this.config);
    delete cfg.modules.collaboration;

    cfg.documents.forEach((doc) => {
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
    const userKey = user.email || user.name || '';
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
   * @param {UpgradeToCollaborationOptions} options
   * @returns {Promise<void>} Resolves once the collaborative runtime is ready
   */
  async upgradeToCollaboration({ ydoc, provider }) {
    this.#validateUpgradePrerequisites({ ydoc, provider });
    this.#isUpgrading = true;

    try {
      const sourceEditor = this.#resolveSourceEditor();

      await this.#waitForProviderSync(provider);
      this.#assertNotDestroyed();

      // --- Seed the room authoritatively (while editor is still local) ---
      seedEditorStateToYDoc(sourceEditor, ydoc);
      overwriteRoomComments(ydoc, this.commentsStore.commentsList);
      overwriteRoomLockState(ydoc, { isLocked: this.isLocked, lockedBy: this.lockedBy });

      // --- Attach collaboration config (awareness, flags, config.documents) ---
      /** @type {InternalConfig} */ (this.config).modules.collaboration = { ydoc, provider };
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
   * @param {import('yjs').Doc | null} ydoc
   * @param {import('./types/index.js').CollaborationProvider | null} provider
   */
  #setStoreDocumentCollaboration(ydoc, provider) {
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
   * @returns {import('@superdoc/super-editor').PresentationEditor | import('@superdoc/super-editor').Editor}
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
   * @param {import('@superdoc/super-editor').Editor | import('@superdoc/super-editor').PresentationEditor} editorInstance
   * @returns {Promise<void>}
   */
  #waitForCollaborationReady(editorInstance) {
    const TIMEOUT_MS = 10_000;

    // PresentationEditor wraps Editor; get the underlying editor for event listening.
    // PresentationEditor exposes a `get editor(): Editor` accessor; plain
    // Editor has no such property, so the runtime `??` fallback returns
    // the instance itself in that case. The cast names the structural
    // `.editor` lookup without claiming the field exists on the Editor
    // arm of the union, so the access type-checks once SuperDoc.js is
    // brought under the SD-2863 checkJs gate.
    const editor = /** @type {Editor} */ (/** @type {{ editor?: Editor }} */ (editorInstance).editor ?? editorInstance);

    // If collaborationReady already fired (options flag set by collaboration extension)
    if (editor.options?.collaborationIsReady) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
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
   * @param {import('./types/index.js').CollaborationProvider} provider
   * @returns {Promise<void>}
   */
  #waitForProviderSync(provider) {
    const SYNC_TIMEOUT_MS = 10_000;

    return new Promise((resolve, reject) => {
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer;
      let settled = false;
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
   * @param {{ ydoc: unknown, provider: unknown }} options
   */
  #validateUpgradePrerequisites({ ydoc, provider }) {
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

    const cfg = /** @type {InternalConfig} */ (this.config);
    const docxDocs = cfg.documents.filter((d) => d.type === DOCX);
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
   * @returns {Editor} The editor instance for the source document
   * @throws {Error} If the editor is not yet created
   */
  #resolveSourceEditor() {
    // Upstream `#assertCanUpgrade` already verified at least one DOCX
    // document exists; cast the find result to assert non-null without
    // changing runtime behavior.
    const docxDoc = /** @type {Document} */ (
      /** @type {InternalConfig} */ (this.config).documents.find((d) => d.type === DOCX)
    );
    const storeDoc = this.superdocStore.documents.find((d) => d.id === docxDoc.id);
    const editor = storeDoc?.getEditor?.();

    if (!editor) {
      throw new Error('SuperDoc: source editor not yet created — wait for the ready event before upgrading');
    }
    return editor;
  }

  /**
   * Add a user to the shared users list
   * @param {User} user The user to add
   * @returns {void}
   */
  addSharedUser(user) {
    if (this.users.some((u) => u.email === user.email)) return;
    this.users.push(user);
  }

  /**
   * Remove a user from the shared users list
   * @param {String} email The email of the user to remove
   * @returns {void}
   */
  removeSharedUser(email) {
    this.users = this.users.filter((u) => u.email !== email);
  }

  /**
   * Triggered when there is an error in the content
   * @param {{ error: Error, editor: Editor }} params
   */
  onContentError({ error, editor }) {
    const { documentId } = editor.options;
    // The errored editor came from `superdocStore.documents`, so the find
    // by its `documentId` is expected to hit. Cast the find result to a
    // RuntimeDocument to assert non-null at the consumer callback.
    const doc = /** @type {RuntimeDocument} */ (this.superdocStore.documents.find((d) => d.id === documentId));
    // `onContentError` is typed as optional on the public Config typedef
    // because consumers don't have to wire a handler. The class field
    // initializer installs a `() => null` default, but `#init` spreads
    // the consumer-supplied config over it (`{ ...this.config, ...config }`),
    // so an explicit `onContentError: undefined` can still strip the
    // default. The optional chain keeps the call safe in that case.
    this.config.onContentError?.({ error, editor, documentId: doc.id, file: doc.data });
  }

  /**
   * Triggered when the PDF document is ready
   * @returns {void}
   */
  broadcastPdfDocumentReady() {
    this.emit('pdf:document-ready');
  }

  /**
   * Triggered when the superdoc is ready
   * @returns {void}
   */
  broadcastReady() {
    if (this.readyEditors === this.requiredNumberOfEditors) {
      this.emit('ready', { superdoc: this });
    }
  }

  /**
   * Triggered before an editor is created
   * @param {Editor} editor The editor that is about to be created
   * @returns {void}
   */
  broadcastEditorBeforeCreate(editor) {
    this.emit('editorBeforeCreate', { editor: createDeprecatedEditorProxy(editor) });
  }

  /**
   * Triggered when an editor is created
   * @param {Editor} editor The editor that was created
   * @returns {void}
   */
  broadcastEditorCreate(editor) {
    this.readyEditors++;
    this.broadcastReady();
    this.emit('editorCreate', { editor: createDeprecatedEditorProxy(editor) });
  }

  /**
   * Triggered when an editor is destroyed
   * @returns {void}
   */
  broadcastEditorDestroy() {
    this.emit('editorDestroy');
  }

  /**
   * Triggered when the comments sidebar is toggled
   * @param {boolean} isOpened
   */
  broadcastSidebarToggle(isOpened) {
    this.emit('sidebar-toggle', isOpened);
  }

  /** @param {unknown[]} args */
  #log(...args) {
    (console.debug ? console.debug : console.log)('🦋 🦸‍♀️ [superdoc]', ...args);
  }

  /**
   * Set the active editor
   * @param {Editor} editor The editor to set as active
   * @returns {void}
   */
  setActiveEditor(editor) {
    this.activeEditor = editor;
    if (this.toolbar) {
      this.activeEditor.toolbar = this.toolbar;
      this.toolbar.setActiveEditor(editor);
    }
  }

  /**
   * Toggle the ruler visibility for SuperEditors
   *
   * @returns {void}
   */
  toggleRuler() {
    this.config.rulers = !this.config.rulers;
    this.superdocStore.documents.forEach((doc) => {
      // In Pinia store, refs are auto-unwrapped, so rulers is a plain boolean
      doc.rulers = this.config.rulers;
    });
  }

  /**
   * Determine whether the current configuration allows a given permission.
   * Used by downstream consumers (toolbar, context menu, commands) to keep
   * tracked-change affordances consistent with customer overrides.
   *
   * `comment` and `trackedChange` carry an open index signature because
   * the function forwards the full payload to `isAllowed()`; tracked-change
   * payloads from the editor include `type`, `attrs`, `from`, `to`,
   * `segments`, and the comment objects passed by consumers vary in shape.
   * The named fields below are the ones this method reads directly.
   *
   * @param {{
   *   permission?: string,
   *   role?: string,
   *   isInternal?: boolean,
   *   comment?: (object & Record<string, unknown>) | null,
   *   trackedChange?: ({ id?: string, commentId?: string, comment?: unknown } & Record<string, unknown>) | null,
   * }} [params]
   * @returns {boolean}
   */
  canPerformPermission({
    permission,
    role = this.config.role,
    isInternal = this.config.isInternal,
    comment = null,
    trackedChange = null,
  } = {}) {
    if (!permission) return false;

    let resolvedComment = comment ?? trackedChange?.comment ?? null;

    const commentId = trackedChange?.commentId || trackedChange?.id;
    if (!resolvedComment && commentId && this.commentsStore?.getComment) {
      const storeComment = this.commentsStore.getComment(commentId);
      resolvedComment = storeComment?.getValues ? storeComment.getValues() : storeComment;
    }

    const context = {
      superdoc: this,
      currentUser: this.config.user,
      comment: resolvedComment ?? null,
      trackedChange: trackedChange ?? null,
    };

    return isAllowed(permission, /** @type {string} */ (role), /** @type {boolean} */ (isInternal), context);
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
      toolbarGroups: this.config.modules?.toolbar?.groups || this.config.toolbarGroups,
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

    this.toolbar.on('exception', asEventListener(this.config.onException));
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
   * @param {Element} element The DOM element to render the comments list in
   * @returns {void}
   */
  addCommentsList(element) {
    if (!this.config?.modules?.comments || this.config.role === 'viewer') return;
    if (element) this.config.modules.comments.element = element;
    this.commentsList = new SuperComments(this.config.modules?.comments, this);
    if (this.config.onCommentsListChange) this.config.onCommentsListChange({ isRendered: true });
  }

  /**
   * Remove the comments list from the superdoc
   * @returns {void}
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
   * @param {string} commentId The comment id
   * @param {{ behavior?: ScrollBehavior, block?: ScrollLogicalPosition }} [options]
   * @returns {boolean} Whether a matching element was found
   */
  scrollToComment(commentId, options = {}) {
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
   * @param {NavigableAddress} target
   * @returns {Promise<boolean>} Whether the target was found and navigated to.
   */
  async navigateTo(target) {
    /** @type {RuntimeDocument[] | undefined} */
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
   * @param {string} elementId - The element's stable ID.
   * @returns {Promise<boolean>} Whether the element was found and scrolled to.
   *
   * @example
   * // Navigate to a paragraph by its nodeId
   * await superdoc.scrollToElement('5AF80E61');
   *
   * // Navigate to a comment by its entityId
   * await superdoc.scrollToElement('imported-25def254');
   */
  async scrollToElement(elementId) {
    /** @type {RuntimeDocument[] | undefined} */
    const storeDocs = this.superdocStore?.documents;
    if (!storeDocs?.length) return false;
    const presentationEditor = storeDocs[0].getPresentationEditor?.();
    if (!presentationEditor?.scrollToElement) return false;
    return presentationEditor.scrollToElement(elementId);
  }

  /**
   * Toggle the custom context menu globally.
   * Updates both flow editors and PresentationEditor instances so downstream listeners can short-circuit early.
   * @param {boolean} disabled
   */
  setDisableContextMenu(disabled = true) {
    const nextValue = Boolean(disabled);
    if (this.config.disableContextMenu === nextValue) return;
    this.config.disableContextMenu = nextValue;

    this.superdocStore?.documents?.forEach((doc) => {
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
   * @param {boolean} show
   * @returns {void}
   */
  setShowBookmarks(show = true) {
    const nextValue = Boolean(show);
    const layoutOptions = (this.config.layoutEngineOptions = this.config.layoutEngineOptions || {});
    if (layoutOptions.showBookmarks === nextValue) return;
    layoutOptions.showBookmarks = nextValue;

    this.superdocStore?.documents?.forEach((doc) => {
      const presentationEditor = doc.getPresentationEditor?.();
      presentationEditor?.setShowBookmarks?.(nextValue);
    });
  }

  /**
   * Set the document mode.
   * @param {DocumentMode} type
   * @returns {void}
   */
  setDocumentMode(type) {
    if (!type) return;

    type = type.toLowerCase();
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
   * @param {RuntimeDocument} doc - The document object
   * @param {DocumentMode} mode - The document mode ('editing', 'viewing', 'suggesting')
   */
  #applyDocumentMode(doc, mode) {
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
   * @param {{ mode?: 'review' | 'original' | 'final' | 'off', enabled?: boolean }} [preferences]
   */
  setTrackedChangesPreferences(preferences) {
    const normalized = preferences && Object.keys(preferences).length ? { ...preferences } : undefined;
    if (!this.config.layoutEngineOptions) {
      this.config.layoutEngineOptions = {};
    }
    this.config.layoutEngineOptions.trackedChanges = normalized;
    this.superdocStore?.documents?.forEach((doc) => {
      const presentationEditor = typeof doc.getPresentationEditor === 'function' ? doc.getPresentationEditor() : null;
      if (presentationEditor?.setTrackedChangesOverrides) {
        presentationEditor.setTrackedChangesOverrides(normalized);
      }
    });
  }

  #setModeEditing() {
    if (this.config.role !== 'editor') return this.#setModeSuggesting();
    if (this.superdocStore.documents.length > 0) {
      const firstEditor = this.superdocStore.documents[0]?.getEditor();
      if (firstEditor) this.setActiveEditor(firstEditor);
    }

    // Enable tracked changes for editing mode
    this.setTrackedChangesPreferences({ mode: 'review', enabled: true });

    this.superdocStore.documents.forEach((doc) => {
      doc.restoreComments();
      this.#applyDocumentMode(doc, 'editing');
    });
  }

  #setModeSuggesting() {
    if (!['editor', 'suggester'].includes(this.config.role)) return this.#setModeViewing();
    if (this.superdocStore.documents.length > 0) {
      const firstEditor = this.superdocStore.documents[0]?.getEditor();
      if (firstEditor) this.setActiveEditor(firstEditor);
    }

    // Enable tracked changes for suggesting mode
    this.setTrackedChangesPreferences({ mode: 'review', enabled: true });

    this.superdocStore.documents.forEach((doc) => {
      doc.restoreComments();
      this.#applyDocumentMode(doc, 'suggesting');
    });
  }

  #setModeViewing() {
    // `this.toolbar` infers as `SuperToolbar | null` from the field's
    // first assignment in `#addToolbar` (the `null` placeholder before
    // the SuperToolbar is constructed). `#addToolbar` runs once during
    // init and unconditionally installs the instance, so by the time
    // mode changes are reachable the toolbar is non-null. The guard
    // keeps TS satisfied and stays a no-op if a future destroy/teardown
    // ever clears the field.
    if (this.toolbar) this.toolbar.activeEditor = null;

    const commentsVisible = this.config.comments?.visible === true;
    const trackChangesVisible = this.config.trackChanges?.visible === true;

    this.setTrackedChangesPreferences(
      trackChangesVisible ? { mode: 'review', enabled: true } : { mode: 'original', enabled: true },
    );

    // Clear comment positions to hide floating comment bubbles in viewing mode
    if (!commentsVisible && !trackChangesVisible) {
      this.commentsStore?.clearEditorCommentPositions?.();
    }

    this.superdocStore.documents.forEach((doc) => {
      if (commentsVisible || trackChangesVisible) {
        doc.restoreComments();
      } else {
        doc.removeComments();
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

    /** @type {RuntimeDocument[] | undefined} */
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
   * @param {string | RegExp} text The text or regex to search for
   * @returns {import('./types/index.js').SearchMatch[] | undefined} The search results
   */
  search(text) {
    return this.activeEditor?.commands.search(text, { searchModel: 'visible' });
  }

  /**
   * Go to the next search result.
   *
   * Pass back a match returned by `superdoc.search()` unchanged; the
   * runtime resolves its current document position via the embedded
   * tracker ids.
   *
   * @param {import('./types/index.js').SearchMatch} match The match object returned by `superdoc.search()`.
   * @returns {void}
   */
  goToSearchResult(match) {
    return this.activeEditor?.commands.goToSearchResult(match);
  }

  /**
   * Get the current zoom level as a percentage (e.g., 100 for 100%)
   * @returns {number} The current zoom level as a percentage
   * @example
   * const zoom = superdoc.getZoom(); // Returns 100, 150, 200, etc.
   */
  getZoom() {
    return this.superdocStore?.activeZoom ?? 100;
  }

  /**
   * Set the zoom level for all documents.
   * Updates the centralized activeZoom state, which propagates to all
   * presentation editors, PDF viewers, and whiteboard layers via the Vue watcher.
   * @param {number} percent - The zoom level as a percentage (e.g., 100, 150, 200)
   * @example
   * superdoc.setZoom(150); // Set zoom to 150%
   * superdoc.setZoom(50);  // Set zoom to 50%
   */
  setZoom(percent) {
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
      console.warn('[SuperDoc] setZoom expects a positive number representing percentage');
      return;
    }

    // Update store — SuperDoc.vue's activeZoom watcher propagates the zoom
    // to all PresentationEditor instances via PresentationEditor.setGlobalZoom().
    if (this.superdocStore) {
      this.superdocStore.activeZoom = percent;
    }

    this.emit('zoomChange', { zoom: percent });
  }

  /**
   * Set the document to locked or unlocked
   * @param {boolean} lock
   */
  setLocked(lock = true) {
    /** @type {InternalConfig} */ (this.config).documents.forEach((doc) => {
      // setLocked is a collaboration-only API; the surrounding flow only
      // calls it once each document has a Yjs doc attached. Cast away the
      // optional shape on the public Document typedef without changing
      // runtime behavior.
      const ydoc = /** @type {import('yjs').Doc} */ (doc.ydoc);
      const metaMap = ydoc.getMap('meta');
      ydoc.transact(() => {
        metaMap.set('locked', lock);
        metaMap.set('lockedBy', this.user);
      });
    });
  }

  /**
   * Get the HTML content of all editors
   * @returns {Array<string>} The HTML content of all editors
   */
  getHTML(options = {}) {
    /** @type {Editor[]} */
    const editors = [];
    this.superdocStore.documents.forEach((doc) => {
      const editor = doc.getEditor();
      if (editor) {
        editors.push(editor);
      }
    });

    return editors.map((editor) => editor.getHTML(options));
  }

  /**
   * Lock the current superdoc
   * @param {Boolean} isLocked
   * @param {User} lockedBy The user who locked the superdoc
   */
  lockSuperdoc(isLocked = false, lockedBy) {
    this.isLocked = isLocked;
    this.lockedBy = lockedBy;
    this.#log('🦋 [superdoc] Locking superdoc:', isLocked, lockedBy, '\n\n\n');
    this.emit('locked', { isLocked, lockedBy });
  }

  /**
   * Export the superdoc to a file
   * @param {ExportParams} params - Export configuration
   * @returns {Promise<void | Blob>}
   */
  async export({
    exportType = ['docx'],
    commentsType = 'external',
    exportedName,
    additionalFiles = [],
    additionalFileNames = [],
    isFinalDoc = false,
    triggerDownload = true,
    fieldsHighlightColor = null,
  } = {}) {
    // Get the docx files first
    const baseFileName = exportedName ? cleanName(exportedName) : cleanName(/** @type {string} */ (this.config.title));
    const docxFiles = await this.exportEditorsToDOCX({ commentsType, isFinalDoc, fieldsHighlightColor });
    const blobsToZip = [...additionalFiles];
    const filenames = [...additionalFileNames];

    // If we are exporting docx files, add them to the zip
    if (exportType.includes('docx')) {
      docxFiles.forEach((blob) => {
        blobsToZip.push(blob);
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
   * @param {{ commentsType?: string, isFinalDoc?: boolean, fieldsHighlightColor?: string }} [options]
   * @returns {Promise<Array<Blob>>}
   */
  async exportEditorsToDOCX({ commentsType, isFinalDoc, fieldsHighlightColor } = {}) {
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
    /** @type {unknown[] | undefined} */
    let comments;
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

    const docxPromises = this.superdocStore.documents.map(async (doc) => {
      if (!doc || doc.type !== DOCX) return null;

      const editor = typeof doc.getEditor === 'function' ? doc.getEditor() : null;
      const fallbackDocx = () => {
        if (!doc.data) return null;
        if (doc.data.type && doc.data.type !== DOCX) return null;
        return doc.data;
      };

      if (!editor) return fallbackDocx();

      try {
        const exported = await editor.exportDocx({ isFinalDoc, comments, commentsType, fieldsHighlightColor });
        if (exported) return exported;
      } catch (error) {
        this.emit('exception', { error, document: doc });
      }

      return fallbackDocx();
    });

    const docxFiles = await Promise.all(docxPromises);
    return docxFiles.filter(Boolean);
  }

  /**
   * Request an immediate save from all collaboration documents
   * @returns {Promise<void>} Resolves when all documents have saved
   */
  async #triggerCollaborationSaves() {
    this.#log('🦋 [superdoc] Triggering collaboration saves');
    return new Promise((resolve) => {
      this.superdocStore.documents.forEach((doc, index) => {
        this.#log(`Before reset - Doc ${index}: pending = ${this.pendingCollaborationSaves}`);
        this.pendingCollaborationSaves = 0;
        if (doc.ydoc) {
          this.pendingCollaborationSaves++;
          this.#log(`After increment - Doc ${index}: pending = ${this.pendingCollaborationSaves}`);
          const metaMap = doc.ydoc.getMap('meta');
          metaMap.observe((/** @type {import('yjs').YMapEvent<unknown>} */ event) => {
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
        `FINAL pending = ${this.pendingCollaborationSaves}, but we have ${this.superdocStore.documents.filter((d) => d.ydoc).length} docs!`,
      );
    });
  }

  /**
   * Save the superdoc if in collaboration mode
   * @returns {Promise<void[]>} Resolves when all documents have saved
   */
  async save() {
    const savePromises = [
      this.#triggerCollaborationSaves(),
      // this.exportEditorsToDOCX(),
    ];

    this.#log('🦋 [superdoc] Saving superdoc');
    const result = await Promise.all(savePromises);
    this.#log('🦋 [superdoc] Save complete:', result);
    return result;
  }

  /**
   * Clean up collaboration resources (providers, ydocs, sockets)
   * @returns {void}
   */
  #cleanupCollaboration() {
    // Remove the awareness listener so the provider cannot emit events
    // into a destroyed SuperDoc instance.
    if (typeof this._cleanupAwareness === 'function') {
      this._cleanupAwareness();
      this._cleanupAwareness = null;
    }

    const cfg = /** @type {InternalConfig} */ (this.config);
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

    cfg.documents.forEach((doc) => {
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
   * @template [TResult=unknown]
   * @param {SurfaceRequest} request
   * @returns {SurfaceHandle<TResult>}
   */
  openSurface(request) {
    return this.#surfaceManager.open(request);
  }

  /**
   * Close a surface by id, or the topmost surface if no id is given.
   * @param {string} [id]
   */
  closeSurface(id) {
    this.#surfaceManager.close(id);
  }

  /**
   * Destroy the superdoc instance
   * @returns {void}
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
      this.superdocStore.reset();
      this.app.unmount();
      this.removeAllListeners();
      delete this.app.config.globalProperties.$config;
      delete this.app.config.globalProperties.$superdoc;
    }

    this.#cleanupCollaboration();

    // Remove the internal wrapper element from the user's container
    if (this.#mountWrapper) {
      this.#mountWrapper.remove();
      this.#mountWrapper = null;
    }
  }

  /**
   * Focus the active editor or the first editor in the superdoc
   * @returns {void}
   */
  focus() {
    if (this.activeEditor) {
      this.activeEditor.focus();
    } else {
      this.superdocStore.documents.find((doc) => {
        const editor = doc.getEditor();
        if (editor) {
          editor.focus();
        }
      });
    }
  }

  /**
   * Set the high contrast mode
   * @param {boolean} isHighContrast
   * @returns {void}
   */
  setHighContrastMode(isHighContrast) {
    if (!this.activeEditor) return;
    // `setHighContrastMode` is typed as optional on Editor because the
    // method is only present once the editor's mount hooks run. By the
    // time this entry point is reachable the editor is fully constructed
    // and the method is installed, so the optional chain is a no-op.
    this.activeEditor.setHighContrastMode?.(isHighContrast);
    this.highContrastModeStore.setHighContrastMode(isHighContrast);
  }
}
