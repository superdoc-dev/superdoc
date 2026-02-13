/**
 * @typedef {Object} User The current user of this superdoc
 * @property {string} name The user's name
 * @property {string} email The user's email
 * @property {string | null} [image] The user's photo
 */

/**
 * @typedef {Object} Document
 * @property {string} [id] The ID of the document
 * @property {string} type The type of the document
 * @property {File | Blob | null} [data] The initial data of the document (File, Blob, or null)
 * @property {string} [name] The name of the document
 * @property {string} [url] The URL of the document
 * @property {boolean} [isNewFile] Whether the document is a new file
 * @property {import('yjs').Doc} [ydoc] The Yjs document for collaboration
 * @property {import('@hocuspocus/provider').HocuspocusProvider} [provider] The provider for collaboration
 */

/**
 * @typedef {Object} CollaborationProvider External collaboration provider interface
 * Accepts any Yjs-compatible provider (HocuspocusProvider, LiveblocksYjsProvider, TiptapCollabProvider, etc.)
 * @property {Object} [awareness] The Yjs awareness instance (optional, may be null)
 * @property {(event: string, handler: Function) => void} [on] Event listener
 * @property {(event: string, handler: Function) => void} [off] Event unsubscriber
 * @property {() => void} [disconnect] Disconnect from the provider
 * @property {() => void} [destroy] Destroy the provider
 * @property {boolean} [synced] Whether the provider has synced
 * @property {boolean} [isSynced] Alternative sync property (used by some providers)
 */

/**
 * @typedef {Object} CollaborationConfig Collaboration module configuration
 * @property {Object} [ydoc] External Yjs document (provider-agnostic mode)
 * @property {CollaborationProvider} [provider] External collaboration provider (provider-agnostic mode)
 * @property {'hocuspocus' | 'superdoc'} [providerType] Internal provider type (deprecated)
 * @property {string} [url] WebSocket URL for internal provider (deprecated)
 * @property {string} [token] Authentication token for internal provider (deprecated)
 * @property {Object} [params] Additional params for internal provider (deprecated)
 */

/**
 * @typedef {Object} Modules
 * @property {Object | false} [comments] Comments module configuration (false to disable)
 * @property {(params: {
 *   permission: string,
 *   role?: string,
 *   isInternal?: boolean,
 *   comment?: Object | null,
 *   trackedChange?: Object | null,
 *   currentUser?: User | null,
 *   superdoc?: SuperDoc | null,
 * }) => boolean | undefined} [comments.permissionResolver] Custom permission resolver for comment actions
 * @property {Object} [comments.highlightColors] Comment highlight colors (internal/external and active overrides)
 * @property {string} [comments.highlightColors.internal] Base highlight color for internal comments
 * @property {string} [comments.highlightColors.external] Base highlight color for external comments
 * @property {string} [comments.highlightColors.activeInternal] Active highlight color override for internal comments
 * @property {string} [comments.highlightColors.activeExternal] Active highlight color override for external comments
 * @property {Object} [comments.highlightOpacity] Comment highlight opacity values (0-1)
 * @property {number} [comments.highlightOpacity.active] Opacity for active comment highlight
 * @property {number} [comments.highlightOpacity.inactive] Opacity for inactive comment highlight
 * @property {string} [comments.highlightHoverColor] Hover highlight color for comment marks
 * @property {Object} [comments.trackChangeHighlightColors] Track change highlight colors
 * @property {string} [comments.trackChangeHighlightColors.insertBorder] Border color for inserted text highlight
 * @property {string} [comments.trackChangeHighlightColors.insertBackground] Background color for inserted text highlight
 * @property {string} [comments.trackChangeHighlightColors.deleteBorder] Border color for deleted text highlight
 * @property {string} [comments.trackChangeHighlightColors.deleteBackground] Background color for deleted text highlight
 * @property {string} [comments.trackChangeHighlightColors.formatBorder] Border color for format change highlight
 * @property {Object} [comments.trackChangeActiveHighlightColors] Active track change highlight colors (defaults to trackChangeHighlightColors)
 * @property {string} [comments.trackChangeActiveHighlightColors.insertBorder] Active border color for inserted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.insertBackground] Active background color for inserted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.deleteBorder] Active border color for deleted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.deleteBackground] Active background color for deleted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.formatBorder] Active border color for format change highlight
 * @property {Object} [ai] AI module configuration
 * @property {string} [ai.apiKey] Harbour API key for AI features
 * @property {string} [ai.endpoint] Custom endpoint URL for AI services
 * @property {CollaborationConfig} [collaboration] Collaboration module configuration
 * @property {Object} [toolbar] Toolbar module configuration
 * @property {Object} [slashMenu] Slash menu module configuration
 * @property {Array} [slashMenu.customItems] Array of custom menu sections with items
 * @property {Function} [slashMenu.menuProvider] Function to customize menu items
 * @property {boolean} [slashMenu.includeDefaultItems] Whether to include default menu items
 */

