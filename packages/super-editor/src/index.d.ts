/**
 * Main type declarations for @superdoc/super-editor
 * This file provides TypeScript types for the JavaScript exports in index.js
 */

export type { EditorView } from 'prosemirror-view';
export type { EditorState, Transaction } from 'prosemirror-state';
export type { Schema } from 'prosemirror-model';

// ============================================
// COMMAND TYPES (inlined from ChainedCommands.ts)
// ============================================

/**
 * Map of built-in command names to their parameter signatures.
 * Extensions can augment this interface to add more precise types.
 */
export interface CoreCommandMap {}

/**
 * Map of extension command names to their parameter signatures.
 * Extensions should augment this interface via module augmentation.
 */
export interface ExtensionCommandMap {}

/**
 * Props passed to command functions
 */
export interface CommandProps {
  editor: Editor;
  tr: Transaction;
  state: EditorState;
  view: EditorView;
  dispatch?: (tr: Transaction) => void;
}

/**
 * A command function signature
 */
export type Command = (props: CommandProps) => boolean;

/**
 * Chainable command object returned by editor.chain()
 */
export interface ChainableCommandObject {
  run: () => boolean;
  [commandName: string]: ((...args: any[]) => ChainableCommandObject) | (() => boolean);
}

/**
 * Chained command type
 */
export type ChainedCommand = ChainableCommandObject;

/**
 * Object returned by editor.can()
 */
export interface CanObject {
  chain: () => ChainableCommandObject;
  [commandName: string]: ((...args: any[]) => boolean) | (() => ChainableCommandObject);
}

/**
 * All available editor commands.
 * Commands are dynamically populated from extensions.
 */
export interface EditorCommands {
  // Core commands
  focus: (position?: 'start' | 'end' | 'all' | number | boolean | null) => boolean;
  blur: () => boolean;

  // Formatting commands (from extensions)
  toggleBold: () => boolean;
  toggleItalic: () => boolean;
  toggleUnderline: () => boolean;
  toggleStrike: () => boolean;
  toggleHighlight: (color?: string) => boolean;

  // Font commands
  setFontSize: (size: string | number) => boolean;
  setFontFamily: (family: string) => boolean;
  setTextColor: (color: string) => boolean;

  // Alignment commands
  setTextAlign: (alignment: 'left' | 'center' | 'right' | 'justify') => boolean;

  // List commands
  toggleBulletList: () => boolean;
  toggleOrderedList: () => boolean;

  // History commands
  undo: () => boolean;
  redo: () => boolean;

  // Link commands
  setLink: (attrs: { href: string; target?: string }) => boolean;
  unsetLink: () => boolean;

  // Table commands
  insertTable: (options?: { rows?: number; cols?: number }) => boolean;
  deleteTable: () => boolean;
  addRowBefore: () => boolean;
  addRowAfter: () => boolean;
  addColumnBefore: () => boolean;
  addColumnAfter: () => boolean;
  deleteRow: () => boolean;
  deleteColumn: () => boolean;
  mergeCells: () => boolean;
  splitCell: () => boolean;

  // Image commands
  insertImage: (attrs: { src: string; alt?: string }) => boolean;

  // Selection commands
  selectAll: () => boolean;

  // Content commands
  insertContent: (content: any) => boolean;
  setContent: (content: any) => boolean;
  clearContent: () => boolean;

  // Allow any other command (for extension commands)
  [commandName: string]: ((...args: any[]) => boolean) | undefined;
}

// ============================================
// DATA TYPES
// ============================================

/** An unsupported HTML element that was dropped during import. */
export interface UnsupportedContentItem {
  /** The tag name, e.g. "HR", "DETAILS" */
  tagName: string;
  /** The outerHTML of the element (truncated to 200 chars) */
  outerHTML: string;
  /** How many instances of this tag were dropped */
  count: number;
}

/** Binary data source (works in both browser and Node.js - Buffer extends Uint8Array) */
export type BinaryData = ArrayBuffer | ArrayBufferView;

export interface DocxFileEntry {
  name: string;
  content: string;
}

