import '../style.css';

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { markRaw } from 'vue';
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider';

import { DOCX, PDF, HTML } from '@superdoc/common';
import { SuperToolbar, createZip } from '@superdoc/super-editor';
import { SuperComments } from '../components/CommentsLayer/commentsList/super-comments-list.js';
import { createSuperdocVueApp } from './create-app.js';
import { shuffleArray } from '@superdoc/common/collaboration/awareness';
import { createDownload, cleanName } from './helpers/export.js';
import { initSuperdocYdoc, initCollaborationComments, makeDocumentsCollaborative } from './collaboration/helpers.js';
import { setupAwarenessHandler } from './collaboration/collaboration.js';
import { normalizeDocumentEntry } from './helpers/file.js';
import { isAllowed } from './collaboration/permissions.js';
import { Whiteboard } from './whiteboard/Whiteboard';
import { WhiteboardRenderer } from './whiteboard/WhiteboardRenderer';

const DEFAULT_USER = Object.freeze({
  name: 'Default SuperDoc user',
  email: null,
});

/** @typedef {import('./types').User} User */
/** @typedef {import('./types').Document} Document */
/** @typedef {import('./types').Modules} Modules */
/** @typedef {import('./types').Editor} Editor */
/** @typedef {import('./types').DocumentMode} DocumentMode */
/** @typedef {import('./types').Config} Config */
/** @typedef {import('./types').ExportParams} ExportParams */

/**
 * SuperDoc class
 * Expects a config object
 *
 * @class
 * @extends EventEmitter
 */
export class SuperDoc extends EventEmitter {
  /** @type {Array<string>} */
  static allowedTypes = [DOCX, PDF, HTML];

  /** @type {boolean} */
  #destroyed = false;

  /** @type {HTMLDivElement | null} */
  #mountWrapper = null;

  /** @type {string} */
  version;

  /** @type {User[]} */
  users;

  /** @type {import('yjs').Doc | undefined} */
  ydoc;

  /** @type {import('@hocuspocus/provider').HocuspocusProvider | undefined} */
  provider;

  /** @type {Whiteboard | null} */
  whiteboard;

