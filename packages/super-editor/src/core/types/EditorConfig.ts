import type { EditorState, Transaction } from 'prosemirror-state';
import type { XmlFragment as YXmlFragment } from 'yjs';
import type { Editor } from '../Editor.js';
import type { Extension } from '../Extension.js';
import type { Node as EditorNode } from '../Node.js';
import type { Mark as EditorMark } from '../Mark.js';
import type { EditorRenderer } from '../renderers/EditorRenderer.js';
import type {
  FontsResolvedPayload,
  Comment,
  CommentsPayload,
  CommentLocationsPayload,
  ListDefinitionsPayload,
} from './EditorEvents.js';
import type { ProseMirrorJSON } from './EditorTypes.js';

/**
 * User information for collaboration
 */
export interface User {
  /** The user's name */
  name: string;

  /** The user's email */
  email: string;

  /** The user's photo URL */
  image: string | null;
}

/**
 * Field value for document fields
 */
export interface FieldValue {
  /** The id of the input field */
  input_id: string;

  /** The value to insert into the field */
  input_value: string;
}

/**
 * A JSON representation of a docx node
 */
export interface DocxNode {
  [key: string]: unknown;
}

/**
 * Single docx file entry extracted from the archive
 */
export interface DocxFileEntry {
  name: string;
  content: string;
}

/**
 * Document view layout values - mirrors OOXML ST_View (ECMA-376 §17.18.102)
 * - 'print': Print Layout View - displays document as it prints (default)
 * - 'web': Web Page View - content reflows to fit container (mobile/accessibility)
 */
export type ViewLayout = 'print' | 'web';

/**
 * Document view options for controlling how the document is displayed.
 * Mirrors OOXML document view settings.
 */
export interface ViewOptions {
  /**
   * Document view layout (OOXML ST_View compatible)
   * - 'print': Fixed page width, displays document as it prints (default)
   * - 'web': Content reflows to fit container width
   * @default 'print'
   */
  layout?: ViewLayout;
}

/**
 * Awareness interface - matches y-protocols Awareness.
 * All properties optional to support various provider implementations.
 */
export interface Awareness {
  clientID?: number;
  getStates?(): Map<number, Record<string, unknown>>;
  setLocalStateField?(field: string, value: unknown): void;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * Collaboration provider interface.
 * Accepts any Yjs-compatible provider (HocuspocusProvider, LiveblocksYjsProvider, TiptapCollabProvider, etc.)
 */
export interface CollaborationProvider {
  awareness?: Awareness | null;
  on?(event: any, handler: (...args: any[]) => void): void;
  off?(event: any, handler: (...args: any[]) => void): void;
  disconnect?(): void;
  destroy?(): void;
  /** Whether provider is synced - some use `synced`, others `isSynced` */
  synced?: boolean;
  isSynced?: boolean;
}

/**
 * Any extension supported by the editor (node, mark, or extension)
 */
export type EditorExtension =
  | Extension<Record<string, unknown>, Record<string, unknown>>
  | EditorNode<Record<string, unknown>, Record<string, unknown>>
  | EditorMark<Record<string, unknown>, Record<string, unknown>>;

/**
 * Permission resolver parameters
 */
export interface PermissionParams {
  permission: string;
  role?: string;
  isInternal?: boolean;
  comment?: Comment | null;
  trackedChange?: unknown | null;
}

/**
 * Comment highlight color configuration
 */
export interface CommentHighlightColors {
  /** Base highlight color for internal comments */
  internal?: string;
  /** Base highlight color for external comments */
  external?: string;
  /** Active highlight color override for internal comments */
  activeInternal?: string;
  /** Active highlight color override for external comments */
  activeExternal?: string;
}

/**
 * Comment highlight opacity configuration
 */
export interface CommentHighlightOpacity {
  /** Opacity for active comment highlight (0-1) */
  active?: number;
  /** Opacity for inactive comment highlight (0-1) */
  inactive?: number;
}

/**
 * Comment configuration options
 */
export interface CommentConfig {
  /** Comment highlight colors */
  highlightColors?: CommentHighlightColors;
  /** Comment highlight opacity values */
  highlightOpacity?: CommentHighlightOpacity;
}

/**
 * Editor configuration options
 */
export interface EditorOptions {
  /** The container element for the editor */
  element?: HTMLElement | null;

