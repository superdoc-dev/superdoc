import type { EditorState, Transaction, Plugin } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import type { EditorView as PmEditorView } from 'prosemirror-view';
import type { Node as PmNode, Schema } from 'prosemirror-model';
import type { EditorOptions, User, FieldValue, DocxFileEntry } from './types/EditorConfig.js';
import type { EditorHelpers, ExtensionStorage, ProseMirrorJSON, PageStyles, Toolbar } from './types/EditorTypes.js';
import type { ChainableCommandObject, CanObject, EditorCommands } from './types/ChainedCommands.js';
import type { EditorEventMap, FontsResolvedPayload, Comment } from './types/EditorEvents.js';
import type { SchemaSummaryJSON } from './types/EditorSchema.js';

import { EditorState as PmEditorState } from 'prosemirror-state';
import { DOMSerializer as PmDOMSerializer } from 'prosemirror-model';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { helpers } from '@core/index.js';
import { EventEmitter } from './EventEmitter.js';
import { ExtensionService } from './ExtensionService.js';
import { CommandService } from './CommandService.js';
import { Attribute } from './Attribute.js';
import { SuperConverter } from '@core/super-converter/SuperConverter.js';
import { Commands, Editable, EditorFocus, Keymap, PositionTrackerExtension } from './extensions/index.js';
import { createDocument } from './helpers/createDocument.js';
import { isActive } from './helpers/isActive.js';
import { trackedTransaction } from '@extensions/track-changes/trackChangesHelpers/trackedTransaction.js';
import { TrackChangesBasePluginKey } from '@extensions/track-changes/plugins/index.js';
import { CommentsPluginKey } from '@extensions/comment/comments-plugin.js';
import { getNecessaryMigrations } from '@core/migrations/index.js';
import { getStarterExtensions, getRichTextExtensions } from '../extensions/index.js';
import {
  InvalidStateError,
  NoSourcePathError,
  FileSystemNotAvailableError,
  DocumentLoadError,
} from './errors/index.js';
import { AnnotatorHelpers } from '@helpers/annotator.js';
import { prepareCommentsForExport, prepareCommentsForImport } from '@extensions/comment/comments-helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import { generateCollaborationData } from '@extensions/collaboration/collaboration.js';
import { useHighContrastMode } from '../composables/use-high-contrast-mode.js';
import { updateYdocDocxData } from '@extensions/collaboration/collaboration-helpers.js';
import { setImageNodeSelection } from './helpers/setImageNodeSelection.js';
import { canRenderFont } from './helpers/canRenderFont.js';
import {
  migrateListsToV2IfNecessary,
  migrateParagraphFieldsListsV2,
} from '@core/migrations/0.14-listsv2/listsv2migration.js';
import { createLinkedChildEditor } from '@core/child-editor/index.js';
import { unflattenListsInHtml } from './inputRules/html/html-helpers.js';
import { SuperValidator } from '@core/super-validator/index.js';
import { createDocFromMarkdown, createDocFromHTML } from '@core/helpers/index.js';
import { isHeadless } from '../utils/headless-helpers.js';
import { canUseDOM } from '../utils/canUseDOM.js';
import { buildSchemaSummary } from './schema-summary.js';
import { PresentationEditor } from './presentation-editor/index.js';
import type { EditorRenderer } from './renderers/EditorRenderer.js';
import { ProseMirrorRenderer } from './renderers/ProseMirrorRenderer.js';
import { BLANK_DOCX_DATA_URI } from './blank-docx.js';
import { getArrayBufferFromUrl } from '@core/super-converter/helpers.js';
import { Telemetry, COMMUNITY_LICENSE_KEY } from '@superdoc/common';
import type { DocumentApi } from '@superdoc/document-api';
import { createDocumentApi } from '@superdoc/document-api';
import { getDocumentApiAdapters } from '../document-api-adapters/index.js';

declare const __APP_VERSION__: string;
declare const version: string | undefined;

/**
 * Constants for layout calculations
 */
const PIXELS_PER_INCH = 96;
const MAX_HEIGHT_BUFFER_PX = 50;
const MAX_WIDTH_BUFFER_PX = 20;

/**
 * Image storage structure used by the image extension
 */
interface ImageStorage {
  media: Record<string, unknown>;
}

/**
 * Editor lifecycle state.
 *
 * State machine:
 * ```
 * initialized -> documentLoading -> ready <-> saving
 *                                     |
 *                                     v
 *                                  closed -> documentLoading -> ready
 *                                     |
 *                                     v
 *                                 destroyed
 * ```
 */
export type EditorLifecycleState = 'initialized' | 'documentLoading' | 'ready' | 'saving' | 'closed' | 'destroyed';

/**
 * Options for opening a document.
 */
export interface OpenOptions {
  /** Document mode ('docx', 'text', 'html') */
  mode?: 'docx' | 'text' | 'html';

  /** HTML content to initialize with (for text/html mode) */
  html?: string;

  /** Markdown content to initialize with */
  markdown?: string;

  /** JSON content to initialize with */
  json?: ProseMirrorJSON | null;

  /** Whether comments are enabled */
  isCommentsEnabled?: boolean;

  /** Prevent default styles from being applied in docx mode */
  suppressDefaultDocxStyles?: boolean;

  /** Document mode ('editing', 'viewing', 'suggesting') */
  documentMode?: 'editing' | 'viewing' | 'suggesting';

  /** Pre-parsed docx content (for when document is already loaded) */
  content?: unknown;

  /** Media files from docx */
  mediaFiles?: Record<string, unknown>;

  /** Font data from docx */
  fonts?: Record<string, unknown>;
}

/**
 * Options for saving a document.
 */
export interface SaveOptions {
  /** Whether this is the final document version */
  isFinalDoc?: boolean;

  /** Comment export type */
  commentsType?: string;

  /** Comments to include in export */
  comments?: Array<{ id: string; [key: string]: unknown }>;

  /** Highlight color for fields */
  fieldsHighlightColor?: string | null;

  /** ZIP compression method for docx export. Defaults to 'DEFLATE'. Use 'STORE' for faster exports without compression. */
  compression?: 'DEFLATE' | 'STORE';
}

/**
 * Options for exporting a document.
 * Currently identical to SaveOptions, but may be extended in the future
 * with format-specific options (e.g., format?: 'docx' | 'json' | 'xml').
 */
export type ExportOptions = SaveOptions;

/**
 * Main editor class that manages document state, extensions, and user interactions
 */
export class Editor extends EventEmitter<EditorEventMap> {
  /**
   * Command service for handling editor commands
   */
  #commandService!: CommandService;

  /**
   * Service for managing extensions
   */
  extensionService!: ExtensionService;

  /**
   * Storage for extension data
   */
  extensionStorage: ExtensionStorage = {};

  /**
   * ProseMirror schema for the editor
   */
  schema!: Schema;

  /**
   * ProseMirror view instance.
   * Undefined in headless mode or before the editor is mounted.
   */
  view?: PmEditorView;

  /**
   * Renderer responsible for attaching/destroying the editing surface.
   */
  #renderer: EditorRenderer | null = null;

  /**
   * ProseMirror editor state (exists with or without a view)
   */
  private _state!: EditorState;

  /**
   * Whether the editor instance has been destroyed.
   */
  #isDestroyed = false;

  /**
   * Editor lifecycle state.
   * Tracks the current phase of the editor's document lifecycle.
   */
  #editorLifecycleState: EditorLifecycleState = 'initialized';

  /**
   * Document API instance (lazy-initialized).
   */
  #documentApi: DocumentApi | null = null;

  /**
   * Source path of the currently opened document.
   * Set when opening from a file path, null when opening from Blob/Buffer or blank.
   */
  #sourcePath: string | null = null;

  /**
   * Active PresentationEditor instance when layout mode is enabled.
   * Set by PresentationEditor constructor to enable renderer-neutral helpers.
   */
  presentationEditor: PresentationEditor | null = null;

  /**
   * Whether the editor currently has focus
   */
  isFocused: boolean = false;

  /**
   * All the embedded fonts that were imported by the Editor
   */
  fontsImported: string[] = [];

  /**
   * The document converter instance
   */
  converter!: SuperConverter;

  /**
   * Toolbar instance (if attached)
   */
  toolbar?: Toolbar;

  /**
   * Original state for preview mode
   */
  originalState?: EditorState;

  /**
   * High contrast mode setter
   */
  setHighContrastMode?: (enabled: boolean) => void;

  /**
   * Telemetry instance for tracking document opens
   */
  #telemetry: Telemetry | null = null;

  /**
   * Guard flag to prevent double-tracking document open
   */
  #documentOpenTracked = false;

  options: EditorOptions = {
    element: null,
    selector: null,
    isHeadless: false,
    document: null,
    mockDocument: null,
    mockWindow: null,
    content: '', // XML content
    user: null,
    users: [],
    media: {},
    mediaFiles: {},
    fonts: {},
    documentMode: 'editing',
    mode: 'docx',
    role: 'editor',
    colors: [],
    converter: null,
    fileSource: null,
    initialState: null,
    documentId: null,
    extensions: [],
    editable: true,
    editorProps: {},
    parseOptions: {},
    coreExtensionOptions: {},
    enableInputRules: true,
    isCommentsEnabled: false,
    isNewFile: false,
    scale: 1,
    viewOptions: { layout: 'print' },
    annotations: false,
    isInternal: false,
    externalExtensions: [],
    isChildEditor: false,
    numbering: {},
    isHeaderOrFooter: false,
    lastSelection: null,
    suppressDefaultDocxStyles: false,
    jsonOverride: null,
    loadFromSchema: false,
    fragment: null,
    skipViewCreation: false,
    onBeforeCreate: () => null,
    onCreate: () => null,
    onUpdate: () => null,
    onSelectionUpdate: () => null,
    onTransaction: () => null,
    onFocus: () => null,
    onBlur: () => null,
    onDestroy: () => null,
    onContentError: ({ error }: { editor: Editor; error: Error }) => {
      throw error;
    },
    onTrackedChangesUpdate: () => null,
    onCommentsUpdate: () => null,
    onCommentsLoaded: () => null,
    onCommentClicked: () => null,
    onCommentLocationsUpdate: () => null,
    onDocumentLocked: () => null,
    onFirstRender: () => null,
    onCollaborationReady: () => null,
    onException: () => null,
    onListDefinitionsChange: () => null,
    onFontsResolved: null,
    // async (file) => url;
    handleImageUpload: null,

    // Docx xml updated by User
    customUpdatedFiles: {},

    isHeaderFooterChanged: false,
    isCustomXmlChanged: false,
    ydoc: null,
    collaborationProvider: null,
    collaborationIsReady: false,
    shouldLoadComments: false,
    replacedFile: false,

    focusTarget: null,
    permissionResolver: null,

    // header/footer editors may have parent(main) editor set
    parentEditor: null,

    // License key (resolved in #initTelemetry; undefined means "not explicitly set")
    licenseKey: undefined,

    // Telemetry configuration
    telemetry: { enabled: true },
  };

  /**
   * Create a new Editor instance.
   *
   * **Legacy mode (backward compatible):**
   * When `content` or `fileSource` is provided, the editor initializes synchronously
   * with the document loaded immediately. This preserves existing behavior where
   * `editor.view` is available right after construction.
   *
   * **New mode (document lifecycle API):**
   * When no `content` or `fileSource` is provided, only core services (extensions,
   * commands, schema) are initialized. Call `editor.open()` to load a document.
   *
   * @param options - Editor configuration options
   *
   * @example
   * ```typescript
   * // Legacy mode (still works)
   * const editor = new Editor({ content: docx, element: el });
   * console.log(editor.view.state.doc); // Works immediately
   *
   * // New mode
   * const editor = new Editor({ element: el });
   * await editor.open('/path/to/doc.docx');
   * ```
   */
  constructor(options: Partial<EditorOptions>) {
    super();

    const resolvedOptions = { ...options };
    const domAvailable = canUseDOM();
    const isHeadlessRequested = Boolean(resolvedOptions.isHeadless);
    const mountRequested = Boolean(resolvedOptions.element || resolvedOptions.selector);
    const domDocumentForImport =
      resolvedOptions.document ?? resolvedOptions.mockDocument ?? (domAvailable ? document : null);

    const requiresDomForImport =
      Boolean(resolvedOptions.html || resolvedOptions.markdown) ||
      ((resolvedOptions.mode === 'text' || resolvedOptions.mode === 'html') &&
        typeof resolvedOptions.content === 'string');

    if (!domDocumentForImport && requiresDomForImport) {
      throw new Error(
        '[super-editor] HTML/Markdown import requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
      );
    }

    if (!domAvailable && mountRequested && !isHeadlessRequested) {
      throw new Error(
        '[super-editor] Cannot mount an editor without a DOM. Provide DOM globals (e.g. via JSDOM) or pass { isHeadless: true }.',
      );
    }

    if (!domAvailable && !isHeadlessRequested) {
      resolvedOptions.isHeadless = true;
    }

    if (resolvedOptions.isHeadless) {
      resolvedOptions.element = null;
      resolvedOptions.selector = null;
    }

    this.#checkHeadless(resolvedOptions);
    this.setOptions(resolvedOptions);
    this.#renderer = resolvedOptions.renderer ?? (domAvailable ? new ProseMirrorRenderer() : null);
    this.#initTelemetry();

    const { setHighContrastMode } = useHighContrastMode();
    this.setHighContrastMode = setHighContrastMode;

    // New API mode: only when explicitly requested via deferDocumentLoad option
    // This preserves 100% backward compatibility - the original editor ALWAYS created a view
    const useNewApiMode = resolvedOptions.deferDocumentLoad === true;

    if (useNewApiMode) {
      // NEW MODE: Initialize core only, wait for open()
      // This is opt-in to ensure zero breaking changes
      this.#initCore();
      this.#editorLifecycleState = 'initialized';
    } else {
      // LEGACY MODE (default): Exact current behavior - synchronous, view created immediately
      const modes: Record<string, () => void> = {
        docx: () => this.#init(),
        text: () => this.#initRichText(),
        html: () => this.#initRichText(),
        default: () => {
          console.log('Not implemented.');
        },
      };

      const initMode = modes[this.options.mode!] ?? modes.default;
      initMode();
      this.#editorLifecycleState = 'ready';
    }
  }

