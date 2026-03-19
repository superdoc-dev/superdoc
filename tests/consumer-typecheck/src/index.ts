/**
 * Consumer TypeScript compilation test.
 *
 * This file attempts to use SuperDoc's public API the way a real customer would.
 * If this file compiles, the types are sufficient. If it fails, we know what's missing.
 *
 * Based on customer workaround from SD-2227.
 */

// ============================================
// BASIC IMPORTS
// These should all resolve from the main entry point
// ============================================

import {
  SuperDoc,
  Editor,
  SuperConverter,
  PresentationEditor,
  getRichTextExtensions,
  getStarterExtensions,
  DOCX,
  PDF,
  HTML,
  Extensions,
  createZip,
  // Additional exports
  DocxZipper,
  SuperToolbar,
  getMarksFromSelection,
  getActiveFormatting,
  getAllowedImageDimensions,
  // Type guards
  isNodeType,
  assertNodeType,
  isMarkType,
  // Extension helpers
  defineNode,
  defineMark,
  // Helper modules
  helpers,
  fieldAnnotationHelpers,
  trackChangesHelpers,
  AnnotatorHelpers,
  SectionHelpers,
  registeredHandlers,
  // Plugin keys
  TrackChangesBasePluginKey,
  CommentsPluginKey,
  // Vue components
  SuperEditor,
  SuperInput,
  BasicUpload,
  Toolbar,
  AIWriter,
  ContextMenu,
  SlashMenu,
} from 'superdoc';

// ============================================
// EDITOR CLASS - STATIC METHODS
// Customer uses Editor.loadXmlData() for headless processing
// ============================================

async function testEditorStaticMethods() {
  const file = new File([''], 'test.docx');

  // Static method to load DOCX data
  const xmlData = await Editor.loadXmlData(file);

  // Static method to open a document
  const editor = await Editor.open(file);
}

// ============================================
// EDITOR CLASS - INSTANCE METHODS
// Customer needs exportDocx, on/off event handlers, setToolbar
// ============================================

async function testEditorInstanceMethods() {
  const editor = new Editor();

  // Export to DOCX - customer's primary use case
  const docxBlob = await editor.exportDocx({
    comments: [],
    commentsType: 'none',
  });

  // Event handlers - customer uses these extensively
  editor.on('update', () => {});
  editor.on('create', () => {});
  editor.off('update', () => {});

  // Toolbar integration
  editor.setToolbar({});

  // Basic properties
  const state = editor.state;
  const schema = editor.schema;
  const isEditable = editor.isEditable;
  const commands = editor.commands;

  // Commands
  editor.commands.toggleBold();
  editor.commands.setFontSize('14pt');

  // Chain commands
  editor.chain().toggleBold().toggleItalic().run();

  // Content methods
  const html = editor.getHTML();
  const json = editor.getJSON();
  const text = editor.getText();

  // Cleanup
  editor.destroy();
}

// ============================================
// PRESENTATION EDITOR CLASS
// Customer's main entry point for paginated editing
// ============================================