export interface OpenOptions {
  mode?: 'docx' | 'text' | 'html';
  html?: string;
  markdown?: string;
  json?: object | null;
  isCommentsEnabled?: boolean;
  suppressDefaultDocxStyles?: boolean;
  documentMode?: 'editing' | 'viewing' | 'suggesting';
  content?: unknown;
  mediaFiles?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
}

// ============================================
// PRESENTATION EDITOR TYPES
// ============================================

/** Page dimensions in points (72 points = 1 inch) */
export interface PageSize {
  /** Width in points */
  w: number;
  /** Height in points */
  h: number;
}

/** Page margin configuration in points */
export interface PageMargins {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  header?: number;
  footer?: number;
}

/** Virtualization options for large documents */
export interface VirtualizationOptions {
  enabled?: boolean;
  window?: number;
  overscan?: number;
  gap?: number;
  paddingTop?: number;
}

/** Tracked changes display mode */
export type TrackedChangesMode = 'review' | 'original' | 'final' | 'off';

/** Override tracked changes behavior */
export interface TrackedChangesOverrides {
  mode?: TrackedChangesMode;
  enabled?: boolean;
}

/** Layout mode for page rendering */
export type LayoutMode = 'vertical' | 'horizontal';

/** Remote user presence information */
export interface RemoteUserInfo {
  name?: string;
  email?: string;
  color: string;
}

/** Remote cursor state for collaboration */
export interface RemoteCursorState {
  clientId: number;
  user: RemoteUserInfo;
  anchor: number;
  head: number;
  updatedAt: number;
}

/** Presence rendering options */
export interface PresenceOptions {
  enabled?: boolean;
  showLabels?: boolean;
  maxVisible?: number;
  labelFormatter?: (user: RemoteUserInfo) => string;
  highlightOpacity?: number;
  staleTimeout?: number;
}

/** Layout engine configuration */
export interface LayoutEngineOptions {
  pageSize?: PageSize;
  margins?: PageMargins;
  zoom?: number;
  virtualization?: VirtualizationOptions;
  pageStyles?: Record<string, unknown>;
  debugLabel?: string;
  layoutMode?: LayoutMode;
  trackedChanges?: TrackedChangesOverrides;
  emitCommentPositionsInViewing?: boolean;
  enableCommentsInViewing?: boolean;
  presence?: PresenceOptions;
  ruler?: {
    enabled?: boolean;
    interactive?: boolean;
    onMarginChange?: (side: 'left' | 'right', marginInches: number) => void;
  };
}

/** Options for creating a PresentationEditor instance */
export interface PresentationEditorOptions {
  /** Host element where the layout-engine powered UI should render (required) */
  element: HTMLElement;
  /** Layout-specific configuration */
  layoutEngineOptions?: LayoutEngineOptions;
  /** Document mode: 'editing', 'viewing', or 'suggesting' */
  documentMode?: 'editing' | 'viewing' | 'suggesting';
  /** Collaboration provider with awareness support */
  collaborationProvider?: {
    awareness?: unknown;
    disconnect?: () => void;
  } | null;
  /** Whether to disable the context menu */
  disableContextMenu?: boolean;
  /** Document content */
  content?: string | object;
  /** Editor extensions */
  extensions?: any[];
  /** Whether the editor is editable */
  editable?: boolean;
  /** Additional options passed to the underlying Editor */
  [key: string]: any;
}

/** Layout error information */
export interface LayoutError {
  phase: 'initialization' | 'render';
  error: Error;
  timestamp: number;
}

