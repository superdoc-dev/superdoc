/**
 * Consumer type compatibility test.
 *
 * Validates the full public API surface compiles correctly for consumers,
 * including with noPropertyAccessFromIndexSignature enabled.
 *
 * Organized by API area. Each section tests:
 * - Type imports resolve
 * - Types are constructable with correct shapes
 * - Methods accept/return the expected types
 * - Event handlers receive typed payloads
 */

import {
  Editor,
  PresentationEditor,
  SuperToolbar,
  SuperDoc,
  SuperConverter,
  getStarterExtensions,
  getRichTextExtensions,
  Extensions,
  DOCX,
  PDF,
  HTML,
  createZip,
  DocxZipper,
  getMarksFromSelection,
  getActiveFormatting,
  getAllowedImageDimensions,
  isNodeType,
  assertNodeType,
  isMarkType,
  defineNode,
  defineMark,
  fieldAnnotationHelpers,
  trackChangesHelpers,
  AnnotatorHelpers,
  SectionHelpers,
  registeredHandlers,
  TrackChangesBasePluginKey,
  CommentsPluginKey,
  SuperEditor,
  SuperInput,
  BasicUpload,
  Toolbar,
  AIWriter,
  ContextMenu,
  SlashMenu,
} from 'superdoc';

import type {
  // ProseMirror core
  EditorState,
  Transaction,
  Schema,
  EditorView,

  // Commands
  EditorCommands,
  CommandProps,
  Command,
  ChainedCommand,
  ChainableCommandObject,
  CanObject,

  // Editor config
  EditorOptions,
  PresentationEditorOptions,
  LayoutEngineOptions,
  User,
  FontConfig,
  OpenOptions,
  SaveOptions,
  ExportOptions,
  ExportDocxParams,
  DocxFileEntry,
  BinaryData,

  // Layout
  PageSize,
  PageMargins,
  VirtualizationOptions,
  TrackedChangesMode,
  TrackedChangesOverrides,
  LayoutMode,
  FlowMode,
  PresenceOptions,
  RemoteUserInfo,
  RemoteCursorState,
  Layout,
  LayoutPage,
  LayoutFragment,
  LayoutState,
  LayoutMetrics,
  LayoutError,
  LayoutUpdatePayload,
  RangeRect,
  BoundingRect,
  PositionHit,
  FlowBlock,
  Measure,
  SectionMetadata,
  PaintSnapshot,

  // Comments
  Comment,
  CommentElement,
  CommentsPayload,
  FontsResolvedPayload,

  // Events
  ImageSelectedEvent,
  ImageDeselectedEvent,
  TelemetryEvent,
  RemoteCursorsRenderPayload,

  // Selection
  SelectionHandle,
  SelectionCommandContext,
  ResolveRangeOutput,
  SelectionApi,
  SelectionInfo,
  SelectionCurrentInput,
  TextTarget,
  TextAddress,
  TextSegment,

  // Viewport scroll (now exposed via ui.viewport.scrollIntoView)
  ScrollIntoViewInput,
  ScrollIntoViewOutput,
  EntityAddress,

  // Proofing
  ProofingProvider,
  ProofingCapabilities,
  ProofingConfig,
  ProofingCheckRequest,
  ProofingCheckResult,
  ProofingSegment,
  ProofingIssue,
  ProofingIssueKind,
  ProofingStatus,
  ProofingError,

  // Context menu
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuSection,
  ContextMenuConfig,

  // Other
  UnsupportedContentItem,
  PageStyles,
} from 'superdoc';

// ============================================
// SECTION 1: Type shapes — verify types are constructable
// ============================================