  /** CSS selector for the editor container */
  selector?: string | null;

  /** Whether the editor is running in headless mode */
  isHeadless?: boolean;

  /** Optional Document instance for HTML/Markdown import/export in headless environments (e.g. JSDOM) */
  document?: Document | null;

  /** Mock document for testing */
  mockDocument?: Document | null;

  /** Mock window for testing */
  mockWindow?: Window | null;

  /** XML/JSON/HTML content */
  content?: string | DocxFileEntry[] | Record<string, unknown> | null;

  /** Current user information */
  user?: User | null;

  /** List of users for collaboration */
  users?: User[];

  /** Media configuration */
  media?: Record<string, unknown>;

  /** Media files */
  mediaFiles?: Record<string, unknown>;

  /** Font configuration */
  fonts?: Record<string, unknown>;

  /** Document mode ('editing', 'viewing', 'suggesting') */
  documentMode?: string;

  /** Editor mode ('docx', 'text', 'html') */
  mode?: 'docx' | 'text' | 'html';

  /** User role ('editor', 'viewer', 'suggester') */
  role?: string;

  /** Available colors */
  colors?: string[];

  /** Document converter */
  converter?: unknown | null;

  /** Source of the file (File/Blob in browser, Buffer in Node.js) */
  fileSource?: File | Blob | Buffer | null;

  /** Initial editor state */
  initialState?: EditorState | null;

  /** Unique document identifier */
  documentId?: string | null;

  /** Editor extensions */
  extensions?: EditorExtension[];

  /** Whether the editor is editable */
  editable?: boolean;

  /** Editor properties */
  editorProps?: Record<string, unknown>;

  /** Parsing options */
  parseOptions?: Record<string, unknown>;

  /** Core extension options */
  coreExtensionOptions?: Record<string, unknown>;

  /** Whether to enable input rules */
  enableInputRules?: boolean;

  /** Whether comments are enabled */
  isCommentsEnabled?: boolean;

  /** Comment highlight configuration */
  comments?: CommentConfig;

  /** Whether this is a new file */
  isNewFile?: boolean;

  /** Editor scale/zoom */
  scale?: number;

  /**
   * Document view options (OOXML ST_View compatible).
   * Controls how the document is displayed.
   * @example { layout: 'web' } // Content reflows to fit container
   */
  viewOptions?: ViewOptions | null;

  /** Whether annotations are enabled */
  annotations?: boolean;

  /** Whether this is an internal editor */
  isInternal?: boolean;

  /** External extensions */
  externalExtensions?: EditorExtension[];

  /** Whether this editor runs as a linked child editor */
  isChildEditor?: boolean;

  /** Whether the document content was generated from schema */
  loadFromSchema?: boolean;

  /** Whether to skip creating the ProseMirror view (layout mode) */
  skipViewCreation?: boolean;

  /** Optional renderer implementation (defaults to ProseMirrorRenderer in DOM environments) */
  renderer?: EditorRenderer | null;

  /** Numbering configuration */
  numbering?: Record<string, unknown>;

  /** Whether this is a header or footer editor */
  isHeaderOrFooter?: boolean;

  /** Optional pagination metadata */
  lastSelection?: unknown | null;

  /** Prevent default styles from being applied in docx mode */
  suppressDefaultDocxStyles?: boolean;

  /** Provided JSON to override content with */
  jsonOverride?: ProseMirrorJSON | null;

  /** HTML content to initialize the editor with */
  html?: string;

  /** Markdown content to initialize the editor with */
  markdown?: string;

  /**
   * Callback invoked with unsupported HTML elements that were dropped during import.
   * When provided, `console.warn` is NOT emitted automatically.
   */
  onUnsupportedContent?: ((items: { tagName: string; outerHTML: string; count: number }[]) => void) | null;

  /**
   * When true and no `onUnsupportedContent` callback is provided,
   * emits a `console.warn` with unsupported items dropped during import.
   * Default: false (silent).
   */
  warnOnUnsupportedContent?: boolean;

  /** Whether to enable debug mode */
  isDebug?: boolean;

  /** Whether to disable the context menu (slash menu and right-click menu) */
  disableContextMenu?: boolean;

  /** Docx xml updated by User */
  customUpdatedFiles?: Record<string, string>;