/** @typedef {import('@superdoc/super-editor').Editor} Editor */
/** @typedef {import('../SuperDoc.js').SuperDoc} SuperDoc */

/**
 * @typedef {'editing' | 'viewing' | 'suggesting'} DocumentMode
 */

/**
 * @typedef {'docx' | 'pdf' | 'html'} ExportType
 */

/**
 * @typedef {'external' | 'clean'} CommentsType
 * - 'external': Include only external comments (default)
 * - 'clean': Export without any comments
 */

/**
 * @typedef {'print' | 'web'} ViewLayout
 * Document view layout values - mirrors OOXML ST_View (ECMA-376 §17.18.102)
 * - 'print': Print Layout View - displays document as it prints (default)
 * - 'web': Web Page View - content reflows to fit container (mobile/accessibility)
 */

/**
 * @typedef {Object} ViewOptions
 * Document view options for controlling how the document is displayed.
 * Mirrors OOXML document view settings.
 * @property {ViewLayout} [layout='print'] Document view layout (OOXML ST_View compatible)
 */

/**
 * @typedef {Object} ExportParams
 * @property {ExportType[]} [exportType=['docx']] - File formats to export
 * @property {CommentsType} [commentsType='external'] - How to handle comments
 * @property {string} [exportedName] - Custom filename (without extension)
 * @property {boolean} [triggerDownload=true] - Auto-download or return blob
 * @property {string} [fieldsHighlightColor] - Color for field highlights
 */