function testTypeShapes() {
  // Layout types
  const pageSize: PageSize = { w: 612, h: 792 };
  const margins: PageMargins = { top: 72, right: 72, bottom: 72, left: 72 };
  const virtualization: VirtualizationOptions = { enabled: true, window: 5, overscan: 2 };
  const trackedChanges: TrackedChangesOverrides = { mode: 'review', enabled: true };
  const presence: PresenceOptions = {
    enabled: true,
    showLabels: true,
    maxVisible: 5,
    labelFormatter: (user: RemoteUserInfo) => user.name || 'Anonymous',
  };

  // Comment types
  const element: CommentElement = {
    type: 'paragraph',
    text: 'Hello',
    content: [{ type: 'text', text: 'nested' }],
  };
  const comment: Comment = {
    commentId: 'c-1',
    createdTime: Date.now(),
    creatorName: 'User',
    creatorEmail: 'user@example.com',
    elements: [element],
    isDone: false,
    parentCommentId: null,
    importedId: 'imp-1',
  };

  // Font config
  const font: FontConfig = {
    key: 'arial',
    label: 'Arial',
    fontWeight: 400,
    props: { style: { fontFamily: 'Arial, sans-serif' } },
  };

  // User with optional fields
  const user: User = {};
  const userPartial: User = { name: 'Alice' };
  const userFull: User = { name: 'Alice', email: 'alice@example.com', image: null };

  // Proofing
  const proofingConfig: ProofingConfig = {
    enabled: true,
    defaultLanguage: 'en',
    debounceMs: 500,
  };
  const proofingIssue: ProofingIssue = {
    segmentId: 'seg-1',
    start: 0,
    end: 5,
    kind: 'spelling' satisfies ProofingIssueKind,
  };

  // Layout state
  const layoutError: LayoutError = { phase: 'render', error: new Error('fail'), timestamp: Date.now() };
  const layoutMetrics: LayoutMetrics = { durationMs: 100, blockCount: 50, pageCount: 3 };
  const rect: BoundingRect = { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100 };

  // Event payloads
  const imgSelected: ImageSelectedEvent = { element: document.createElement('div'), blockId: 'b-1', pmStart: 0 };
  const imgDeselected: ImageDeselectedEvent = { blockId: 'b-1' };
  const telemetry: TelemetryEvent = { type: 'error', data: layoutError };
  const remoteCursorsRender: RemoteCursorsRenderPayload = { collaboratorCount: 3, visibleCount: 2, renderTimeMs: 5 };
  const fontSupport: FontsResolvedPayload = { documentFonts: ['Arial'], unsupportedFonts: ['CustomFont'] };

  // Save/export options
  const saveOpts: SaveOptions = { isFinalDoc: true, fieldsHighlightColor: '#ff0', compression: 'DEFLATE' };
  const exportParams: ExportDocxParams = { exportXmlOnly: true };

  // FlowMode and LayoutMode literals
  const fm: FlowMode = 'paginated';
  const lm: LayoutMode = 'vertical';
  const tcm: TrackedChangesMode = 'review';
}

// ============================================
// SECTION 2: Editor constructor and options
// ============================================

function testEditorOptions() {
  const editor = new Editor({
    user: { name: 'Alice', email: 'alice@example.com' },
    documentMode: 'editing',
    editable: true,
  });

  const presentation = new PresentationEditor({
    element: document.createElement('div'),
    documentMode: 'editing',
    layoutEngineOptions: {
      pageSize: { w: 612, h: 792 },
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      zoom: 1,
      layoutMode: 'vertical',
      flowMode: 'paginated',
      virtualization: { enabled: true },
      trackedChanges: { mode: 'review' },
      presence: { enabled: true },
    },
  });

  // Optional user fields (was: string required)
  const withPartialUser = new PresentationEditor({
    element: document.createElement('div'),
    user: { name: undefined, email: undefined },
  });
}

// ============================================
// SECTION 3: Commands — dot access with noPropertyAccessFromIndexSignature
// ============================================

function testEditorCommands(editor: Editor) {
  // Core commands (from core-command-map.d.ts)
  editor.commands.insertContent('Hello');
  editor.commands.toggleMark('bold');
  editor.commands.selectAll();
  editor.commands.undo();
  editor.commands.redo();
  editor.commands.setMark('bold');
  editor.commands.unsetMark('bold');
  editor.commands.deleteSelection();
  editor.commands.splitBlock();

  // Chain API
  editor.chain().toggleBold().toggleItalic().run();

  // SD-2334: Chain intermediate methods must return ChainableCommandObject, not boolean.
  // Reproduces IT-344 (Ontra): chain().setTextSelection(...).setMark(...).run()
  const chainResult: ChainableCommandObject = editor.chain().setTextSelection({ from: 0, to: 5 });
  const runResult: boolean = editor.chain().setTextSelection({ from: 0, to: 5 }).setMark('bold').run();

  // SD-2334: can().chain() must return ChainableCommandObject, not boolean
  const canChain: ChainableCommandObject = editor.can().chain();
  const canChainRun: boolean = editor.can().chain().toggleBold().run();
}