async function testPresentationEditor() {
  const container = document.createElement('div');

  // Constructor with options - customer passes many options
  const presentationEditor = new PresentationEditor({
    element: container,
    documentMode: 'editing',
    content: {},
    extensions: [],
    editable: true,
    isCommentsEnabled: true,
    layoutEngineOptions: {
      pageSize: { w: 612, h: 792 },
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      zoom: 1,
      layoutMode: 'vertical',
      virtualization: { enabled: true },
      trackedChanges: { mode: 'review' },
      presence: { enabled: true },
    },
  });

  // Access underlying editor
  const editor = presentationEditor.editor;

  // Get active editor (body or header/footer)
  const activeEditor: Editor = presentationEditor.getActiveEditor();

  // State and schema access
  const state = presentationEditor.state;
  const isEditable = presentationEditor.isEditable;

  // Commands - customer uses comment commands
  presentationEditor.commands.insertComment?.({ id: '123' });
  presentationEditor.commands.insertContent?.('Hello');

  // Event handlers
  presentationEditor.on('update', () => {});
  presentationEditor.on('create', () => {});
  presentationEditor.off('update', () => {});

  // Document mode switching
  presentationEditor.setDocumentMode('viewing');
  presentationEditor.setDocumentMode('suggesting');
  presentationEditor.setDocumentMode('editing');

  // Tracked changes overrides
  presentationEditor.setTrackedChangesOverrides({ mode: 'final', enabled: true });

  // Viewing comment options
  presentationEditor.setViewingCommentOptions({
    emitCommentPositionsInViewing: true,
    enableCommentsInViewing: true,
  });

  // Context menu toggle
  presentationEditor.setContextMenuDisabled(true);

  // File replacement
  const newFile = new File([''], 'new.docx');
  await presentationEditor.replaceFile?.(newFile);

  // Zoom
  presentationEditor.setZoom(1.5);

  // Layout mode
  presentationEditor.setLayoutMode('horizontal');

  // Layout methods
  const pages: LayoutPage[] = presentationEditor.getPages();
  const rects: RangeRect[] = presentationEditor.getSelectionRects();
  const rangeRects: RangeRect[] = presentationEditor.getRangeRects(0, 100);

  // Selection bounds
  const bounds = presentationEditor.getSelectionBounds(0, 100);
  if (bounds) {
    const { bounds: boundingRect, rects: selRects, pageIndex } = bounds;
  }

  // Comment bounds mapping
  const commentBounds = presentationEditor.getCommentBounds({
    'comment-1': { start: 0, end: 50 },
    'comment-2': { pos: 75 },
  });

  // Layout snapshot
  const snapshot = presentationEditor.getLayoutSnapshot();
  const { blocks, measures, layout, sectionMetadata } = snapshot;

  // Layout options
  const layoutOptions: LayoutEngineOptions = presentationEditor.getLayoutOptions();

  // Paint snapshot (debugging)
  const paintSnapshot: PaintSnapshot | null = presentationEditor.getPaintSnapshot();

  // Section-aware page styles
  const sectionStyles = presentationEditor.getCurrentSectionPageStyles();

  // Remote cursors (collaboration)
  const cursors: RemoteCursorState[] = presentationEditor.getRemoteCursors();

  // Layout health
  const layoutError: LayoutError | null = presentationEditor.getLayoutError();
  const isHealthy: boolean = presentationEditor.isLayoutHealthy();
  const healthState: 'healthy' | 'degraded' | 'failed' = presentationEditor.getLayoutHealthState();

  // Layout event subscriptions
  const unsubLayout = presentationEditor.onLayoutUpdated((payload: LayoutUpdatePayload) => {
    console.log('Layout updated', payload.layout.pages.length);
  });
  const unsubError = presentationEditor.onLayoutError((error: LayoutError) => {
    console.error('Layout error', error);
  });
  unsubLayout(); // cleanup
  unsubError();

  // Hit testing
  const hit: PositionHit | null = presentationEditor.hitTest(100, 200);

  // Coordinate conversions
  const normalizedPoint = presentationEditor.normalizeClientPoint(100, 200);
  const denormalizedPoint = presentationEditor.denormalizeClientPoint(50, 100, 0, 20);

  // Position/coordinate mappings
  const coords = presentationEditor.coordsAtPos(42);
  const posResult = presentationEditor.posAtCoords({ clientX: 100, clientY: 200 });
  const elementAtPos = presentationEditor.getElementAtPos(42);

  // Scrolling
  await presentationEditor.scrollToPosition(100);
  await presentationEditor.scrollToPositionAsync(100, { behavior: 'smooth' });
  await presentationEditor.scrollToPage(2, 'smooth');
  presentationEditor.scrollThreadAnchorToClientY('thread-1', 300);

  // Navigation
  await presentationEditor.goToAnchor('bookmark-1');

  // Caret computation
  const caretRect = presentationEditor.computeCaretLayoutRect(42);

  // Undo/redo
  presentationEditor.undo();
  presentationEditor.redo();

  // Dispatch in active editor
  presentationEditor.dispatchInActiveEditor((ed) => {
    ed.commands.toggleBold();
  });

  // Transaction dispatch
  const tr = presentationEditor.state.tr;
  presentationEditor.dispatch(tr);

  // Cleanup
  presentationEditor.destroy();
}

// ============================================
// SUPER TOOLBAR CLASS
// Customer creates toolbar with specific options
// ============================================