/** Rectangle with page context */
export interface RangeRect {
  pageIndex: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** Layout metrics for telemetry */
export interface LayoutMetrics {
  durationMs: number;
  blockCount: number;
  pageCount: number;
}

/** Position hit result from coordinate mapping */
export interface PositionHit {
  pos: number;
  layoutEpoch: number;
  blockId: string;
  pageIndex: number;
  column: number;
  lineIndex: number;
}

/** Bounding rectangle dimensions */
export interface BoundingRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

/** A fragment positioned on a page */
export interface LayoutFragment {
  pmStart: number;
  pmEnd: number;
  x: number;
  y: number;
  width: number;
  height: number;
  blockId: string;
  column?: number;
}

/** A rendered page in the layout */
export interface LayoutPage {
  number: number;
  fragments: LayoutFragment[];
  margins?: PageMargins;
  size?: PageSize;
  orientation?: 'portrait' | 'landscape';
  sectionIndex?: number;
  footnoteReserved?: number;
}

/** Final layout output from the layout engine */
export interface Layout {
  pageSize: PageSize;
  pages: LayoutPage[];
  pageGap?: number;
  layoutEpoch?: number;
}

/** A block in the flow document model */
export interface FlowBlock {
  id: string;
  type: string;
  pmStart: number;
  pmEnd: number;
  [key: string]: unknown;
}

/** Measurement data for a block */
export interface Measure {
  blockId: string;
  width: number;
  height: number;
  lines?: Array<{
    width: number;
    ascent: number;
    descent: number;
    lineHeight: number;
  }>;
  [key: string]: unknown;
}

/** Section metadata for multi-section documents */
export interface SectionMetadata {
  sectionIndex: number;
  startPage: number;
  endPage: number;
  [key: string]: unknown;
}

/** Paint snapshot for debugging/testing */
export interface PaintSnapshot {
  formatVersion: 1;
  pageCount: number;
  lineCount: number;
  markerCount: number;
  tabCount: number;
  pages: Array<{
    index: number;
    pageNumber?: number;
    lineCount: number;
    lines: Array<{
      index: number;
      inTableFragment: boolean;
      inTableParagraph: boolean;
      style: Record<string, unknown>;
    }>;
  }>;
}

/** Payload for layout update events */
export interface LayoutUpdatePayload {
  blocks: FlowBlock[];
  measures: Measure[];
  layout: Layout;
  metrics?: LayoutMetrics;
}

// ============================================
// EDITOR CLASS
// ============================================

/**
 * The main Editor class for SuperDoc.
 * Provides a rich text editing experience built on ProseMirror.
 */
export declare class Editor {
  /**
   * Creates a new Editor instance.
   * @param options - Editor configuration options
   */
  constructor(options?: {
    element?: HTMLElement;
    content?: string | object;
    extensions?: any[];
    editable?: boolean;
    autofocus?: boolean | 'start' | 'end' | 'all' | number;
    [key: string]: any;
  });

  /** Load and parse a DOCX file into XML data for headless processing. */
  static loadXmlData(
    fileSource: File | Blob | BinaryData,
    isNode?: boolean,
  ): Promise<[DocxFileEntry[], Record<string, unknown>, Record<string, unknown>, Record<string, unknown>] | undefined>;

  /** Open a document with smart defaults. */
  static open(
    source?: string | File | Blob | BinaryData,
    config?: Partial<{
      element?: HTMLElement;
      selector?: string;
      [key: string]: any;
    }> &
      OpenOptions,
  ): Promise<Editor>;

  /** ProseMirror view instance (undefined in headless mode) */
  view?: EditorView;

  /** ProseMirror schema */
  schema: Schema;

  /** Editor converter for import/export */
  converter?: any;

  /** Presentation editor instance for pages mode */
  presentationEditor?: {
    element?: HTMLElement;
    [key: string]: any;
  };

  /** Editor options passed during construction */
  options: {
    element?: HTMLElement;
    [key: string]: any;
  };

  /** Current editor state */
  state: EditorState;

  /** Whether the editor is currently editable */
  isEditable: boolean;

  /** Whether the editor has been destroyed */
  isDestroyed: boolean;

  /** Update page style (for pages mode) */
  updatePageStyle?: (styles: Record<string, unknown>) => void;

  /** Get current page styles (for pages mode) */
  getPageStyles?: () => Record<string, unknown>;

  /** Get coordinates at a document position */
  coordsAtPos?: (pos: number) => { left: number; top: number } | undefined;

  /** Get the DOM element for a document position */
  getElementAtPos?: (
    pos: number,
    options?: { forceRebuild?: boolean; fallbackToCoords?: boolean },
  ) => HTMLElement | null;