function testPresentationEditorCommands(pe: PresentationEditor) {
  // Comment commands
  pe.commands.insertComment({ commentId: 'c-1' });
  pe.commands.removeComment({ commentId: 'c-1' });
  pe.commands.resolveComment({ commentId: 'c-1' });
  pe.commands.setActiveComment({ commentId: 'c-1' });
  pe.commands.setCursorById('c-1');
  pe.commands.addComment('Review this section');

  // Formatting commands
  pe.commands.toggleBold();
  pe.commands.toggleItalic();
  pe.commands.toggleUnderline();
  pe.commands.toggleStrike();
  pe.commands.setFontSize('14pt');
  pe.commands.setFontFamily('Arial');
  pe.commands.setColor('#ff0000');
  pe.commands.setHighlight('#ffff00');

  // Track changes
  pe.commands.enableTrackChanges();
  pe.commands.disableTrackChanges();
  pe.commands.acceptTrackedChange();
  pe.commands.rejectTrackedChange();
}

// ============================================
// SECTION 4: exportDocx overloads
// ============================================

async function testExportDocx(editor: Editor) {
  // Default → Blob | Buffer
  const blob: Blob | Buffer = await editor.exportDocx();

  // With comments — round-trip using Comment type
  const comment: Comment = {
    commentId: 'c-1',
    createdTime: Date.now(),
    creatorName: 'User',
    creatorEmail: 'user@example.com',
    elements: [],
    isDone: false,
  };
  await editor.exportDocx({ comments: [comment], commentsType: 'external' });

  // Specific overloads → narrowed return types
  const xml: string = await editor.exportDocx({ exportXmlOnly: true });
  const json: string = await editor.exportDocx({ exportJsonOnly: true });
  const docs: Record<string, string | null> = await editor.exportDocx({ getUpdatedDocs: true });
}

// ============================================
// SECTION 5: loadXmlData overloads
// ============================================

async function testLoadXmlData() {
  // File input
  const file = new File([''], 'test.docx');
  const fileResult = await Editor.loadXmlData(file);
  const [docx1] = fileResult;

  // ArrayBuffer input (was: rejected)
  const ab = new ArrayBuffer(10);
  const abResult = await Editor.loadXmlData(ab);
  const [docx2] = abResult;

  // Blob input
  const blob = new Blob(['']);
  const blobResult = await Editor.loadXmlData(blob);
  const [docx3] = blobResult;
}

// ============================================
// SECTION 6: replaceFile with ArrayBuffer
// ============================================

async function testReplaceFile(editor: Editor) {
  await editor.replaceFile(new File([''], 'new.docx'));
  await editor.replaceFile(new Blob(['']));
  await editor.replaceFile(new ArrayBuffer(10));
}

// ============================================
// SECTION 7: PresentationEditor methods
// ============================================