function testSuperToolbar() {
  const editor = new Editor();

  // Toolbar construction - customer uses these options
  // const toolbar = new SuperToolbar({
  //   editor,
  //   selector: '#toolbar',
  //   fonts: [],
  //   toolbarGroups: ['formatting', 'lists'],
  //   hideButtons: false,
  //   pagination: true,
  //   icons: {},
  // });

  // Note: SuperToolbar is typed as `any` in hand-written types
  // This section tests if it's exported at all
}

// ============================================
// COMMENT TYPES
// Customer works extensively with comments
// ============================================

function testCommentTypes() {
  // This tests the exported Comment type
  // Customer needs to type their comment handlers

  const comment: Comment = {
    commentId: '123',
    createdTime: Date.now(),
    creatorEmail: 'user@example.com',
    creatorName: 'User',
    elements: [{ type: 'paragraph', text: 'Comment text' }],
    isDone: false,
    parentCommentId: undefined,
    importedId: 'imported-123',
  };

  // Comment element type
  const element: CommentElement = {
    type: 'paragraph',
    content: [{ type: 'text', text: 'nested' }],
    text: 'Element text',
  };

  // CommentsLoadedEventData type
  const handleCommentsLoaded = (data: CommentsLoadedEventData) => {
    for (const c of data.comments) {
      console.log(c.commentId, c.creatorName);
    }
  };

  // ContentErrorEventData type
  const handleContentError = (data: ContentErrorEventData) => {
    console.error(data.error.message);
  };
}

// ============================================
// SELECTION HANDLE API
// New API for deferred selection-based operations (AI, dialogs, async chains)
// ============================================

async function testSelectionHandleAPI() {
  const editor = new Editor();

  // Capture selection as a tracked handle
  const handle: SelectionHandle = editor.captureCurrentSelectionHandle('body');

  // Handle properties
  const handleId: number = handle.id;
  const surface: 'body' | 'header' | 'footer' = handle.surface;
  const wasNonEmpty: boolean = handle.wasNonEmpty;

  // Capture effective selection
  const effectiveHandle: SelectionHandle = editor.captureEffectiveSelectionHandle('body');

  // Resolve the handle to get current range
  const range: ResolveRangeOutput | null = editor.resolveSelectionHandle(handle);

  // Snapshot convenience methods (no handle, immediate resolution)
  const currentRange: ResolveRangeOutput = editor.getCurrentSelectionRange();
  const effectiveRange: ResolveRangeOutput = editor.getEffectiveSelectionRange();

  // Release the handle when done
  editor.releaseSelectionHandle(handle);
  editor.releaseSelectionHandle(effectiveHandle);

  // Editor dispatch method (for headless mode)
  const tr = editor.state.tr;
  editor.dispatch(tr);
}

async function testPresentationEditorSelectionAPI() {
  const container = document.createElement('div');
  const presentationEditor = new PresentationEditor({
    element: container,
  });

  // Capture selection handles
  const handle: SelectionHandle = presentationEditor.captureCurrentSelectionHandle();
  const effectiveHandle: SelectionHandle = presentationEditor.captureEffectiveSelectionHandle();

  // Resolve to SelectionCommandContext (includes editor, doc, surface, range)
  const context: SelectionCommandContext | null = presentationEditor.resolveSelectionHandle(handle);
  if (context) {
    const { editor, doc, surface, range } = context;
    // editor: Editor instance
    // doc: DocumentApi instance
    // surface: 'body' | 'header' | 'footer'
    // range: ResolveRangeOutput
  }

  // Snapshot convenience methods
  const currentRange: ResolveRangeOutput = presentationEditor.getCurrentSelectionRange();
  const effectiveRange: ResolveRangeOutput = presentationEditor.getEffectiveSelectionRange();
  const currentContext: SelectionCommandContext = presentationEditor.getCurrentSelectionContext();
  const effectiveContext: SelectionCommandContext = presentationEditor.getEffectiveSelectionContext();

  // Release handles
  presentationEditor.releaseSelectionHandle(handle);
  presentationEditor.releaseSelectionHandle(effectiveHandle);
}

// ============================================
// EXTENSION HELPERS
// Customer uses these to configure the editor
// ============================================

function testExtensionHelpers() {
  // Get default extensions
  const starterExtensions = getStarterExtensions();
  const richTextExtensions = getRichTextExtensions();

  // Extensions namespace
  const { Node, Mark, Extension, Plugin, PluginKey } = Extensions;
}