  /** @type {Config} */
  config = {
    superdocId: null,
    selector: '#superdoc',
    documentMode: 'editing',
    role: 'editor',
    document: {},
    documents: [],
    format: null,
    editorExtensions: [],

    colors: [],
    user: { name: null, email: null },
    users: [],

    modules: {}, // Optional: Modules to load. Use modules.ai.{your_key} to pass in your key
    permissionResolver: null, // Optional: Override for permission checks

    // License key (resolved downstream; undefined means "not explicitly set")
    licenseKey: undefined,

    // Telemetry settings
    telemetry: { enabled: true },

    title: 'SuperDoc',
    conversations: [],
    isInternal: false,
    comments: { visible: false },
    trackChanges: { visible: false },

    // toolbar config
    toolbar: null, // Optional DOM element to render the toolbar in
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
    onTransaction: () => null,
    onFontsResolved: null,
    // Image upload handler
    // async (file) => url;
    handleImageUpload: null,

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
    if (!this.config.trackChanges || typeof this.config.trackChanges !== 'object') {
      this.config.trackChanges = { visible: false };
    } else if (typeof this.config.trackChanges.visible !== 'boolean') {
      this.config.trackChanges.visible = false;
    }

    // Web layout mode requires layout engine to be disabled (content reflows vs pagination)
    if (this.config.viewOptions?.layout === 'web' && this.config.useLayoutEngine) {
      console.warn(
        '[SuperDoc] Web layout mode requires useLayoutEngine: false. Automatically disabling layout engine.',
      );
      this.config.useLayoutEngine = false;
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

    // Initialize tracked changes defaults based on document mode
    if (!this.config.layoutEngineOptions) {
      this.config.layoutEngineOptions = {};
    }
    // Only set defaults if user didn't explicitly configure tracked changes
    if (!this.config.layoutEngineOptions.trackedChanges) {
      // Default: ON for editing/suggesting modes, OFF for viewing mode
      const isViewingMode = this.config.documentMode === 'viewing';
      const viewingTrackedChangesVisible = isViewingMode && this.config.trackChanges?.visible === true;
      this.config.layoutEngineOptions.trackedChanges = {
        mode: isViewingMode ? (viewingTrackedChangesVisible ? 'review' : 'original') : 'review',
        enabled: true,
      };
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

    this.config.colors = shuffleArray(this.config.colors);
    this.userColorMap = new Map();
    this.colorIndex = 0;

    // @ts-expect-error - __APP_VERSION__ is injected at build time
    this.version = __APP_VERSION__;
    this.#log('🦋 [superdoc] Using SuperDoc version:', this.version);

    this.superdocId = config.superdocId || uuidv4();
    this.colors = this.config.colors;

    // Preprocess document
    this.#initDocuments();

    // Initialize collaboration if configured
    await this.#initCollaboration(this.config.modules);

    // Check if destroy() was called while we were initializing
    if (this.#destroyed) {
      this.#cleanupCollaboration();
      return;
    }

    // Apply csp nonce if provided
    if (this.config.cspNonce) this.#patchNaiveUIStyles();

    this.#initVueApp();
    this.#initListeners();
    this.#initWhiteboard();

    this.user = this.config.user; // The current user
    this.users = this.config.users || []; // All users who have access to this superdoc
    this.socket = null;

    this.isDev = this.config.isDev || false;

    /** @type {Editor | null | undefined} */
    this.activeEditor = null;
    this.comments = [];

    // Mount Vue into a child wrapper element instead of directly on the user's
    // container. This prevents conflicts with host frameworks (React, Angular)
    // that manage the container's DOM. See SD-1832.
    this.#mountWrapper = document.createElement('div');
    this.#mountWrapper.style.display = 'contents';
    container.appendChild(this.#mountWrapper);
    this.app.mount(this.#mountWrapper);

    // Required editors
    this.readyEditors = 0;

    this.isLocked = this.config.isLocked || false;
    this.lockedBy = this.config.lockedBy || null;

    // If a toolbar element is provided, render a toolbar
    this.#addToolbar();
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
    document.createElement = function (tagName) {
      const element = originalCreateElement.call(this, tagName);
      if (tagName.toLowerCase() === 'style') {
        element.setAttribute('nonce', cspNonce);
      }
      return element;
    };
  }

  #initDocuments() {
    const doc = this.config.document;
    const hasDocumentConfig = !!doc && typeof doc === 'object' && Object.keys(this.config.document)?.length;
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
          url: this.config.document,
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
    this.superdocStore = superdocStore;
    this.commentsStore = commentsStore;
    this.highContrastModeStore = highContrastModeStore;
    if (typeof this.superdocStore.setExceptionHandler === 'function') {
      this.superdocStore.setExceptionHandler((payload) => this.emit('exception', payload));
    }
    this.superdocStore.init(this.config);
    const commentsModuleConfig = this.config.modules.comments;
    this.commentsStore.init(commentsModuleConfig && commentsModuleConfig !== false ? commentsModuleConfig : {});
    if (this.isCollaborative) {
      initCollaborationComments(this);
    }
    this.#syncViewingVisibility();
  }

  #initListeners() {
    this.on('editorBeforeCreate', this.config.onEditorBeforeCreate);
    this.on('editorCreate', this.config.onEditorCreate);
    this.on('editorDestroy', this.config.onEditorDestroy);
    this.on('ready', this.config.onReady);
    this.on('comments-update', this.config.onCommentsUpdate);
    this.on('awareness-update', this.config.onAwarenessUpdate);
    this.on('locked', this.config.onLocked);
    this.on('pdf:document-ready', this.config.onPdfDocumentReady);
    this.on('sidebar-toggle', this.config.onSidebarToggle);
    this.on('collaboration-ready', this.config.onCollaborationReady);
    this.on('editor-update', this.config.onEditorUpdate);
    this.on('content-error', this.onContentError);
    this.on('exception', this.config.onException);
    this.on('list-definitions-change', this.config.onListDefinitionsChange);

    if (this.config.onFontsResolved) {
      this.on('fonts-resolved', this.config.onFontsResolved);
    }
  }

  /**
   * Initialize collaboration if configured
   * @param {Object} config
   * @returns {Promise<Object[]>} The processed documents with collaboration enabled
   */
  async #initCollaboration({ collaboration: collaborationModuleConfig, comments: commentsConfig = {} } = {}) {
    if (!collaborationModuleConfig) return this.config.documents;

    // Flag this superdoc as collaborative
    this.isCollaborative = true;

    // Check for external ydoc/provider (provider-agnostic mode)
    const { ydoc: externalYdoc, provider: externalProvider } = collaborationModuleConfig;

    if (externalYdoc && externalProvider) {
      // Use external provider - wire up awareness for SuperDoc events
      // Mark Y.js objects as raw to prevent Vue's deep reactive traversal
      // from hitting circular references inside Y.js internals (causes stack overflow).
      this.ydoc = markRaw(externalYdoc);
      this.provider = markRaw(externalProvider);

      // Assign a stable color to the local user so awareness broadcasts it.
      // Without this, y-prosemirror's cursor plugin mutates user.color to '#ffa500'
      // (orange) as a default, causing color flickering between that default and
      // the fallback colors used by RemoteCursorAwareness.
      // Use a hash of the user identity to pick a deterministic color from the
      // palette so that different users get different colors.
      if (!this.config.user.color) {
        // 24 visually distinct hex colors — large enough palette to minimize
        // collisions (~4% for two users) while staying within y-prosemirror's
        // hex-only color format requirement.
        const defaultPalette = [
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
        ];
        const palette = this.colors.length > 0 ? this.colors : defaultPalette;
        const userKey = this.config.user.email || this.config.user.name || '';
        let hash = 5381;
        for (let i = 0; i < userKey.length; i++) {
          hash = ((hash << 5) + hash) ^ userKey.charCodeAt(i);
        }
        this.config.user.color = palette[Math.abs(hash) % palette.length];
      }

      setupAwarenessHandler(externalProvider, this, this.config.user);

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

      // Assign to all documents
      this.config.documents.forEach((doc) => {
        doc.ydoc = externalYdoc;
        doc.provider = externalProvider;
        doc.role = this.config.role;
      });

      // Initialize comments sync, if enabled
      initCollaborationComments(this);

      return this.config.documents;
    }

    // Fallback: internal provider creation (legacy mode)
    // Start a socket for all documents and general metaMap for this SuperDoc
    if (collaborationModuleConfig.providerType === 'hocuspocus') {
      this.config.socket = new HocuspocusProviderWebsocket({
        url: collaborationModuleConfig.url,
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

  /**
   * Add a user to the shared users list
   * @param {Object} user The user to add
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
   * @param {Object} param0
   * @param {Error} param0.error The error that occurred
   * @param {Editor} param0.editor The editor that caused the error
   */
  onContentError({ error, editor }) {
    const { documentId } = editor.options;
    const doc = this.superdocStore.documents.find((d) => d.id === documentId);
    this.config.onContentError({ error, editor, documentId: doc.id, file: doc.data });
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
    this.emit('editorBeforeCreate', { editor });
  }

  /**
   * Triggered when an editor is created
   * @param {Editor} editor The editor that was created
   * @returns {void}
   */
  broadcastEditorCreate(editor) {
    this.readyEditors++;
    this.broadcastReady();
    this.emit('editorCreate', { editor });
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
   * @param {Object} params
   * @param {string} params.permission Permission key to evaluate
   * @param {string} [params.role=this.config.role] Role to evaluate against
   * @param {boolean} [params.isInternal=this.config.isInternal] Internal/external flag
   * @param {Object|null} [params.comment] Comment object (if already resolved)
   * @param {Object|null} [params.trackedChange] Tracked change metadata (id, attrs, etc.)
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

    return isAllowed(permission, role, isInternal, context);
  }

  #addToolbar() {
    const moduleConfig = this.config.modules?.toolbar || {};
    this.toolbarElement = this.config.modules?.toolbar?.selector || this.config.toolbar;
    this.toolbar = null;

    // Build excludeItems list - hide ruler button if rulers not configured
    const excludeItems = [...(moduleConfig.excludeItems || [])];
    if (!this.config.rulers) {
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

    this.toolbar.on('superdoc-command', this.onToolbarCommand.bind(this));
    this.toolbar.on('exception', this.config.onException);
    this.once('editorCreate', () => this.toolbar.updateToolbarState());
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
   * Triggered when a toolbar command is executed
   * @param {Object} param0
   * @param {Object} param0.item The toolbar item that was clicked
   * @param {string} param0.argument The argument passed to the command
   */
  onToolbarCommand({ item, argument }) {
    if (item.command === 'setDocumentMode') {
      this.setDocumentMode(argument);
    } else if (item.command === 'setZoom') {
      this.superdocStore.activeZoom = argument;
    }
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
    }
  }

  /**
   * Set the document mode on a document's editor (PresentationEditor or Editor).
   * Tries PresentationEditor first, falls back to Editor for backward compatibility.
   * @param {Object} doc - The document object
   * @param {string} mode - The document mode ('editing', 'viewing', 'suggesting')
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

    if (this.toolbar) {
      this.toolbar.documentMode = 'editing';
      this.toolbar.updateToolbarState();
    }
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

    if (this.toolbar) {
      this.toolbar.documentMode = 'suggesting';
      this.toolbar.updateToolbarState();
    }
  }

  #setModeViewing() {
    this.toolbar.activeEditor = null;

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

    if (this.toolbar) {
      this.toolbar.documentMode = 'viewing';
      this.toolbar.updateToolbarState();
    }
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
   * Search for text or regex in the active editor
   * @param {string | RegExp} text The text or regex to search for
   * @returns {Object[]} The search results
   */
  search(text) {
    return this.activeEditor?.commands.search(text);
  }

  /**
   * Go to the next search result
   * @param {Object} match The match object
   * @returns {void}
   */
  goToSearchResult(match) {
    return this.activeEditor?.commands.goToSearchResult(match);
  }

  /**
   * Set the document to locked or unlocked
   * @param {boolean} lock
   */
  setLocked(lock = true) {
    this.config.documents.forEach((doc) => {
      const metaMap = doc.ydoc.getMap('meta');
      doc.ydoc.transact(() => {
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
    const baseFileName = exportedName ? cleanName(exportedName) : cleanName(this.config.title);
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
    const comments = [];
    if (commentsType !== 'clean') {
      if (this.commentsStore && typeof this.commentsStore.translateCommentsForExport === 'function') {
        comments.push(...this.commentsStore.translateCommentsForExport());
      }
    }

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
          metaMap.observe((event) => {
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
    this.config.socket?.cancelWebsocketRetry();
    this.config.socket?.disconnect();
    this.config.socket?.destroy();

    this.ydoc?.destroy();
    this.provider?.disconnect();
    this.provider?.destroy();

    this.config.documents.forEach((doc) => {
      doc.provider?.disconnect();
      doc.provider?.destroy();
      doc.ydoc?.destroy();
    });
  }

  /**
   * Destroy the superdoc instance
   * @returns {void}
   */
  destroy() {
    // Mark as destroyed early to prevent in-flight init from mounting
    this.#destroyed = true;

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
    this.activeEditor.setHighContrastMode(isHighContrast);
    this.highContrastModeStore.setHighContrastMode(isHighContrast);
  }
}