  /**
   * Command service - provides access to all editor commands.
   * @example
   * editor.commands.toggleBold();
   * editor.commands.setFontSize('14pt');
   */
  commands: EditorCommands;

  /**
   * Create a chain of commands to call multiple commands at once.
   * Commands are executed in order when `.run()` is called.
   * @example
   * editor.chain().toggleBold().toggleItalic().run();
   */
  chain(): ChainedCommand;

  /**
   * Check if a command or chain of commands can be executed without executing it.
   * @example
   * if (editor.can().toggleBold()) {
   *   // Bold can be toggled
   * }
   */
  can(): CanObject;

  /** Dispatch a transaction to update editor state (use this in headless mode instead of view.dispatch). */
  dispatch(tr: Transaction): void;

  /**
   * Destroy the editor instance and clean up resources.
   */
  destroy(): void;

  /**
   * Get the current document as HTML.
   */
  getHTML(): string;

  /**
   * Get the current document as JSON.
   */
  getJSON(): object;

  /**
   * Get the current document as plain text.
   */
  getText(): string;

  /**
   * Check if the document is empty.
   */
  isEmpty: boolean;

  /** Allow additional properties */
  [key: string]: any;
}

// ============================================
// OTHER CLASSES
// ============================================

export declare class SuperConverter {
  [key: string]: any;
}

export declare class DocxZipper {
  [key: string]: any;
}

export declare class SuperToolbar {
  [key: string]: any;
}

/**
 * PresentationEditor provides a paginated, layout-engine-powered editing experience.
 * It wraps a hidden ProseMirror Editor and renders via the layout engine pipeline.
 */
export declare class PresentationEditor {
  /**
   * Creates a new PresentationEditor instance.
   * @param options - Configuration options including the host element
   */
  constructor(options: PresentationEditorOptions);

  /**
   * Get a PresentationEditor instance by document ID.
   */
  static getInstance(documentId: string): PresentationEditor | undefined;

  /**
   * Set zoom globally across all PresentationEditor instances.
   */
  static setGlobalZoom(zoom: number): void;

  // ============================================
  // Public Getters
  // ============================================

  /** The underlying ProseMirror Editor instance */
  readonly editor: Editor;

  /** The visible host element where the editor is rendered */
  readonly element: HTMLElement;

  /** Command service for the currently active editor (body or header/footer) */
  readonly commands: EditorCommands;

  /** ProseMirror editor state for the currently active editor */
  readonly state: EditorState;

  /** Whether the active editor accepts input */
  readonly isEditable: boolean;

  /** Editor options for the currently active editor */
  readonly options: Record<string, any>;

  /** The visible host container element */
  readonly visibleHost: HTMLElement;

  /** Selection overlay element for caret and highlight rendering */
  readonly overlayElement: HTMLElement | null;

  /** Current zoom level (1 = 100%) */
  readonly zoom: number;

  // ============================================
  // Public Methods
  // ============================================

  /**
   * Dispatch a ProseMirror transaction to the currently active editor.
   */
  dispatch(tr: Transaction): void;

  /**
   * Focus the editor.
   */
  focus(): void;

  /**
   * Returns the currently active editor (body or header/footer session).
   */
  getActiveEditor(): Editor;

  /**
   * Undo the last action in the active editor.
   */
  undo(): boolean;

  /**
   * Redo the last undone action in the active editor.
   */
  redo(): boolean;

  /**
   * Run a callback against the active editor.
   */
  dispatchInActiveEditor(callback: (editor: Editor) => void): void;

  /**
   * Set the document mode and update editor editability.
   * @param mode - 'editing', 'viewing', or 'suggesting'
   */
  setDocumentMode(mode: 'editing' | 'viewing' | 'suggesting'): void;

  /**
   * Override tracked-changes rendering preferences.
   */
  setTrackedChangesOverrides(overrides?: TrackedChangesOverrides): void;

  /**
   * Update viewing-mode comment rendering behavior.
   */
  setViewingCommentOptions(options?: {
    emitCommentPositionsInViewing?: boolean;
    enableCommentsInViewing?: boolean;
  }): void;