/**
 * @typedef {Object} Config
 * @property {string} [superdocId] The ID of the SuperDoc
 * @property {string | HTMLElement} selector The selector or element to mount the SuperDoc into
 * @property {DocumentMode} documentMode The mode of the document
 * @property {'editor' | 'viewer' | 'suggester'} [role] The role of the user in this SuperDoc
 * @property {Object | string | File | Blob} [document] The document to load. If a string, it will be treated as a URL. If a File or Blob, it will be used directly.
 * @property {Array<Document>} [documents] The documents to load -> Soon to be deprecated
 * @property {User} [user] The current user of this SuperDoc
 * @property {Array<User>} [users] All users of this SuperDoc (can be used for "@"-mentions)
 * @property {Array<string>} [colors] Colors to use for user awareness
 * @property {Modules} [modules] Modules to load
 * @property {(params: {
 *   permission: string,
 *   role?: string,
 *   isInternal?: boolean,
 *   comment?: Object | null,
 *   trackedChange?: Object | null,
 *   currentUser?: User | null,
 *   superdoc?: SuperDoc | null,
 * }) => boolean | undefined} [permissionResolver] Top-level override for permission checks
 * @property {string} [toolbar] Optional DOM element to render the toolbar in
 * @property {Array<string>} [toolbarGroups] Toolbar groups to show
 * @property {Object} [toolbarIcons] Icons to show in the toolbar
 * @property {Object} [toolbarTexts] Texts to override in the toolbar
 * @property {string} [uiDisplayFallbackFont='Arial, Helvetica, sans-serif'] The font-family to use for all SuperDoc UI surfaces
 *   (toolbar, comments UI, dropdowns, tooltips, etc.). This ensures consistent typography across the entire application
 *   and helps match your application's design system. The value should be a valid CSS font-family string.
 *   Example (system fonts):
 *     uiDisplayFallbackFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
 *   Example (custom font):
 *     uiDisplayFallbackFont: '"Inter", Arial, sans-serif'
 * @property {boolean} [isDev] Whether the SuperDoc is in development mode
 * @property {Object} [layoutEngineOptions] Layout engine overrides passed through to PresentationEditor (page size, margins, virtualization, zoom, debug label, etc.)
 * @property {Object} [layoutEngineOptions.trackedChanges] Optional override for paginated track-changes rendering (e.g., `{ mode: 'final' }` to force final view or `{ enabled: false }` to strip metadata entirely)
 * @property {(editor: Editor) => void} [onEditorBeforeCreate] Callback before an editor is created
 * @property {(editor: Editor) => void} [onEditorCreate] Callback after an editor is created
 * @property {(params: { editor: Editor, transaction: any, duration: number }) => void} [onTransaction] Callback when a transaction is made
 * @property {() => void} [onEditorDestroy] Callback after an editor is destroyed
 * @property {(params: { error: object, editor: Editor, documentId: string, file: File }) => void} [onContentError] Callback when there is an error in the content
 * @property {(editor: { superdoc: SuperDoc }) => void} [onReady] Callback when the SuperDoc is ready
 * @property {(params: { type: string, data: object}) => void} [onCommentsUpdate] Callback when comments are updated
 * @property {(params: { context: SuperDoc, states: Array }) => void} [onAwarenessUpdate] Callback when awareness is updated
 * @property {(params: { isLocked: boolean, lockedBy: User }) => void} [onLocked] Callback when the SuperDoc is locked
 * @property {() => void} [onPdfDocumentReady] Callback when the PDF document is ready
 * @property {(isOpened: boolean) => void} [onSidebarToggle] Callback when the sidebar is toggled
 * @property {(params: { editor: Editor }) => void} [onCollaborationReady] Callback when collaboration is ready
 * @property {(params: { editor: Editor }) => void} [onEditorUpdate] Callback when document is updated
 * @property {(params: { error: Error }) => void} [onException] Callback when an exception is thrown
 * @property {(params: { isRendered: boolean }) => void} [onCommentsListChange] Callback when the comments list is rendered
 * @property {(params: {})} [onListDefinitionsChange] Callback when the list definitions change
 * @property {string} [format] The format of the document (docx, pdf, html)
 * @property {Object[]} [editorExtensions] The extensions to load for the editor
 * @property {boolean} [isInternal] Whether the SuperDoc is internal
 * @property {string} [title] The title of the SuperDoc
 * @property {Object[]} [conversations] The conversations to load
 * @property {{ visible?: boolean }} [comments] Toggle comment visibility when `documentMode` is `viewing` (default: false)
 * @property {{ visible?: boolean }} [trackChanges] Toggle tracked-change visibility when `documentMode` is `viewing` (default: false)
 * @property {boolean} [isLocked] Whether the SuperDoc is locked
 * @property {function(File): Promise<string>} [handleImageUpload] The function to handle image uploads
 * @property {User} [lockedBy] The user who locked the SuperDoc
 * @property {boolean} [rulers] Whether to show the ruler in the editor
 * @property {boolean} [suppressDefaultDocxStyles] Whether to suppress default styles in docx mode
 * @property {Object} [jsonOverride] Provided JSON to override content with
 * @property {boolean} [disableContextMenu] Whether to disable slash / right-click custom context menu
 * @property {string} [html] HTML content to initialize the editor with
 * @property {string} [markdown] Markdown content to initialize the editor with
 * @property {boolean} [isDebug=false] Whether to enable debug mode
 * @property {ViewOptions} [viewOptions] Document view options (OOXML ST_View compatible)
 * @property {string} [cspNonce] Content Security Policy nonce for dynamically injected styles
 * @property {string} [licenseKey] License key for organization identification
 * @property {{ enabled: boolean, endpoint?: string, metadata?: Record<string, unknown>, licenseKey?: string }} [telemetry] Telemetry configuration
 */

export {};