function testPresentationEditorMethods(pe: PresentationEditor) {
  // Properties
  const editor: Editor = pe.editor;
  const state: EditorState = pe.state;
  const isEditable: boolean = pe.isEditable;
  const element: HTMLElement = pe.element;
  const zoom: number = pe.zoom;

  // Document mode
  pe.setDocumentMode('viewing');
  pe.setDocumentMode('editing');
  pe.setDocumentMode('suggesting');

  // Tracked changes
  pe.setTrackedChangesOverrides({ mode: 'final', enabled: true });

  // Layout
  const pages: LayoutPage[] = pe.getPages();
  const layoutOpts: LayoutEngineOptions = pe.getLayoutOptions();
  const layoutError: LayoutError | null = pe.getLayoutError();
  const isHealthy: boolean = pe.isLayoutHealthy();
  const healthState: 'healthy' | 'degraded' | 'failed' = pe.getLayoutHealthState();
  pe.setLayoutMode('horizontal');
  pe.setZoom(1.5);

  // Selection
  const selRects: RangeRect[] = pe.getSelectionRects();
  const rangeRects: RangeRect[] = pe.getRangeRects(0, 100);
  const bounds = pe.getSelectionBounds(0, 100);

  // Hit testing
  const hit: PositionHit | null = pe.hitTest(100, 200);
  const normalized = pe.normalizeClientPoint(100, 200);

  // Coordinate mapping
  const coords = pe.coordsAtPos(42);
  const posResult = pe.posAtCoords({ clientX: 100, clientY: 200 });

  // Remote cursors
  const cursors: RemoteCursorState[] = pe.getRemoteCursors();

  // Paint snapshot
  const paintSnapshot: PaintSnapshot | null = pe.getPaintSnapshot();

  // Section styles
  const sectionStyles = pe.getCurrentSectionPageStyles();

  // Scrolling
  pe.scrollToPosition(100);
  pe.scrollThreadAnchorToClientY('thread-1', 300);

  // Element navigation
  pe.scrollToElement('paraId-ABC123');
  pe.navigateTo({ kind: 'block', nodeId: 'paraId-ABC123' });
  pe.navigateTo({ kind: 'block', nodeId: 'paraId-ABC123', nodeType: 'paragraph' });
  pe.navigateTo({ kind: 'entity', entityType: 'comment', entityId: 'comment-1' });
  pe.navigateTo({ kind: 'entity', entityType: 'trackedChange', entityId: 'tc-1' });

  // Dispatch
  pe.dispatch(pe.state.tr);
  pe.dispatchInActiveEditor((ed) => {
    ed.commands.toggleBold();
  });

  // Undo/redo
  pe.undo();
  pe.redo();

  // Focus
  pe.focus();

  // Cleanup
  pe.destroy();
}

// ============================================
// SECTION 8: Selection handle API
// ============================================

function testSelectionAPI(pe: PresentationEditor) {
  const handle: SelectionHandle = pe.captureCurrentSelectionHandle();
  const effectiveHandle: SelectionHandle = pe.captureEffectiveSelectionHandle();

  const context: SelectionCommandContext | null = pe.resolveSelectionHandle(handle);
  if (context) {
    const { editor, doc, surface, range } = context;
  }

  const currentRange: ResolveRangeOutput = pe.getCurrentSelectionRange();
  const effectiveRange: ResolveRangeOutput = pe.getEffectiveSelectionRange();

  pe.releaseSelectionHandle(handle);
  pe.releaseSelectionHandle(effectiveHandle);
}

// ============================================
// SECTION 8c: Viewport scroll — `ui.viewport.scrollIntoView`
// ============================================

/**
 * Type-only smoke test for `ui.viewport.scrollIntoView`. Consumers
 * construct `ScrollIntoViewInput` (TextAddress, TextTarget, or
 * EntityAddress) and pass it to the viewport handle, which returns
 * `Promise<ScrollIntoViewOutput>`.
 */
async function testViewportScrollIntoView(viewport: {
  scrollIntoView(input: ScrollIntoViewInput): Promise<ScrollIntoViewOutput>;
}) {
  // TextAddress — single-block target.
  const textAddress: TextAddress = { kind: 'text', blockId: 'p1', range: { start: 0, end: 10 } };
  const resTextAddr: ScrollIntoViewOutput = await viewport.scrollIntoView({ target: textAddress });
  const successA: boolean = resTextAddr.success;
  void successA;

  // TextTarget — multi-segment (e.g. from `selection.current().target`).
  const seg: TextSegment = { blockId: 'p1', range: { start: 0, end: 5 } };
  const textTarget: TextTarget = {
    kind: 'text',
    segments: [seg, { blockId: 'p2', range: { start: 0, end: 3 } }],
  };
  const resTextTarget: ScrollIntoViewOutput = await viewport.scrollIntoView({
    target: textTarget,
    block: 'start',
    behavior: 'auto',
  });
  void resTextTarget;

  // EntityAddress — scroll to a comment or tracked change by id.
  const commentAddr: EntityAddress = { kind: 'entity', entityType: 'comment', entityId: 'c_1' };
  const trackedAddr: EntityAddress = {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: 'tc_1',
  };
  await viewport.scrollIntoView({ target: commentAddr, behavior: 'smooth' });
  await viewport.scrollIntoView({ target: trackedAddr, block: 'center' });

  // Construct a full input object and pass it through — verifies the
  // combined type compiles for consumers who build inputs programmatically.
  const fullInput: ScrollIntoViewInput = {
    target: textAddress,
    block: 'nearest',
    behavior: 'auto',
  };
  await viewport.scrollIntoView(fullInput);
}