  /**
   * Toggle the custom context menu.
   */
  setContextMenuDisabled(disabled: boolean): void;

  /**
   * Subscribe to layout update events. Returns an unsubscribe function.
   */
  onLayoutUpdated(handler: (payload: LayoutUpdatePayload) => void): () => void;

  /**
   * Subscribe to layout error events. Returns an unsubscribe function.
   */
  onLayoutError(handler: (error: LayoutError) => void): () => void;

  /**
   * Get the rendered pages.
   */
  getPages(): LayoutPage[];

  /**
   * Get the most recent layout error (if any).
   */
  getLayoutError(): LayoutError | null;

  /**
   * Check if layout is healthy.
   */
  isLayoutHealthy(): boolean;

  /**
   * Get detailed layout health state.
   */
  getLayoutHealthState(): 'healthy' | 'degraded' | 'failed';

  /**
   * Get layout-relative rects for the current document selection.
   */
  getSelectionRects(relativeTo?: HTMLElement): RangeRect[];

  /**
   * Convert a document range into layout-based bounding rects.
   */
  getRangeRects(from: number, to: number, relativeTo?: HTMLElement): RangeRect[];

  /**
   * Get bounds for a document range.
   */
  getSelectionBounds(
    from: number,
    to: number,
    relativeTo?: HTMLElement,
  ): {
    bounds: BoundingRect;
    rects: RangeRect[];
    pageIndex: number;
  } | null;

  /**
   * Remap comment positions to layout coordinates with bounds and rects.
   */
  getCommentBounds(
    positions: Record<string, { start?: number; end?: number; pos?: number; [key: string]: unknown }>,
    relativeTo?: HTMLElement,
  ): Record<
    string,
    {
      start?: number;
      end?: number;
      pos?: number;
      bounds?: BoundingRect;
      rects?: RangeRect[];
      pageIndex?: number;
      [key: string]: unknown;
    }
  >;

  /**
   * Get current layout snapshot.
   */
  getLayoutSnapshot(): {
    blocks: FlowBlock[];
    measures: Measure[];
    layout: Layout | null;
    sectionMetadata: SectionMetadata[];
  };

  /**
   * Get current layout options.
   */
  getLayoutOptions(): LayoutEngineOptions;

  /**
   * Get current paint snapshot.
   */
  getPaintSnapshot(): PaintSnapshot | null;

  /**
   * Get section-aware page styles.
   */
  getCurrentSectionPageStyles(): {
    pageSize: { width: number; height: number };
    pageMargins: { left: number; right: number; top: number; bottom: number };
    sectionIndex: number;
    orientation: 'portrait' | 'landscape';
  };

  /**
   * Get remote cursor states for all collaborators.
   */
  getRemoteCursors(): RemoteCursorState[];

  /**
   * Set the layout mode (vertical or horizontal).
   */
  setLayoutMode(mode: LayoutMode): void;

  /**
   * Hit test at client coordinates to find document position.
   */
  hitTest(clientX: number, clientY: number): PositionHit | null;

  /**
   * Normalize client coordinates to layout coordinates.
   */
  normalizeClientPoint(
    clientX: number,
    clientY: number,
  ): {
    x: number;
    y: number;
    pageIndex?: number;
    pageLocalY?: number;
  } | null;

  /**
   * Get viewport coordinates at a document position.
   */
  coordsAtPos(
    pos: number,
  ): { left: number; right: number; top: number; bottom: number; width: number; height: number } | null;

  /**
   * Get the painted DOM element for a document position (body only).
   */
  getElementAtPos(pos: number, options?: { forceRebuild?: boolean; fallbackToCoords?: boolean }): HTMLElement | null;

  /**
   * Scroll to a document position.
   */
  scrollToPosition(pos: number, options?: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition }): boolean;