  /** Whether header/footer has changed */
  isHeaderFooterChanged?: boolean;

  /** Whether custom XML has changed */
  isCustomXmlChanged?: boolean;

  /** Focus target element */
  focusTarget?: HTMLElement | null;

  /** Parent editor (for header/footer editors) */
  parentEditor?: Editor | null;

  /** Collaborative Y.Doc reference - accepts any yjs Doc instance */
  ydoc?: unknown;

  /** Y.js XML fragment for collaborative editing */
  fragment?: YXmlFragment | null;

  /** Collaboration provider */
  collaborationProvider?: CollaborationProvider | null;

  /** Whether the collaboration provider finished syncing */
  collaborationIsReady?: boolean;

  /** Whether comments should be loaded after collaboration replace */
  shouldLoadComments?: boolean;

  /** Whether the current file was replaced */
  replacedFile?: boolean;

  /** Called before editor creation */
  onBeforeCreate?: (params: { editor: Editor }) => void;

  /** Called after editor creation */
  onCreate?: (params: { editor: Editor }) => void;

  /** Called when editor content updates */
  onUpdate?: (params: { editor: Editor; transaction: Transaction }) => void;

  /** Called when selection updates */
  onSelectionUpdate?: (params: { editor: Editor }) => void;

  /** Called when a transaction is processed */
  onTransaction?: (params: { editor: Editor; transaction: Transaction }) => void;

  /** Called when editor gets focus */
  onFocus?: (params: { editor: Editor; event: FocusEvent }) => void;

  /** Called when editor loses focus */
  onBlur?: (params: { editor: Editor; event: FocusEvent }) => void;

  /** Called when editor is destroyed */
  onDestroy?: () => void;

  /** Called when there's a content error */
  onContentError?: (params: { editor: Editor; error: Error }) => void;

  /** Called when tracked changes update */
  onTrackedChangesUpdate?: (params: { changes: unknown }) => void;

  /** Called when comments update */
  onCommentsUpdate?: (params: CommentsPayload) => void;

  /** Called when comments are loaded */
  onCommentsLoaded?: (params: { editor: Editor; replacedFile?: boolean; comments: Comment[] }) => void;

  /** Called when a comment is clicked */
  onCommentClicked?: (params: { commentId: string; event?: MouseEvent }) => void;

  /** Called when comment locations update */
  onCommentLocationsUpdate?: (params: CommentLocationsPayload) => void;

  /** Called when document is locked */
  onDocumentLocked?: (params: { locked: boolean; lockedBy?: string }) => void;

  /** Called on first render */
  onFirstRender?: () => void;

  /** Called when collaboration is ready */
  onCollaborationReady?: (params: { editor: Editor; ydoc: unknown }) => void;

  /** Called when an exception occurs */
  onException?: (params: { error: Error; editor: Editor }) => void;

  /** Called when list definitions change */
  onListDefinitionsChange?: (params: ListDefinitionsPayload) => void;

  /** Called when all fonts used in the document are determined */
  onFontsResolved?: ((payload: FontsResolvedPayload) => void) | null;

  /** Handler for image uploads - async (file) => url */
  handleImageUpload?: ((file: File) => Promise<string>) | null;

  /** Host-provided permission hook */
  permissionResolver?: ((params: PermissionParams) => boolean | undefined) | null;

  /**
   * When true, defers document initialization until open() is called.
   * This enables the new document lifecycle API where:
   * - Constructor only initializes core services (extensions, schema)
   * - open() loads the document
   * - close() unloads the document
   * - Editor instance can be reused for multiple documents
   *
   * Default is false for backward compatibility.
   * The static Editor.open() factory sets this automatically.
   */
  deferDocumentLoad?: boolean;

  /**
   * License key for billing and telemetry authentication.
   */
  licenseKey?: string | null;

  /**
   * Telemetry configuration for tracking document opens.
   * When enabled, sends document open events for usage-based billing.
   */
  telemetry?: {
    /** Whether telemetry is enabled */
    enabled: boolean;
    /** Custom telemetry endpoint (optional) */
    endpoint?: string;
    /** Custom metadata to include with telemetry events (optional) */
    metadata?: Record<string, unknown>;
    /**
     * @deprecated Use root-level `licenseKey` instead. If both are provided, root-level has priority.
     */
    licenseKey?: string | null;
  } | null;
}