// ============================================
// SECTION 8b: Document API — selection primitives
// ============================================

/**
 * Smoke test for the exported `editor.doc.selection.*` surface.
 * Validates that the types consumers build custom toolbars / comment
 * sidebars against (SelectionInfo, TextTarget, the subscription
 * shape) are reachable from the `superdoc` package entrypoint and
 * compose correctly with `comments.create`.
 *
 * The function is not called at runtime — it exists for the type
 * checker only, like the other sections in this file.
 */
function testDocSelectionPrimitives(editor: Editor) {
  const api: SelectionApi = (editor as any).doc.selection;

  // selection.current() with and without args.
  const info: SelectionInfo = api.current();
  const infoWithText: SelectionInfo = api.current({ includeText: true });
  void infoWithText;

  // SelectionInfo shape destructuring — the properties a floating
  // toolbar or comment composer would read.
  const empty: boolean = info.empty;
  const target: TextTarget | null = info.target;
  const marks: string[] = info.activeMarks;
  const text: string | undefined = info.text;
  void empty;
  void marks;
  void text;

  // Hand the selection target straight to comments.create — this is
  // the advertised DX flow. Accepts TextTarget via the widened input.
  if (target !== null) {
    // Per-segment access.
    for (const segment of target.segments) {
      const blockId: string = segment.blockId;
      const start: number = segment.range.start;
      const end: number = segment.range.end;
      void blockId;
      void start;
      void end;
    }
    // Comments.create should accept TextTarget directly. Shape only —
    // there is no guarantee the runtime `doc.comments` is reachable
    // here, but the parameter type must compile.
    type CommentsCreate = (input: { text: string; target: TextTarget | TextAddress }) => unknown;
    const create: CommentsCreate = (_input) => undefined;
    create({ text: 'comment', target });
  }

  // Construct TextAddress / TextTarget / TextSegment literals.
  const ta: TextAddress = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } };
  const seg: TextSegment = { blockId: 'p1', range: { start: 0, end: 5 } };
  const tt: TextTarget = { kind: 'text', segments: [seg] };
  void ta;
  void tt;

  // The Document API contract is request/response: `current()` is
  // the read primitive. For change subscriptions, use the
  // `superdoc/ui` selector substrate
  // (`createSuperDocUI({ superdoc }).select(s => s.selection, ...)`).
  const input: SelectionCurrentInput = { includeText: true };
  api.current(input);
}

// ============================================
// SECTION 9: Event handlers — typed payloads
// ============================================

function testEditorEvents(editor: Editor) {
  editor.on('commentsLoaded', ({ comments, editor: ed, replacedFile }) => {
    for (const c of comments) {
      const id: string = c.commentId;
      const name: string | null = c.creatorName;
      const els: CommentElement[] = c.elements;
      const done: boolean = c.isDone;
    }
  });

  editor.on('contentError', ({ error, editor: ed }) => {
    console.error(error.message);
  });

  editor.on('documentModeChange', ({ documentMode, editor: ed }) => {
    const mode: 'editing' | 'viewing' | 'suggesting' = documentMode;
  });

  editor.on('fonts-resolved', ({ documentFonts, unsupportedFonts }) => {
    const fonts: string[] = documentFonts;
  });

  editor.on('commentsUpdate', (payload) => {
    const comments = payload.comments;
  });

  editor.on('update', ({ editor: ed, transaction }) => {});
  editor.on('create', ({ editor: ed }) => {});
  editor.on('destroy', () => {});
}

function testPresentationEditorEvents(pe: PresentationEditor) {
  const unsubLayout = pe.onLayoutUpdated((payload) => {
    const blocks: FlowBlock[] = payload.blocks;
    const measures: Measure[] = payload.measures;
    const layout: Layout = payload.layout;
  });
  unsubLayout();

  const unsubError = pe.onLayoutError((error) => {
    const phase = error.phase;
    const timestamp = error.timestamp;
  });
  unsubError();
}