  /**
   * Getter which indicates if any changes happen in Editor
   */
  get docChanged(): boolean {
    return (
      this.options.isHeaderFooterChanged ||
      this.options.isCustomXmlChanged ||
      !this.options.initialState!.doc.eq(this.state.doc)
    );
  }

  /**
   * Initialize the container element for the editor
   */
  #initContainerElement(options: Partial<EditorOptions>): void {
    this.#renderer?.initContainerElement?.(options);
  }

  #shouldMountRenderer(): boolean {
    return canUseDOM() && !this.options.isHeadless;
  }

  #getDomDocument(): Document | null {
    return this.options.document ?? this.options.mockDocument ?? (canUseDOM() ? document : null);
  }

  #emitCreateAsync(): void {
    setTimeout(() => {
      if (this.isDestroyed) return;
      this.emit('create', { editor: this });
    }, 0);

    // Generate metadata and track telemetry (non-blocking)
    this.#trackDocumentOpen();
  }

  /**
   * Initialize telemetry if configured
   */
  #initTelemetry(): void {
    const { telemetry: telemetryConfig, licenseKey } = this.options;

    // Skip in test environments and when telemetry is not enabled
    if (typeof process !== 'undefined' && (process.env?.VITEST || process.env?.NODE_ENV === 'test')) {
      return;
    }

    // Skip for sub-editors that are not primary document editors
    if (this.options.mode === 'text' || this.options.isHeaderOrFooter) {
      return;
    }

    if (!telemetryConfig?.enabled) {
      return;
    }

    // Root-level licenseKey has a priority; fall back to deprecated telemetry.licenseKey
    const resolvedLicenseKey =
      licenseKey !== undefined ? licenseKey : (telemetryConfig.licenseKey ?? COMMUNITY_LICENSE_KEY);

    try {
      this.#telemetry = new Telemetry({
        enabled: true,
        endpoint: telemetryConfig.endpoint,
        licenseKey: resolvedLicenseKey,
        metadata: telemetryConfig.metadata,
      });
      console.debug('[super-editor] Telemetry: enabled');
    } catch {
      // Fail silently - telemetry should never break the app
    }
  }

  /**
   * Ensure document metadata is generated and track telemetry if enabled
   */
  #trackDocumentOpen(): void {
    // Always generate metadata (GUID, timestamp) regardless of telemetry
    this.getDocumentIdentifier().then((documentId) => {
      // Only track if telemetry enabled and not already tracked
      if (!this.#telemetry || this.#documentOpenTracked) return;

      try {
        const documentCreatedAt = this.converter?.getDocumentCreatedTimestamp?.() || null;
        this.#telemetry.trackDocumentOpen(documentId, documentCreatedAt);
        this.#documentOpenTracked = true;
      } catch {
        // Fail silently - telemetry should never break the app
      }
    });
  }

  /**
   * Assert that the editor is in one of the allowed states.
   * Throws InvalidStateError if not.
   */
  #assertState(...allowed: EditorLifecycleState[]): void {
    if (!allowed.includes(this.#editorLifecycleState)) {
      throw new InvalidStateError(
        `Invalid operation: editor is in '${this.#editorLifecycleState}' state, expected one of: ${allowed.join(', ')}`,
      );
    }
  }

  /**
   * Wraps an async operation with state transitions for safe lifecycle management.
   *
   * This method ensures atomic state transitions during async operations:
   * 1. Sets state to `during` before executing the operation
   * 2. On success: sets state to `success` and returns the operation result
   * 3. On error: sets state to `failure` and re-throws the error
   *
   * This prevents race conditions and ensures the editor is always in a valid state,
   * even when operations fail.
   *
   * @template T - The return type of the operation
   * @param during - State to set while the operation is running
   * @param success - State to set if the operation succeeds
   * @param failure - State to set if the operation fails
   * @param operation - Async operation to execute
   * @returns Promise resolving to the operation's return value
   * @throws Re-throws any error from the operation after setting failure state
   *
   * @example
   * ```typescript
   * // Used internally for save operations:
   * await this.#withState('saving', 'ready', 'ready', async () => {
   *   const data = await this.exportDocument();
   *   await this.#writeToPath(path, data);
   * });
   * ```
   */
  async #withState<T>(
    during: EditorLifecycleState,
    success: EditorLifecycleState,
    failure: EditorLifecycleState,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.#editorLifecycleState = during;
    try {
      const result = await operation();
      this.#editorLifecycleState = success;
      return result;
    } catch (error) {
      this.#editorLifecycleState = failure;
      throw error;
    }
  }

  /**
   * Initialize core editor services for new lifecycle API mode.
   *
   * When `deferDocumentLoad: true` is set, this method initializes only the
   * document-independent components:
   * - Extension service (loads and configures all extensions)
   * - Command service (registers all editor commands)
   * - ProseMirror schema (derived from extensions, reusable across documents)
   *
   * These services are created once during construction and reused when opening
   * different documents via the `open()` method. This enables efficient document
   * switching without recreating the entire editor infrastructure.
   *
   * Called exclusively from the constructor when `deferDocumentLoad` is true.
   *
   * @remarks
   * This is part of the new lifecycle API that separates editor initialization
   * from document loading. The schema and extensions remain constant while
   * documents can be opened, closed, and reopened.
   *
   * @see #loadDocument - Loads document-specific state after core initialization
   */
  #initCore(): void {
    // Apply default extensions if none provided
    if (!this.options.extensions?.length) {
      this.options.extensions = this.options.mode === 'docx' ? getStarterExtensions() : getRichTextExtensions();
    }

    this.#createExtensionService();
    this.#createCommandService();
    this.#createSchema();

    // Register event listeners once during core init (not per-document)
    this.#registerEventListeners();
  }

  /**
   * Register all event listeners from options.
   *
   * Called once during core initialization. These listeners persist across
   * document open/close cycles since the callbacks are set at construction time.
   */
  #registerEventListeners(): void {
    this.on('create', this.options.onCreate!);
    this.on('update', this.options.onUpdate!);
    this.on('selectionUpdate', this.options.onSelectionUpdate!);
    this.on('transaction', this.options.onTransaction!);
    this.on('focus', this.#onFocus.bind(this));
    this.on('blur', this.options.onBlur!);
    this.on('destroy', this.options.onDestroy!);
    this.on('trackedChangesUpdate', this.options.onTrackedChangesUpdate!);
    this.on('commentsLoaded', this.options.onCommentsLoaded!);
    this.on('commentClick', this.options.onCommentClicked!);
    this.on('commentsUpdate', this.options.onCommentsUpdate!);
    this.on('locked', this.options.onDocumentLocked!);
    this.on('collaborationReady', this.#onCollaborationReady.bind(this));
    this.on('comment-positions', this.options.onCommentLocationsUpdate!);
    this.on('list-definitions-change', this.options.onListDefinitionsChange!);
    this.on('fonts-resolved', this.options.onFontsResolved!);
    this.on('exception', this.options.onException!);
  }

  /**
   * Load a document into the editor from various source types.
   *
   * This method handles the complete document loading pipeline:
   * 1. **Source resolution**: Determines source type (path/File/Blob/Buffer/blank)
   * 2. **Content loading**:
   *    - String path: Reads file from disk (Node.js) or fetches URL (browser)
   *    - File/Blob: Extracts docx archive data
   *    - Buffer: Processes binary data (Node.js)
   *    - undefined/null: Creates blank document
   * 3. **Document initialization**: Creates converter, media, fonts, initial state
   * 4. **View mounting**: Attaches ProseMirror view (unless headless)
   * 5. **Event wiring**: Connects all lifecycle event handlers
   *
   * Called by `open()` after state validation, wrapped in `#withState()` for
   * atomic state transitions.
   *
   * @param source - Document source:
   *   - `string`: File path (Node.js reads from disk, browser fetches as URL)
   *   - `File | Blob`: Browser file object or blob
   *   - `Buffer`: Node.js buffer containing docx data
   *   - `undefined | null`: Creates a blank document
   * @param options - Document-level options (mode, comments, styles, etc.)
   * @returns Promise that resolves when document is fully loaded and ready
   * @throws {DocumentLoadError} If any step of document loading fails. The error
   *   wraps the underlying cause for debugging.
   *
   * @remarks
   * - Sets `#sourcePath` for path-based sources (enables `save()`)
   * - Sets `#sourcePath = null` for Blob/Buffer sources (requires `saveTo()`)
   * - In browser, string paths are treated as URLs to fetch
   * - In Node.js, string paths are read from the filesystem
   *
   * @see open - Public API that calls this method
   * @see #unloadDocument - Cleanup counterpart that reverses this process
   */
  async #loadDocument(source?: string | File | Blob | Buffer, options?: OpenOptions): Promise<void> {
    try {
      // Merge options with defaults
      const resolvedMode = options?.mode ?? this.options.mode ?? 'docx';
      const resolvedOptions = {
        ...this.options,
        mode: resolvedMode,
        isCommentsEnabled: options?.isCommentsEnabled ?? this.options.isCommentsEnabled,
        suppressDefaultDocxStyles: options?.suppressDefaultDocxStyles ?? this.options.suppressDefaultDocxStyles,
        documentMode: options?.documentMode ?? this.options.documentMode ?? 'editing',
        html: options?.html,
        markdown: options?.markdown,
        jsonOverride: options?.json ?? null,
      };

      // Determine source type and load XML data
      if (typeof source === 'string') {
        // Node.js: read file from path
        if (typeof process !== 'undefined' && process.versions?.node) {
          // Dynamic require to avoid bundler issues
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs') as typeof import('fs');
          const buffer = fs.readFileSync(source);
          const [docx, _media, mediaFiles, fonts] = (await Editor.loadXmlData(buffer, true))!;
          resolvedOptions.content = docx;
          resolvedOptions.mediaFiles = mediaFiles;
          resolvedOptions.fonts = fonts;
          resolvedOptions.fileSource = buffer;
          this.#sourcePath = source;
        } else {
          // Browser: fetch the file
          const response = await fetch(source);
          if (!response.ok) {
            console.debug('[SuperDoc] Fetch failed:', response.status, response.statusText);
            throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
          }
          const blob = await response.blob();
          const [docx, _media, mediaFiles, fonts] = (await Editor.loadXmlData(blob))!;
          resolvedOptions.content = docx;
          resolvedOptions.mediaFiles = mediaFiles;
          resolvedOptions.fonts = fonts;
          resolvedOptions.fileSource = blob;
          // In browser, path is just a suggested filename
          this.#sourcePath = source.split('/').pop() || null;
        }
      } else if (source != null && typeof source === 'object') {
        // File, Blob, Buffer, or ArrayBuffer-like object
        // Check for Buffer in Node.js (Buffer.isBuffer is more reliable than instanceof)
        const isNodeBuffer = typeof Buffer !== 'undefined' && (Buffer.isBuffer(source) || source instanceof Buffer);
        const isBlob = typeof Blob !== 'undefined' && source instanceof Blob;
        const isArrayBuffer = source instanceof ArrayBuffer;
        const hasArrayBuffer = typeof source === 'object' && 'buffer' in source && source.buffer instanceof ArrayBuffer;

        if (isNodeBuffer || isBlob || isArrayBuffer || hasArrayBuffer) {
          const [docx, _media, mediaFiles, fonts] = (await Editor.loadXmlData(
            source as File | Blob | Buffer,
            isNodeBuffer,
          ))!;
          resolvedOptions.content = docx;
          resolvedOptions.mediaFiles = mediaFiles;
          resolvedOptions.fonts = fonts;
          resolvedOptions.fileSource = source as File | Blob | Buffer;
          this.#sourcePath = null;
        } else {
          // Unknown object type - try to load it anyway
          const [docx, _media, mediaFiles, fonts] = (await Editor.loadXmlData(source as File | Blob | Buffer, false))!;
          resolvedOptions.content = docx;
          resolvedOptions.mediaFiles = mediaFiles;
          resolvedOptions.fonts = fonts;
          resolvedOptions.fileSource = source as File | Blob | Buffer;
          this.#sourcePath = null;
        }
      } else {
        // Blank document (source is undefined or null)
        // For docx mode without pre-parsed content, load the blank.docx template
        const shouldLoadBlankDocx =
          resolvedMode === 'docx' && !options?.content && !options?.html && !options?.markdown && !options?.json;

        if (shouldLoadBlankDocx) {
          // Decode base64 blank.docx without fetch
          const arrayBuffer = await getArrayBufferFromUrl(BLANK_DOCX_DATA_URI);
          const isNodeRuntime = typeof process !== 'undefined' && !!process.versions?.node;
          const canUseBuffer = isNodeRuntime && typeof Buffer !== 'undefined';
          // Use Uint8Array to ensure compatibility with both Node Buffer and browser Blob
          const uint8Array = new Uint8Array(arrayBuffer);
          let fileSource: File | Blob | Buffer;
          if (canUseBuffer) {
            fileSource = Buffer.from(uint8Array);
          } else if (typeof Blob !== 'undefined') {
            fileSource = new Blob([uint8Array as BlobPart]);
          } else {
            throw new Error('Blob is not available to create blank DOCX');
          }
          const [docx, _media, mediaFiles, fonts] = (await Editor.loadXmlData(fileSource, canUseBuffer))!;
          resolvedOptions.content = docx;
          resolvedOptions.mediaFiles = mediaFiles;
          resolvedOptions.fonts = fonts;
          resolvedOptions.fileSource = fileSource;
          resolvedOptions.isNewFile = true;
          this.#sourcePath = null;
        } else {
          // Use pre-parsed content from options if provided, otherwise create minimal structure
          resolvedOptions.content = (options?.content ?? []) as string | Record<string, unknown> | DocxFileEntry[];
          resolvedOptions.mediaFiles = options?.mediaFiles ?? {};
          resolvedOptions.fonts = options?.fonts ?? {};
          resolvedOptions.fileSource = null;
          resolvedOptions.isNewFile = !options?.content; // Only mark as new if no content provided
          this.#sourcePath = null;
        }
      }

      // Update options
      this.setOptions(resolvedOptions);

      // Create converter
      this.#createConverter();

      // Initialize media
      this.#initMedia();

      // Initialize fonts (if not headless)
      const shouldMountRenderer = this.#shouldMountRenderer();
      if (shouldMountRenderer) {
        this.#initContainerElement(this.options);
        this.#initFonts();
      }

      // Create initial state
      this.#createInitialState({ includePlugins: !shouldMountRenderer });

      // In headless mode, run synthetic transaction pass
      if (!shouldMountRenderer) {
        const tr = this.state.tr.setMeta('forcePluginPass', true).setMeta('addToHistory', false);
        this.#dispatchTransaction(tr);
      }

      // Mount if not headless
      if (shouldMountRenderer) {
        this.mount(this.options.element!);
        this.#configureStateWithExtensionPlugins();
      }

      // Emit create event
      if (!shouldMountRenderer) {
        this.#emitCreateAsync();
      }

      // Initialize default styles (if not headless)
      if (shouldMountRenderer) {
        this.initDefaultStyles();
        this.#checkFonts();
      }

      // Migrate lists if needed
      const shouldMigrateListsOnInit = Boolean(
        this.options.markdown ||
          this.options.html ||
          this.options.loadFromSchema ||
          this.options.jsonOverride ||
          this.options.mode === 'html' ||
          this.options.mode === 'text',
      );
      if (shouldMigrateListsOnInit) {
        this.migrateListsToV2();
      }

      // Set document mode
      this.setDocumentMode(this.options.documentMode!, 'init');

      // Initialize collaboration data for new files
      this.initializeCollaborationData();

      // Initialize comments
      if (!this.options.ydoc && !this.options.isChildEditor) {
        this.#initComments();
      }

      // Initialize dev tools and copy handler
      if (shouldMountRenderer) {
        this.#initDevTools();
        this.#registerCopyHandler();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.debug('[SuperDoc] Document load error:', err.message);
      throw new DocumentLoadError(`Failed to load document: ${err.message}`, err);
    }
  }

  /**
   * Unload the current document and clean up all document-specific resources.
   *
   * This method performs a complete cleanup of document state while preserving
   * the core editor services (schema, extensions, commands) for reuse:
   *
   * **Resources cleaned up:**
   * - ProseMirror view (unmounted from DOM)
   * - Header/footer editors (destroyed)
   * - Document converter instance
   * - Media references and image storage
   * - Source path reference
   * - Document-specific options (content, fileSource, initialState)
   * - ProseMirror editor state
   *
   * **Resources preserved:**
   * - ProseMirror schema
   * - Extension service and registered extensions
   * - Command service and registered commands
   * - Event listeners (registered once during core init, reused across documents)
   *
   * After cleanup, the editor transitions to 'closed' state and can be reopened
   * with a new document via `open()`.
   *
   * Called by `close()` after emitting the `documentClose` event.
   *
   * @remarks
   * This is a critical part of the document lifecycle API that enables efficient
   * document switching. By preserving schema and extensions, we avoid expensive
   * reinitialization when opening multiple documents sequentially.
   *
   * @see close - Public API that calls this method
   * @see #loadDocument - Counterpart method that loads document resources
   */
  #unloadDocument(): void {
    // Unmount the view
    this.unmount();

    // Destroy header/footer editors
    this.destroyHeaderFooterEditors();

    // Reset converter
    this.converter = undefined!;

    // Clear media references
    if (this.storage.image) {
      (this.storage.image as ImageStorage).media = {};
    }

    // Clear source path
    this.#sourcePath = null;

    // Clear document-specific state
    this.options.initialState = null;
    this.options.content = '';
    this.options.fileSource = null;

    // Reset internal state
    this._state = undefined!;
  }

  /**
   * Initialize the editor with the given options
   */
  #init(): void {
    this.#createExtensionService();
    this.#createCommandService();
    this.#createSchema();
    this.#createConverter();
    this.#initMedia();

    this.on('beforeCreate', this.options.onBeforeCreate!);
    this.emit('beforeCreate', { editor: this });
    this.on('contentError', this.options.onContentError!);

    const shouldMountRenderer = this.#shouldMountRenderer();
    this.#createInitialState({ includePlugins: !shouldMountRenderer });
    // In headless mode the view never dispatches an initial transaction,
    // so run one synthetic pass to let appendTransaction hooks (e.g. numbering) populate derived attrs.
    if (!shouldMountRenderer) {
      const tr = this.state.tr.setMeta('forcePluginPass', true).setMeta('addToHistory', false);
      this.#dispatchTransaction(tr);
    }
    if (shouldMountRenderer) {
      this.#initContainerElement(this.options);
      this.#initFonts();
      this.mount(this.options.element!);
      this.#configureStateWithExtensionPlugins();
    }

    this.on('create', this.options.onCreate!);
    this.on('update', this.options.onUpdate!);
    this.on('selectionUpdate', this.options.onSelectionUpdate!);
    this.on('transaction', this.options.onTransaction!);
    this.on('focus', this.#onFocus.bind(this));
    this.on('blur', this.options.onBlur!);
    this.on('destroy', this.options.onDestroy!);
    this.on('trackedChangesUpdate', this.options.onTrackedChangesUpdate!);
    this.on('commentsLoaded', this.options.onCommentsLoaded!);
    this.on('commentClick', this.options.onCommentClicked!);
    this.on('commentsUpdate', this.options.onCommentsUpdate!);
    this.on('locked', this.options.onDocumentLocked!);
    this.on('collaborationReady', this.#onCollaborationReady.bind(this));
    this.on('comment-positions', this.options.onCommentLocationsUpdate!);
    this.on('list-definitions-change', this.options.onListDefinitionsChange!);
    this.on('fonts-resolved', this.options.onFontsResolved!);
    this.on('exception', this.options.onException!);

    if (!shouldMountRenderer) {
      this.#emitCreateAsync();
    }

    this.initializeCollaborationData();

    if (shouldMountRenderer) {
      this.initDefaultStyles();
      this.#checkFonts();
    }

    const shouldMigrateListsOnInit = Boolean(
      this.options.markdown ||
        this.options.html ||
        this.options.loadFromSchema ||
        this.options.jsonOverride ||
        this.options.mode === 'html' ||
        this.options.mode === 'text',
    );

    if (shouldMigrateListsOnInit) {
      this.migrateListsToV2();
    }

    this.setDocumentMode(this.options.documentMode!, 'init');

    if (!this.options.ydoc && !this.options.isChildEditor) {
      this.#initComments();
    }

    if (shouldMountRenderer) {
      this.#initDevTools();
      this.#registerCopyHandler();
    }
  }

  /**
   * Initialize the editor in rich text mode
   */
  #initRichText(): void {
    if (!this.options.extensions || !this.options.extensions.length) {
      this.options.extensions = getRichTextExtensions();
    }

    this.#createExtensionService();
    this.#createCommandService();
    this.#createSchema();

    this.on('beforeCreate', this.options.onBeforeCreate!);
    this.emit('beforeCreate', { editor: this });
    this.on('contentError', this.options.onContentError!);

    const shouldMountRenderer = this.#shouldMountRenderer();
    this.#createInitialState({ includePlugins: !shouldMountRenderer });
    if (shouldMountRenderer) {
      this.#initContainerElement(this.options);
      this.mount(this.options.element!);
      this.#configureStateWithExtensionPlugins();
    }

    this.on('create', this.options.onCreate!);
    this.on('update', this.options.onUpdate!);
    this.on('selectionUpdate', this.options.onSelectionUpdate!);
    this.on('transaction', this.options.onTransaction!);
    this.on('focus', this.#onFocus.bind(this));
    this.on('blur', this.options.onBlur!);
    this.on('destroy', this.options.onDestroy!);
    this.on('commentsLoaded', this.options.onCommentsLoaded!);
    this.on('commentClick', this.options.onCommentClicked!);
    this.on('locked', this.options.onDocumentLocked!);
    this.on('list-definitions-change', this.options.onListDefinitionsChange!);

    if (!shouldMountRenderer) {
      this.#emitCreateAsync();
    }
  }

  mount(el: HTMLElement | null): void {
    this.#createView(el);

    setTimeout(() => {
      if (this.isDestroyed) return;
      this.emit('create', { editor: this });
    }, 0);

    // Generate metadata and track telemetry (non-blocking)
    this.#trackDocumentOpen();
  }

  unmount(): void {
    if (this.#renderer) {
      this.#renderer.destroy();
    } else if (this.view) {
      this.view.destroy();
    }
    this.view = undefined;
  }

  /**
   * Handle focus event
   */
  #onFocus({ editor, event }: { editor: Editor; event: FocusEvent }): void {
    this.toolbar?.setActiveEditor?.(editor);
    this.options.onFocus?.({ editor, event });
  }

  /**
   * Set the toolbar for this editor
   */
  setToolbar(toolbar: Toolbar): void {
    this.toolbar = toolbar;
  }

  /**
   * Check if the editor should run in headless mode
   */
  #checkHeadless(options: Partial<EditorOptions>): void {
    if (!options.isHeadless) return;

    // Set up minimal navigator for Node.js environments
    if (typeof navigator === 'undefined') {
      // Create a minimal navigator object with required properties
      // @ts-expect-error - Partial navigator object for headless mode
      (global as typeof globalThis & { navigator?: unknown }).navigator = {
        platform: 'node',
        userAgent: 'Node.js',
      };
    }

    // Deprecation warnings for legacy mock options
    if (options.mockDocument) {
      console.warn(
        '[super-editor] `mockDocument` is deprecated and will be removed in a future version. ' +
          'Use `document` instead (e.g., `new Editor({ document: jsdomDocument })`). ' +
          'See https://docs.superdoc.dev/guide/headless for migration guidance.',
      );
      (global as typeof globalThis).document = options.mockDocument;
    }
    if (options.mockWindow) {
      console.warn(
        '[super-editor] `mockWindow` is deprecated and will be removed in a future version. ' +
          'Prefer passing `document` only. Global window assignment is no longer required for headless mode.',
      );
      (global as typeof globalThis).window = options.mockWindow as Window & typeof globalThis;
    }
  }

  /**
   * Check if web layout mode is enabled (OOXML ST_View 'web')
   */
  isWebLayout(): boolean {
    return this.options.viewOptions?.layout === 'web';
  }

  /**
   * Focus the editor.
   */
  focus(): void {
    this.view?.focus();
  }

  /**
   * Get the editor state
   */
  get state(): EditorState {
    return this._state;
  }

  /**
   * Get the current editor lifecycle state.
   *
   * @returns The current lifecycle state ('initialized', 'documentLoading', 'ready', 'saving', 'closed', 'destroyed')
   */
  get lifecycleState(): EditorLifecycleState {
    return this.#editorLifecycleState;
  }

  /**
   * Get the source path of the currently opened document.
   *
   * Returns the file path if the document was opened from a path (Node.js),
   * or null if opened from a Blob/Buffer or created as a blank document.
   *
   * In browsers, this is only a suggested filename, not an actual filesystem path.
   */
  get sourcePath(): string | null {
    return this.#sourcePath;
  }

  /**
   * Replace the editor state entirely.
   *
   * Use this method when you need to set a completely new EditorState
   * (e.g., in tests or when loading a new document). For incremental
   * changes, prefer using transactions via `editor.dispatch()` or commands.
   *
   * **Important:** This method bypasses the transaction system entirely.
   * No transaction events will be emitted, no history entries will be created,
   * and plugins will not receive transaction metadata. Use `editor.dispatch()`
   * with transactions for changes that should be undoable or tracked.
   *
   * @param newState - The new EditorState to set
   *
   * @example
   * ```typescript
   * const newState = EditorState.create({
   *   schema: editor.schema,
   *   doc: newDoc,
   *   plugins: editor.state.plugins,
   * });
   * editor.setState(newState);
   * ```
   */
  setState(newState: EditorState): void {
    this._state = newState;
    if (this.view && !this.view.isDestroyed) {
      this.view.updateState(newState);
    }
  }

  /**
   * Get the editor storage.
   */
  get storage(): ExtensionStorage {
    return this.extensionStorage;
  }

  /**
   * Get object of registered commands.
   */
  get commands(): EditorCommands {
    return this.#commandService?.commands;
  }

  /**
   * Programmatic document API for querying and mutating the document.
   *
   * Lazily creates a {@link DocumentApi} backed by the editor's adapter graph.
   * The instance is cached for the current document session and
   * invalidated on {@link close} so a fresh adapter set is created on reopen.
   *
   * @throws {InvalidStateError} If the editor is not in `ready` or `saving` state.
   *
   * @example
   * ```ts
   * const result = editor.doc.find({ nodeType: 'paragraph' });
   *
   * // Fetch node info for the first match
   * const info = editor.doc.getNode(result.matches[0]);
   * ```
   */
  get doc(): DocumentApi {
    this.#assertState('ready', 'saving');
    if (!this.#documentApi) {
      this.#documentApi = createDocumentApi(getDocumentApiAdapters(this));
    }
    return this.#documentApi;
  }

  /**
   * Get extension helpers.
   */
  get helpers(): EditorHelpers {
    return this.extensionService.helpers;
  }

  /**
   * Check if the editor is editable.
   */
  get isEditable(): boolean {
    return Boolean(this.options.editable && this.view && this.view.editable);
  }

  /**
   * Check if editor is destroyed.
   */
  get isDestroyed(): boolean {
    return Boolean(this.#isDestroyed || this.view?.isDestroyed);
  }

  /**
   * Get the editor element
   */
  get element(): HTMLElement | null {
    return this.options.element!;
  }

  /**
   * Get possible users of the editor.
   */
  get users(): User[] {
    return this.options.users!;
  }

  /**
   * Create a chain of commands to call multiple commands at once.
   */
  chain(): ChainableCommandObject {
    return this.#commandService.chain();
  }

  /**
   * Check if a command or a chain of commands can be executed. Without executing it.
   */
  can(): CanObject {
    return this.#commandService.can();
  }

  /**
   * Set the document mode
   * @param documentMode - The document mode ('editing', 'viewing', 'suggesting')
   * @param _caller - Calling context (unused)
   */
  setDocumentMode(documentMode: string, _caller?: string): void {
    if (this.options.isHeaderOrFooter || this.options.isChildEditor) return;

    let cleanedMode = documentMode?.toLowerCase() || 'editing';
    if (!this.extensionService || !this.state) return;

    const pm = this.view?.dom || this.options.element?.querySelector?.('.ProseMirror');

    if (this.options.role === 'viewer') cleanedMode = 'viewing';
    if (this.options.role === 'suggester' && cleanedMode === 'editing') cleanedMode = 'suggesting';

    // Viewing mode: Not editable, no tracked changes, no comments
    if (cleanedMode === 'viewing') {
      this.commands.toggleTrackChangesShowOriginal?.();
      this.setEditable(false, false);
      this.setOptions({ documentMode: 'viewing' });
      if (pm) pm.classList.add('view-mode');
    }

    // Suggesting: Editable, tracked changes plugin enabled, comments
    else if (cleanedMode === 'suggesting') {
      this.commands.disableTrackChangesShowOriginal?.();
      this.commands.enableTrackChanges?.();
      this.setOptions({ documentMode: 'suggesting' });
      this.setEditable(true, false);
      if (pm) pm.classList.remove('view-mode');
    }

    // Editing: Editable, tracked changes plugin disabled, comments
    else if (cleanedMode === 'editing') {
      this.commands.disableTrackChangesShowOriginal?.();
      this.commands.disableTrackChanges?.();
      this.setEditable(true, false);
      this.setOptions({ documentMode: 'editing' });
      if (pm) pm.classList.remove('view-mode');
    }
  }

  /**
   * Blur the editor.
   */
  blur(): void {
    this.view?.dom?.blur();
  }

  /**
   * Check if editor has focus
   */
  hasFocus(): boolean {
    if (this.view) {
      return this.view.hasFocus();
    }
    return false;
  }

  /**
   * Get viewport coordinates for a document position.
   * In presentation mode the ProseMirror view is hidden off-screen, so we
   * delegate to PresentationEditor which uses visual layout coordinates.
   */
  coordsAtPos(pos: number): ReturnType<PmEditorView['coordsAtPos']> | null {
    if (this.presentationEditor) {
      return this.presentationEditor.coordsAtPos(pos);
    }

    if (this.view) {
      return this.view.coordsAtPos(pos);
    }

    return null;
  }

  /**
   * Get the DOM element for a document position.
   * In presentation mode, returns the painted element.
   */
  getElementAtPos(
    pos: number,
    options: { forceRebuild?: boolean; fallbackToCoords?: boolean } = {},
  ): HTMLElement | null {
    if (this.presentationEditor) {
      return this.presentationEditor.getElementAtPos(pos, options);
    }

    if (!this.view) return null;
    if (!Number.isFinite(pos)) return null;

    const maxPos = this.view.state.doc.content.size;
    const clampedPos = Math.max(0, Math.min(pos, maxPos));

    try {
      const { node } = this.view.domAtPos(clampedPos);
      if (node && node.nodeType === 1) {
        return node as HTMLElement;
      }
      if (node && node.nodeType === 3) {
        return node.parentElement;
      }
      return node?.parentElement ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get position from client-space coordinates.
   * In layout/presentation mode, uses PresentationEditor hit testing for accurate coordinate mapping.
   * Falls back to ProseMirror view for standard editing mode.
   */
  posAtCoords(coords: Parameters<PmEditorView['posAtCoords']>[0]): ReturnType<PmEditorView['posAtCoords']> {
    // In presentation/layout mode, use the layout engine's hit testing
    // which properly converts visible surface coordinates to document positions
    if (typeof this.presentationEditor?.hitTest === 'function') {
      // Extract coordinates from various possible coordinate formats
      const coordsObj = coords as {
        clientX?: number;
        clientY?: number;
        left?: number;
        top?: number;
        x?: number;
        y?: number;
      };
      const clientX = coordsObj?.clientX ?? coordsObj?.left ?? coordsObj?.x ?? null;
      const clientY = coordsObj?.clientY ?? coordsObj?.top ?? coordsObj?.y ?? null;
      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const hit = this.presentationEditor.hitTest(clientX as number, clientY as number);
        if (hit) {
          return {
            pos: hit.pos,
            inside: hit.pos,
          };
        }
      }
    }

    // Fall back to ProseMirror view for standard editing mode
    if (this.view) {
      return this.view.posAtCoords(coords);
    }

    return null;
  }

  #registerCopyHandler(): void {
    this.#renderer?.registerCopyHandler?.(this);
  }

  /**
   * Export the yjs binary from the current state.
   */
  async generateCollaborationUpdate(): Promise<Uint8Array> {
    return await generateCollaborationData(this);
  }

  /**
   * Initialize data for collaborative editing
   * If we are replacing data and have a valid provider, listen for synced event
   * so that we can initialize the data
   */
  initializeCollaborationData(): void {
    if (!this.options.isNewFile || !this.options.collaborationProvider) return;
    const provider = this.options.collaborationProvider;

    const postSyncInit = () => {
      provider.off?.('synced', postSyncInit);
      this.#insertNewFileData();
    };

    if (provider.synced) this.#insertNewFileData();
    // If we are not sync'd yet, wait for the event then insert the data
    else provider.on?.('synced', postSyncInit);
  }

  /**
   * Replace content of editor that was created with loadFromSchema option
   * Used to replace content of other header/footer when one of it was edited
   *
   * @param content - new editor content json (retrieved from editor.getUpdatedJson)
   */
  replaceContent(content: ProseMirrorJSON): void {
    this.setOptions({
      content: content as unknown as Record<string, unknown>,
    });

    this.#createConverter();
    this.initDefaultStyles();

    this.#createConverter();
    this.#initMedia();

    const doc = this.#generatePmData();
    const tr = this.state.tr.replaceWith(0, this.state.doc.content.size, doc);
    tr.setMeta('replaceContent', true);
    this.#dispatchTransaction(tr);
  }

  /**
   * Replace the current document with new data. Necessary for initializing a new collaboration file,
   * since we need to insert the data only after the provider has synced.
   */
  #insertNewFileData(): void {
    if (!this.options.isNewFile) return;
    this.options.isNewFile = false;
    const doc = this.#generatePmData();
    // hiding this transaction from history so it doesn't appear in undo stack
    const tr = this.state.tr.replaceWith(0, this.state.doc.content.size, doc).setMeta('addToHistory', false);
    this.#dispatchTransaction(tr);

    setTimeout(() => {
      this.#initComments();
    }, 50);
  }

  /**
   * Set editor options and update state.
   */
  setOptions(options: Partial<EditorOptions> = {}): void {
    this.options = {
      ...this.options,
      ...options,
    };

    if ((this.options.isNewFile || !this.options.ydoc) && this.options.isCommentsEnabled) {
      this.options.shouldLoadComments = true;
    }

    if (!this.view || !this.state || this.isDestroyed) {
      return;
    }

    if (this.options.editorProps) {
      this.view.setProps(this.options.editorProps);
    }

    this.view.updateState(this.state);
  }

  /**
   * Set whether the editor is editable.
   *
   * When setting to non-editable, this method:
   * - Forces ProseMirror to re-evaluate the editable prop from the Editable plugin
   * - Blurs the editor to remove the cursor
   *
   * @param editable - Whether the editor should accept user input (default: true)
   * @param emitUpdate - Whether to emit an update event after changing editability (default: true)
   */
  setEditable(editable: boolean = true, emitUpdate: boolean = true): void {
    this.setOptions({ editable });

    // Force ProseMirror to re-evaluate the editable prop from the Editable plugin.
    // ProseMirror only updates the editable state when setProps is called,
    // even if the underlying editor.options.editable value has changed.
    if (this.view) {
      this.view.setProps({});

      // When setting to non-editable, blur the editor to remove cursor
      if (!editable && this.view.dom) {
        this.view.dom.blur();
      }
    }

    if (emitUpdate) {
      this.emit('update', { editor: this, transaction: this.state.tr });
    }
  }

  /**
   * Register PM plugin.
   * @param plugin PM plugin.
   * @param handlePlugins Optional function for handling plugin merge.
   */
  registerPlugin(plugin: Plugin, handlePlugins?: (plugin: Plugin, plugins: Plugin[]) => Plugin[]): void {
    if (this.isDestroyed) return;
    if (!this.state?.plugins) return;
    const plugins =
      typeof handlePlugins === 'function'
        ? handlePlugins(plugin, [...this.state.plugins])
        : [...this.state.plugins, plugin];

    this._state = this.state.reconfigure({ plugins });
    this.view?.updateState(this._state);
  }

  /**
   * Safely resolve the plugin key string for a plugin instance.
   */
  #getPluginKeyName(plugin: Plugin): string {
    const pluginKey = (plugin as Plugin & { key?: { key: string } }).key;
    return typeof pluginKey?.key === 'string' ? pluginKey.key : '';
  }

  /**
   * Unregister a PM plugin
   */
  unregisterPlugin(nameOrPluginKey: string | { key?: string }): void {
    if (this.isDestroyed) return;

    const name =
      typeof nameOrPluginKey === 'string'
        ? `${nameOrPluginKey}$`
        : ((nameOrPluginKey?.key as string | undefined) ?? '');

    this._state = this.state.reconfigure({
      plugins: this.state.plugins.filter((plugin) => !this.#getPluginKeyName(plugin).startsWith(name)),
    });

    this.view?.updateState(this._state);
  }

  /**
   * Creates extension service.
   */
  #createExtensionService(): void {
    const allowedExtensions = ['extension', 'node', 'mark'];

    const coreExtensions = [Editable, Commands, EditorFocus, Keymap, PositionTrackerExtension];
    const externalExtensions = this.options.externalExtensions || [];

    const allExtensions = [...coreExtensions, ...this.options.extensions!].filter((extension) => {
      const extensionType = typeof extension?.type === 'string' ? extension.type : undefined;
      return extensionType ? allowedExtensions.includes(extensionType) : false;
    });

    this.extensionService = ExtensionService.create(allExtensions, externalExtensions, this);
  }

  /**
   * Creates a command service.
   */
  #createCommandService(): void {
    this.#commandService = CommandService.create({
      editor: this,
    });
  }

  /**
   * Create the document converter as this.converter.
   */
  #createConverter(): void {
    if (this.options.converter) {
      this.converter = this.options.converter as SuperConverter;
    } else {
      this.converter = new SuperConverter({
        docx: this.options.content,
        media: this.options.mediaFiles,
        fonts: this.options.fonts,
        debug: true,
        fileSource: this.options.fileSource,
        documentId: this.options.documentId,
        mockWindow: this.options.mockWindow ?? null,
        mockDocument: this.options.mockDocument ?? null,
        isNewFile: this.options.isNewFile ?? false,
      });
    }
  }

  /**
   * Initialize media.
   */
  #initMedia(): void {
    if (this.options.isChildEditor) return;
    if (!this.options.ydoc) {
      (this.storage.image as ImageStorage).media = this.options.mediaFiles!;
      return;
    }

    const mediaMap = (this.options.ydoc as { getMap: (name: string) => Map<string, unknown> }).getMap('media');

    // We are creating a new file and need to set the media
    if (this.options.isNewFile) {
      Object.entries(this.options.mediaFiles!).forEach(([key, value]) => {
        mediaMap.set(key, value);
      });

      // Set the storage to the imported media files
      (this.storage.image as ImageStorage).media = this.options.mediaFiles!;
    }

    // If we are opening an existing file, we need to get the media from the ydoc
    else {
      (this.storage.image as ImageStorage).media = Object.fromEntries(mediaMap.entries());
    }
  }

  /**
   * Initialize fonts
   */
  #initFonts(): void {
    this.#renderer?.initFonts?.(this);
  }

  /**
   * Determines the fonts used in the document and the unsupported ones and triggers the `onFontsResolved` callback.
   */
  async #checkFonts(): Promise<void> {
    // We only want to run the algorithm to resolve the fonts if the user has asked for it
    if (!this.options.onFontsResolved || typeof this.options.onFontsResolved !== 'function') {
      return;
    }

    if (this.options.isHeadless) {
      return;
    }

    try {
      const fontsUsedInDocument = this.converter.getDocumentFonts();
      const unsupportedFonts = this.#determineUnsupportedFonts(fontsUsedInDocument);

      const payload: FontsResolvedPayload = {
        documentFonts: fontsUsedInDocument,
        unsupportedFonts,
      };

      this.emit('fonts-resolved', payload);
    } catch {
      console.warn('[SuperDoc] Could not determine document fonts and unsupported fonts');
    }
  }

  /**
   * Determines which fonts used in the document are not supported
   * by attempting to render them on a canvas.
   * Fonts are considered unsupported if they cannot be rendered
   * and are not already imported in the document via @font-face.
   *
   * @param fonts - Array of font family names used in the document.
   * @returns Array of unsupported font family names.
   */
  #determineUnsupportedFonts(fonts: string[]): string[] {
    const unsupportedFonts = fonts.filter((font) => {
      const canRender = canRenderFont(font);
      const isFontImported = this.fontsImported.includes(font);

      return !canRender && !isFontImported;
    });

    return unsupportedFonts;
  }

  /**
   * Load the data from DOCX to be used in the schema.
   * Expects a DOCX file.
   * @param fileSource - The DOCX file to load (File/Blob in browser, Buffer in Node.js)
   * @param isNode - Whether the method is being called in a Node.js environment
   * @returns A promise that resolves to an array containing:
   *   - [0] xmlFiles - Array of XML files extracted from the DOCX
   *   - [1] mediaFiles - Object containing media files with URLs (browser only)
   *   - [2] mediaFiles - Object containing media files with base64 data
   *   - [3] fonts - Object containing font files from the DOCX
   */
  static async loadXmlData(
    fileSource: File | Blob | Buffer,
    isNode: boolean = false,
  ): Promise<[DocxFileEntry[], Record<string, unknown>, Record<string, unknown>, Record<string, unknown>] | undefined> {
    if (!fileSource) return;

    const zipper = new DocxZipper();
    const xmlFiles = await zipper.getDocxData(fileSource, isNode);
    const mediaFiles = zipper.media;

    return [xmlFiles, mediaFiles, zipper.mediaFiles, zipper.fonts];
  }

  /**
   * Get the document version
   */
  static getDocumentVersion(doc: DocxFileEntry[]): string {
    return SuperConverter.getStoredSuperdocVersion(doc);
  }

  /**
   * Set the document version
   */
  static setDocumentVersion(doc: DocxFileEntry[], version: string): string {
    const result = SuperConverter.setStoredSuperdocVersion(doc, version);
    if (typeof result === 'string') {
      return result;
    }
    return version;
  }

  /**
   * Get the document GUID
   */
  static getDocumentGuid(doc: DocxFileEntry[]): string | null {
    return SuperConverter.extractDocumentGuid(doc);
  }

  /**
   * @deprecated use setDocumentVersion instead
   */
  static updateDocumentVersion(doc: DocxFileEntry[], version: string): string {
    console.warn('updateDocumentVersion is deprecated, use setDocumentVersion instead');
    return Editor.setDocumentVersion(doc, version);
  }

  /**
   * Generates a schema summary for the current runtime schema.
   */
  async getSchemaSummaryJSON(): Promise<SchemaSummaryJSON> {
    if (!this.schema) {
      throw new Error('Schema is not initialized.');
    }

    const schemaVersion = this.converter?.getSuperdocVersion?.() || 'current';

    const suppressedNames = new Set(
      (this.extensionService?.extensions || [])
        .filter((ext: { config?: { excludeFromSummaryJSON?: boolean } }) => {
          const config = (ext as { config?: { excludeFromSummaryJSON?: boolean } })?.config;
          const suppressFlag = config?.excludeFromSummaryJSON;
          return Boolean(suppressFlag);
        })
        .map((ext: { name: string }) => ext.name),
    );

    const summary = buildSchemaSummary(this.schema, schemaVersion);

    if (!suppressedNames.size) {
      return summary;
    }

    return {
      ...summary,
      nodes: summary.nodes.filter((node) => !suppressedNames.has(node.name)),
      marks: summary.marks.filter((mark) => !suppressedNames.has(mark.name)),
    };
  }

  /**
   * Validates a ProseMirror JSON document against the current schema.
   */
  validateJSON(doc: ProseMirrorJSON | ProseMirrorJSON[]): PmNode | PmNode[] {
    if (!this.schema) {
      throw new Error('Schema is not initialized.');
    }

    try {
      if (Array.isArray(doc)) return doc.map((d) => this.schema!.nodeFromJSON(d));
      return this.schema.nodeFromJSON(doc as ProseMirrorJSON);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const validationError = new Error(`Invalid document for current schema: ${detail}`);
      if (error instanceof Error) {
        (validationError as Error & { cause?: Error }).cause = error;
      }
      throw validationError;
    }
  }

  /**
   * Creates document PM schema.
   */
  #createSchema(): void {
    this.schema = this.extensionService.schema;
  }

  /**
   * Generate ProseMirror data from file
   */
  #generatePmData(): PmNode {
    let doc: PmNode;

    try {
      const { mode, content, fragment, loadFromSchema } = this.options;
      const domDocument = this.#getDomDocument();
      const hasJsonContent = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value);

      if (mode === 'docx') {
        if (loadFromSchema && hasJsonContent(content)) {
          doc = this.schema.nodeFromJSON(content);
          doc = this.#prepareDocumentForImport(doc);
        } else {
          doc = createDocument(this.converter, this.schema, this);
          // Perform any additional document processing prior to finalizing the doc here
          doc = this.#prepareDocumentForImport(doc);

          // Check for markdown BEFORE html (since markdown gets converted to HTML)
          if (this.options.markdown) {
            doc = createDocFromMarkdown(this.options.markdown, this, { isImport: true, document: domDocument });
          }
          // If we have a new doc, and have html data, we initialize from html
          else if (this.options.html)
            doc = createDocFromHTML(this.options.html, this, { isImport: true, document: domDocument });
          else if (this.options.jsonOverride) doc = this.schema.nodeFromJSON(this.options.jsonOverride);

          if (fragment) doc = yXmlFragmentToProseMirrorRootNode(fragment, this.schema);
        }
      }

      // If we are in HTML mode, we initialize from either content or html (or blank)
      else if (mode === 'text' || mode === 'html') {
        if (loadFromSchema && hasJsonContent(content)) doc = this.schema.nodeFromJSON(content);
        else if (typeof content === 'string') doc = createDocFromHTML(content, this, { document: domDocument });
        else doc = this.schema.topNodeType.createAndFill()!;
      }
    } catch (err) {
      console.error(err);
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('contentError', { editor: this, error });
    }

    return doc!;
  }

  /**
   * Create the PM editor view
   */
  #createInitialState({ includePlugins = false }: { includePlugins?: boolean } = {}): void {
    if (this._state) return;

    const doc = this.#generatePmData();

    // Only initialize the doc if we are not using Yjs/collaboration.
    const config: { schema: Schema; doc?: PmNode } = { schema: this.schema };
    if (!this.options.ydoc) config.doc = doc;

    let initialState = PmEditorState.create(config);

    if (includePlugins) {
      initialState = initialState.reconfigure({
        plugins: [...this.extensionService.plugins],
      });
    }

    this.options.initialState = initialState;
    this._state = initialState;
  }

  #configureStateWithExtensionPlugins(): void {
    const configuredState = this.state.reconfigure({
      plugins: [...this.extensionService.plugins],
    });

    this._state = configuredState;
    this.view?.updateState(configuredState);
  }

  /**
   * Create the PM editor view
   */
  #createView(element: HTMLElement | null): void {
    if (!this._state) {
      this.#createInitialState();
    }

    if (!this.#renderer) {
      if (!canUseDOM()) {
        throw new Error('[super-editor] Cannot create an editor view without a renderer.');
      }
      this.#renderer = new ProseMirrorRenderer();
    }

    this.view = this.#renderer.attach({
      element,
      editorProps: this.options.editorProps,
      dispatchTransaction: this.#dispatchTransaction.bind(this),
      state: this.state,
      handleClick: this.#handleNodeSelection.bind(this),
    });

    this.createNodeViews();
  }

  /**
   * Creates all node views.
   */
  createNodeViews(): void {
    if (this.options.skipViewCreation || typeof this.view?.setProps !== 'function') {
      return;
    }
    this.view.setProps({
      nodeViews: this.extensionService.nodeViews,
    });
  }

  /**
   * Get the maximum content size based on page dimensions and margins
   * @returns Size object with width and height in pixels, or empty object if no page size
   * @note In web layout mode, returns empty object to skip content constraints.
   *       CSS max-width: 100% handles responsive display while preserving full resolution.
   */
  getMaxContentSize(): { width?: number; height?: number } {
    if (!this.converter) return {};

    // In web layout mode: skip constraints, let CSS handle responsive sizing
    // This preserves full image resolution while CSS max-width: 100% handles display
    if (this.isWebLayout()) {
      return {};
    }

    const { pageSize = {}, pageMargins = {} } = this.converter.pageStyles ?? {};
    const { width, height } = pageSize;

    if (!width || !height) return {};

    // Print layout mode: use document margins (inches converted to pixels)
    const getMarginPx = (side: 'top' | 'bottom' | 'left' | 'right'): number => {
      return (pageMargins?.[side] ?? 0) * PIXELS_PER_INCH;
    };

    const topPx = getMarginPx('top');
    const bottomPx = getMarginPx('bottom');
    const leftPx = getMarginPx('left');
    const rightPx = getMarginPx('right');

    // All sizes are in inches so we multiply by PIXELS_PER_INCH to get pixels
    const maxHeight = height * PIXELS_PER_INCH - topPx - bottomPx - MAX_HEIGHT_BUFFER_PX;
    const maxWidth = width * PIXELS_PER_INCH - leftPx - rightPx - MAX_WIDTH_BUFFER_PX;
    return {
      width: maxWidth,
      height: maxHeight,
    };
  }

  /**
   * Attach styles and attributes to the editor element
   */
  updateEditorStyles(element: HTMLElement, proseMirror: HTMLElement): void {
    this.#renderer?.updateEditorStyles?.(this, element, proseMirror);
  }

  /**
   * Initialize default styles for the editor container and ProseMirror.
   * Get page size and margins from the converter.
   * Set document default font and font size.
   *
   * @param element - The DOM element to apply styles to
   */
  initDefaultStyles(element: HTMLElement | null = this.element): void {
    if (this.options.isHeadless || this.options.suppressDefaultDocxStyles) return;
    this.#renderer?.initDefaultStyles?.(this, element);
  }

  /**
   * Initializes responsive styles for mobile devices.
   * Sets up scaling based on viewport width and handles orientation changes.
   */
  initMobileStyles(element: HTMLElement | null): void {
    this.#renderer?.initMobileStyles?.(this, element);
  }

  /**
   * Handler called when collaboration is ready.
   * Initializes comments if not a new file.
   */
  #onCollaborationReady({ editor, ydoc }: { editor: Editor; ydoc: unknown }): void {
    if (this.options.collaborationIsReady) return;
    console.debug('🔗 [super-editor] Collaboration ready');

    this.#validateDocumentInit();

    if (this.options.ydoc) {
      this.migrateListsToV2();
    }

    this.options.onCollaborationReady!({ editor, ydoc });
    this.options.collaborationIsReady = true;
    this.options.initialState = this.state;

    const { tr } = this.state;
    tr.setMeta('collaborationReady', true);
    this.#dispatchTransaction(tr);

    if (!this.options.isNewFile) {
      this.#initComments();
      updateYdocDocxData(this, this.options.ydoc);
    }
  }

  /**
   * Initialize comments plugin
   */
  #initComments(): void {
    if (!this.options.isCommentsEnabled) return;
    if (!this.options.shouldLoadComments) return;
    const replacedFile = this.options.replacedFile;
    this.emit('commentsLoaded', {
      editor: this,
      replacedFile,
      comments: this.converter.comments || [],
    });

    // Reset replacedFile synchronously in both headless and mounted paths
    // to ensure consistent behavior for consumers reading this flag after commentsLoaded.
    this.options.replacedFile = false;

    // In headless mode we support comment data (for export and server-side workflows),
    // but skip comment UI behaviors that rely on a mounted view.
    if (this.options.isHeadless) {
      return;
    }

    // Force comment plugin update after a short delay to allow DOM to settle.
    setTimeout(() => {
      const st = this.state;
      if (!st) return;
      const tr = st.tr.setMeta(CommentsPluginKey, { type: 'force' });
      this.#dispatchTransaction(tr);
    }, 50);
  }

  /**
   * Dispatch a transaction to update the editor state
   */
  #dispatchTransaction(transaction: Transaction): void {
    if (this.isDestroyed) return;
    const perf = this.view?.dom?.ownerDocument?.defaultView?.performance ?? globalThis.performance;
    const perfNow = () => (perf?.now ? perf.now() : Date.now());
    const perfStart = perfNow();

    const prevState = this.state;
    let nextState: EditorState;
    let transactionToApply = transaction;
    const forceTrackChanges = transactionToApply.getMeta('forceTrackChanges') === true;
    try {
      const trackChangesState = TrackChangesBasePluginKey.getState(prevState);
      const isTrackChangesActive = trackChangesState?.isTrackChangesActive ?? false;
      const skipTrackChanges = transactionToApply.getMeta('skipTrackChanges') === true;

      const shouldTrack = (isTrackChangesActive || forceTrackChanges) && !skipTrackChanges;
      if (shouldTrack && forceTrackChanges && !this.options.user) {
        throw new Error('forceTrackChanges requires a user to be configured on the editor instance.');
      }

      transactionToApply = shouldTrack
        ? trackedTransaction({
            tr: transactionToApply,
            state: prevState,
            user: this.options.user!,
          })
        : transactionToApply;

      const { state: appliedState } = prevState.applyTransaction(transactionToApply);
      nextState = appliedState;
    } catch (error) {
      if (forceTrackChanges) throw error;
      // just in case
      nextState = prevState.apply(transactionToApply);
      console.log(error);
    }

    const selectionHasChanged = !prevState.selection.eq(nextState.selection);

    this._state = nextState;
    if (this.view) {
      this.view.updateState(nextState);
    }

    const end = perfNow();

    this.emit('transaction', {
      editor: this,
      transaction: transactionToApply,
      duration: end - perfStart,
    });

    if (selectionHasChanged) {
      this.emit('selectionUpdate', {
        editor: this,
        transaction: transactionToApply,
      });
    }

    const focus = transactionToApply.getMeta('focus');
    if (focus) {
      this.emit('focus', {
        editor: this,
        event: focus.event,
        transaction: transactionToApply,
      });
    }

    const blur = transactionToApply.getMeta('blur');
    if (blur) {
      this.emit('blur', {
        editor: this,
        event: blur.event,
        transaction: transactionToApply,
      });
    }

    if (transactionToApply.docChanged) {
      // Track document modifications and promote to GUID if needed
      if (transaction.docChanged && this.converter) {
        if (!this.converter.documentGuid) {
          this.converter.promoteToGuid();
          console.debug('Document modified - assigned GUID:', this.converter.documentGuid);
        }
        this.converter.documentModified = true;
      }

      this.emit('update', {
        editor: this,
        transaction: transactionToApply,
      });
    }
  }

  /**
   * Public dispatch method for transaction dispatching.
   *
   * Allows external callers (e.g., SuperDoc stores, headless workflows) to dispatch
   * transactions without accessing editor.view directly. This method works in both
   * mounted and headless modes.
   *
   * In headless mode, this is the primary way to apply state changes since there is
   * no ProseMirror view to dispatch through.
   *
   * @param tr - The ProseMirror transaction to dispatch
   *
   * @example
   * ```typescript
   * // Headless mode: insert text without a view
   * const editor = new Editor({ isHeadless: true, content: docx });
   * editor.dispatch(editor.state.tr.insertText('Hello'));
   * ```
   */
  dispatch(tr: Transaction): void {
    this.#dispatchTransaction(tr);
  }

  /**
   * Get document unique identifier (async)
   * Returns a stable identifier for the document (identifierHash or contentHash)
   */
  async getDocumentIdentifier(): Promise<string | null> {
    return (await this.converter?.getDocumentIdentifier()) || null;
  }

  /**
   * Get permanent document GUID (sync - only for modified documents)
   */
  getDocumentGuid(): string | null {
    return this.converter?.documentGuid || null;
  }

  /**
   * Check if document has been modified
   */
  isDocumentModified(): boolean {
    return this.converter?.documentModified || false;
  }

  /**
   * @deprecated use getDocumentGuid instead
   */
  getDocumentId(): string | null {
    console.warn('getDocumentId is deprecated, use getDocumentGuid instead');
    return this.getDocumentGuid();
  }

  /**
   * Get attrs of the currently selected node or mark.
   * @example
   * editor.getAttributes('textStyle').color
   */
  getAttributes(nameOrType: string): Record<string, unknown> {
    return Attribute.getAttributes(this.state, nameOrType);
  }

  /**
   * Returns if the currently selected node or mark is active.
   * @param nameOrAttributes - The name of the node/mark or an attributes object
   * @param attributesOrUndefined - Optional attributes to check when first parameter is a name
   * @example
   * editor.isActive('bold')
   * editor.isActive('textStyle', { color: 'purple' })
   * editor.isActive({ textAlign: 'center' })
   */
  isActive(
    nameOrAttributes: string | Record<string, unknown>,
    attributesOrUndefined?: Record<string, unknown>,
  ): boolean {
    const name = typeof nameOrAttributes === 'string' ? nameOrAttributes : null;
    const attributes = typeof nameOrAttributes === 'string' ? attributesOrUndefined : nameOrAttributes;
    return isActive(this.state, name, attributes);
  }

  /**
   * Get the editor content as JSON
   */
  getJSON(): ProseMirrorJSON {
    const json = this.state.doc.toJSON();
    try {
      // Always sync converter bodySectPr into doc attrs so layout/export see latest section defaults
      const jsonObj = json as ProseMirrorJSON;
      const attrs = jsonObj.attrs as Record<string, unknown> | undefined;
      const converter = this.converter as unknown as { bodySectPr?: unknown };
      if (converter && converter.bodySectPr) {
        jsonObj.attrs = attrs || {};
        (jsonObj.attrs as Record<string, unknown>).bodySectPr = converter.bodySectPr;
      }
    } catch {
      // Non-fatal: leave json as-is if anything unexpected occurs
    }
    return json as ProseMirrorJSON;
  }

  /**
   * Get document metadata including GUID, modification status, and version
   */
  getMetadata(): {
    documentGuid: string | null;
    isModified: boolean;
    version: string | null;
  } {
    return {
      documentGuid: this.converter?.documentGuid || null,
      isModified: this.isDocumentModified(),
      version: this.converter?.getSuperdocVersion() || null,
    };
  }

  /**
   * Get the editor content as HTML
   */
  getHTML({ unflattenLists = false }: { unflattenLists?: boolean } = {}): string {
    const domDocument = this.#getDomDocument();
    if (!domDocument) {
      throw new Error(
        '[super-editor] getHTML() requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
      );
    }

    const container = domDocument.createElement('div');
    const fragment = PmDOMSerializer.fromSchema(this.schema).serializeFragment(this.state.doc.content, {
      document: domDocument,
    });
    container.appendChild(fragment);
    let html = container.innerHTML;
    if (unflattenLists) {
      html = unflattenListsInHtml(html, domDocument);
    }
    return html;
  }

  /**
   * Get the editor content as Markdown
   */
  async getMarkdown(): Promise<string> {
    const domDocument = this.#getDomDocument();
    if (!domDocument) {
      throw new Error(
        '[super-editor] getMarkdown() requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
      );
    }

    // Type alias to avoid repeated verbose casts when manipulating DOM globals
    type MutableGlobals = Record<string, unknown> & {
      document?: Document;
      window?: Window & typeof globalThis;
      navigator?: Navigator;
    };
    const globals = globalThis as unknown as MutableGlobals;

    const shouldInjectGlobals = globals.document === undefined;
    const savedGlobals = shouldInjectGlobals
      ? {
          document: globals.document,
          window: globals.window,
          navigatorDescriptor: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
        }
      : null;

    if (shouldInjectGlobals) {
      globals.document = domDocument;
      if (!globals.window && domDocument.defaultView) {
        globals.window = domDocument.defaultView as Window & typeof globalThis;
      }
      if (!globals.navigator && domDocument.defaultView?.navigator) {
        globals.navigator = domDocument.defaultView.navigator;
      }
    }

    // Lazy-load markdown libraries to avoid requiring 'document' at import time
    // These libraries (specifically rehype) execute code that accesses document.createElement()
    // during module initialization, which breaks Node.js compatibility
    try {
      const [
        { unified },
        { default: rehypeParse },
        { default: rehypeRemark },
        { default: remarkStringify },
        { default: remarkGfm },
      ] = await Promise.all([
        import('unified'),
        import('rehype-parse'),
        import('rehype-remark'),
        import('remark-stringify'),
        import('remark-gfm'),
      ]);

      const html = this.getHTML();
      const file = unified()
        .use(rehypeParse, { fragment: true })
        .use(rehypeRemark)
        .use(remarkGfm)
        .use(remarkStringify, {
          bullet: '-',
          fences: true,
        })
        .processSync(html);

      return String(file);
    } finally {
      if (savedGlobals) {
        // Restore or delete each global based on its original state
        if (savedGlobals.document === undefined) {
          delete globals.document;
        } else {
          globals.document = savedGlobals.document;
        }

        if (savedGlobals.window === undefined) {
          delete globals.window;
        } else {
          globals.window = savedGlobals.window;
        }

        if (savedGlobals.navigatorDescriptor) {
          Object.defineProperty(globalThis, 'navigator', savedGlobals.navigatorDescriptor);
        } else {
          delete globals.navigator;
        }
      }
    }
  }

  /**
   * Get the document version from the converter
   */
  getDocumentVersion(): string | null {
    return this.converter?.getSuperdocVersion() || null;
  }

  /**
   * Create a child editor linked to this editor.
   * This is useful for creating header/footer editors that are linked to the main editor.
   * Or paragraph fields that rely on the same underlying document and list defintions
   */
  createChildEditor(options: Partial<EditorOptions>): Editor {
    return createLinkedChildEditor(this, options);
  }

  /**
   * Get page styles
   */
  getPageStyles(): PageStyles {
    return this.converter?.pageStyles || {};
  }

  /**
   * Update page styles
   */
  updatePageStyle({ pageMargins }: { pageMargins?: Record<string, unknown> }): void {
    if (!this.converter) return;

    let hasMadeUpdate = false;
    if (pageMargins) {
      this.converter.pageStyles.pageMargins = pageMargins;
      this.initDefaultStyles();
      hasMadeUpdate = true;
    }

    if (hasMadeUpdate && this.view && !isHeadless()) {
      const newTr = this.view.state.tr;
      newTr.setMeta('forceUpdatePagination', true);
      this.#dispatchTransaction(newTr);

      // Emit dedicated event for page style updates
      // This provides a clearer semantic signal for consumers that need to react
      // to page style changes (margins, size, orientation) without content modifications
      this.emit('pageStyleUpdate', {
        pageMargins,
        pageStyles: this.converter.pageStyles,
      });
    }
  }

  /**
   * Handles image node selection for header/footer editor
   */
  #handleNodeSelection(view: PmEditorView, pos: number): boolean | void {
    this.setOptions({
      lastSelection: null,
    });

    if (this.options.isHeaderOrFooter) {
      return setImageNodeSelection(view, pos);
    }
  }

  /**
   * Perform any post conversion pre prosemirror import processing.
   * Comments are processed here.
   * @param doc The prosemirror document
   * @returns The updated prosemirror document
   */
  #prepareDocumentForImport(doc: PmNode): PmNode {
    const newState = PmEditorState.create({
      schema: this.schema,
      doc,
    });

    const { tr, doc: newDoc } = newState;

    // Perform comments processing (replaces comment nodes with marks)
    prepareCommentsForImport(newDoc, tr, this.schema, this.converter);

    const updatedState = newState.apply(tr);
    return updatedState.doc;
  }

  migrateListsToV2(): Array<{ from: number; to: number; slice: unknown }> {
    if (this.options.isHeaderOrFooter) return [];
    const replacements = migrateListsToV2IfNecessary(this);
    return replacements;
  }

  /**
   * Prepare the document for export. Any necessary pre-export processing to the state
   * can happen here.
   * @returns The updated document in JSON
   */
  #prepareDocumentForExport(comments: Comment[] = []): ProseMirrorJSON {
    // Use Transform directly instead of creating a throwaway EditorState.
    // EditorState.create() calls Plugin.init() for every plugin, and
    // yUndoPlugin.init() registers persistent observers on the shared ydoc
    // that are never cleaned up — causing an observer leak that degrades
    // collaboration performance over time.
    const doc = this.state.doc;
    const tr = new Transform(doc);
    prepareCommentsForExport(doc, tr, this.schema, comments);
    return tr.doc.toJSON();
  }

  getUpdatedJson(): ProseMirrorJSON {
    return this.#prepareDocumentForExport();
  }

  /**
   * Export the editor document to DOCX.
   */
  async exportDocx({
    isFinalDoc = false,
    commentsType = 'external',
    exportJsonOnly = false,
    exportXmlOnly = false,
    comments,
    getUpdatedDocs = false,
    fieldsHighlightColor = null,
    compression,
  }: {
    isFinalDoc?: boolean;
    commentsType?: string;
    exportJsonOnly?: boolean;
    exportXmlOnly?: boolean;
    comments?: Comment[];
    getUpdatedDocs?: boolean;
    fieldsHighlightColor?: string | null;
    compression?: 'DEFLATE' | 'STORE';
  } = {}): Promise<Blob | ArrayBuffer | Buffer | Record<string, string> | ProseMirrorJSON | string | undefined> {
    try {
      // Use provided comments, or fall back to imported comments from converter
      const effectiveComments = comments ?? this.converter.comments ?? [];

      // Normalize commentJSON property (imported comments provide `elements`)
      const preparedComments = effectiveComments.map((comment: Comment) => {
        const elements = Array.isArray(comment.elements) && comment.elements.length ? comment.elements : undefined;
        return {
          ...comment,
          commentJSON: comment.commentJSON ?? elements,
        };
      });

      // Pre-process the document state to prepare for export
      const json = this.#prepareDocumentForExport(preparedComments);

      // Export the document to DOCX
      // GUID will be handled automatically in converter.exportToDocx if document was modified
      const documentXml = await this.converter.exportToDocx(
        json,
        this.schema,
        (this.storage.image as ImageStorage).media,
        isFinalDoc,
        commentsType,
        preparedComments,
        this,
        exportJsonOnly,
        fieldsHighlightColor,
      );

      this.#validateDocumentExport();

      if (exportXmlOnly || exportJsonOnly) return documentXml;

      const customXml = this.converter.schemaToXml(this.converter.convertedXml['docProps/custom.xml'].elements[0]);
      const styles = this.converter.schemaToXml(this.converter.convertedXml['word/styles.xml'].elements[0]);
      const hasCustomSettings = !!this.converter.convertedXml['word/settings.xml']?.elements?.length;
      const customSettings = hasCustomSettings
        ? this.converter.schemaToXml(this.converter.convertedXml['word/settings.xml']?.elements?.[0])
        : null;

      const rels = this.converter.schemaToXml(this.converter.convertedXml['word/_rels/document.xml.rels'].elements[0]);
      const footnotesData = this.converter.convertedXml['word/footnotes.xml'];
      const footnotesXml = footnotesData?.elements?.[0] ? this.converter.schemaToXml(footnotesData.elements[0]) : null;
      const footnotesRelsData = this.converter.convertedXml['word/_rels/footnotes.xml.rels'];
      const footnotesRelsXml = footnotesRelsData?.elements?.[0]
        ? this.converter.schemaToXml(footnotesRelsData.elements[0])
        : null;

      const media = this.converter.addedMedia;

      const updatedHeadersFooters: Record<string, string> = {};
      Object.entries(this.converter.convertedXml).forEach(([name, json]) => {
        if (name.includes('header') || name.includes('footer')) {
          const jsonObj = json as { elements?: unknown[] };
          const resultXml = this.converter.schemaToXml(jsonObj.elements?.[0]);
          updatedHeadersFooters[name] = String(resultXml.replace(/\[\[sdspace\]\]/g, ''));
        }
      });

      const numberingData = this.converter.convertedXml['word/numbering.xml'];
      const numbering = this.converter.schemaToXml(numberingData.elements[0]);

      // Export core.xml (contains dcterms:created timestamp)
      const coreXmlData = this.converter.convertedXml['docProps/core.xml'];
      const coreXml = coreXmlData?.elements?.[0] ? this.converter.schemaToXml(coreXmlData.elements[0]) : null;

      const updatedDocs: Record<string, string> = {
        ...this.options.customUpdatedFiles,
        'word/document.xml': String(documentXml),
        'docProps/custom.xml': String(customXml),
        'word/_rels/document.xml.rels': String(rels),
        'word/numbering.xml': String(numbering),
        'word/styles.xml': String(styles),
        ...updatedHeadersFooters,
        ...(coreXml ? { 'docProps/core.xml': String(coreXml) } : {}),
      };

      if (hasCustomSettings) {
        updatedDocs['word/settings.xml'] = String(customSettings);
      }

      if (footnotesXml) {
        updatedDocs['word/footnotes.xml'] = String(footnotesXml);
      }

      if (footnotesRelsXml) {
        updatedDocs['word/_rels/footnotes.xml.rels'] = String(footnotesRelsXml);
      }

      if (preparedComments.length) {
        const commentsXml = this.converter.schemaToXml(this.converter.convertedXml['word/comments.xml'].elements[0]);
        updatedDocs['word/comments.xml'] = String(commentsXml);

        const commentsExtended = this.converter.convertedXml['word/commentsExtended.xml'];
        if (commentsExtended?.elements?.[0]) {
          const commentsExtendedXml = this.converter.schemaToXml(commentsExtended.elements[0]);
          updatedDocs['word/commentsExtended.xml'] = String(commentsExtendedXml);
        }

        const commentsExtensible = this.converter.convertedXml['word/commentsExtensible.xml'];
        if (commentsExtensible?.elements?.[0]) {
          const commentsExtensibleXml = this.converter.schemaToXml(commentsExtensible.elements[0]);
          updatedDocs['word/commentsExtensible.xml'] = String(commentsExtensibleXml);
        }

        const commentsIds = this.converter.convertedXml['word/commentsIds.xml'];
        if (commentsIds?.elements?.[0]) {
          const commentsIdsXml = this.converter.schemaToXml(commentsIds.elements[0]);
          updatedDocs['word/commentsIds.xml'] = String(commentsIdsXml);
        }
      }

      const zipper = new DocxZipper();

      if (getUpdatedDocs) {
        updatedDocs['[Content_Types].xml'] = await zipper.updateContentTypes(
          {
            files: this.options.content,
          },
          media,
          true,
          updatedDocs,
        );
        return updatedDocs;
      }

      const result = await zipper.updateZip({
        docx: this.options.content,
        updatedDocs: updatedDocs,
        originalDocxFile: this.options.fileSource,
        media,
        fonts: this.options.fonts,
        isHeadless: this.options.isHeadless,
        compression,
      });

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('exception', { error: err, editor: this });
      console.error(err);
    }
  }

  /**
   * Destroy collaboration provider and ydoc
   */
  #endCollaboration(): void {
    if (!this.options.ydoc) return;
    try {
      console.debug('🔗 [super-editor] Ending collaboration');
      this.options.collaborationProvider?.disconnect?.();
      (this.options.ydoc as { destroy: () => void }).destroy();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('exception', { error: err, editor: this });
      console.error(err);
    }
  }

  // ============================================================================
  // Document Lifecycle API
  // ============================================================================

  /**
   * Open a document in the editor.
   *
   * @param source - Document source:
   *   - `string` - File path (Node.js reads from disk, browser fetches URL)
   *   - `File | Blob` - Browser file object
   *   - `Buffer` - Node.js buffer
   *   - `undefined` - Creates a blank document
   * @param options - Document options (mode, comments, etc.)
   * @returns Promise that resolves when document is loaded
   *
   * @throws {InvalidStateError} If editor is not in 'initialized' or 'closed' state
   * @throws {DocumentLoadError} If document loading fails
   *
   * @example
   * ```typescript
   * const editor = new Editor({ element: myDiv });
   *
   * // Open from file path (Node.js)
   * await editor.open('/path/to/document.docx');
   *
   * // Open from File object (browser)
   * await editor.open(fileInput.files[0]);
   *
   * // Open blank document
   * await editor.open();
   *
   * // Open with options
   * await editor.open('/path/to/doc.docx', { isCommentsEnabled: true });
   * ```
   */
  async open(source?: string | File | Blob | Buffer, options?: OpenOptions): Promise<void> {
    this.#assertState('initialized', 'closed');

    await this.#withState('documentLoading', 'ready', 'closed', async () => {
      await this.#loadDocument(source, options);
    });

    this.emit('documentOpen', { editor: this, sourcePath: this.#sourcePath });
  }

  /**
   * Static factory method for one-liner document opening.
   * Creates an Editor instance and opens the document in one call.
   *
   * Smart defaults enable minimal configuration:
   * - No element/selector → headless mode
   * - No extensions → uses getStarterExtensions() for docx, getRichTextExtensions() for text/html
   * - No mode → defaults to 'docx'
   *
   * @param source - Document source (path, File, Blob, Buffer, or undefined for blank)
   * @param config - Combined editor and document options (all optional)
   * @returns Promise resolving to the ready Editor instance
   *
   * @example
   * ```typescript
   * // Minimal headless usage - just works!
   * const editor = await Editor.open('/path/to/doc.docx');
   *
   * // With options
   * const editor = await Editor.open('/path/to/doc.docx', {
   *   isCommentsEnabled: true,
   * });
   *
   * // With UI element (automatically not headless)
   * const editor = await Editor.open('/path/to/doc.docx', {
   *   element: document.getElementById('editor'),
   * });
   *
   * // Blank document
   * const editor = await Editor.open();
   * ```
   */
  static async open(
    source?: string | File | Blob | Buffer,
    config?: Partial<EditorOptions> & OpenOptions,
  ): Promise<Editor> {
    // Apply smart defaults
    const hasElement = config?.element != null || config?.selector != null;
    const resolvedConfig: Partial<EditorOptions> = {
      mode: 'docx',
      isHeadless: !hasElement,
      ...config,
    };

    // Separate editor-level config from document-level options
    const {
      // OpenOptions (document-level)
      html,
      markdown,
      isCommentsEnabled,
      suppressDefaultDocxStyles,
      documentMode,
      content,
      mediaFiles,
      fonts,
      // Everything else is EditorOptions
      ...editorConfig
    } = resolvedConfig;

    const openOptions: OpenOptions = {
      mode: resolvedConfig.mode as 'docx' | 'text' | 'html',
      html,
      markdown,
      isCommentsEnabled,
      suppressDefaultDocxStyles,
      documentMode: documentMode as 'editing' | 'viewing' | 'suggesting' | undefined,
      content,
      mediaFiles,
      fonts,
    };

    // Use new API mode for static factory
    const editor = new Editor({ ...editorConfig, deferDocumentLoad: true });
    await editor.open(source, openOptions);
    return editor;
  }

  /**
   * Close the current document.
   *
   * This unloads the document but keeps the editor instance alive.
   * The editor can be reused by calling `open()` again.
   *
   * This method is idempotent - calling it when already closed is a no-op.
   *
   * @example
   * ```typescript
   * await editor.open('/doc1.docx');
   * // ... work with document ...
   * editor.close();
   *
   * await editor.open('/doc2.docx');  // Reuse the same editor
   * ```
   */
  close(): void {
    // Idempotent: calling close() when already closed is a no-op
    if (this.#editorLifecycleState === 'closed' || this.#editorLifecycleState === 'initialized') {
      return;
    }

    if (this.#editorLifecycleState === 'destroyed') {
      return;
    }

    this.#assertState('ready');
    this.emit('documentClose', { editor: this });
    this.#unloadDocument();
    this.#documentApi = null;
    this.#editorLifecycleState = 'closed';
  }

  /**
   * Save the document to the original source path.
   *
   * Only works if the document was opened from a file path.
   * If opened from Blob/Buffer or created blank, use `saveTo()` or `exportDocument()`.
   *
   * @param options - Save options (comments, final doc, etc.)
   * @throws {InvalidStateError} If editor is not in 'ready' state
   * @throws {NoSourcePathError} If no source path is available
   * @throws {FileSystemNotAvailableError} If file system access is not available
   *
   * @example
   * ```typescript
   * const editor = await Editor.open('/path/to/doc.docx');
   * // ... make changes ...
   * await editor.save();  // Saves back to /path/to/doc.docx
   * ```
   */
  async save(options?: SaveOptions): Promise<void> {
    this.#assertState('ready');

    if (!this.#sourcePath) {
      throw new NoSourcePathError('No source path. Use saveTo(path) or exportDocument() instead.');
    }

    await this.#withState('saving', 'ready', 'ready', async () => {
      const data = await this.exportDocument(options);
      await this.#writeToPath(this.#sourcePath!, data);
    });
  }

  /**
   * Save the document to a specific path.
   *
   * Updates the source path to the new location after saving.
   *
   * @param path - File path to save to
   * @param options - Save options
   * @throws {InvalidStateError} If editor is not in 'ready' state
   * @throws {FileSystemNotAvailableError} If file system access is not available
   *
   * @example
   * ```typescript
   * const editor = await Editor.open(blobData);  // No source path
   * await editor.saveTo('/path/to/new-doc.docx');
   * await editor.save();  // Now saves to /path/to/new-doc.docx
   * ```
   */
  async saveTo(path: string, options?: SaveOptions): Promise<void> {
    this.#assertState('ready');

    await this.#withState('saving', 'ready', 'ready', async () => {
      const data = await this.exportDocument(options);
      await this.#writeToPath(path, data);
      this.#sourcePath = path;
    });
  }

  /**
   * Export the document as a Blob or Buffer.
   *
   * This is a convenience wrapper around `exportDocx()` that returns
   * the document data without writing to a file.
   *
   * @param options - Export options
   * @returns Promise resolving to Blob (browser) or Buffer (Node.js)
   * @throws {InvalidStateError} If editor is not in 'ready' state
   *
   * @example
   * ```typescript
   * const blob = await editor.exportDocument();
   *
   * // Create download link in browser
   * const url = URL.createObjectURL(blob);
   * const a = document.createElement('a');
   * a.href = url;
   * a.download = 'document.docx';
   * a.click();
   * ```
   */
  async exportDocument(options?: ExportOptions): Promise<Blob | Buffer> {
    // Allow exporting from 'ready' or 'saving' state (saving calls exportDocument internally)
    this.#assertState('ready', 'saving');

    const result = await this.exportDocx({
      isFinalDoc: options?.isFinalDoc,
      commentsType: options?.commentsType,
      comments: options?.comments,
      fieldsHighlightColor: options?.fieldsHighlightColor,
      compression: options?.compression,
    });

    return result as Blob | Buffer;
  }

  /**
   * Writes document data to a file path.
   *
   * **Browser behavior:**
   * In browsers, the `path` parameter is only used as a suggested filename.
   * The File System Access API shows a save dialog and the user chooses the actual location.
   *
   * **Node.js behavior:**
   * The path is an actual filesystem path, written directly.
   */
  async #writeToPath(path: string, data: Blob | Buffer): Promise<void> {
    // Detect Node.js environment more reliably
    const isNode =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.process !== 'undefined' &&
      globalThis.process.versions?.node != null;

    // Also check for Buffer which is Node.js specific
    const hasNodeBuffer = typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function';

    if (isNode || hasNodeBuffer) {
      try {
        // Dynamic require to avoid bundler issues
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs') as typeof import('fs');
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(await (data as Blob).arrayBuffer());
        fs.writeFileSync(path, buffer);
        return;
      } catch {
        // Fall through to browser methods if require fails
      }
    }

    // Browser with File System Access API
    // NOTE: path is only used as suggestedName; user picks actual location via dialog
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      const handle = await (
        window as Window & { showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle> }
      ).showSaveFilePicker({
        suggestedName: path.split('/').pop() || 'document.docx',
        types: [
          {
            description: 'Word Document',
            accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(data as Blob);
      await writable.close();
      return;
    }

    // Browser without File System Access API
    throw new FileSystemNotAvailableError(
      'File System Access API not available. Use exportDocument() to get the document data and handle the download manually.',
    );
  }

  /**
   * Destroy the editor and clean up resources
   */
  destroy(): void {
    // Close document if open
    if (this.#editorLifecycleState === 'ready') {
      this.close();
    }

    // Already destroyed - idempotent
    if (this.#editorLifecycleState === 'destroyed') {
      return;
    }

    this.#isDestroyed = true;
    this.emit('destroy');

    this.unmount();

    this.destroyHeaderFooterEditors();
    this.#endCollaboration();
    this.removeAllListeners();

    // Clear references
    this.extensionService = undefined!;
    this.schema = undefined!;
    this.#commandService = undefined!;
    this.#documentApi = null;

    this.#editorLifecycleState = 'destroyed';
  }

  destroyHeaderFooterEditors(): void {
    try {
      const headerEditors = this.converter?.headerEditors ?? [];
      const footerEditors = this.converter?.footerEditors ?? [];
      if (!headerEditors.length && !footerEditors.length) return;

      const editors = [...headerEditors, ...footerEditors].filter(Boolean);
      for (const editorData of editors) {
        editorData?.editor?.destroy?.();
      }
      if (headerEditors.length) headerEditors.length = 0;
      if (footerEditors.length) footerEditors.length = 0;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('exception', { error: err, editor: this });
      console.error(err);
    }
  }

  /**
   * Check if migrations are needed for the data
   */
  static checkIfMigrationsNeeded(): boolean {
    const dataVersion = version ?? 'initial';
    const migrations = getNecessaryMigrations(dataVersion) || [];
    console.debug('[checkVersionMigrations] Migrations needed:', dataVersion, migrations.length);
    return migrations.length > 0;
  }

  /**
   * Process collaboration migrations
   */
  processCollaborationMigrations(): unknown | void {
    console.debug('[checkVersionMigrations] Current editor version', __APP_VERSION__);
    if (!this.options.ydoc) return;

    const metaMap = (this.options.ydoc as { getMap: (name: string) => Map<string, unknown> }).getMap('meta');
    let docVersion = metaMap.get('version');
    if (!docVersion) docVersion = 'initial';
    console.debug('[checkVersionMigrations] Document version', docVersion);
    const migrations = getNecessaryMigrations(docVersion) || [];

    const plugins = this.state.plugins;
    const syncPlugin = plugins.find((plugin) => this.#getPluginKeyName(plugin).startsWith('y-sync'));
    if (!syncPlugin) return this.options.ydoc;

    let hasRunMigrations = false;
    for (const migration of migrations) {
      console.debug('🏃‍♂️ Running migration', migration.name);
      const result = migration(this);
      if (!result) throw new Error('Migration failed at ' + migration.name);
      else hasRunMigrations = true;
    }

    // If no migrations were run, return undefined (no updated ydoc).
    if (!hasRunMigrations) return;

    // Return the updated ydoc
    const pluginState = syncPlugin?.getState(this.state);
    return pluginState.doc;
  }

  /**
   * Replace the current file
   */
  async replaceFile(newFile: File | Blob | Buffer): Promise<void> {
    this.setOptions({ annotations: true });
    const [docx, media, mediaFiles, fonts] = (await Editor.loadXmlData(newFile))!;
    this.setOptions({
      fileSource: newFile,
      content: docx,
      media,
      mediaFiles,
      fonts,
      isNewFile: true,
    });
    this.options.shouldLoadComments = true;
    this.options.replacedFile = true;

    this.#createConverter();
    this.#initMedia();
    this.initDefaultStyles();

    if (this.options.ydoc && this.options.collaborationProvider) {
      updateYdocDocxData(this, this.options.ydoc);
      this.initializeCollaborationData();
    } else {
      this.#insertNewFileData();
    }

    if (!this.options.ydoc) {
      this.#initComments();
    }
  }

  /**
   * Get internal docx file content
   * @param name - File name
   * @param type - type of result (json, string)
   */
  getInternalXmlFile(name: string, type: 'json' | 'string' = 'json'): unknown | string | null {
    if (!this.converter.convertedXml[name]) {
      console.warn('Cannot find file in docx');
      return null;
    }

    if (type === 'json') {
      return this.converter.convertedXml[name].elements[0] || null;
    }
    return this.converter.schemaToXml(this.converter.convertedXml[name].elements[0]);
  }

  /**
   * Update internal docx file content
   * @param name - File name
   * @param updatedContent - new file content
   */
  updateInternalXmlFile(name: string, updatedContent: string | unknown): void {
    if (typeof updatedContent === 'string') {
      this.options.customUpdatedFiles![name] = String(updatedContent);
    } else {
      const internalFileXml = this.converter.schemaToXml(updatedContent);
      this.options.customUpdatedFiles![name] = String(internalFileXml);
    }
    this.options.isCustomXmlChanged = true;
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesOfType(type: string): Array<{ node: PmNode; pos: number }> {
    const { findChildren } = helpers;
    return findChildren(this.state.doc, (node: PmNode) => node.type.name === type);
  }

  /**
   * Replace a node with HTML content
   */
  replaceNodeWithHTML(targetNode: { node: PmNode; pos: number }, html: string): void {
    const { tr } = this.state;

    if (!targetNode || !html) return;
    const start = targetNode.pos;
    const end = start + targetNode.node.nodeSize;
    const htmlNode = createDocFromHTML(html, this);
    tr.replaceWith(start, end, htmlNode);
    this.dispatch(tr);
  }

  /**
   * A command to prepare the editor to receive annotations. This will
   * pre-process the document as needed prior to running in the annotator.
   *
   * Currently this is only used for table generation but additional pre-processing can be done here.
   */
  prepareForAnnotations(annotationValues: FieldValue[] = []): void {
    const { tr } = this.state;
    const newTr = AnnotatorHelpers.processTables({ state: this.state, tr, annotationValues });
    this.dispatch(newTr);
  }

  /**
   * Migrate paragraph fields to lists V2 structure if necessary.
   * @param annotationValues - List of field values to migrate.
   * @returns Returns a promise that resolves to the migrated values
   */
  async migrateParagraphFields(annotationValues: FieldValue[] = []): Promise<FieldValue[]> {
    if (!Array.isArray(annotationValues) || !annotationValues.length) return annotationValues;
    const result = await migrateParagraphFieldsListsV2(annotationValues, this);
    return result;
  }

  /**
   * Annotate the document with the given annotation values.
   */
  annotate(annotationValues: FieldValue[] = [], hiddenIds: string[] = [], removeEmptyFields: boolean = false): void {
    const { state, schema } = this;
    let tr = state.tr;

    tr = AnnotatorHelpers.processTables({ state: this.state, tr, annotationValues });
    tr = AnnotatorHelpers.annotateDocument({
      tr,
      schema,
      annotationValues,
      hiddenFieldIds: hiddenIds,
      removeEmptyFields,
      editor: this,
    });

    // Dispatch everything in a single transaction, which makes this undo-able in a single undo
    if (tr.docChanged) {
      const finalTr = tr.scrollIntoView();
      this.dispatch(finalTr);
    }
  }

  /**
   * Preview annotations in the editor. It stores a copy of the original state.
   * This can be reverted via closePreview()
   */
  previewAnnotations(annotationValues: FieldValue[] = [], hiddenIds: string[] = []): void {
    this.originalState = this.state;
    this.annotate(annotationValues, hiddenIds);
  }

  /**
   * If there is a preview active, this will revert the editor to the original state.
   */
  closePreview(): void {
    if (!this.originalState) return;
    if (this.view) {
      this.view.updateState(this.originalState);
    } else {
      this._state = this.originalState;
    }
  }

  /**
   * Run the SuperValidator's active document validation to check and fix potential known issues.
   */
  #validateDocumentInit(): void {
    if (this.options.isHeaderOrFooter || this.options.isChildEditor) return;

    const validator = new SuperValidator({ editor: this, dryRun: false, debug: false });
    validator.validateActiveDocument();
  }

  /**
   * Run the SuperValidator's on document upon export to check and fix potential known issues.
   */
  #validateDocumentExport(): void {
    if (this.options.isHeaderOrFooter || this.options.isChildEditor) return;

    const validator = new SuperValidator({ editor: this, dryRun: false, debug: false });
    validator.validateDocumentExport();
  }

  #initDevTools(): void {
    this.#renderer?.initDevTools?.(this);
  }
}