// ============================================
// SUPERDOC CLASS (Vue component wrapper)
// ============================================

function testSuperDoc() {
  // SuperDoc is the main Vue component
  // Type should exist even if it's `any`
  const superdoc: typeof SuperDoc = SuperDoc;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function testUtilities() {
  // createZip for manual DOCX assembly
  const files = [{ name: 'document.xml', content: '<w:document/>' }];
  const zip = await createZip(files);

  // MIME type constants
  const docxMime: typeof DOCX = DOCX;
  const pdfMime: typeof PDF = PDF;
  const htmlMime: typeof HTML = HTML;
}

// ============================================
// TYPE EXPORTS
// These types should be importable by consumers
// ============================================

import type {
  // Editor types
  EditorState,
  Transaction,
  Schema,
  EditorView,

  // Command types
  EditorCommands,
  ChainedCommand,
  CommandProps,
  Command,
  CanObject,

  // Selection handle types (new)
  SelectionHandle,
  SelectionCommandContext,
  ResolveRangeOutput,

  // Presentation types
  PresentationEditorOptions,
  LayoutEngineOptions,
  PageSize,
  PageMargins,
  VirtualizationOptions,
  TrackedChangesMode,
  TrackedChangesOverrides,
  LayoutMode,
  PresenceOptions,

  // Remote collaboration types
  RemoteUserInfo,
  RemoteCursorState,

  // Layout types
  Layout,
  LayoutPage,
  LayoutFragment,
  RangeRect,
  BoundingRect,
  LayoutError,
  LayoutMetrics,
  PositionHit,
  FlowBlock,
  Measure,
  SectionMetadata,
  PaintSnapshot,
  LayoutUpdatePayload,

  // Comment types
  Comment,
  CommentElement,
  CommentsLoadedEventData,
  ContentErrorEventData,

  // Font types
  FontConfig,
  FontSupportInfo,

  // Data types
  OpenOptions,
  DocxFileEntry,
  BinaryData,
  UnsupportedContentItem,
} from 'superdoc';

function testTypeImports() {
  // Verify types are usable
  const options: PresentationEditorOptions = {
    element: document.createElement('div'),
  };

  const pageSize: PageSize = { w: 612, h: 792 };
  const margins: PageMargins = { top: 72, right: 72, bottom: 72, left: 72 };

  // Virtualization options
  const virtualization: VirtualizationOptions = {
    enabled: true,
    window: 5,
    overscan: 2,
    gap: 20,
    paddingTop: 0,
  };

  // Tracked changes configuration
  const trackedChangesMode: TrackedChangesMode = 'review';
  const trackedChanges: TrackedChangesOverrides = {
    mode: trackedChangesMode,
    enabled: true,
  };

  // Layout mode
  const layoutMode: LayoutMode = 'vertical';

  // Presence/collaboration options
  const presenceOptions: PresenceOptions = {
    enabled: true,
    showLabels: true,
    maxVisible: 5,
    labelFormatter: (user: RemoteUserInfo) => user.name || 'Anonymous',
    highlightOpacity: 0.3,
    staleTimeout: 5000,
  };

  const layoutOptions: LayoutEngineOptions = {
    pageSize,
    margins,
    zoom: 1,
    virtualization,
    trackedChanges,
    layoutMode,
    presence: presenceOptions,
  };

  // Remote cursor state
  const remoteCursor: RemoteCursorState = {
    clientId: 1,
    user: { name: 'User', email: 'user@example.com', color: '#ff0000' },
    anchor: 0,
    head: 10,
    updatedAt: Date.now(),
  };

  // Layout types
  const layoutError: LayoutError = {
    phase: 'render',
    error: new Error('Layout failed'),
    timestamp: Date.now(),
  };

  const layoutMetrics: LayoutMetrics = {
    durationMs: 100,
    blockCount: 50,
    pageCount: 3,
  };

  const positionHit: PositionHit = {
    pos: 42,
    layoutEpoch: 1,
    blockId: 'block-1',
    pageIndex: 0,
    column: 0,
    lineIndex: 5,
  };

  const flowBlock: FlowBlock = {
    id: 'block-1',
    type: 'paragraph',
    pmStart: 0,
    pmEnd: 100,
  };

  const measure: Measure = {
    blockId: 'block-1',
    width: 612,
    height: 24,
    lines: [{ width: 500, ascent: 12, descent: 4, lineHeight: 16 }],
  };

  const sectionMetadata: SectionMetadata = {
    sectionIndex: 0,
    startPage: 1,
    endPage: 3,
  };

  const layoutUpdatePayload: LayoutUpdatePayload = {
    blocks: [flowBlock],
    measures: [measure],
    layout: { pageSize, pages: [] },
    metrics: layoutMetrics,
  };

  // Font types
  const fontConfig: FontConfig = {
    key: 'arial',
    label: 'Arial',
    fontWeight: 400,
    props: { style: { fontFamily: 'Arial, sans-serif' } },
  };

  const fontSupport: FontSupportInfo = {
    documentFonts: ['Arial', 'Times New Roman'],
    unsupportedFonts: ['CustomFont'],
  };

  // Binary data type
  const binaryData: BinaryData = new ArrayBuffer(100);

  // Unsupported content item
  const unsupported: UnsupportedContentItem = {
    tagName: 'HR',
    outerHTML: '<hr>',
    count: 1,
  };

  // Command types
  const commandProps: CommandProps = {
    editor: new Editor(),
    tr: {} as Transaction,
    state: {} as EditorState,
    view: {} as EditorView,
    dispatch: () => {},
  };

  const command: Command = (props: CommandProps) => true;
}

// ============================================
// TYPE GUARDS AND HELPER FUNCTIONS
// ============================================

function testTypeGuards() {
  // isNodeType - narrows node type
  const node = { type: { name: 'paragraph' }, attrs: { align: 'left' } };
  if (isNodeType(node, 'paragraph')) {
    // node.type.name is now 'paragraph'
    const name: 'paragraph' = node.type.name;
  }

  // assertNodeType - throws if wrong type
  try {
    assertNodeType(node, 'heading');
  } catch (e) {
    // Expected - node is 'paragraph', not 'heading'
  }

  // isMarkType - narrows mark type
  const mark = { type: { name: 'bold' }, attrs: {} };
  if (isMarkType(mark, 'bold')) {
    const markName: 'bold' = mark.type.name;
  }
}

function testHelperModules() {
  // Helper modules should be accessible (typed as any for flexibility)
  const h = helpers;
  const fa = fieldAnnotationHelpers;
  const tc = trackChangesHelpers;
  const ah = AnnotatorHelpers;
  const sh = SectionHelpers;
  const rh = registeredHandlers;

  // Plugin keys
  const trackChangesKey = TrackChangesBasePluginKey;
  const commentsKey = CommentsPluginKey;
}

async function testAdditionalFunctions() {
  // getMarksFromSelection
  const selection = {}; // Mock selection
  const marks = getMarksFromSelection(selection);

  // getActiveFormatting
  const state = {}; // Mock state
  const formatting = getActiveFormatting(state);

  // getAllowedImageDimensions
  const file = new File([''], 'image.png', { type: 'image/png' });
  const dimensions = await getAllowedImageDimensions(file);
  const { width, height } = dimensions;

  // defineNode and defineMark helpers
  const nodeConfig = defineNode({ name: 'custom-node' });
  const markConfig = defineMark({ name: 'custom-mark' });
}

function testAdditionalClasses() {
  // DocxZipper class
  const zipper = new DocxZipper();

  // SuperToolbar class
  const toolbar = new SuperToolbar();
}

function testVueComponents() {
  // Vue components should be exported (typed as any)
  const superEditor = SuperEditor;
  const superInput = SuperInput;
  const basicUpload = BasicUpload;
  const toolbarComponent = Toolbar;
  const aiWriter = AIWriter;
  const contextMenu = ContextMenu;
  const slashMenu = SlashMenu; // deprecated
}

// ============================================
// Run type checks (these are just for TypeScript, not runtime)
// ============================================

export {
  testEditorStaticMethods,
  testEditorInstanceMethods,
  testPresentationEditor,
  testSuperToolbar,
  testCommentTypes,
  testExtensionHelpers,
  testSuperDoc,
  testUtilities,
  testTypeImports,
  // New test functions
  testSelectionHandleAPI,
  testPresentationEditorSelectionAPI,
  testTypeGuards,
  testHelperModules,
  testAdditionalFunctions,
  testAdditionalClasses,
  testVueComponents,
};