// ============================================
// SECTION 10: Toolbar
// ============================================

function testToolbar(editor: Editor) {
  const font: FontConfig = { key: 'arial', label: 'Arial' };

  const toolbar = new SuperToolbar({
    editor,
    selector: '#toolbar',
    fonts: [font],
    toolbarGroups: ['left', 'center', 'right'],
    hideButtons: false,
    pagination: true,
    icons: {},
  });

  // SuperToolbar assignable to setToolbar (was TS2345)
  editor.setToolbar(toolbar);
  toolbar.setActiveEditor(editor);
}

// ============================================
// SECTION 11: Proofing provider contract
// ============================================

function testProofingProvider() {
  const provider: ProofingProvider = {
    id: 'test-provider',
    check: async (request: ProofingCheckRequest): Promise<ProofingCheckResult> => {
      const segments: ProofingSegment[] = request.segments;
      return {
        issues: [
          {
            segmentId: segments[0].id,
            start: 0,
            end: 5,
            kind: 'spelling',
            message: 'Misspelled word',
            replacements: ['correct'],
          },
        ],
      };
    },
  };

  const config: ProofingConfig = {
    enabled: true,
    provider,
    defaultLanguage: 'en',
    onStatusChange: (status: ProofingStatus) => {},
    onProofingError: (error: ProofingError) => {},
  };
}

// ============================================
// SECTION 12: Editor static and content methods
// ============================================

async function testEditorStaticMethods() {
  const file = new File([''], 'test.docx');
  const xmlData = await Editor.loadXmlData(file);
  const editor = await Editor.open(file);
}

function testEditorContentMethods(editor: Editor) {
  const html = editor.getHTML();
  const json = editor.getJSON();
  editor.destroy();
}

// ============================================
// SECTION 12b: Context menu types (SD-2514)
// ============================================

function testContextMenuTypes() {
  // action receives (editor, context) — both args
  const item: ContextMenuItem = {
    id: 'copy-text',
    label: 'Copy',
    icon: 'copy',
    action: (editor, context) => {
      editor.commands.selectAll();
      const text: string = context.selectedText;
    },
    showWhen: (ctx) => ctx.hasSelection && !ctx.isInTable,
  };

  const section: ContextMenuSection = {
    id: 'custom-actions',
    items: [item],
  };

  const config: ContextMenuConfig = {
    customItems: [section],
    includeDefaultItems: true,
    menuProvider: (ctx, sections) => sections.filter((s) => s.id !== 'clipboard'),
  };

  // ContextMenuContext has the full runtime shape
  const ctx: ContextMenuContext = {} as ContextMenuContext;
  const _trigger: 'click' | 'slash' = ctx.trigger;
  const _mode: string = ctx.documentMode;
  const _marks: string[] = ctx.activeMarks;
}

// ============================================
// SECTION 13: Extensions, SuperDoc, and utilities
// ============================================

function testExtensions() {
  const starterExtensions = getStarterExtensions();
  const richTextExtensions = getRichTextExtensions();
  const { Node, Mark, Extension, Plugin, PluginKey } = Extensions;
}

function testSuperDoc() {
  const superdoc: typeof SuperDoc = SuperDoc;
}

function testUtilities() {
  // Verify these are exported
  const zipFn = createZip;
  const docxMime: typeof DOCX = DOCX;
  const pdfMime: typeof PDF = PDF;
  const htmlMime: typeof HTML = HTML;
}

// ============================================
// SECTION 14: Type guards
// ============================================

function testTypeGuards() {
  // Verify type guard functions are exported and callable
  const nodeGuard = isNodeType;
  const nodeAssert = assertNodeType;
  const markGuard = isMarkType;
}

// ============================================
// SECTION 15: Helper modules, plugin keys, additional functions
// ============================================

function testHelperModules() {
  const fa = fieldAnnotationHelpers;
  const tc = trackChangesHelpers;
  const ah = AnnotatorHelpers;
  const sh = SectionHelpers;
  const rh = registeredHandlers;
  const trackChangesKey = TrackChangesBasePluginKey;
  const commentsKey = CommentsPluginKey;
}