  /**
   * Scroll to a document position (async version).
   */
  scrollToPositionAsync(
    pos: number,
    options?: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition },
  ): Promise<boolean>;

  /**
   * Scroll to a specific page number.
   */
  scrollToPage(pageNumber: number, scrollBehavior?: ScrollBehavior): Promise<boolean>;

  /**
   * Get document position at viewport coordinates.
   */
  posAtCoords(coords: {
    left?: number;
    top?: number;
    clientX?: number;
    clientY?: number;
  }): { pos: number; inside: number } | null;

  /**
   * Update zoom level and re-render.
   * @param zoom - Zoom level multiplier (1.0 = 100%)
   */
  setZoom(zoom: number): void;

  /**
   * Navigate to a document anchor/bookmark.
   */
  goToAnchor(anchor: string): Promise<boolean>;

  /**
   * Convert layout coordinates back to viewport coordinates.
   */
  denormalizeClientPoint(
    layoutX: number,
    layoutY: number,
    pageIndex?: number,
    height?: number,
  ): { x: number; y: number; height?: number } | null;

  /**
   * Compute caret position in layout coordinates.
   */
  computeCaretLayoutRect(pos: number): { pageIndex: number; x: number; y: number; height: number } | null;

  /**
   * Clean up editor and DOM nodes.
   */
  destroy(): void;

  /**
   * Register an event listener.
   */
  on(event: string, handler: (...args: any[]) => void): void;

  /**
   * Remove an event listener.
   */
  off(event: string, handler: (...args: any[]) => void): void;

  /**
   * Emit an event.
   */
  emit(event: string, ...args: any[]): void;

  /** Allow additional properties */
  [key: string]: any;
}

// ============================================
// VUE COMPONENTS
// ============================================

export declare const SuperEditor: any;
export declare const SuperInput: any;
export declare const BasicUpload: any;
export declare const Toolbar: any;
export declare const AIWriter: any;
export declare const ContextMenu: any;
/** @deprecated Use ContextMenu instead */
export declare const SlashMenu: any;

// ============================================
// HELPER MODULES
// ============================================

export declare const helpers: {
  [key: string]: any;
};

export declare const fieldAnnotationHelpers: {
  [key: string]: any;
};

export declare const trackChangesHelpers: {
  [key: string]: any;
};

export declare const AnnotatorHelpers: {
  [key: string]: any;
};

export declare const SectionHelpers: {
  [key: string]: any;
};

export declare const registeredHandlers: {
  [key: string]: any;
};

// ============================================
// FUNCTIONS
// ============================================

export declare function getMarksFromSelection(selection: any): any[];
export declare function getActiveFormatting(state: any): Record<string, any>;
export declare function getStarterExtensions(): any[];
export declare function getRichTextExtensions(): any[];
export declare function createZip(files: any): Promise<Blob>;
export declare function getAllowedImageDimensions(file: File): Promise<{ width: number; height: number }>;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a node is of a specific type.
 * Narrows the node.attrs type to the specific node's attributes.
 */
export declare function isNodeType<T extends string>(
  node: { type: { name: string }; attrs: unknown },
  typeName: T,
): node is { type: { name: T }; attrs: any };

/**
 * Assert that a node is of a specific type.
 * Throws if the node type doesn't match.
 */
export declare function assertNodeType<T extends string>(
  node: { type: { name: string }; attrs: unknown },
  typeName: T,
): asserts node is { type: { name: T }; attrs: any };

/**
 * Type guard to check if a mark is of a specific type.
 */
export declare function isMarkType<T extends string>(
  mark: { type: { name: string }; attrs: unknown },
  typeName: T,
): mark is { type: { name: T }; attrs: any };

// ============================================
// EXTENSION HELPERS
// ============================================

export declare function defineNode(config: any): any;
export declare function defineMark(config: any): any;

// ============================================
// EXTENSIONS NAMESPACE
// ============================================

export declare const Extensions: {
  Node: any;
  Attribute: any;
  Extension: any;
  Mark: any;
  Plugin: any;
  PluginKey: any;
  Decoration: any;
  DecorationSet: any;
};

// ============================================
// PLUGIN KEYS
// ============================================

export declare const TrackChangesBasePluginKey: any;
export declare const CommentsPluginKey: any;