function testAdditionalFunctions() {
  // Verify these functions are exported and callable
  const marksFromSel = getMarksFromSelection;
  const activeFmt = getActiveFormatting;
  const imgDims = getAllowedImageDimensions;
  const nodeDef = defineNode;
  const markDef = defineMark;
}

// ============================================
// SECTION 16: Additional classes
// ============================================

function testAdditionalClasses() {
  // Verify these classes are exported
  const ZipperClass = DocxZipper;
  const ToolbarClass = SuperToolbar;
}

// ============================================
// SECTION 17: Vue components
// ============================================

function testVueComponents() {
  const superEditor = SuperEditor;
  const superInput = SuperInput;
  const basicUpload = BasicUpload;
  const toolbarComponent = Toolbar;
  const aiWriter = AIWriter;
  const contextMenu = ContextMenu;
  const slashMenu = SlashMenu;
}

// ============================================
// SECTION 18: superdoc/ui sub-entry — `createSuperDocUI({ superdoc })`
// ============================================

/**
 * Type-level smoke test for the published `superdoc/ui` sub-entry.
 *
 * Mirrors the `superdoc/headless-toolbar` shim pattern: this module
 * is a thin re-export of the browser-only UI controller from
 * `@superdoc/super-editor`. Without a consumer-perspective import,
 * the published sub-entry would only be type-checked from inside the
 * monorepo and a broken re-export could ship undetected.
 */
import {
  createSuperDocUI,
  shallowEqual,
  type CommentsHandle,
  type CommentsSlice,
  type EqualityFn,
  type ReviewHandle,
  type ReviewItem,
  type ReviewSlice,
  type SelectionSlice,
  type SelectorFn,
  type Subscribable,
  type SuperDocEditorLike,
  type SuperDocLike,
  type SuperDocUI,
  type SuperDocUIOptions,
  type SuperDocUIState,
  type ViewportGetRectInput,
  type ViewportHandle,
  type ViewportRect,
  type ViewportRectResult,
} from 'superdoc/ui';

function testSuperDocUISubEntry() {
  // Runtime exports compile and have callable shapes.
  const factory: (options: SuperDocUIOptions) => SuperDocUI = createSuperDocUI;
  const eq: EqualityFn<unknown> = shallowEqual;
  void factory;
  void eq;

  // Public handle / slice types resolve through the sub-entry.
  type AssertHandles = {
    toolbar: SuperDocUI['toolbar'];
    commands: SuperDocUI['commands'];
    comments: CommentsHandle;
    review: ReviewHandle;
    viewport: ViewportHandle;
    state: SuperDocUIState;
  };
  type AssertSlices = {
    selection: SelectionSlice;
    comments: CommentsSlice;
    review: ReviewSlice;
    reviewItem: ReviewItem;
  };
  type AssertViewportShapes = {
    input: ViewportGetRectInput;
    rect: ViewportRect;
    result: ViewportRectResult;
  };
  type AssertSubstrate = {
    selector: SelectorFn<SuperDocUIState, SelectionSlice>;
    sub: Subscribable<SelectionSlice>;
  };
  type AssertHostShapes = {
    superdoc: SuperDocLike;
    editor: SuperDocEditorLike;
  };

  // `void` the type aliases so the file stays a smoke test, not a
  // sample. Touching each at value level via `null as never` keeps
  // the typechecker honest without runtime work.
  void (null as never as AssertHandles);
  void (null as never as AssertSlices);
  void (null as never as AssertViewportShapes);
  void (null as never as AssertSubstrate);
  void (null as never as AssertHostShapes);
}

export {
  testTypeShapes,
  testEditorOptions,
  testEditorCommands,
  testPresentationEditorCommands,
  testExportDocx,
  testLoadXmlData,
  testReplaceFile,
  testPresentationEditorMethods,
  testSelectionAPI,
  testViewportScrollIntoView,
  testEditorEvents,
  testPresentationEditorEvents,
  testToolbar,
  testProofingProvider,
  testEditorStaticMethods,
  testEditorContentMethods,
  testContextMenuTypes,
  testExtensions,
  testSuperDoc,
  testUtilities,
  testTypeGuards,
  testHelperModules,
  testAdditionalFunctions,
  testAdditionalClasses,
  testVueComponents,
  testSuperDocUISubEntry,
};
