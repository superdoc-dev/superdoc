import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node as ProseMirrorNode, Mark } from 'prosemirror-model';
import type { Mapping } from 'prosemirror-transform';
import { Editor } from './Editor.js';
import { EventEmitter } from './EventEmitter.js';
import { EpochPositionMapper } from './EpochPositionMapper.js';
import { DomPositionIndex } from './DomPositionIndex.js';
import { DomPositionIndexObserverManager } from './DomPositionIndexObserverManager.js';
import {
  computeDomCaretPageLocal as computeDomCaretPageLocalFromDom,
  computeSelectionRectsFromDom as computeSelectionRectsFromDomFromDom,
} from './DomSelectionGeometry.js';
import {
  convertPageLocalToOverlayCoords as convertPageLocalToOverlayCoordsFromTransform,
  getPageOffsetX as getPageOffsetXFromTransform,
} from './CoordinateTransform.js';
import { normalizeClientPoint as normalizeClientPointFromPointer } from './PointerNormalization.js';
import { getPageElementByIndex } from './PageDom.js';
import { inchesToPx, parseColumns } from './LayoutOptionParsing.js';
import { createLayoutMetrics as createLayoutMetricsFromHelper } from './PresentationLayoutMetrics.js';
import { safeCleanup } from './SafeCleanup.js';
import { createHiddenHost } from './HiddenHost.js';
import { normalizeAwarenessStates as normalizeAwarenessStatesFromHelper } from './RemoteCursorAwareness.js';
import { renderRemoteCursors as renderRemoteCursorsFromHelper } from './RemoteCursorRendering.js';
import { SelectionSyncCoordinator } from './SelectionSyncCoordinator.js';
import { PresentationInputBridge } from './PresentationInputBridge.js';
import { calculateExtendedSelection } from './SelectionHelpers.js';
import { getAtomNodeTypes as getAtomNodeTypesFromSchema } from './SchemaNodeTypes.js';
import { buildPositionMapFromPmDoc } from './PositionMapFromPm.js';
import {
  computeParagraphSelectionRangeAt as computeParagraphSelectionRangeAtFromHelper,
  computeWordSelectionRangeAt as computeWordSelectionRangeAtFromHelper,
  getFirstTextPosition as getFirstTextPositionFromHelper,
  registerPointerClick as registerPointerClickFromHelper,
} from './ClickSelectionUtilities.js';
import {
  computeA11ySelectionAnnouncement as computeA11ySelectionAnnouncementFromHelper,
  scheduleA11ySelectionAnnouncement as scheduleA11ySelectionAnnouncementFromHelper,
  syncHiddenEditorA11yAttributes as syncHiddenEditorA11yAttributesFromHelper,
} from './A11ySupport.js';
import { computeSelectionVirtualizationPins } from './SelectionVirtualizationPins.js';
import { debugLog, updateSelectionDebugHud, type SelectionDebugHudState } from './SelectionDebug.js';
import { renderCellSelectionOverlay } from './CellSelectionOverlay.js';
import { renderCaretOverlay, renderSelectionRects } from './LocalSelectionOverlayRendering.js';
import { computeCaretLayoutRectGeometry as computeCaretLayoutRectGeometryFromHelper } from './CaretGeometry.js';
import { collectCommentPositions as collectCommentPositionsFromHelper } from './CommentPositionCollection.js';
import { getCurrentSectionPageStyles as getCurrentSectionPageStylesFromHelper } from './SectionPageStyles.js';
import {
  computeAnchorMap as computeAnchorMapFromHelper,
  goToAnchor as goToAnchorFromHelper,
} from './AnchorNavigation.js';
import {
  getCellPosFromTableHit as getCellPosFromTableHitFromHelper,
  getTablePosFromHit as getTablePosFromHitFromHelper,
  hitTestTable as hitTestTableFromHelper,
  shouldUseCellSelection as shouldUseCellSelectionFromHelper,
} from './TableSelectionUtilities.js';
import {
  createExternalFieldAnnotationDragOverHandler,
  createExternalFieldAnnotationDropHandler,
  setupInternalFieldAnnotationDragHandlers,
} from './FieldAnnotationDragDrop.js';
import { initHeaderFooterRegistry as initHeaderFooterRegistryFromHelper } from './header-footer/HeaderFooterRegistryInit.js';
import { decodeRPrFromMarks } from './super-converter/styles.js';
import { halfPointToPoints } from './super-converter/helpers.js';
import { layoutPerRIdHeaderFooters as layoutPerRIdHeaderFootersFromHelper } from './header-footer/HeaderFooterPerRidLayout.js';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import {
  incrementalLayout,
  selectionToRects,
  clickToPosition,
  getFragmentAtPosition,
  extractIdentifierFromConverter,
  getHeaderFooterType,
  getBucketForPageNumber,
  getBucketRepresentative,
  buildMultiSectionIdentifier,
  getHeaderFooterTypeForSection,
  layoutHeaderFooterWithCache as _layoutHeaderFooterWithCache,
  PageGeometryHelper,
} from '@superdoc/layout-bridge';
import type {
  HeaderFooterIdentifier,
  HeaderFooterLayoutResult,
  HeaderFooterType,
  PositionHit,
  MultiSectionHeaderFooterIdentifier,
  TableHitResult,
} from '@superdoc/layout-bridge';
import { createDomPainter } from '@superdoc/painter-dom';
import type { LayoutMode, PageDecorationProvider, RulerOptions } from '@superdoc/painter-dom';
import { measureBlock } from '@superdoc/measuring-dom';
import type {
  ColumnLayout,
  FlowBlock,
  Layout,
  Measure,
  Page,
  SectionMetadata,
  TrackedChangesMode,
  Fragment,
} from '@superdoc/contracts';
import { extractHeaderFooterSpace as _extractHeaderFooterSpace } from '@superdoc/contracts';
import { TrackChangesBasePluginKey } from '@extensions/track-changes/plugins/index.js';

// Comment and tracked change mark names (inline to avoid missing declaration files)
const CommentMarkName = 'commentMark';
const TrackInsertMarkName = 'trackInsert';
const TrackDeleteMarkName = 'trackDelete';
const TrackFormatMarkName = 'trackFormat';

/**
 * Font size scaling factor for subscript and superscript text.
 * This value (0.65 or 65%) matches Microsoft Word's default rendering behavior
 * for vertical alignment (w:vertAlign) when set to 'superscript' or 'subscript'.
 * Applied to the base font size to reduce text size for sub/superscripts.
 */
const SUBSCRIPT_SUPERSCRIPT_SCALE = 0.65;

// Collaboration cursor imports
import { absolutePositionToRelativePosition, ySyncPluginKey } from 'y-prosemirror';
import type * as Y from 'yjs';
import {
  HeaderFooterEditorManager,
  HeaderFooterLayoutAdapter,
  type HeaderFooterDescriptor,
} from './header-footer/HeaderFooterRegistry.js';
import { EditorOverlayManager } from './header-footer/EditorOverlayManager.js';
import { isInRegisteredSurface } from './uiSurfaceRegistry.js';

export type PageSize = {
  w: number;
  h: number;
};

export type PageMargins = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  header?: number;
  footer?: number;
};

export type VirtualizationOptions = {
  enabled?: boolean;
  window?: number;
  overscan?: number;
  gap?: number;
  paddingTop?: number;
};

/**
 * Awareness state structure from y-protocols.
 * Represents the state stored for each collaborator in the awareness protocol.
 */
type AwarenessState = {
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
  user?: {
    name?: string;
    email?: string;
    color?: string;
  };
  [key: string]: unknown;
};

/**
 * Cursor position data stored in awareness state.
 * Contains relative Yjs positions for anchor and head.
 */
type AwarenessCursorData = {
  /** Relative Yjs position for selection anchor */
  anchor: Y.RelativePosition;
  /** Relative Yjs position for selection head (caret) */
  head: Y.RelativePosition;
};

/**
 * Extended awareness interface that includes the setLocalStateField method.
 * The base Awareness type from y-protocols has this method but it's not always
 * included in type definitions, so we extend it here for type safety.
 */
interface AwarenessWithSetField {
  clientID: number;
  getStates: () => Map<number, AwarenessState>;
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
  /**
   * Update a specific field in the local awareness state.
   * @param field - The field name to update (e.g., 'cursor', 'user')
   * @param value - The value to set for the field
   */
  setLocalStateField: (field: string, value: unknown) => void;
}

/**
 * User metadata for remote collaborators.
 * Exported as a standalone type for external consumers building custom presence UI.
 */
export type RemoteUserInfo = {
  /** User's display name (optional) */
  name?: string;
  /** User's email address (optional) */
  email?: string;
  /** Hex color code for this user's cursor/selection */
  color: string;
};

/**
 * Normalized remote cursor state for a single collaborator.
 * Contains absolute ProseMirror positions and user metadata.
 */
export type RemoteCursorState = {
  /** Yjs client ID for this collaborator */
  clientId: number;
  /** User metadata (name, email, color) */
  user: RemoteUserInfo;
  /** Selection anchor (absolute PM position) */
  anchor: number;
  /** Selection head/caret position (absolute PM position) */
  head: number;
  /** Timestamp of last update (for recency-based rendering limits) */
  updatedAt: number;
};

/**
 * Cell anchor state for table cell drag selection.
 *
 * Lifecycle:
 * - Created when a drag operation starts inside a table cell (#setCellAnchor)
 * - Persists throughout the drag to track the anchor cell
 * - Cleared when drag ends (#clearCellAnchor) or document changes
 *
 * Used by the cell selection state machine to determine when to transition
 * from text selection to cell selection mode during table drag operations.
 */
type CellAnchorState = {
  /** PM position of the table node */
  tablePos: number;
  /** PM position at the start of the anchor cell */
  cellPos: number;
  /** Row index of the anchor cell (0-based) */
  cellRowIndex: number;
  /** Column index of the anchor cell (0-based) */
  cellColIndex: number;
  /** Cached reference to table block ID for performance */
  tableBlockId: string;
};

/**
 * Configuration options for remote cursor presence rendering.
 * Controls how collaborator cursors and selections appear in the layout.
 */
export type PresenceOptions = {
  /** Enable remote cursor rendering. Default: true */
  enabled?: boolean;
  /** Show name labels above remote cursors. Default: true */
  showLabels?: boolean;
  /** Maximum number of remote cursors to render (performance guardrail). Default: 20 */
  maxVisible?: number;
  /** Custom formatter for user labels. Default: user.name ?? user.email */
  labelFormatter?: (user: RemoteUserInfo) => string;
  /** Opacity for remote selection highlights (0-1). Default: 0.35 */
  highlightOpacity?: number;
  /** Time in milliseconds before removing inactive cursors. Default: 300000 (5 minutes) */
  staleTimeout?: number;
};

/**
 * Type-safe interface for Editor instances with SuperConverter attached.
 * Used to access converter-specific properties for header/footer management
 * without resorting to type assertions throughout the codebase.
 */
interface EditorWithConverter extends Editor {
  converter: Editor['converter'] & {
    pageStyles?: { alternateHeaders?: boolean };
    headerIds?: { default?: string; first?: string; even?: string; odd?: string };
    footerIds?: { default?: string; first?: string; even?: string; odd?: string };
    createDefaultHeader?: (variant: string) => string;
    createDefaultFooter?: (variant: string) => string;
  };
}

export type LayoutEngineOptions = {
  pageSize?: PageSize;
  margins?: PageMargins;
  zoom?: number;
  virtualization?: VirtualizationOptions;
  pageStyles?: Record<string, unknown>;
  debugLabel?: string;
  layoutMode?: LayoutMode;
  trackedChanges?: TrackedChangesOverrides;
  /** Emit comment positions while in viewing mode (used to render comment highlights). */
  emitCommentPositionsInViewing?: boolean;
  /** Render comment highlights while in viewing mode. */
  enableCommentsInViewing?: boolean;
  /** Collaboration cursor/presence configuration */
  presence?: PresenceOptions;
  /**
   * Per-page ruler options.
   * When enabled, renders a horizontal ruler at the top of each page showing
   * inch marks and optionally margin handles for interactive margin adjustment.
   */
  ruler?: RulerOptions;
};

export type TrackedChangesOverrides = {
  mode?: TrackedChangesMode;
  enabled?: boolean;
};

export type PresentationEditorOptions = ConstructorParameters<typeof Editor>[0] & {
  /**
   * Host element where the layout-engine powered UI should render.
   */
  element: HTMLElement;
  /**
   * Layout-specific configuration consumed by PresentationEditor.
   */
  layoutEngineOptions?: LayoutEngineOptions;
  /**
   * Document mode for the editor. Determines editability and tracked changes behavior.
   * @default 'editing'
   */
  documentMode?: 'editing' | 'viewing' | 'suggesting';
  /**
   * Collaboration provider with awareness support (e.g., WebsocketProvider from y-websocket).
   * Required for remote cursor rendering.
   */
  collaborationProvider?: {
    awareness?: AwarenessWithSetField;
    disconnect?: () => void;
  } | null;
  /**
   * Whether to disable the context menu.
   * @default false
   */
  disableContextMenu?: boolean;
};

type LayoutState = {
  blocks: FlowBlock[];
  measures: Measure[];
  layout: Layout | null;
  bookmarks: Map<string, number>;
  anchorMap?: Map<string, number>;
};

type LayoutMetrics = {
  durationMs: number;
  blockCount: number;
  pageCount: number;
};

type LayoutError = {
  phase: 'initialization' | 'render';
  error: Error;
  timestamp: number;
};

type LayoutRect = { x: number; y: number; width: number; height: number; pageIndex: number };
type RangeRect = {
  pageIndex: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type HeaderFooterMode = 'body' | 'header' | 'footer';
type HeaderFooterSession = {
  mode: HeaderFooterMode;
  kind?: 'header' | 'footer';
  headerId?: string | null;
  sectionType?: string | null;
  pageIndex?: number;
  pageNumber?: number;
};

type HeaderFooterRegion = {
  kind: 'header' | 'footer';
  headerId?: string;
  sectionType?: string;
  pageIndex: number;
  pageNumber: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
  contentHeight?: number;
  /** Minimum Y coordinate from layout (can be negative if content extends above y=0) */
  minY?: number;
};

type HeaderFooterLayoutContext = {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  region: HeaderFooterRegion;
};

const DEFAULT_PAGE_SIZE: PageSize = { w: 612, h: 792 }; // Letter @ 72dpi
const DEFAULT_MARGINS: PageMargins = { top: 72, right: 72, bottom: 72, left: 72 };
/** Default gap between pages when virtualization is enabled (matches renderer.ts virtualGap) */
const DEFAULT_VIRTUALIZED_PAGE_GAP = 72;
/** Default gap between pages without virtualization (from containerStyles in styles.ts) */
const DEFAULT_PAGE_GAP = 24;
/** Default gap for horizontal layout mode */
const DEFAULT_HORIZONTAL_PAGE_GAP = 20;

// Constants for interaction timing and thresholds
/** Maximum time between clicks to register as multi-click (milliseconds) */
const MULTI_CLICK_TIME_THRESHOLD_MS = 400;
/** Maximum distance between clicks to register as multi-click (pixels) */
const MULTI_CLICK_DISTANCE_THRESHOLD_PX = 5;
/** Budget for header/footer initialization before warning (milliseconds) */
const HEADER_FOOTER_INIT_BUDGET_MS = 200;
/**
 * Debounce delay for scroll events (milliseconds).
 * Set to 32ms (~31fps) for responsive cursor updates during scrolling while avoiding
 * excessive re-renders. Reduced from 100ms to improve collaboration cursor responsiveness
 * when users scroll to view remote collaborators' positions.
 */
const SCROLL_DEBOUNCE_MS = 32;
/** Maximum zoom level before warning */
const MAX_ZOOM_WARNING_THRESHOLD = 10;
/** Maximum number of selection rectangles per user (performance guardrail) */
const MAX_SELECTION_RECTS_PER_USER = 100;
/** Default timeout for stale collaborator cleanup (milliseconds) */
const DEFAULT_STALE_TIMEOUT_MS = 5 * 60 * 1000;

const GLOBAL_PERFORMANCE: Performance | undefined = typeof performance !== 'undefined' ? performance : undefined;

/**
 * Telemetry payload for remote cursor render events.
 * Provides performance metrics for monitoring collaboration cursor rendering.
 */
export type RemoteCursorsRenderPayload = {
  /** Total number of collaborators with cursors */
  collaboratorCount: number;
  /** Number of cursors actually rendered (after maxVisible limit) */
  visibleCount: number;
  /** Time taken to render all cursors in milliseconds */
  renderTimeMs: number;
};

/**
 * Telemetry payload for layout updates.
 */
export type LayoutUpdatePayload = {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  metrics: LayoutMetrics;
};

/**
 * Event payload emitted when an image is selected in the editor.
 */
export type ImageSelectedEvent = {
  /** The DOM element representing the selected image */
  element: HTMLElement;
  /** The layout-engine block ID for the image (null for inline images) */
  blockId: string | null;
  /** The ProseMirror document position where the image node starts */
  pmStart: number;
};

/**
 * Event payload emitted when an image is deselected in the editor.
 */
export type ImageDeselectedEvent = {
  /** The block ID of the previously selected image (may be a synthetic ID like "inline-{position}") */
  blockId: string;
};

type PendingMarginClick =
  | { pointerId: number; kind: 'aboveFirstLine' }
  | { pointerId: number; kind: 'left' | 'right'; layoutEpoch: number; pmStart: number; pmEnd: number };

/**
 * Extended editor view type with a flag indicating the focus method has been wrapped
 * to prevent unwanted scroll behavior when the hidden editor receives focus.
 *
 * @remarks
 * This flag is set by {@link PresentationEditor#wrapHiddenEditorFocus} to ensure
 * the wrapping is idempotent (applied only once per view instance).
 */
interface EditorViewWithScrollFlag {
  /** Flag indicating focus wrapping has been applied to prevent scroll on focus */
  __sdPreventScrollFocus?: boolean;
}

/**
 * Extended function type that may have a mock property, used to detect test mocks.
 *
 * @remarks
 * During testing, mocking libraries like Vitest often attach a `mock` property to
 * mocked functions. We check for this property to avoid wrapping already-mocked
 * focus functions, which could interfere with test assertions or cause test failures.
 */
interface PotentiallyMockedFunction {
  /** Property present on mocked functions in test environments */
  mock?: unknown;
}

/**
 * Discriminated union for all telemetry events.
 * Use TypeScript's type narrowing to handle each event type safely.
 */
export type TelemetryEvent =
  | { type: 'layout'; data: LayoutUpdatePayload }
  | { type: 'error'; data: LayoutError }
  | { type: 'remoteCursorsRender'; data: RemoteCursorsRenderPayload };

/**
 * PresentationEditor bootstraps the classic Editor instance in a hidden container
 * while layout-engine handles the visible rendering pipeline.
 */
export class PresentationEditor extends EventEmitter {
  // Static registry for managing instances globally
  static #instances = new Map<string, PresentationEditor>();

  /**
   * Fallback color palette for remote cursors when user.color is not provided.
   * Colors are deterministically assigned based on clientId to maintain consistency.
   * @private
   */
  static readonly FALLBACK_COLORS = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E2',
  ];

  /**
   * Constants for remote cursor rendering styles.
   * Centralized styling values for consistent cursor/label rendering across all methods.
   * @private
   */
  static readonly CURSOR_STYLES = {
    CARET_WIDTH: 2,
    LABEL_FONT_SIZE: 13,
    LABEL_PADDING: '2px 6px',
    LABEL_OFFSET: '-1.05em',
    SELECTION_BORDER_RADIUS: '2px',
    MAX_LABEL_LENGTH: 30,
  } as const;

  /**
   * Get a PresentationEditor instance by document ID.
   */
  static getInstance(documentId: string): PresentationEditor | undefined {
    return PresentationEditor.#instances.get(documentId);
  }

  /**
   * Set zoom globally across all PresentationEditor instances.
   */
  static setGlobalZoom(zoom: number): void {
    PresentationEditor.#instances.forEach((instance) => {
      instance.setZoom(zoom);
    });
  }

  #options: PresentationEditorOptions;
  #editor: Editor;
  #visibleHost: HTMLElement;
  #viewportHost: HTMLElement;
  #painterHost: HTMLElement;
  #selectionOverlay: HTMLElement;
  #permissionOverlay: HTMLElement | null = null;
  #hiddenHost: HTMLElement;
  #layoutOptions: LayoutEngineOptions;
  #layoutState: LayoutState = { blocks: [], measures: [], layout: null, bookmarks: new Map() };
  #domPainter: ReturnType<typeof createDomPainter> | null = null;
  #pageGeometryHelper: PageGeometryHelper | null = null;
  #dragHandlerCleanup: (() => void) | null = null;
  #layoutError: LayoutError | null = null;
  #layoutErrorState: 'healthy' | 'degraded' | 'failed' = 'healthy';
  #errorBanner: HTMLElement | null = null;
  #errorBannerMessage: HTMLElement | null = null;
  #telemetryEmitter: ((event: TelemetryEvent) => void) | null = null;
  #renderScheduled = false;
  #pendingDocChange = false;
  #pendingMapping: Mapping | null = null;
  #isRerendering = false;
  #selectionSync = new SelectionSyncCoordinator();
  #remoteCursorUpdateScheduled = false;
  #epochMapper = new EpochPositionMapper();
  #layoutEpoch = 0;
  #domPositionIndex = new DomPositionIndex();
  #domIndexObserverManager: DomPositionIndexObserverManager | null = null;
  #debugLastPointer: SelectionDebugHudState['lastPointer'] = null;
  #debugLastHit: SelectionDebugHudState['lastHit'] = null;
  #pendingMarginClick: PendingMarginClick | null = null;
  #rafHandle: number | null = null;
  #editorListeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];
  #sectionMetadata: SectionMetadata[] = [];
  #documentMode: 'editing' | 'viewing' | 'suggesting' = 'editing';
  #inputBridge: PresentationInputBridge | null = null;
  #trackedChangesMode: TrackedChangesMode = 'review';
  #trackedChangesEnabled = true;
  #trackedChangesOverrides: TrackedChangesOverrides | undefined;
  #headerFooterManager: HeaderFooterEditorManager | null = null;
  #headerFooterAdapter: HeaderFooterLayoutAdapter | null = null;
  #headerFooterIdentifier: HeaderFooterIdentifier | null = null;
  #multiSectionIdentifier: MultiSectionHeaderFooterIdentifier | null = null;
  #headerLayoutResults: HeaderFooterLayoutResult[] | null = null;
  #footerLayoutResults: HeaderFooterLayoutResult[] | null = null;
  // Per-rId layout results for multi-section support
  #headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> = new Map();
  #footerLayoutsByRId: Map<string, HeaderFooterLayoutResult> = new Map();
  #headerDecorationProvider: PageDecorationProvider | undefined;
  #footerDecorationProvider: PageDecorationProvider | undefined;
  #headerFooterManagerCleanups: Array<() => void> = [];
  #headerRegions: Map<number, HeaderFooterRegion> = new Map();
  #footerRegions: Map<number, HeaderFooterRegion> = new Map();
  #session: HeaderFooterSession = { mode: 'body' };
  #activeHeaderFooterEditor: Editor | null = null;
  #overlayManager: EditorOverlayManager | null = null;
  #hoverOverlay: HTMLElement | null = null;
  #hoverTooltip: HTMLElement | null = null;
  #modeBanner: HTMLElement | null = null;
  #ariaLiveRegion: HTMLElement | null = null;
  #a11ySelectionAnnounceTimeout: number | null = null;
  #a11yLastAnnouncedSelectionKey: string | null = null;
  #hoverRegion: HeaderFooterRegion | null = null;
  #clickCount = 0;
  #lastClickTime = 0;
  #lastClickPosition: { x: number; y: number } = { x: 0, y: 0 };
  #lastSelectedImageBlockId: string | null = null;

  // Drag selection state
  #dragAnchor: number | null = null;
  #dragAnchorPageIndex: number | null = null;
  #isDragging = false;
  #dragExtensionMode: 'char' | 'word' | 'para' = 'char';
  #dragLastPointer: SelectionDebugHudState['lastPointer'] = null;
  #dragLastRawHit: PositionHit | null = null;
  #dragUsedPageNotMountedFallback = false;
  #suppressFocusInFromDraggable = false;

  // Cell selection drag state
  // Tracks cell-specific context when drag starts in a table for multi-cell selection
  #cellAnchor: CellAnchorState | null = null;

  /** Cell drag mode state machine: 'none' = not in table, 'pending' = in table but haven't crossed cell boundary, 'active' = crossed cell boundary */
  #cellDragMode: 'none' | 'pending' | 'active' = 'none';

  // Remote cursor/presence state management
  /** Map of clientId -> normalized remote cursor state */
  #remoteCursorState: Map<number, RemoteCursorState> = new Map();
  /** Map of clientId -> DOM element for cursor (enables DOM reuse to prevent flicker) */
  #remoteCursorElements: Map<number, HTMLElement> = new Map();
  /** Flag indicating remote cursor state needs re-rendering (RAF batching) */
  #remoteCursorDirty = false;
  /** DOM element for rendering remote cursor overlays */
  #remoteCursorOverlay: HTMLElement | null = null;
  /** DOM element for rendering local selection/caret (dual-layer overlay architecture) */
  #localSelectionLayer: HTMLElement | null = null;
  /** Cleanup function for awareness subscription */
  #awarenessCleanup: (() => void) | null = null;
  /** Cleanup function for scroll listener (virtualization updates) */
  #scrollCleanup: (() => void) | null = null;
  /** Timeout handle for scroll debounce (instance-level tracking for proper cleanup) */
  #scrollTimeout: number | undefined = undefined;
  /** Timestamp of last remote cursor render for throttle-based immediate rendering */
  #lastRemoteCursorRenderTime = 0;
  /** Timeout handle for trailing edge of cursor throttle */
  #remoteCursorThrottleTimeout: number | null = null;

  constructor(options: PresentationEditorOptions) {
    super();

    if (!options?.element) {
      throw new Error('PresentationEditor requires an `element` to mount into.');
    }

    this.#options = options;
    this.#documentMode = options.documentMode ?? 'editing';
    this.#visibleHost = options.element;
    this.#visibleHost.innerHTML = '';
    this.#visibleHost.classList.add('presentation-editor');
    this.#syncDocumentModeClass();
    if (!this.#visibleHost.hasAttribute('tabindex')) {
      this.#visibleHost.tabIndex = 0;
    }
    const viewForPosition = this.#visibleHost.ownerDocument?.defaultView ?? window;
    if (viewForPosition.getComputedStyle(this.#visibleHost).position === 'static') {
      this.#visibleHost.style.position = 'relative';
    }
    const doc = this.#visibleHost.ownerDocument ?? document;

    // Validate and normalize presence options
    const rawPresence = options.layoutEngineOptions?.presence;
    const validatedPresence = rawPresence
      ? {
          ...rawPresence,
          // Clamp maxVisible to reasonable range [1, 100]
          maxVisible:
            rawPresence.maxVisible !== undefined
              ? Math.max(1, Math.min(rawPresence.maxVisible, 100))
              : rawPresence.maxVisible,
          // Clamp highlightOpacity to [0, 1]
          highlightOpacity:
            rawPresence.highlightOpacity !== undefined
              ? Math.max(0, Math.min(rawPresence.highlightOpacity, 1))
              : rawPresence.highlightOpacity,
        }
      : undefined;

    this.#layoutOptions = {
      pageSize: options.layoutEngineOptions?.pageSize ?? DEFAULT_PAGE_SIZE,
      margins: options.layoutEngineOptions?.margins ?? DEFAULT_MARGINS,
      virtualization: options.layoutEngineOptions?.virtualization,
      zoom: options.layoutEngineOptions?.zoom ?? 1,
      pageStyles: options.layoutEngineOptions?.pageStyles,
      debugLabel: options.layoutEngineOptions?.debugLabel,
      layoutMode: options.layoutEngineOptions?.layoutMode ?? 'vertical',
      trackedChanges: options.layoutEngineOptions?.trackedChanges,
      emitCommentPositionsInViewing: options.layoutEngineOptions?.emitCommentPositionsInViewing,
      enableCommentsInViewing: options.layoutEngineOptions?.enableCommentsInViewing,
      presence: validatedPresence,
    };
    this.#trackedChangesOverrides = options.layoutEngineOptions?.trackedChanges;

    this.#viewportHost = doc.createElement('div');
    this.#viewportHost.className = 'presentation-editor__viewport';
    // Hide the viewport from screen readers - it's a visual rendering layer, not semantic content.
    // The hidden ProseMirror editor (in #hiddenHost) provides the actual accessible document structure.
    // This prevents screen readers from encountering duplicate or non-semantic visual elements.
    this.#viewportHost.setAttribute('aria-hidden', 'true');
    this.#viewportHost.style.position = 'relative';
    this.#viewportHost.style.width = '100%';
    // Set min-height to at least one page so the viewport is clickable before layout renders
    const pageHeight = this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
    this.#viewportHost.style.minHeight = `${pageHeight}px`;
    this.#visibleHost.appendChild(this.#viewportHost);

    this.#painterHost = doc.createElement('div');
    this.#painterHost.className = 'presentation-editor__pages';
    this.#painterHost.style.transformOrigin = 'top left';
    this.#viewportHost.appendChild(this.#painterHost);
    const win = this.#visibleHost?.ownerDocument?.defaultView ?? window;
    this.#domIndexObserverManager = new DomPositionIndexObserverManager({
      windowRoot: win,
      getPainterHost: () => this.#painterHost,
      onRebuild: () => {
        this.#rebuildDomPositionIndex();
        this.#selectionSync.requestRender({ immediate: true });
      },
    });
    this.#domIndexObserverManager.setup();
    this.#selectionSync.on('render', () => this.#updateSelection());
    this.#selectionSync.on('render', () => this.#updatePermissionOverlay());

    this.#permissionOverlay = doc.createElement('div');
    this.#permissionOverlay.className = 'presentation-editor__permission-overlay';
    Object.assign(this.#permissionOverlay.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '5',
    });
    this.#viewportHost.appendChild(this.#permissionOverlay);

    // Create dual-layer overlay structure
    // Container holds both remote (below) and local (above) layers
    this.#selectionOverlay = doc.createElement('div');
    this.#selectionOverlay.className = 'presentation-editor__selection-overlay';
    this.#selectionOverlay.id = `presentation-overlay-${options.documentId || 'default'}`;
    this.#selectionOverlay.style.position = 'absolute';
    this.#selectionOverlay.style.inset = '0';
    this.#selectionOverlay.style.pointerEvents = 'none';
    this.#selectionOverlay.style.zIndex = '10';

    // Create remote layer (renders below local)
    this.#remoteCursorOverlay = doc.createElement('div');
    this.#remoteCursorOverlay.className = 'presentation-editor__selection-layer--remote';
    this.#remoteCursorOverlay.style.position = 'absolute';
    this.#remoteCursorOverlay.style.inset = '0';
    this.#remoteCursorOverlay.style.pointerEvents = 'none';

    // Create local layer (renders above remote)
    this.#localSelectionLayer = doc.createElement('div');
    this.#localSelectionLayer.className = 'presentation-editor__selection-layer--local';
    this.#localSelectionLayer.style.position = 'absolute';
    this.#localSelectionLayer.style.inset = '0';
    this.#localSelectionLayer.style.pointerEvents = 'none';

    // Append layers in correct z-index order (remote first, local second)
    this.#selectionOverlay.appendChild(this.#remoteCursorOverlay);
    this.#selectionOverlay.appendChild(this.#localSelectionLayer);
    this.#viewportHost.appendChild(this.#selectionOverlay);
    this.#hoverOverlay = doc.createElement('div');
    this.#hoverOverlay.className = 'presentation-editor__hover-overlay';
    Object.assign(this.#hoverOverlay.style, {
      position: 'absolute',
      border: '1px dashed rgba(51, 102, 255, 0.8)',
      borderRadius: '2px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '11',
    });
    this.#selectionOverlay.appendChild(this.#hoverOverlay);

    this.#hoverTooltip = doc.createElement('div');
    this.#hoverTooltip.className = 'presentation-editor__hover-tooltip';
    Object.assign(this.#hoverTooltip.style, {
      position: 'absolute',
      background: 'rgba(18, 22, 33, 0.85)',
      color: '#fff',
      padding: '2px 6px',
      fontSize: '12px',
      borderRadius: '2px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '12',
      whiteSpace: 'nowrap',
    });
    this.#selectionOverlay.appendChild(this.#hoverTooltip);

    this.#modeBanner = doc.createElement('div');
    this.#modeBanner.className = 'presentation-editor__mode-banner';
    Object.assign(this.#modeBanner.style, {
      position: 'absolute',
      top: '0',
      left: '50%',
      transform: 'translate(-50%, -100%)',
      background: '#1b3fbf',
      color: '#fff',
      padding: '4px 12px',
      borderRadius: '6px',
      fontSize: '13px',
      display: 'none',
      zIndex: '15',
    });
    this.#visibleHost.appendChild(this.#modeBanner);

    this.#ariaLiveRegion = doc.createElement('div');
    this.#ariaLiveRegion.className = 'presentation-editor__aria-live';
    this.#ariaLiveRegion.setAttribute('role', 'status');
    this.#ariaLiveRegion.setAttribute('aria-live', 'polite');
    this.#ariaLiveRegion.setAttribute('aria-atomic', 'true');
    Object.assign(this.#ariaLiveRegion.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(1px, 1px, 1px, 1px)',
    });
    this.#visibleHost.appendChild(this.#ariaLiveRegion);

    this.#hiddenHost = createHiddenHost(doc, this.#layoutOptions.pageSize?.w ?? DEFAULT_PAGE_SIZE.w);
    if (doc.body) {
      doc.body.appendChild(this.#hiddenHost);
    } else {
      this.#visibleHost.appendChild(this.#hiddenHost);
    }

    const { layoutEngineOptions: _layoutEngineOptions, element: _element, ...editorOptions } = options;
    const normalizedEditorProps = {
      ...(editorOptions.editorProps ?? {}),
      editable: () => {
        // Hidden editor respects documentMode for plugin compatibility,
        // but permission ranges may temporarily re-enable editing.
        return !this.#isViewLocked();
      },
    };
    try {
      this.#editor = new Editor({
        ...(editorOptions as ConstructorParameters<typeof Editor>[0]),
        element: this.#hiddenHost,
        editorProps: normalizedEditorProps,
        documentMode: this.#documentMode,
      });
      this.#wrapHiddenEditorFocus();
      // Set bidirectional reference for renderer-neutral helpers
      // Type assertion is safe here as we control both Editor and PresentationEditor
      (this.#editor as Editor & { presentationEditor?: PresentationEditor | null }).presentationEditor = this;
      // Add reference back to PresentationEditor for event handler detection
      (this.#editor as Editor & { _presentationEditor?: PresentationEditor })._presentationEditor = this;
      this.#syncHiddenEditorA11yAttributes();
      if (typeof this.#options.disableContextMenu === 'boolean') {
        this.setContextMenuDisabled(this.#options.disableContextMenu);
      }

      this.#initHeaderFooterRegistry();
      this.#applyZoom();
      this.#setupEditorListeners();
      this.#setupPointerHandlers();
      this.#setupDragHandlers();
      this.#setupInputBridge();
      this.#syncTrackedChangesPreferences();

      // Register this instance in the static registry
      if (options.documentId) {
        PresentationEditor.#instances.set(options.documentId, this);
      }

      this.#pendingDocChange = true;
      this.#scheduleRerender();

      // Check if collaboration is already ready and setup cursors immediately
      // Handles race condition where collaborationReady fires before event listener is attached
      if (this.#options.collaborationProvider?.awareness) {
        const ystate = ySyncPluginKey.getState(this.#editor.state);
        if (ystate && this.#layoutOptions.presence?.enabled !== false) {
          this.#setupCollaborationCursors();
        }
      }
    } catch (error) {
      // Ensure cleanup on initialization failure
      this.destroy();
      throw error;
    }
  }

  /**
   * Wraps the hidden editor's focus method to prevent unwanted scrolling when it receives focus.
   *
   * The hidden ProseMirror editor is positioned off-screen but must remain focusable for
   * accessibility. When it receives focus, browsers may attempt to scroll it into view,
   * disrupting the user's viewport position. This method wraps the view's focus function
   * to prevent that scroll behavior using multiple fallback strategies.
   *
   * @remarks
   * **Why this exists:**
   * - The hidden editor provides semantic document structure for screen readers
   * - It must be focusable, but is positioned off-screen with `left: -9999px`
   * - Some browsers scroll to bring focused elements into view, breaking the user experience
   * - This wrapper prevents that scroll while maintaining focus behavior
   *
   * **Fallback strategies (in order):**
   * 1. Try `view.dom.focus({ preventScroll: true })` - the standard approach
   * 2. If that fails, try `view.dom.focus()` without options and restore scroll position
   * 3. If both fail, call the original ProseMirror focus method as last resort
   * 4. Always restore scroll position if it changed during any focus attempt
   *
   * **Idempotency:**
   * - Safe to call multiple times - checks `__sdPreventScrollFocus` flag to avoid re-wrapping
   * - The flag is set on the view object after first successful wrap
   *
   * **Test awareness:**
   * - Skips wrapping if the focus function has a `mock` property (Vitest/Jest mocks)
   * - Prevents interference with test assertions and mock function tracking
   */
  #wrapHiddenEditorFocus(): void {
    const view = this.#editor?.view;
    if (!view || !view.dom || typeof view.focus !== 'function') {
      return;
    }

    // Check if we've already wrapped this view's focus method (idempotency)
    const viewWithFlag = view as typeof view & EditorViewWithScrollFlag;
    if (viewWithFlag.__sdPreventScrollFocus) {
      return;
    }

    // Skip wrapping mocked functions in test environments
    const focusFn = view.focus as typeof view.focus & PotentiallyMockedFunction;
    if (focusFn.mock) {
      return;
    }

    // Mark this view as wrapped to prevent re-wrapping
    viewWithFlag.__sdPreventScrollFocus = true;

    // Save the original focus method
    const originalFocus = view.focus.bind(view);

    // Replace with our scroll-preventing wrapper
    view.focus = () => {
      // Get window context from the visible host's document
      // Do NOT fall back to global window - if there's no document context, we can't
      // reliably prevent scroll, so just call originalFocus and let it handle focus
      const win = this.#visibleHost.ownerDocument?.defaultView;
      if (!win) {
        originalFocus();
        return;
      }

      const beforeX = win.scrollX;
      const beforeY = win.scrollY;
      let focused = false;

      // Strategy 1: Try focus with preventScroll option (modern browsers)
      try {
        view.dom.focus({ preventScroll: true });
        focused = true;
      } catch (error) {
        debugLog('warn', 'Hidden editor focus: preventScroll failed', {
          error: String(error),
          strategy: 'preventScroll',
        });
      }

      // Strategy 2: Fall back to focus without options
      if (!focused) {
        try {
          view.dom.focus();
          focused = true;
        } catch (error) {
          debugLog('warn', 'Hidden editor focus: standard focus failed', {
            error: String(error),
            strategy: 'standard',
          });
        }
      }

      // Strategy 3: Last resort - call original ProseMirror focus
      if (!focused) {
        try {
          originalFocus();
        } catch (error) {
          debugLog('error', 'Hidden editor focus: all strategies failed', {
            error: String(error),
            strategy: 'original',
          });
        }
      }

      // Restore scroll position if any focus attempt changed it
      if (win.scrollX !== beforeX || win.scrollY !== beforeY) {
        win.scrollTo(beforeX, beforeY);
      }
    };
  }

  /**
   * Accessor for the underlying Editor so SuperDoc can reuse existing APIs.
   */
  get editor(): Editor {
    return this.#editor;
  }

  /**
   * Expose the visible host element for renderer-agnostic consumers.
   */
  get element(): HTMLElement {
    return this.#visibleHost;
  }

  /**
   * Get the commands interface for the currently active editor (header/footer-aware).
   *
   * This property dynamically routes command execution to the appropriate editor instance:
   * - In body mode, returns the main editor's commands
   * - In header/footer mode, returns the active header/footer editor's commands
   *
   * This ensures that formatting commands (bold, italic, etc.) and other operations
   * execute in the correct editing context.
   *
   * @returns The CommandService instance for the active editor
   *
   * @example
   * ```typescript
   * // This will bold text in the active editor (body or header/footer)
   * presentationEditor.commands.bold();
   * ```
   */
  get commands() {
    const activeEditor = this.getActiveEditor();
    return activeEditor.commands;
  }

  /**
   * Get the ProseMirror editor state for the currently active editor (header/footer-aware).
   *
   * This property dynamically returns the state from the appropriate editor instance:
   * - In body mode, returns the main editor's state
   * - In header/footer mode, returns the active header/footer editor's state
   *
   * This enables components like SlashMenu and context menus to access document
   * state, selection, and schema information in the correct editing context.
   *
   * @returns The EditorState for the active editor
   *
   * @example
   * ```typescript
   * const { selection, doc } = presentationEditor.state;
   * const selectedText = doc.textBetween(selection.from, selection.to);
   * ```
   */
  get state(): EditorState {
    return this.getActiveEditor().state;
  }

  /**
   * Check if the editor is currently editable (header/footer-aware).
   *
   * This property checks the editable state of the currently active editor:
   * - In body mode, returns whether the main editor is editable
   * - In header/footer mode, returns whether the header/footer editor is editable
   *
   * The editor may be non-editable due to:
   * - Document mode set to 'viewing'
   * - Explicit `editable: false` option
   * - Editor not fully initialized
   *
   * @returns true if the active editor accepts input, false otherwise
   *
   * @example
   * ```typescript
   * if (presentationEditor.isEditable) {
   *   presentationEditor.commands.insertText('Hello');
   * }
   * ```
   */
  get isEditable(): boolean {
    return this.getActiveEditor().isEditable;
  }

  /**
   * Get the editor options for the currently active editor (header/footer-aware).
   *
   * This property returns the options object from the appropriate editor instance,
   * providing access to configuration like document mode, AI settings, and custom
   * slash menu configuration.
   *
   * @returns The options object for the active editor
   *
   * @example
   * ```typescript
   * const { documentMode, isAiEnabled } = presentationEditor.options;
   * ```
   */
  get options() {
    return this.getActiveEditor().options;
  }

  /**
   * Dispatch a ProseMirror transaction to the currently active editor (header/footer-aware).
   *
   * This method routes transactions to the appropriate editor instance:
   * - In body mode, dispatches to the main editor
   * - In header/footer mode, dispatches to the active header/footer editor
   *
   * Use this for direct state manipulation when commands are insufficient.
   * For most use cases, prefer using `commands` or `dispatchInActiveEditor`.
   *
   * @param tr - The ProseMirror transaction to dispatch
   *
   * @example
   * ```typescript
   * const { state } = presentationEditor;
   * const tr = state.tr.insertText('Hello', state.selection.from);
   * presentationEditor.dispatch(tr);
   * ```
   */
  dispatch(tr: Transaction): void {
    const activeEditor = this.getActiveEditor();
    activeEditor.view?.dispatch(tr);
  }

  /**
   * Focus the editor, routing focus to the appropriate editing surface.
   *
   * In PresentationEditor, the actual ProseMirror EditorView is hidden and input
   * is bridged from the visible layout surface. This method focuses the hidden
   * editor view to enable keyboard input while the visual focus remains on the
   * rendered presentation.
   *
   * @example
   * ```typescript
   * // After closing a modal, restore focus to the editor
   * presentationEditor.focus();
   * ```
   */
  focus(): void {
    const activeEditor = this.getActiveEditor();
    activeEditor.view?.focus();
  }

  /**
   * Returns the currently active editor (body or header/footer session).
   *
   * When editing headers or footers, this returns the header/footer editor instance.
   * Otherwise, returns the main document body editor.
   *
   * @returns The active Editor instance
   *
   * @example
   * ```typescript
   * const editor = presentation.getActiveEditor();
   * const selection = editor.state.selection;
   * ```
   */
  getActiveEditor(): Editor {
    if (this.#session.mode === 'body' || !this.#activeHeaderFooterEditor) {
      return this.#editor;
    }
    return this.#activeHeaderFooterEditor;
  }

  /**
   * Undo the last action in the active editor.
   */
  undo(): boolean {
    const editor = this.getActiveEditor();
    if (editor?.commands?.undo) {
      return Boolean(editor.commands.undo());
    }
    return false;
  }

  /**
   * Redo the last undone action in the active editor.
   */
  redo(): boolean {
    const editor = this.getActiveEditor();
    if (editor?.commands?.redo) {
      return Boolean(editor.commands.redo());
    }
    return false;
  }

  /**
   * Runs a callback against the active editor (body or header/footer session).
   *
   * Use this method when you need to run commands or access state in the currently
   * active editing context (which may be the body or a header/footer region).
   *
   * @param callback - Function that receives the active editor instance
   *
   * @example
   * ```typescript
   * presentation.dispatchInActiveEditor((editor) => {
   *   editor.commands.insertText('Hello world');
   * });
   * ```
   */
  dispatchInActiveEditor(callback: (editor: Editor) => void) {
    const editor = this.getActiveEditor();
    callback(editor);
  }

  /**
   * Alias for the visible host container so callers can attach listeners explicitly.
   *
   * This is the main scrollable container that hosts the rendered pages.
   * Use this element to attach scroll listeners, measure viewport bounds, or
   * position floating UI elements relative to the editor.
   *
   * @returns The visible host HTMLElement
   *
   * @example
   * ```typescript
   * const host = presentation.visibleHost;
   * host.addEventListener('scroll', () => console.log('Scrolled!'));
   * ```
   */
  get visibleHost(): HTMLElement {
    return this.#visibleHost;
  }

  /**
   * Selection overlay element used for caret + highlight rendering.
   *
   * This overlay is positioned absolutely over the rendered pages and contains
   * the visual selection indicators (caret, selection highlights, remote cursors).
   *
   * @returns The selection overlay element, or null if not yet initialized
   *
   * @example
   * ```typescript
   * const overlay = presentation.overlayElement;
   * if (overlay) {
   *   console.log('Overlay dimensions:', overlay.getBoundingClientRect());
   * }
   * ```
   */
  get overlayElement(): HTMLElement | null {
    return this.#selectionOverlay ?? null;
  }

  /**
   * Get the current zoom level.
   *
   * The zoom level is a multiplier that controls the visual scale of the document.
   * Zoom is applied via CSS transform: scale() on the content elements (#painterHost
   * and #selectionOverlay), with the viewport dimensions (#viewportHost) set to the
   * scaled size to ensure proper scroll behavior.
   *
   * Relationship to Centralized Zoom Architecture:
   * - PresentationEditor is the SINGLE SOURCE OF TRUTH for zoom state
   * - Zoom is applied internally via transform: scale() on #painterHost and #selectionOverlay
   * - The #viewportHost dimensions are set to scaled values for proper scroll container behavior
   * - External components (toolbar, UI controls) should use setZoom() to modify zoom
   * - The zoom value is used throughout the system for coordinate transformations
   *
   * Coordinate Space Implications:
   * - Layout coordinates: Unscaled logical pixels used by the layout engine
   * - Screen coordinates: Physical pixels affected by CSS transform: scale()
   * - Conversion: screenCoord = layoutCoord * zoom
   *
   * Zoom Scale:
   * - 1 = 100% (default, no scaling)
   * - 0.5 = 50% (zoomed out, content appears smaller)
   * - 2 = 200% (zoomed in, content appears larger)
   *
   * @returns The current zoom level multiplier (default: 1 if not configured)
   *
   * @example
   * ```typescript
   * const zoom = presentation.zoom;
   * // Convert layout coordinates to screen coordinates
   * const screenX = layoutX * zoom;
   * const screenY = layoutY * zoom;
   *
   * // Convert screen coordinates back to layout coordinates
   * const layoutX = screenX / zoom;
   * const layoutY = screenY / zoom;
   * ```
   */
  get zoom(): number {
    return this.#layoutOptions.zoom ?? 1;
  }

  /**
   * Set the document mode and update editor editability.
   *
   * This method updates both the PresentationEditor's internal mode state and the
   * underlying Editor's document mode. The hidden editor's editable state will
   * reflect the mode for plugin compatibility (editable in 'editing' and 'suggesting'
   * modes, non-editable in 'viewing' mode), while the presentation layer remains
   * visually inert (handled by hidden container CSS).
   *
   * @param mode - The document mode to set. Valid values:
   *   - 'editing': Full editing capabilities, no tracked changes
   *   - 'suggesting': Editing with tracked changes enabled
   *   - 'viewing': Read-only mode, shows original content without changes
   * @throws {TypeError} If mode is not a string or is not one of the valid modes
   *
   * @example
   * ```typescript
   * const presentation = PresentationEditor.getInstance('doc-123');
   * presentation.setDocumentMode('viewing'); // Switch to read-only
   * ```
   */
  setDocumentMode(mode: 'editing' | 'viewing' | 'suggesting') {
    if (typeof mode !== 'string') {
      throw new TypeError(`[PresentationEditor] setDocumentMode expects a string, received ${typeof mode}`);
    }
    const validModes: Array<'editing' | 'viewing' | 'suggesting'> = ['editing', 'viewing', 'suggesting'];
    if (!validModes.includes(mode)) {
      throw new TypeError(`[PresentationEditor] Invalid mode "${mode}". Must be one of: ${validModes.join(', ')}`);
    }
    const modeChanged = this.#documentMode !== mode;
    this.#documentMode = mode;
    this.#editor.setDocumentMode(mode);
    this.#syncDocumentModeClass();
    this.#syncHiddenEditorA11yAttributes();
    const trackedChangesChanged = this.#syncTrackedChangesPreferences();
    // Re-render if mode changed OR tracked changes preferences changed.
    // Mode change affects enableComments in toFlowBlocks even if tracked changes didn't change.
    if (modeChanged || trackedChangesChanged) {
      this.#pendingDocChange = true;
      this.#scheduleRerender();
    }
    this.#updatePermissionOverlay();
  }

  #syncDocumentModeClass() {
    if (!this.#visibleHost) return;
    this.#visibleHost.classList.toggle('presentation-editor--viewing', this.#documentMode === 'viewing');
  }

  /**
   * Override tracked-changes rendering preferences—for hosts without plugin state
   * or when forcing a specific viewing mode (e.g., PDF preview).
   *
   * @param overrides - Tracked changes overrides object with optional 'mode' and 'enabled' fields
   * @throws {TypeError} If overrides is provided but is not a plain object
   */
  setTrackedChangesOverrides(overrides?: TrackedChangesOverrides) {
    if (overrides !== undefined && (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides))) {
      throw new TypeError('[PresentationEditor] setTrackedChangesOverrides expects an object or undefined');
    }
    if (overrides !== undefined) {
      const validModes = ['review', 'original', 'final', 'off'];
      if (overrides.mode !== undefined && !validModes.includes(overrides.mode as string)) {
        throw new TypeError(
          `[PresentationEditor] Invalid tracked changes mode "${overrides.mode}". Must be one of: ${validModes.join(', ')}`,
        );
      }
      if (overrides.enabled !== undefined && typeof overrides.enabled !== 'boolean') {
        throw new TypeError('[PresentationEditor] tracked changes "enabled" must be a boolean');
      }
    }
    this.#trackedChangesOverrides = overrides;
    this.#layoutOptions.trackedChanges = overrides;
    const trackedChangesChanged = this.#syncTrackedChangesPreferences();
    if (trackedChangesChanged) {
      this.#pendingDocChange = true;
      this.#scheduleRerender();
    }
  }

  /**
   * Update viewing-mode comment rendering behavior and re-render if needed.
   *
   * @param options - Viewing mode comment options.
   */
  setViewingCommentOptions(
    options: { emitCommentPositionsInViewing?: boolean; enableCommentsInViewing?: boolean } = {},
  ) {
    if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
      throw new TypeError('[PresentationEditor] setViewingCommentOptions expects an object or undefined');
    }

    let hasChanges = false;

    if (typeof options.emitCommentPositionsInViewing === 'boolean') {
      if (this.#layoutOptions.emitCommentPositionsInViewing !== options.emitCommentPositionsInViewing) {
        this.#layoutOptions.emitCommentPositionsInViewing = options.emitCommentPositionsInViewing;
        hasChanges = true;
      }
    }

    if (typeof options.enableCommentsInViewing === 'boolean') {
      if (this.#layoutOptions.enableCommentsInViewing !== options.enableCommentsInViewing) {
        this.#layoutOptions.enableCommentsInViewing = options.enableCommentsInViewing;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.#pendingDocChange = true;
      this.#scheduleRerender();
    }
  }

  /**
   * Toggle the custom context menu at runtime to respect host-level guardrails.
   */
  setContextMenuDisabled(disabled: boolean) {
    this.#editor.setOptions({ disableContextMenu: Boolean(disabled) });
  }

  /**
   * Subscribe to layout update events. Returns an unsubscribe function.
   */
  onLayoutUpdated(handler: (payload: LayoutState & { layout: Layout; metrics?: LayoutMetrics }) => void) {
    this.on('layoutUpdated', handler);
    return () => this.off('layoutUpdated', handler);
  }

  /**
   * Subscribe to layout error events. Returns an unsubscribe function.
   */
  onLayoutError(handler: (error: LayoutError) => void) {
    this.on('layoutError', handler);
    return () => this.off('layoutError', handler);
  }

  /**
   * Attach a telemetry listener to capture layout events/errors.
   * Uses type-safe discriminated union for event handling.
   *
   * @param handler - Callback function receiving telemetry events
   * @returns Unsubscribe function to remove the handler
   *
   * @example
   * ```typescript
   * const unsubscribe = editor.onTelemetry((event) => {
   *   if (event.type === 'remoteCursorsRender') {
   *     console.log(`Rendered ${event.data.visibleCount} cursors in ${event.data.renderTimeMs}ms`);
   *   }
   * });
   * ```
   */
  onTelemetry(handler: (event: TelemetryEvent) => void) {
    this.#telemetryEmitter = handler;
    return () => {
      if (this.#telemetryEmitter === handler) {
        this.#telemetryEmitter = null;
      }
    };
  }

  /**
   * Surface pages for pagination UI consumers.
   */
  getPages() {
    return this.#layoutState.layout?.pages ?? [];
  }

  /**
   * Surface the most recent layout error (if any).
   */
  getLayoutError(): LayoutError | null {
    return this.#layoutError;
  }

  /**
   * Returns the current health status of the layout engine.
   *
   * @returns Layout health status:
   *   - 'healthy': No errors, layout is functioning normally
   *   - 'degraded': Recovered from errors but may have stale state
   *   - 'failed': Critical error, layout cannot render
   *
   * @example
   * ```typescript
   * const editor = PresentationEditor.getInstance('doc-123');
   * if (!editor.isLayoutHealthy()) {
   *   console.error('Layout is unhealthy:', editor.getLayoutError());
   * }
   * ```
   */
  isLayoutHealthy(): boolean {
    return this.#layoutErrorState === 'healthy';
  }

  /**
   * Returns the detailed layout health state.
   *
   * @returns One of: 'healthy', 'degraded', 'failed'
   */
  getLayoutHealthState(): 'healthy' | 'degraded' | 'failed' {
    return this.#layoutErrorState;
  }

  /**
   * Return layout-relative rects for the current document selection.
   */
  getSelectionRects(relativeTo?: HTMLElement): RangeRect[] {
    const selection = this.#editor.state?.selection;
    if (!selection || selection.empty) return [];
    return this.getRangeRects(selection.from, selection.to, relativeTo);
  }

  /**
   * Convert an arbitrary document range into layout-based bounding rects.
   *
   * @param from - Start position in the ProseMirror document
   * @param to - End position in the ProseMirror document
   * @param relativeTo - Optional HTMLElement for coordinate reference. If provided, returns coordinates
   *                     relative to this element's bounding rect. If omitted, returns absolute viewport
   *                     coordinates relative to the selection overlay.
   * @returns Array of rects, each containing pageIndex and position data (left, top, right, bottom, width, height)
   */
  getRangeRects(from: number, to: number, relativeTo?: HTMLElement): RangeRect[] {
    if (!this.#selectionOverlay) return [];
    if (!Number.isFinite(from) || !Number.isFinite(to)) return [];

    const start = Math.min(from, to);
    const end = Math.max(from, to);
    // Use effective zoom from actual rendered dimensions, not internal state.
    // Zoom may be applied externally (e.g., by SuperDoc toolbar) without
    // updating PresentationEditor's internal zoom value.
    const zoom = this.#layoutOptions.zoom ?? 1;
    const relativeRect = relativeTo?.getBoundingClientRect() ?? null;
    const containerRect = this.#visibleHost.getBoundingClientRect();
    const scrollLeft = this.#visibleHost.scrollLeft ?? 0;
    const scrollTop = this.#visibleHost.scrollTop ?? 0;

    let usedDomRects = false;
    const layoutRectSource = () => {
      if (this.#session.mode !== 'body') {
        return this.#computeHeaderFooterSelectionRects(start, end);
      }
      const domRects = this.#computeSelectionRectsFromDom(start, end);
      if (domRects != null) {
        usedDomRects = true;
        return domRects;
      }
      if (!this.#layoutState.layout) return [];
      const rects =
        selectionToRects(
          this.#layoutState.layout,
          this.#layoutState.blocks,
          this.#layoutState.measures,
          start,
          end,
          this.#pageGeometryHelper ?? undefined,
        ) ?? [];
      return rects;
    };

    const rawRects = layoutRectSource();
    if (!rawRects.length) return [];

    let domCaretStart: { pageIndex: number; x: number; y: number } | null = null;
    let domCaretEnd: { pageIndex: number; x: number; y: number } | null = null;
    const pageDelta: Record<number, { dx: number; dy: number }> = {};
    if (!usedDomRects) {
      // Geometry fallback path: apply a small DOM-based delta to reduce drift.
      try {
        domCaretStart = this.#computeDomCaretPageLocal(start);
        domCaretEnd = this.#computeDomCaretPageLocal(end);
      } catch (error) {
        // DOM operations can throw exceptions - fall back to geometry-only positioning
        if (process.env.NODE_ENV === 'development') {
          console.warn('[PresentationEditor] DOM caret computation failed in getRectsForRange:', error);
        }
      }
      const layoutCaretStart = this.#computeCaretLayoutRectGeometry(start, false);
      if (domCaretStart && layoutCaretStart && domCaretStart.pageIndex === layoutCaretStart.pageIndex) {
        pageDelta[domCaretStart.pageIndex] = {
          dx: domCaretStart.x - layoutCaretStart.x,
          dy: domCaretStart.y - layoutCaretStart.y,
        };
      }
    }

    // Fix Issue #1: Get actual header/footer page height instead of hardcoded 1
    // When in header/footer mode, we need to use the real page height from the layout context
    // to correctly map coordinates for selection highlighting
    const pageHeight = this.#session.mode === 'body' ? this.#getBodyPageHeight() : this.#getHeaderFooterPageHeight();
    const pageGap = this.#layoutState.layout?.pageGap ?? 0;
    const finalRects = rawRects
      .map((rect: LayoutRect, idx: number, allRects: LayoutRect[]) => {
        let adjustedX = rect.x;
        let adjustedY = rect.y;
        if (!usedDomRects) {
          const delta = pageDelta[rect.pageIndex];
          adjustedX = delta ? rect.x + delta.dx : rect.x;
          adjustedY = delta ? rect.y + delta.dy : rect.y;

          // If we have DOM caret positions, override start/end rect edges for tighter alignment
          const isFirstRect = idx === 0;
          const isLastRect = idx === allRects.length - 1;
          if (isFirstRect && domCaretStart && rect.pageIndex === domCaretStart.pageIndex) {
            adjustedX = domCaretStart.x;
          }
          if (isLastRect && domCaretEnd && rect.pageIndex === domCaretEnd.pageIndex) {
            const endX = domCaretEnd.x;
            const newWidth = Math.max(1, endX - adjustedX);
            // Temporarily stash width override by updating rect.width for downstream calculations
            rect = { ...rect, width: newWidth };
          }
        }

        const pageLocalY = adjustedY - rect.pageIndex * (pageHeight + pageGap);
        const coords = this.#convertPageLocalToOverlayCoords(rect.pageIndex, adjustedX, pageLocalY);
        if (!coords) return null;
        // coords are in layout space; convert to viewport coordinates using scroll + zoom
        const absLeft = coords.x * zoom - scrollLeft + containerRect.left;
        const absTop = coords.y * zoom - scrollTop + containerRect.top;
        const left = relativeRect ? absLeft - relativeRect.left : absLeft;
        const top = relativeRect ? absTop - relativeRect.top : absTop;
        const width = Math.max(1, rect.width * zoom);
        const height = Math.max(1, rect.height * zoom);
        return {
          pageIndex: rect.pageIndex,
          left,
          top,
          right: left + width,
          bottom: top + height,
          width,
          height,
        };
      })
      .filter((rect: RangeRect | null): rect is RangeRect => Boolean(rect));

    return finalRects;
  }

  /**
   * Get selection bounds for a document range with aggregated bounding box.
   * Returns null if layout is unavailable or the range is invalid.
   *
   * @param from - Start position in the ProseMirror document
   * @param to - End position in the ProseMirror document
   * @param relativeTo - Optional HTMLElement to use as coordinate reference. If provided, returns coordinates
   *                     relative to this element's bounding rect (client coordinates). If omitted, returns
   *                     absolute viewport coordinates (relative to the selection overlay).
   * @returns Object containing aggregated bounds, individual rects, and pageIndex, or null if unavailable
   */
  getSelectionBounds(
    from: number,
    to: number,
    relativeTo?: HTMLElement,
  ): {
    bounds: { top: number; left: number; bottom: number; right: number; width: number; height: number };
    rects: RangeRect[];
    pageIndex: number;
  } | null {
    if (!this.#layoutState.layout) return null;
    const rects = this.getRangeRects(from, to, relativeTo);
    if (!rects.length) return null;
    const bounds = this.#aggregateLayoutBounds(rects);
    if (!bounds) return null;
    return {
      rects,
      bounds,
      pageIndex: rects[0]?.pageIndex ?? 0,
    };
  }

  /**
   * Remap comment positions to layout coordinates with bounds and rects.
   * Takes a positions object with threadIds as keys and position data as values.
   * Returns the same structure with added bounds, rects, and pageIndex for each comment.
   *
   * PERFORMANCE NOTE: This iterates all comment positions on every call. For documents with many comments
   * (>100), consider caching layout bounds per comment and invalidating on layout updates.
   *
   * @param positions - Map of threadId -> { start?, end?, pos?, ...otherFields }
   * @param relativeTo - Optional HTMLElement for coordinate reference
   * @returns Updated positions map with bounds, rects, and pageIndex added to each comment
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
      bounds?: unknown;
      rects?: unknown;
      pageIndex?: number;
      [key: string]: unknown;
    }
  > {
    if (!positions || typeof positions !== 'object') return positions;
    if (!this.#layoutState.layout) return positions;

    const entries = Object.entries(positions);
    if (!entries.length) return positions;

    let hasUpdates = false;
    const remapped: Record<
      string,
      {
        start?: number;
        end?: number;
        pos?: number;
        bounds?: unknown;
        rects?: unknown;
        pageIndex?: number;
        [key: string]: unknown;
      }
    > = {};

    entries.forEach(([threadId, data]) => {
      if (!data) {
        remapped[threadId] = data;
        return;
      }
      const start = data.start ?? data.pos;
      const end = data.end ?? start;
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        remapped[threadId] = data;
        return;
      }

      const layoutRange = this.getSelectionBounds(start!, end!, relativeTo);
      if (!layoutRange) {
        remapped[threadId] = data;
        return;
      }

      hasUpdates = true;
      remapped[threadId] = {
        ...data,
        bounds: layoutRange.bounds,
        rects: layoutRange.rects,
        pageIndex: layoutRange.pageIndex,
      };
    });

    return hasUpdates ? remapped : positions;
  }

  /**
   * Collect all comment and tracked change positions from the PM document.
   *
   * This is the authoritative source for PM positions - called after every
   * layout update to ensure positions are always fresh from the current document.
   *
   * The returned positions contain PM offsets (start, end) which can be passed
   * to getCommentBounds() to compute visual layout coordinates.
   *
   * @returns Map of threadId -> { threadId, start, end }
   */
  #collectCommentPositions(): Record<string, { threadId: string; start: number; end: number }> {
    return collectCommentPositionsFromHelper(this.#editor?.state?.doc ?? null, {
      commentMarkName: CommentMarkName,
      trackChangeMarkNames: [TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName],
    });
  }

  /**
   * Return a snapshot of the latest layout state.
   */
  getLayoutSnapshot(): {
    layout: Layout | null;
    blocks: FlowBlock[];
    measures: Measure[];
    sectionMetadata: SectionMetadata[];
  } {
    return {
      layout: this.#layoutState.layout,
      blocks: this.#layoutState.blocks,
      measures: this.#layoutState.measures,
      sectionMetadata: this.#sectionMetadata,
    };
  }

  /**
   * Expose the current layout engine options.
   */
  getLayoutOptions(): LayoutEngineOptions {
    return { ...this.#layoutOptions };
  }

  /**
   * Get the page styles for the section containing the current caret position.
   *
   * In multi-section documents, different sections can have different page sizes,
   * margins, and orientations. This method returns the styles for the section
   * where the caret is currently located, enabling section-aware UI components
   * like rulers to display accurate information.
   *
   * @returns Object containing:
   *   - pageSize: { width, height } in inches
   *   - pageMargins: { left, right, top, bottom } in inches
   *   - sectionIndex: The current section index (0-based)
   *   - orientation: 'portrait' or 'landscape'
   *
   * Falls back to document-level defaults if section info is unavailable.
   *
   * @example
   * ```typescript
   * const sectionStyles = presentation.getCurrentSectionPageStyles();
   * console.log(`Section ${sectionStyles.sectionIndex}: ${sectionStyles.pageSize.width}" x ${sectionStyles.pageSize.height}"`);
   * ```
   */
  getCurrentSectionPageStyles(): {
    pageSize: { width: number; height: number };
    pageMargins: { left: number; right: number; top: number; bottom: number };
    sectionIndex: number;
    orientation: 'portrait' | 'landscape';
  } {
    return getCurrentSectionPageStylesFromHelper(
      this.#layoutState.layout,
      this.#getCurrentPageIndex(),
      this.#editor.converter?.pageStyles ?? null,
    );
  }

  /**
   * Get current remote cursor states (normalized to absolute PM positions).
   * Returns an array of cursor states for all remote collaborators, excluding the local user.
   *
   * Exposes normalized awareness states for host consumption.
   * Hosts can use this to build custom presence UI (e.g., presence pills, sidebar lists).
   *
   * @returns Array of remote cursor states with PM positions and user metadata
   *
   * @example
   * ```typescript
   * const presentation = PresentationEditor.getInstance('doc-123');
   * const cursors = presentation.getRemoteCursors();
   * cursors.forEach(cursor => {
   *   console.log(`${cursor.user.name} at position ${cursor.head}`);
   * });
   * ```
   */
  getRemoteCursors(): RemoteCursorState[] {
    return Array.from(this.#remoteCursorState.values());
  }

  /**
   * Adjust layout mode (vertical/book/horizontal) and rerender.
   *
   * Changes how pages are arranged visually:
   * - 'vertical': Pages stacked vertically (default)
   * - 'book': Two-page spread side-by-side
   * - 'horizontal': Pages arranged horizontally
   *
   * Note: Virtualization is automatically disabled for non-vertical modes.
   *
   * @param mode - The layout mode to set
   *
   * @example
   * ```typescript
   * presentation.setLayoutMode('book'); // Two-page spread
   * presentation.setLayoutMode('vertical'); // Back to single column
   * ```
   */
  setLayoutMode(mode: LayoutMode) {
    if (!mode || this.#layoutOptions.layoutMode === mode) {
      return;
    }
    this.#layoutOptions.layoutMode = mode;
    if (mode !== 'vertical' && this.#layoutOptions.virtualization?.enabled) {
      this.#layoutOptions.virtualization = {
        ...this.#layoutOptions.virtualization,
        enabled: false,
      };
    }
    this.#domPainter = null;
    this.#pageGeometryHelper = null;
    this.#pendingDocChange = true;
    this.#scheduleRerender();
  }

  /**
   * Convert a viewport coordinate into a document hit using the current layout.
   */
  hitTest(clientX: number, clientY: number): PositionHit | null {
    const normalized = this.#normalizeClientPoint(clientX, clientY);
    if (!normalized) {
      return null;
    }

    if (this.#session.mode !== 'body') {
      const context = this.#getHeaderFooterContext();
      if (!context) {
        return null;
      }
      const headerPageHeight = context.layout.pageSize?.h ?? context.region.height ?? 1;
      const bodyPageHeight = this.#getBodyPageHeight();
      const pageIndex = Math.max(0, Math.floor(normalized.y / bodyPageHeight));
      if (pageIndex !== context.region.pageIndex) {
        return null;
      }
      const localX = normalized.x - context.region.localX;
      const localY = normalized.y - context.region.pageIndex * bodyPageHeight - context.region.localY;
      if (localX < 0 || localY < 0 || localX > context.region.width || localY > context.region.height) {
        return null;
      }
      const headerPageIndex = Math.floor(localY / headerPageHeight);
      const headerPoint = {
        x: localX,
        y: headerPageIndex * headerPageHeight + (localY - headerPageIndex * headerPageHeight),
      };
      const hit =
        clickToPosition(
          context.layout,
          context.blocks,
          context.measures,
          headerPoint,
          undefined,
          undefined,
          undefined,
          undefined,
        ) ?? null;
      return hit;
    }

    if (!this.#layoutState.layout) {
      return null;
    }
    const rawHit =
      clickToPosition(
        this.#layoutState.layout,
        this.#layoutState.blocks,
        this.#layoutState.measures,
        normalized,
        this.#viewportHost,
        clientX,
        clientY,
        this.#pageGeometryHelper ?? undefined,
      ) ?? null;
    if (!rawHit) {
      return null;
    }

    const doc = this.#editor.state?.doc;
    if (!doc) {
      return rawHit;
    }

    const mapped = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(rawHit.pos, rawHit.layoutEpoch, 1);
    if (!mapped.ok) {
      debugLog('warn', 'hitTest mapping failed', mapped);
      return null;
    }

    const clamped = Math.max(0, Math.min(mapped.pos, doc.content.size));
    return { ...rawHit, pos: clamped, layoutEpoch: mapped.toEpoch };
  }

  #updateSelectionDebugHud(): void {
    try {
      const activeEditor = this.getActiveEditor();
      const selection = activeEditor?.state?.selection
        ? { from: activeEditor.state.selection.from, to: activeEditor.state.selection.to }
        : null;
      updateSelectionDebugHud(this.#viewportHost, {
        docEpoch: this.#epochMapper.getCurrentEpoch(),
        layoutEpoch: this.#layoutEpoch,
        selection,
        lastPointer: this.#debugLastPointer,
        lastHit: this.#debugLastHit,
      });
    } catch {
      // Debug HUD should never break editor interaction paths
    }
  }

  #computePendingMarginClick(pointerId: number, x: number, y: number): PendingMarginClick | null {
    const layout = this.#layoutState.layout;
    const geometryHelper = this.#pageGeometryHelper;
    if (!layout || !geometryHelper) {
      return null;
    }

    const pageIndex = geometryHelper.getPageIndexAtY(y);
    if (pageIndex == null) {
      return null;
    }

    const page = layout.pages[pageIndex];
    if (!page) {
      return null;
    }

    const pageWidth = page.size?.w ?? layout.pageSize.w;
    if (!Number.isFinite(pageWidth) || pageWidth <= 0) {
      return null;
    }
    if (!Number.isFinite(x) || x < 0 || x > pageWidth) {
      return null;
    }

    const margins = page.margins ?? this.#layoutOptions.margins ?? DEFAULT_MARGINS;
    const marginLeft = Number.isFinite(margins.left) ? (margins.left as number) : (DEFAULT_MARGINS.left ?? 0);
    const marginRight = Number.isFinite(margins.right) ? (margins.right as number) : (DEFAULT_MARGINS.right ?? 0);

    const isLeftMargin = marginLeft > 0 && x < marginLeft;
    const isRightMargin = marginRight > 0 && x > pageWidth - marginRight;

    const pageEl = this.#viewportHost.querySelector(
      `.superdoc-page[data-page-index="${pageIndex}"]`,
    ) as HTMLElement | null;
    if (!pageEl) {
      return null;
    }

    const pageTop = geometryHelper.getPageTop(pageIndex);
    const localY = y - pageTop;
    if (!Number.isFinite(localY)) {
      return null;
    }

    const zoom = this.#layoutOptions.zoom ?? 1;
    const pageRect = pageEl.getBoundingClientRect();

    type LineCandidate = {
      pmStart: number;
      pmEnd: number;
      layoutEpoch: number;
      top: number;
      bottom: number;
    };

    const candidates: LineCandidate[] = [];
    const lineEls = Array.from(pageEl.querySelectorAll('.superdoc-line')) as HTMLElement[];
    for (const lineEl of lineEls) {
      if (lineEl.closest('.superdoc-page-header, .superdoc-page-footer')) {
        continue;
      }
      const pmStart = Number(lineEl.dataset.pmStart ?? 'NaN');
      const pmEnd = Number(lineEl.dataset.pmEnd ?? 'NaN');
      if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) {
        continue;
      }
      const rect = lineEl.getBoundingClientRect();
      const top = (rect.top - pageRect.top) / zoom;
      const bottom = (rect.bottom - pageRect.top) / zoom;
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
        continue;
      }
      const lineEpochRaw = lineEl.dataset.layoutEpoch;
      const pageEpochRaw = pageEl.dataset.layoutEpoch;
      const lineEpoch = lineEpochRaw != null ? Number(lineEpochRaw) : NaN;
      const pageEpoch = pageEpochRaw != null ? Number(pageEpochRaw) : NaN;
      const layoutEpoch =
        Number.isFinite(lineEpoch) && Number.isFinite(pageEpoch)
          ? Math.max(lineEpoch, pageEpoch)
          : Number.isFinite(lineEpoch)
            ? lineEpoch
            : Number.isFinite(pageEpoch)
              ? pageEpoch
              : 0;
      candidates.push({
        pmStart,
        pmEnd,
        layoutEpoch: Number.isFinite(layoutEpoch) ? layoutEpoch : 0,
        top,
        bottom,
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    const firstBodyLineTop = Math.min(...candidates.map((c) => c.top));
    if (pageIndex === 0 && Number.isFinite(firstBodyLineTop) && localY < firstBodyLineTop) {
      return { pointerId, kind: 'aboveFirstLine' };
    }

    if (!isLeftMargin && !isRightMargin) {
      return null;
    }

    let best: LineCandidate | null = null;
    for (const c of candidates) {
      if (localY >= c.top && localY <= c.bottom) {
        best = c;
        break;
      }
    }
    if (!best) {
      let bestDistance = Infinity;
      for (const c of candidates) {
        const center = (c.top + c.bottom) / 2;
        const distance = Math.abs(localY - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
    }
    if (!best) {
      return null;
    }

    return {
      pointerId,
      kind: isLeftMargin ? 'left' : 'right',
      layoutEpoch: best.layoutEpoch,
      pmStart: best.pmStart,
      pmEnd: best.pmEnd,
    };
  }

  /**
   * Normalize viewport coordinates (clientX/clientY) into layout space while respecting zoom + scroll.
   */
  normalizeClientPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    return this.#normalizeClientPoint(clientX, clientY);
  }

  /**
   * Get viewport coordinates for a document position (header/footer-aware).
   *
   * This method provides coordinate mapping that respects the current editing mode:
   * - In body mode, uses the main document layout
   * - In header/footer mode, maps positions within the header/footer layout and transforms
   *   coordinates to viewport space
   *
   * @param pos - Document position in the active editor
   * @returns Coordinate rectangle with top, bottom, left, right, width, height in viewport pixels,
   *          or null if the position cannot be mapped
   *
   * @example
   * ```typescript
   * const coords = presentationEditor.coordsAtPos(42);
   * if (coords) {
   *   console.log(`Position 42 is at viewport coordinates (${coords.left}, ${coords.top})`);
   * }
   * ```
   */
  coordsAtPos(
    pos: number,
  ): { top: number; bottom: number; left: number; right: number; width: number; height: number } | null {
    if (!Number.isFinite(pos)) {
      console.warn('[PresentationEditor] coordsAtPos called with invalid position:', pos);
      return null;
    }

    // In header/footer mode, use header/footer layout coordinates
    if (this.#session.mode !== 'body') {
      const context = this.#getHeaderFooterContext();
      if (!context) {
        console.warn('[PresentationEditor] Header/footer context not available for coordsAtPos');
        return null;
      }

      // Get selection rects from the header/footer layout (already transformed to viewport)
      const rects = this.#computeHeaderFooterSelectionRects(pos, pos);
      if (!rects || rects.length === 0) {
        return null;
      }

      const rect = rects[0];
      const zoom = this.#layoutOptions.zoom ?? 1;
      const containerRect = this.#visibleHost.getBoundingClientRect();
      const scrollLeft = this.#visibleHost.scrollLeft ?? 0;
      const scrollTop = this.#visibleHost.scrollTop ?? 0;
      const pageHeight = this.#getBodyPageHeight();
      const pageGap = this.#layoutState.layout?.pageGap ?? 0;
      const pageLocalY = rect.y - rect.pageIndex * (pageHeight + pageGap);
      const coords = this.#convertPageLocalToOverlayCoords(rect.pageIndex, rect.x, pageLocalY);
      if (!coords) return null;

      return {
        top: coords.y * zoom - scrollTop + containerRect.top,
        bottom: coords.y * zoom - scrollTop + containerRect.top + rect.height * zoom,
        left: coords.x * zoom - scrollLeft + containerRect.left,
        right: coords.x * zoom - scrollLeft + containerRect.left + rect.width * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom,
      };
    }

    // In body mode, use main document layout
    const rects = this.getRangeRects(pos, pos);
    if (!rects || rects.length === 0) {
      return null;
    }

    const rect = rects[0];
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   * Get the painted DOM element that contains a document position (body only).
   *
   * Uses the DomPositionIndex which maps data-pm-start/end attributes to rendered
   * elements. Returns null when the position is not currently mounted (virtualization)
   * or when in header/footer mode.
   *
   * @param pos - Document position in the active editor
   * @param options.forceRebuild - Rebuild the index before lookup
   * @param options.fallbackToCoords - Use elementFromPoint with layout rects if index lookup fails
   * @returns The nearest painted DOM element for the position, or null if unavailable
   */
  getElementAtPos(
    pos: number,
    options: { forceRebuild?: boolean; fallbackToCoords?: boolean } = {},
  ): HTMLElement | null {
    if (!Number.isFinite(pos)) return null;
    if (!this.#painterHost) return null;
    if (this.#session.mode !== 'body') return null;

    if (options.forceRebuild || this.#domPositionIndex.size === 0) {
      this.#rebuildDomPositionIndex();
    }

    const indexed = this.#domPositionIndex.findElementAtPosition(pos);
    if (indexed) return indexed;

    if (!options.fallbackToCoords) return null;
    const rects = this.getRangeRects(pos, pos);
    if (!rects.length) return null;

    const doc = this.#visibleHost.ownerDocument ?? document;
    for (const rect of rects) {
      const el = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (el instanceof HTMLElement && this.#painterHost.contains(el)) {
        return (el.closest('[data-pm-start][data-pm-end]') as HTMLElement | null) ?? el;
      }
    }

    return null;
  }

  /**
   * Scroll the visible host so a given document position is brought into view.
   *
   * This is primarily used by commands like search navigation when running in
   * PresentationEditor mode, where ProseMirror's `scrollIntoView()` operates on the
   * hidden editor and does not affect the rendered viewport.
   *
   * @param pos - Document position in the active editor to scroll to
   * @param options - Scrolling options
   * @param options.block - Alignment within the viewport ('start' | 'center' | 'end' | 'nearest')
   * @param options.behavior - Scroll behavior ('auto' | 'smooth')
   * @returns True if the position could be mapped and scrolling was applied
   */
  scrollToPosition(
    pos: number,
    options: { block?: 'start' | 'center' | 'end' | 'nearest'; behavior?: ScrollBehavior } = {},
  ): boolean {
    const activeEditor = this.getActiveEditor();
    const doc = activeEditor?.state?.doc;
    if (!doc) return false;
    if (!Number.isFinite(pos)) return false;

    const clampedPos = Math.max(0, Math.min(pos, doc.content.size));

    const behavior = options.behavior ?? 'auto';
    const block = options.block ?? 'center';

    // Use a DOM marker + scrollIntoView so the browser finds the correct scroll container
    // (window, parent overflow container, etc.) without us guessing.
    const layout = this.#layoutState.layout;

    if (layout && this.#session.mode === 'body') {
      let pageIndex: number | null = null;
      for (let idx = 0; idx < layout.pages.length; idx++) {
        const page = layout.pages[idx];
        for (const fragment of page.fragments) {
          const frag = fragment as { pmStart?: number; pmEnd?: number };
          if (frag.pmStart != null && frag.pmEnd != null && clampedPos >= frag.pmStart && clampedPos <= frag.pmEnd) {
            pageIndex = idx;
            break;
          }
        }
        if (pageIndex != null) break;
      }

      if (pageIndex != null) {
        const pageEl = getPageElementByIndex(this.#viewportHost, pageIndex);
        if (pageEl) {
          pageEl.scrollIntoView({ block, inline: 'nearest', behavior });
          return true;
        }
      }

      return false;
    } else {
      return false;
    }
  }

  /**
   * Get document position from viewport coordinates (header/footer-aware).
   *
   * This method maps viewport coordinates to document positions while respecting
   * the current editing mode:
   * - In body mode, performs hit testing on the main document layout
   * - In header/footer mode, hit tests within the active header/footer region
   * - Returns null if coordinates are outside the editable area
   *
   * @param coords - Viewport coordinates (clientX/clientY)
   * @returns Position result with pos and inside properties, or null if no match
   *
   * @example
   * ```typescript
   * const result = presentationEditor.posAtCoords({ clientX: 100, clientY: 200 });
   * if (result) {
   *   console.log(`Clicked at document position ${result.pos}`);
   * }
   * ```
   */
  posAtCoords(coords: {
    clientX?: number;
    clientY?: number;
    left?: number;
    top?: number;
  }): { pos: number; inside: number } | null {
    // Accept multiple coordinate formats for compatibility
    const clientX = coords?.clientX ?? coords?.left ?? null;
    const clientY = coords?.clientY ?? coords?.top ?? null;

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      console.warn('[PresentationEditor] posAtCoords called with invalid coordinates:', coords);
      return null;
    }

    // Use hitTest which already handles both body and header/footer modes
    const hit = this.hitTest(clientX!, clientY!);
    if (!hit) {
      return null;
    }

    // Return in ProseMirror-compatible format
    // Note: 'inside' indicates the depth of the node clicked (ProseMirror-specific).
    // We use -1 as a default to indicate we're not inside a specific node boundary,
    // which is the typical behavior for layout-based coordinate mapping.
    return {
      pos: hit.pos,
      inside: -1,
    };
  }

  /**
   * Aggregate an array of rects into a single bounding box.
   */
  #aggregateLayoutBounds(
    rects: RangeRect[],
  ): { top: number; left: number; bottom: number; right: number; width: number; height: number } | null {
    if (!rects.length) return null;
    const top = Math.min(...rects.map((rect) => rect.top));
    const left = Math.min(...rects.map((rect) => rect.left));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const right = Math.max(...rects.map((rect) => rect.right));
    if (!Number.isFinite(top) || !Number.isFinite(left) || !Number.isFinite(bottom) || !Number.isFinite(right)) {
      return null;
    }
    return {
      top,
      left,
      bottom,
      right,
      width: right - left,
      height: bottom - top,
    };
  }

  /**
   * Update zoom level and re-render.
   *
   * @param zoom - Zoom level multiplier (1.0 = 100%). Must be a positive finite number.
   * @throws {TypeError} If zoom is not a number
   * @throws {RangeError} If zoom is not finite, is <= 0, or is NaN
   *
   * @example
   * ```typescript
   * editor.setZoom(1.5); // 150% zoom
   * editor.setZoom(0.75); // 75% zoom
   * ```
   */
  setZoom(zoom: number) {
    if (typeof zoom !== 'number') {
      throw new TypeError(`[PresentationEditor] setZoom expects a number, received ${typeof zoom}`);
    }
    if (Number.isNaN(zoom)) {
      throw new RangeError('[PresentationEditor] setZoom expects a valid number (not NaN)');
    }
    if (!Number.isFinite(zoom)) {
      throw new RangeError('[PresentationEditor] setZoom expects a finite number');
    }
    if (zoom <= 0) {
      throw new RangeError('[PresentationEditor] setZoom expects a positive number greater than 0');
    }
    if (zoom > MAX_ZOOM_WARNING_THRESHOLD) {
      console.warn(
        `[PresentationEditor] Zoom level ${zoom} exceeds recommended maximum of ${MAX_ZOOM_WARNING_THRESHOLD}. Performance may degrade.`,
      );
    }
    this.#layoutOptions.zoom = zoom;
    this.#applyZoom();
    this.emit('zoomChange', { zoom });
    this.#scheduleSelectionUpdate();
    // Trigger cursor updates on zoom changes
    if (this.#remoteCursorState.size > 0) {
      this.#remoteCursorDirty = true;
      this.#scheduleRemoteCursorUpdate();
    }
    this.#pendingDocChange = true;
    this.#scheduleRerender();
  }

  /**
   * Clean up editor + DOM nodes.
   * Safe to call during partial initialization.
   */
  destroy() {
    // Cancel pending layout RAF
    if (this.#rafHandle != null) {
      safeCleanup(() => {
        const win = this.#visibleHost?.ownerDocument?.defaultView ?? window;
        win.cancelAnimationFrame(this.#rafHandle!);
        this.#rafHandle = null;
      }, 'Layout RAF');
    }

    // Cancel pending remote cursor throttle timeout to prevent execution after destroy
    if (this.#remoteCursorThrottleTimeout !== null) {
      safeCleanup(() => {
        clearTimeout(this.#remoteCursorThrottleTimeout!);
        this.#remoteCursorThrottleTimeout = null;
      }, 'Remote cursor throttle');
    }

    this.#selectionSync.destroy();

    this.#editorListeners.forEach(({ event, handler }) => this.#editor?.off(event, handler));
    this.#editorListeners = [];

    this.#domIndexObserverManager?.destroy();
    this.#domIndexObserverManager = null;

    this.#viewportHost?.removeEventListener('pointerdown', this.#handlePointerDown);
    this.#viewportHost?.removeEventListener('dblclick', this.#handleDoubleClick);
    this.#viewportHost?.removeEventListener('pointermove', this.#handlePointerMove);
    this.#viewportHost?.removeEventListener('pointerup', this.#handlePointerUp);
    this.#viewportHost?.removeEventListener('pointerleave', this.#handlePointerLeave);
    this.#viewportHost?.removeEventListener('dragover', this.#handleDragOver);
    this.#viewportHost?.removeEventListener('drop', this.#handleDrop);
    this.#visibleHost?.removeEventListener('keydown', this.#handleKeyDown);
    this.#visibleHost?.removeEventListener('focusin', this.#handleVisibleHostFocusIn);
    this.#inputBridge?.notifyTargetChanged();
    this.#inputBridge?.destroy();
    this.#inputBridge = null;

    if (this.#a11ySelectionAnnounceTimeout != null) {
      clearTimeout(this.#a11ySelectionAnnounceTimeout);
      this.#a11ySelectionAnnounceTimeout = null;
    }

    // Clean up collaboration cursor subscriptions
    if (this.#awarenessCleanup) {
      this.#awarenessCleanup();
      this.#awarenessCleanup = null;
    }

    if (this.#scrollCleanup) {
      this.#scrollCleanup();
      this.#scrollCleanup = null;
    }

    this.#remoteCursorState.clear();
    this.#remoteCursorElements.clear();
    this.#remoteCursorOverlay = null;

    // Clean up cell selection drag state to prevent memory leaks
    this.#clearCellAnchor();

    // Unregister from static registry
    if (this.#options?.documentId) {
      PresentationEditor.#instances.delete(this.#options.documentId);
    }

    this.#headerFooterManagerCleanups.forEach((fn) => safeCleanup(fn, 'Header/footer'));
    this.#headerFooterManagerCleanups = [];
    safeCleanup(() => {
      this.#headerFooterAdapter?.clear();
      this.#headerFooterAdapter = null;
    }, 'Header/footer adapter');
    safeCleanup(() => {
      this.#headerFooterManager?.destroy();
      this.#headerFooterManager = null;
    }, 'Header/footer manager');
    this.#headerFooterIdentifier = null;
    this.#multiSectionIdentifier = null;
    this.#headerLayoutResults = null;
    this.#footerLayoutResults = null;
    this.#headerLayoutsByRId.clear();
    this.#footerLayoutsByRId.clear();
    this.#headerDecorationProvider = undefined;
    this.#footerDecorationProvider = undefined;
    this.#session = { mode: 'body' };
    this.#activeHeaderFooterEditor = null;

    this.#domPainter = null;
    this.#pageGeometryHelper = null;
    this.#dragHandlerCleanup?.();
    this.#dragHandlerCleanup = null;
    this.#selectionOverlay?.remove();
    this.#painterHost?.remove();
    this.#hiddenHost?.remove();
    this.#hoverOverlay = null;
    this.#hoverTooltip = null;
    this.#modeBanner?.remove();
    this.#modeBanner = null;
    this.#ariaLiveRegion?.remove();
    this.#ariaLiveRegion = null;
    this.#errorBanner?.remove();
    if (this.#editor) {
      (this.#editor as Editor & { presentationEditor?: PresentationEditor | null }).presentationEditor = null;
      this.#editor.destroy();
    }
  }

  #rebuildDomPositionIndex(): void {
    if (!this.#painterHost) return;
    try {
      this.#domPositionIndex.rebuild(this.#painterHost);
    } catch (error) {
      debugLog('warn', 'DomPositionIndex rebuild failed', { error: String(error) });
    }
  }

  #setupEditorListeners() {
    const handleUpdate = ({ transaction }: { transaction?: Transaction }) => {
      const trackedChangesChanged = this.#syncTrackedChangesPreferences();
      if (transaction) {
        this.#epochMapper.recordTransaction(transaction);
        this.#selectionSync.setDocEpoch(this.#epochMapper.getCurrentEpoch());
      }
      if (trackedChangesChanged || transaction?.docChanged) {
        this.#pendingDocChange = true;
        // Store the mapping from this transaction for position updates during paint.
        // Only stored for doc changes - other triggers don't have position shifts.
        if (transaction?.docChanged) {
          if (this.#pendingMapping !== null) {
            // Multiple rapid transactions before rerender - compose the mappings.
            // The painter's gate checks maps.length > 1 to trigger full rebuild,
            // which is the safe fallback for complex/batched edits.
            const combined = this.#pendingMapping.slice();
            combined.appendMapping(transaction.mapping);
            this.#pendingMapping = combined;
          } else {
            this.#pendingMapping = transaction.mapping;
          }
        }
        this.#selectionSync.onLayoutStart();
        this.#scheduleRerender();
      }
      // Update local cursor in awareness whenever document changes
      // This ensures cursor position is broadcast with each keystroke
      if (transaction?.docChanged) {
        this.#updateLocalAwarenessCursor();
        // Clear cell anchor on document changes to prevent stale references
        // (table structure may have changed, cell positions may be invalid)
        this.#clearCellAnchor();
      }
    };
    const handleSelection = () => {
      this.#scheduleSelectionUpdate();
      // Update local cursor in awareness for collaboration
      // This bypasses y-prosemirror's focus check which may fail for hidden PM views
      this.#updateLocalAwarenessCursor();
      this.#scheduleA11ySelectionAnnouncement();
    };
    this.#editor.on('update', handleUpdate);
    this.#editor.on('selectionUpdate', handleSelection);
    this.#editorListeners.push({ event: 'update', handler: handleUpdate as (...args: unknown[]) => void });
    this.#editorListeners.push({ event: 'selectionUpdate', handler: handleSelection as (...args: unknown[]) => void });

    // Listen for page style changes (e.g., margin adjustments via ruler).
    // These changes don't modify document content (docChanged === false),
    // so the 'update' event isn't emitted. The dedicated pageStyleUpdate event
    // provides clearer semantics and better debugging than checking transaction meta flags.
    const handlePageStyleUpdate = () => {
      this.#pendingDocChange = true;
      this.#selectionSync.onLayoutStart();
      this.#scheduleRerender();
    };
    this.#editor.on('pageStyleUpdate', handlePageStyleUpdate);
    this.#editorListeners.push({
      event: 'pageStyleUpdate',
      handler: handlePageStyleUpdate as (...args: unknown[]) => void,
    });

    const handleCollaborationReady = (payload: unknown) => {
      this.emit('collaborationReady', payload);
      // Setup remote cursor rendering after collaboration is ready
      // Only setup if presence is enabled in layout options
      if (this.#options.collaborationProvider?.awareness && this.#layoutOptions.presence?.enabled !== false) {
        this.#setupCollaborationCursors();
      }
    };
    this.#editor.on('collaborationReady', handleCollaborationReady);
    this.#editorListeners.push({
      event: 'collaborationReady',
      handler: handleCollaborationReady as (...args: unknown[]) => void,
    });

    // Handle remote header/footer changes from collaborators
    const handleRemoteHeaderFooterChanged = (payload: {
      type: 'header' | 'footer';
      sectionId: string;
      content: unknown;
    }) => {
      this.#headerFooterAdapter?.invalidate(payload.sectionId);
      this.#headerFooterManager?.refresh();
      this.#pendingDocChange = true;
      this.#scheduleRerender();
    };
    this.#editor.on('remoteHeaderFooterChanged', handleRemoteHeaderFooterChanged);
    this.#editorListeners.push({
      event: 'remoteHeaderFooterChanged',
      handler: handleRemoteHeaderFooterChanged as (...args: unknown[]) => void,
    });
  }

  /**
   * Setup awareness event subscriptions for remote cursor tracking.
   * Includes scroll listener for virtualization updates.
   * Called after collaborationReady event when ySync plugin is initialized.
   * Prevents double-initialization by cleaning up existing subscriptions first.
   * @private
   */
  #setupCollaborationCursors() {
    const provider = this.#options.collaborationProvider;
    if (!provider?.awareness) return;

    // Prevent double-initialization: cleanup existing subscriptions
    if (this.#awarenessCleanup) {
      this.#awarenessCleanup();
      this.#awarenessCleanup = null;
    }
    if (this.#scrollCleanup) {
      this.#scrollCleanup();
      this.#scrollCleanup = null;
    }

    const handleAwarenessChange = () => {
      this.#remoteCursorDirty = true;
      this.#scheduleRemoteCursorUpdate();
    };

    provider.awareness.on('change', handleAwarenessChange);
    provider.awareness.on('update', handleAwarenessChange);

    // Store cleanup function for awareness subscriptions
    this.#awarenessCleanup = () => {
      provider.awareness?.off('change', handleAwarenessChange);
      provider.awareness?.off('update', handleAwarenessChange);
    };

    // Setup scroll listener for virtualization updates
    // When scrolling causes pages to mount/unmount, we need to re-render cursors
    // Attach to #visibleHost (the actual scrolling element) instead of #painterHost
    // This ensures remote cursors update during pagination/virtualization as the container scrolls
    const handleScroll = () => {
      if (this.#remoteCursorState.size > 0) {
        this.#remoteCursorDirty = true;
        this.#scheduleRemoteCursorUpdate();
      }
    };

    // Debounce scroll updates to avoid excessive re-renders
    // Use instance-level scrollTimeout for proper cleanup
    const debouncedHandleScroll = () => {
      if (this.#scrollTimeout !== undefined) {
        clearTimeout(this.#scrollTimeout);
      }
      this.#scrollTimeout = window.setTimeout(handleScroll, SCROLL_DEBOUNCE_MS);
    };

    this.#visibleHost.addEventListener('scroll', debouncedHandleScroll, { passive: true });

    // Store cleanup function for scroll listener
    // Clear pending timeout to prevent memory leak when component is destroyed
    this.#scrollCleanup = () => {
      if (this.#scrollTimeout !== undefined) {
        clearTimeout(this.#scrollTimeout);
        this.#scrollTimeout = undefined;
      }
      this.#visibleHost.removeEventListener('scroll', debouncedHandleScroll);
    };

    // Trigger initial normalization for existing collaborators
    // When joining a session with existing collaborators, awareness.getStates() has data
    // but no 'change' event fires, so we need to normalize immediately
    handleAwarenessChange();
  }

  /**
   * Update local cursor position in awareness.
   *
   * CRITICAL FIX: The y-prosemirror cursor plugin only updates awareness when
   * view.hasFocus() returns true. In PresentationEditor, the hidden PM EditorView
   * may not have DOM focus (focus is on the visual representation / input bridge).
   * This causes the cursor plugin to not send cursor updates, making remote users
   * see a stale cursor position.
   *
   * This method bypasses the focus check and manually updates awareness with the
   * current selection position whenever the PM selection changes.
   *
   * @private
   * @returns {void}
   * @throws {Error} Position conversion errors are silently caught and ignored.
   *   These can occur during document restructuring when the PM document structure
   *   doesn't match the Yjs structure, or when positions are temporarily invalid.
   */
  #updateLocalAwarenessCursor(): void {
    const provider = this.#options.collaborationProvider;
    if (!provider?.awareness) return;

    // Runtime validation: ensure setLocalStateField method exists
    if (typeof provider.awareness.setLocalStateField !== 'function') {
      // Awareness implementation doesn't support setLocalStateField
      return;
    }

    const editorState = this.#editor?.state;
    if (!editorState) return;

    const ystate = ySyncPluginKey.getState(editorState);
    if (!ystate?.binding?.mapping) return;

    const { selection } = editorState;
    const { anchor, head } = selection;

    try {
      // Convert PM positions to Yjs relative positions
      const relAnchor = absolutePositionToRelativePosition(anchor, ystate.type, ystate.binding.mapping);
      const relHead = absolutePositionToRelativePosition(head, ystate.type, ystate.binding.mapping);

      if (relAnchor && relHead) {
        // Update awareness with cursor position
        // Use 'cursor' as the field name to match y-prosemirror's convention
        const cursorData: AwarenessCursorData = {
          anchor: relAnchor,
          head: relHead,
        };
        provider.awareness.setLocalStateField('cursor', cursorData);
      }
    } catch {
      // Silently ignore conversion errors - can happen during document restructuring
    }
  }

  /**
   * Normalize awareness states from Yjs relative positions to absolute PM positions.
   * Converts remote cursor data into PresentationEditor-friendly coordinate space.
   * @private
   */
  /**
   * Schedule a remote cursor update using microtask + throttle-based rendering.
   *
   * CRITICAL: Uses queueMicrotask to defer cursor normalization until after all
   * synchronous code completes. This fixes a race condition where awareness events
   * fire before the ProseMirror state is updated with Yjs document changes:
   *
   * 1. WebSocket message arrives with doc update + awareness update
   * 2. Yjs doc is updated, sync plugin starts creating PM transaction
   * 3. Awareness update fires events (PresentationEditor handler called)
   * 4. If we read PM state NOW, it may not have the new text yet
   * 5. Cursor position conversion uses stale mapping → wrong position
   *
   * By deferring to a microtask, we ensure:
   * - All synchronous code completes (including PM transaction dispatch)
   * - PM state reflects the latest Yjs document state
   * - Cursor positions are calculated correctly
   *
   * Throttling is still applied (60fps max) to prevent excessive re-renders.
   *
   * @private
   */
  #scheduleRemoteCursorUpdate() {
    // Skip scheduling entirely when presence is disabled
    // This avoids unnecessary scheduling when the feature is toggled off
    if (this.#layoutOptions.presence?.enabled === false) return;

    // Already have a pending update scheduled
    if (this.#remoteCursorUpdateScheduled) return;
    this.#remoteCursorUpdateScheduled = true;

    // Use microtask to defer until after PM state is synced with Yjs
    queueMicrotask(() => {
      if (!this.#remoteCursorUpdateScheduled) return; // Was cancelled

      const now = performance.now();
      const elapsed = now - this.#lastRemoteCursorRenderTime;
      /**
       * Throttle window for remote cursor updates (milliseconds).
       * Set to 16ms to target ~60fps rendering (one animation frame at 60Hz).
       * This prevents excessive re-renders during rapid awareness updates while
       * maintaining smooth visual feedback for collaboration cursors.
       * Using requestAnimationFrame would be ideal, but microtask deferral is
       * critical for fixing the race condition with Yjs state synchronization.
       */
      const THROTTLE_MS = 16;

      // If enough time has passed, render now
      if (elapsed >= THROTTLE_MS) {
        // Clear any pending trailing edge timeout
        if (this.#remoteCursorThrottleTimeout !== null) {
          clearTimeout(this.#remoteCursorThrottleTimeout);
          this.#remoteCursorThrottleTimeout = null;
        }
        this.#remoteCursorUpdateScheduled = false;
        this.#lastRemoteCursorRenderTime = now;
        this.#updateRemoteCursors();
        return;
      }

      // Within throttle window: schedule trailing edge render
      const remaining = THROTTLE_MS - elapsed;
      this.#remoteCursorThrottleTimeout = window.setTimeout(() => {
        this.#remoteCursorUpdateScheduled = false;
        this.#remoteCursorThrottleTimeout = null;
        this.#lastRemoteCursorRenderTime = performance.now();
        this.#updateRemoteCursors();
      }, remaining) as unknown as number;
    });
  }

  /**
   * Schedule a remote cursor re-render without re-normalizing awareness states.
   * Performance optimization: avoids expensive Yjs position conversions on layout changes.
   * Used when layout geometry changes but cursor positions haven't (e.g., zoom, scroll, reflow).
   *
   * Note: This method doesn't need microtask deferral because it uses already-computed
   * PM positions from #remoteCursorState, not awareness relative positions.
   * @private
   */
  #scheduleRemoteCursorReRender() {
    if (this.#layoutOptions.presence?.enabled === false) return;
    if (this.#remoteCursorUpdateScheduled) return;
    this.#remoteCursorUpdateScheduled = true;

    // Use RAF for re-renders since they're triggered by layout/scroll events
    // and should align with the browser's paint cycle
    const win = this.#visibleHost.ownerDocument?.defaultView ?? window;
    win.requestAnimationFrame(() => {
      this.#remoteCursorUpdateScheduled = false;
      this.#lastRemoteCursorRenderTime = performance.now();
      this.#renderRemoteCursors();
    });
  }

  /**
   * Update remote cursor state, render overlays, and emit event for host consumption.
   * Normalizes awareness states, applies performance guardrails, and renders cursor/selection overlays.
   * @private
   */
  #updateRemoteCursors() {
    // Gate behind presence.enabled check
    // Clear overlay DOM BEFORE returning when presence is disabled
    // This ensures already-rendered cursors are wiped when toggling presence off
    if (this.#layoutOptions.presence?.enabled === false) {
      this.#remoteCursorState.clear();
      this.#remoteCursorElements.clear();
      if (this.#remoteCursorOverlay) {
        this.#remoteCursorOverlay.innerHTML = '';
      }
      return;
    }

    if (!this.#remoteCursorDirty) return;
    this.#remoteCursorDirty = false;

    // Track render start time for telemetry
    const startTime = performance.now();

    // Normalize awareness states to PM positions
    this.#remoteCursorState = normalizeAwarenessStatesFromHelper({
      provider: this.#options.collaborationProvider ?? null,
      editorState: this.#editor?.state ?? null,
      previousState: this.#remoteCursorState,
      fallbackColors: PresentationEditor.FALLBACK_COLORS,
      staleTimeoutMs: this.#layoutOptions.presence?.staleTimeout ?? DEFAULT_STALE_TIMEOUT_MS,
    });

    // Render cursors with existing state
    this.#renderRemoteCursors();

    // Emit event for host consumption
    this.emit('remoteCursorsUpdate', {
      cursors: Array.from(this.#remoteCursorState.values()),
    });

    // Optional telemetry for monitoring performance
    if (this.#telemetryEmitter) {
      const renderTime = performance.now() - startTime;
      const maxVisible = this.#layoutOptions.presence?.maxVisible ?? 20;
      const visibleCount = Math.min(this.#remoteCursorState.size, maxVisible);
      this.#telemetryEmitter({
        type: 'remoteCursorsRender',
        data: {
          collaboratorCount: this.#remoteCursorState.size,
          visibleCount,
          renderTimeMs: renderTime,
        },
      });
    }
  }

  /**
   * Render remote cursors from existing state without normalization.
   * Extracted rendering logic to support both full updates and geometry-only re-renders.
   * Used by #updateRemoteCursors (after awareness normalization) and #scheduleRemoteCursorReRender
   * (when only layout geometry changes, not cursor positions).
   *
   * FLICKER PREVENTION: This method reuses existing DOM elements instead of clearing
   * and recreating them. Elements are keyed by clientId and only created/removed when
   * clients join/leave. Position updates use CSS transitions for smooth movement.
   *
   * @private
   */
  #renderRemoteCursors() {
    const layout = this.#layoutState?.layout;
    const blocks = this.#layoutState?.blocks;
    const measures = this.#layoutState?.measures;

    if (!layout || !blocks || !measures) {
      // Layout not ready, skip rendering
      return;
    }

    renderRemoteCursorsFromHelper({
      layout,
      blocks,
      measures,
      pageGeometryHelper: this.#pageGeometryHelper,
      presence: this.#layoutOptions.presence,
      remoteCursorState: this.#remoteCursorState,
      remoteCursorElements: this.#remoteCursorElements,
      remoteCursorOverlay: this.#remoteCursorOverlay,
      doc: this.#visibleHost.ownerDocument ?? document,
      computeCaretLayoutRect: (pos) => this.#computeCaretLayoutRect(pos),
      convertPageLocalToOverlayCoords: (pageIndex, x, y) => this.#convertPageLocalToOverlayCoords(pageIndex, x, y),
      fallbackColors: PresentationEditor.FALLBACK_COLORS,
      cursorStyles: PresentationEditor.CURSOR_STYLES,
      maxSelectionRectsPerUser: MAX_SELECTION_RECTS_PER_USER,
      defaultPageHeight: DEFAULT_PAGE_SIZE.h,
      fallbackPageHeight: this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h,
    });
  }

  #setupPointerHandlers() {
    this.#viewportHost.addEventListener('pointerdown', this.#handlePointerDown);
    this.#viewportHost.addEventListener('dblclick', this.#handleDoubleClick);
    this.#viewportHost.addEventListener('pointermove', this.#handlePointerMove);
    this.#viewportHost.addEventListener('pointerup', this.#handlePointerUp);
    this.#viewportHost.addEventListener('pointerleave', this.#handlePointerLeave);
    this.#viewportHost.addEventListener('dragover', this.#handleDragOver);
    this.#viewportHost.addEventListener('drop', this.#handleDrop);
    this.#visibleHost.addEventListener('keydown', this.#handleKeyDown);
    this.#visibleHost.addEventListener('focusin', this.#handleVisibleHostFocusIn);
  }

  /**
   * Sets up drag and drop handlers for field annotations in the layout engine view.
   * Uses the DragHandler from layout-bridge to handle drag events and map drop
   * coordinates to ProseMirror positions.
   */
  #setupDragHandlers() {
    // Clean up any existing handler
    this.#dragHandlerCleanup?.();
    this.#dragHandlerCleanup = null;

    this.#dragHandlerCleanup = setupInternalFieldAnnotationDragHandlers({
      painterHost: this.#painterHost,
      getActiveEditor: () => this.getActiveEditor(),
      hitTest: (clientX, clientY) => this.hitTest(clientX, clientY),
      scheduleSelectionUpdate: () => this.#scheduleSelectionUpdate(),
    });
  }

  /**
   * Focus the editor after image selection and schedule selection update.
   * This method encapsulates the common focus and blur logic used when
   * selecting both inline and block images.
   * @private
   * @returns {void}
   */
  #focusEditorAfterImageSelection(): void {
    this.#scheduleSelectionUpdate();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const editorDom = this.#editor.view?.dom as HTMLElement | undefined;
    if (editorDom) {
      editorDom.focus();
      this.#editor.view?.focus();
    }
  }

  #resolveFieldAnnotationSelectionFromElement(
    annotationEl: HTMLElement,
  ): { node: ProseMirrorNode; pos: number } | null {
    const pmStartRaw = annotationEl.dataset?.pmStart;
    if (pmStartRaw == null) {
      return null;
    }

    const pmStart = Number(pmStartRaw);
    if (!Number.isFinite(pmStart)) {
      return null;
    }

    const doc = this.#editor.state?.doc;
    if (!doc) {
      return null;
    }

    const layoutEpochRaw = annotationEl.dataset?.layoutEpoch;
    const layoutEpoch = layoutEpochRaw != null ? Number(layoutEpochRaw) : NaN;
    const effectiveEpoch = Number.isFinite(layoutEpoch) ? layoutEpoch : this.#epochMapper.getCurrentEpoch();
    const mapped = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(pmStart, effectiveEpoch, 1);
    if (!mapped.ok) {
      const fallbackPos = Math.max(0, Math.min(pmStart, doc.content.size));
      const fallbackNode = doc.nodeAt(fallbackPos);
      if (fallbackNode?.type?.name === 'fieldAnnotation') {
        return { node: fallbackNode, pos: fallbackPos };
      }

      this.#pendingDocChange = true;
      this.#scheduleRerender();
      return null;
    }

    const clampedPos = Math.max(0, Math.min(mapped.pos, doc.content.size));
    const node = doc.nodeAt(clampedPos);
    if (!node || node.type.name !== 'fieldAnnotation') {
      return null;
    }

    return { node, pos: clampedPos };
  }

  #setupInputBridge() {
    this.#inputBridge?.destroy();
    // Pass both window (for keyboard events that bubble) and visibleHost (for beforeinput events that don't)
    const win = this.#visibleHost.ownerDocument?.defaultView ?? window;
    this.#inputBridge = new PresentationInputBridge(
      win as Window,
      this.#visibleHost,
      () => this.#getActiveDomTarget(),
      () => !this.#isViewLocked(),
    );
    this.#inputBridge.bind();
  }

  #initHeaderFooterRegistry() {
    const optionsMedia = (this.#options as { mediaFiles?: Record<string, unknown> })?.mediaFiles;
    const storageMedia = (this.#editor as Editor & { storage?: { image?: { media?: Record<string, unknown> } } })
      .storage?.image?.media;
    const converter = (this.#editor as Editor & { converter?: unknown }).converter;
    const mediaFiles = optionsMedia ?? storageMedia;

    const result = initHeaderFooterRegistryFromHelper({
      painterHost: this.#painterHost,
      visibleHost: this.#visibleHost,
      selectionOverlay: this.#selectionOverlay,
      editor: this.#editor,
      converter,
      mediaFiles,
      isDebug: Boolean(this.#options.isDebug),
      initBudgetMs: HEADER_FOOTER_INIT_BUDGET_MS,
      resetSession: () => {
        this.#headerFooterManagerCleanups = [];
        this.#session = { mode: 'body' };
        this.#activeHeaderFooterEditor = null;
        this.#inputBridge?.notifyTargetChanged();
      },
      requestRerender: () => {
        this.#pendingDocChange = true;
        this.#scheduleRerender();
      },
      exitHeaderFooterMode: () => {
        this.#exitHeaderFooterMode();
      },
      previousCleanups: this.#headerFooterManagerCleanups,
      previousAdapter: this.#headerFooterAdapter,
      previousManager: this.#headerFooterManager,
      previousOverlayManager: this.#overlayManager,
    });

    this.#overlayManager = result.overlayManager;
    this.#headerFooterIdentifier = result.headerFooterIdentifier;
    this.#headerFooterManager = result.headerFooterManager;
    this.#headerFooterAdapter = result.headerFooterAdapter;
    this.#headerFooterManagerCleanups = result.cleanups;
  }

  #handlePointerDown = (event: PointerEvent) => {
    // Return early for non-left clicks (right-click, middle-click)
    if (event.button !== 0) {
      return;
    }

    // On Mac, Ctrl+Click triggers the context menu but reports button=0.
    // Treat it like a right-click: preserve selection and let the contextmenu handler take over.
    // This prevents the selection from being destroyed when user Ctrl+clicks on selected text.
    if (event.ctrlKey && navigator.platform.includes('Mac')) {
      return;
    }

    this.#pendingMarginClick = null;

    // Check if clicking on a draggable field annotation - if so, don't preventDefault
    // to allow native HTML5 drag-and-drop to work (mousedown must fire for dragstart)
    const target = event.target as HTMLElement;
    if (target?.closest?.('.superdoc-ruler-handle') != null) {
      return;
    }

    // Handle clicks on links in the layout engine
    const linkEl = target?.closest?.('a.superdoc-link') as HTMLAnchorElement | null;
    if (linkEl) {
      const href = linkEl.getAttribute('href') ?? '';
      const isAnchorLink = href.startsWith('#') && href.length > 1;
      const isTocLink = linkEl.closest('.superdoc-toc-entry') !== null;

      if (isAnchorLink && isTocLink) {
        // TOC entry anchor links: navigate to the anchor
        event.preventDefault();
        event.stopPropagation();
        this.goToAnchor(href);
        return;
      }

      // Non-TOC links: dispatch custom event to show the link popover
      // We dispatch from pointerdown because the DOM may be re-rendered before click fires,
      // which would cause the click event to land on the wrong element
      event.preventDefault();
      event.stopPropagation();

      const linkClickEvent = new CustomEvent('superdoc-link-click', {
        bubbles: true,
        composed: true,
        detail: {
          href: href,
          target: linkEl.getAttribute('target'),
          rel: linkEl.getAttribute('rel'),
          tooltip: linkEl.getAttribute('title'),
          element: linkEl,
          clientX: event.clientX,
          clientY: event.clientY,
        },
      });
      linkEl.dispatchEvent(linkClickEvent);
      return;
    }

    const annotationEl = target?.closest?.('.annotation[data-pm-start]') as HTMLElement | null;
    const isDraggableAnnotation = target?.closest?.('[data-draggable="true"]') != null;
    this.#suppressFocusInFromDraggable = isDraggableAnnotation;

    if (annotationEl) {
      if (!this.#editor.isEditable) {
        return;
      }

      const resolved = this.#resolveFieldAnnotationSelectionFromElement(annotationEl);
      if (resolved) {
        try {
          const tr = this.#editor.state.tr.setSelection(NodeSelection.create(this.#editor.state.doc, resolved.pos));
          this.#editor.view?.dispatch(tr);
        } catch {}

        this.#editor.emit('fieldAnnotationClicked', {
          editor: this.#editor,
          node: resolved.node,
          nodePos: resolved.pos,
          event,
          currentTarget: annotationEl,
        });
      }
      return;
    }

    if (!this.#layoutState.layout) {
      // Layout not ready yet, but still focus the editor and set cursor to start
      // so the user can immediately begin typing
      if (!isDraggableAnnotation) {
        event.preventDefault();
      }

      // Blur any currently focused element
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const editorDom = this.#editor.view?.dom as HTMLElement | undefined;
      if (!editorDom) {
        return;
      }

      // Find the first valid text position in the document
      const validPos = this.#getFirstTextPosition();
      const doc = this.#editor?.state?.doc;

      if (doc) {
        try {
          const tr = this.#editor.state.tr.setSelection(TextSelection.create(doc, validPos));
          this.#editor.view?.dispatch(tr);
        } catch (error) {
          // Error dispatching selection - this can happen if the document is in an invalid state
          if (process.env.NODE_ENV === 'development') {
            console.warn('[PresentationEditor] Failed to set selection to first text position:', error);
          }
        }
      }

      // Focus the hidden editor
      editorDom.focus();
      this.#editor.view?.focus();
      // Force selection update to render the caret
      this.#scheduleSelectionUpdate();

      return;
    }

    const normalizedPoint = this.#normalizeClientPoint(event.clientX, event.clientY);
    if (!normalizedPoint) {
      return;
    }
    const { x, y } = normalizedPoint;
    this.#debugLastPointer = { clientX: event.clientX, clientY: event.clientY, x, y };

    // Exit header/footer mode if clicking outside the current region
    if (this.#session.mode !== 'body') {
      // Check if click is inside the active editor host element (more reliable than coordinate hit testing)
      const activeEditorHost = this.#overlayManager?.getActiveEditorHost?.();
      const clickedInsideEditorHost =
        activeEditorHost && (activeEditorHost.contains(event.target as Node) || activeEditorHost === event.target);

      if (clickedInsideEditorHost) {
        // Clicked within the active editor host - let the editor handle it, don't interfere
        return;
      }

      // Fallback: use coordinate-based hit testing
      const headerFooterRegion = this.#hitTestHeaderFooterRegion(x, y);
      if (!headerFooterRegion) {
        // Clicked outside header/footer region - exit mode and continue to position cursor in body
        this.#exitHeaderFooterMode();
        // Fall through to body click handling below
      } else {
        // Clicked within header/footer region but not in editor host - still let editor handle it
        return;
      }
    }

    const headerFooterRegion = this.#hitTestHeaderFooterRegion(x, y);
    if (headerFooterRegion) {
      // Header/footer mode will be handled via double-click; ignore single clicks for now.
      return;
    }

    const rawHit = clickToPosition(
      this.#layoutState.layout,
      this.#layoutState.blocks,
      this.#layoutState.measures,
      { x, y },
      this.#viewportHost,
      event.clientX,
      event.clientY,
      this.#pageGeometryHelper ?? undefined,
    );

    const doc = this.#editor.state?.doc;
    const mapped =
      rawHit && doc ? this.#epochMapper.mapPosFromLayoutToCurrentDetailed(rawHit.pos, rawHit.layoutEpoch, 1) : null;
    if (mapped && !mapped.ok) {
      debugLog('warn', 'pointerdown mapping failed', mapped);
    }
    const hit =
      rawHit && doc && mapped?.ok
        ? { ...rawHit, pos: Math.max(0, Math.min(mapped.pos, doc.content.size)), layoutEpoch: mapped.toEpoch }
        : null;
    this.#debugLastHit = hit
      ? { source: 'dom', pos: rawHit?.pos ?? null, layoutEpoch: rawHit?.layoutEpoch ?? null, mappedPos: hit.pos }
      : { source: 'none', pos: rawHit?.pos ?? null, layoutEpoch: rawHit?.layoutEpoch ?? null, mappedPos: null };
    this.#updateSelectionDebugHud();

    // Don't preventDefault for draggable annotations - allows mousedown to fire for native drag
    if (!isDraggableAnnotation) {
      event.preventDefault();
    }

    // Even if clickToPosition returns null (clicked outside text content),
    // we still want to focus the editor so the user can start typing
    if (!rawHit) {
      // Blur any currently focused element
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const editorDom = this.#editor.view?.dom as HTMLElement | undefined;
      if (editorDom) {
        // Find the first valid text position in the document
        const validPos = this.#getFirstTextPosition();
        const doc = this.#editor?.state?.doc;

        if (doc) {
          try {
            const tr = this.#editor.state.tr.setSelection(TextSelection.create(doc, validPos));
            this.#editor.view?.dispatch(tr);
          } catch (error) {
            // Error dispatching selection - this can happen if the document is in an invalid state
            if (process.env.NODE_ENV === 'development') {
              console.warn('[PresentationEditor] Failed to set selection to first text position:', error);
            }
          }
        }
        editorDom.focus();
        this.#editor.view?.focus();
        // Force selection update to render the caret
        this.#scheduleSelectionUpdate();
      }
      return;
    }

    if (!hit || !doc) {
      // We got a layout position but couldn't map it to the current document deterministically.
      // Keep the existing selection and allow the pending re-layout to catch up.
      this.#pendingDocChange = true;
      this.#scheduleRerender();
      return;
    }

    // Check if click landed on an atomic fragment (image, drawing)
    const fragmentHit = getFragmentAtPosition(
      this.#layoutState.layout,
      this.#layoutState.blocks,
      this.#layoutState.measures,
      rawHit.pos,
    );

    // Inline image hit detection via DOM target (for inline images rendered inside paragraphs)
    const targetImg = (event.target as HTMLElement | null)?.closest?.('img');
    const imgPmStart = targetImg?.dataset?.pmStart ? Number(targetImg.dataset.pmStart) : null;
    if (!Number.isNaN(imgPmStart) && imgPmStart != null) {
      const doc = this.#editor.state.doc;
      const imgLayoutEpochRaw = targetImg?.dataset?.layoutEpoch;
      const imgLayoutEpoch = imgLayoutEpochRaw != null ? Number(imgLayoutEpochRaw) : NaN;
      const rawLayoutEpoch = Number.isFinite(rawHit.layoutEpoch) ? rawHit.layoutEpoch : NaN;
      const effectiveEpoch =
        Number.isFinite(imgLayoutEpoch) && Number.isFinite(rawLayoutEpoch)
          ? Math.max(imgLayoutEpoch, rawLayoutEpoch)
          : Number.isFinite(imgLayoutEpoch)
            ? imgLayoutEpoch
            : rawHit.layoutEpoch;
      const mappedImg = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(imgPmStart, effectiveEpoch, 1);
      if (!mappedImg.ok) {
        debugLog('warn', 'inline image mapping failed', mappedImg);
        this.#pendingDocChange = true;
        this.#scheduleRerender();
        return;
      }
      const clampedImgPos = Math.max(0, Math.min(mappedImg.pos, doc.content.size));

      // Validate position is within document bounds
      if (clampedImgPos < 0 || clampedImgPos >= doc.content.size) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[PresentationEditor] Invalid position ${clampedImgPos} for inline image (document size: ${doc.content.size})`,
          );
        }
        return;
      }

      // Emit imageDeselected if previous selection was a different image
      const newSelectionId = `inline-${clampedImgPos}`;
      if (this.#lastSelectedImageBlockId && this.#lastSelectedImageBlockId !== newSelectionId) {
        this.emit('imageDeselected', { blockId: this.#lastSelectedImageBlockId } as ImageDeselectedEvent);
      }

      try {
        const tr = this.#editor.state.tr.setSelection(NodeSelection.create(doc, clampedImgPos));
        this.#editor.view?.dispatch(tr);

        const selector = `.superdoc-inline-image[data-pm-start="${imgPmStart}"]`;
        const targetElement = this.#viewportHost.querySelector(selector);
        this.emit('imageSelected', {
          element: targetElement ?? targetImg,
          blockId: null,
          pmStart: clampedImgPos,
        } as ImageSelectedEvent);
        this.#lastSelectedImageBlockId = newSelectionId;
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[PresentationEditor] Failed to create NodeSelection for inline image at position ${imgPmStart}:`,
            error,
          );
        }
      }

      this.#focusEditorAfterImageSelection();
      return;
    }

    // If clicked on an atomic fragment (image or drawing), create NodeSelection
    if (fragmentHit && (fragmentHit.fragment.kind === 'image' || fragmentHit.fragment.kind === 'drawing')) {
      const doc = this.#editor.state.doc;
      try {
        // Create NodeSelection for atomic node at hit position
        const tr = this.#editor.state.tr.setSelection(NodeSelection.create(doc, hit.pos));
        this.#editor.view?.dispatch(tr);

        // Emit imageDeselected if previous selection was a different image
        if (this.#lastSelectedImageBlockId && this.#lastSelectedImageBlockId !== fragmentHit.fragment.blockId) {
          this.emit('imageDeselected', { blockId: this.#lastSelectedImageBlockId } as ImageDeselectedEvent);
        }

        // Emit imageSelected event for overlay to detect
        if (fragmentHit.fragment.kind === 'image') {
          const targetElement = this.#viewportHost.querySelector(
            `.superdoc-image-fragment[data-pm-start="${fragmentHit.fragment.pmStart}"]`,
          );
          if (targetElement) {
            this.emit('imageSelected', {
              element: targetElement,
              blockId: fragmentHit.fragment.blockId,
              pmStart: fragmentHit.fragment.pmStart,
            } as ImageSelectedEvent);
            this.#lastSelectedImageBlockId = fragmentHit.fragment.blockId;
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[PresentationEditor] Failed to create NodeSelection for atomic fragment:', error);
        }
      }

      this.#focusEditorAfterImageSelection();
      return;
    }

    // If clicking away from an image, emit imageDeselected
    if (this.#lastSelectedImageBlockId) {
      this.emit('imageDeselected', { blockId: this.#lastSelectedImageBlockId } as ImageDeselectedEvent);
      this.#lastSelectedImageBlockId = null;
    }

    // Handle shift+click to extend selection
    if (event.shiftKey && this.#editor.state.selection.$anchor) {
      const anchor = this.#editor.state.selection.anchor;
      const head = hit.pos;

      // Use current extension mode (from previous double/triple click) or default to character mode
      const { selAnchor, selHead } = this.#calculateExtendedSelection(anchor, head, this.#dragExtensionMode);

      try {
        const tr = this.#editor.state.tr.setSelection(TextSelection.create(this.#editor.state.doc, selAnchor, selHead));
        this.#editor.view?.dispatch(tr);
        this.#scheduleSelectionUpdate();
      } catch (error) {
        console.warn('[SELECTION] Failed to extend selection on shift+click:', {
          error,
          anchor,
          head,
          selAnchor,
          selHead,
          mode: this.#dragExtensionMode,
        });
      }

      // Focus editor
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const editorDom = this.#editor.view?.dom as HTMLElement | undefined;
      if (editorDom) {
        editorDom.focus();
        this.#editor.view?.focus();
      }

      return; // Don't start drag on shift+click
    }

    const clickDepth = this.#registerPointerClick(event);

    // Set up drag selection state
    // Only update dragAnchor on single click; preserve it for double/triple clicks
    // so word/paragraph selection uses the consistent first-click position
    // (the second click can return a slightly different position due to mouse movement)
    if (clickDepth === 1) {
      this.#dragAnchor = hit.pos;
      this.#dragAnchorPageIndex = hit.pageIndex;
      this.#pendingMarginClick = this.#computePendingMarginClick(event.pointerId, x, y);

      // Check if click is inside a table cell for potential cell selection
      // Only set up cell anchor on single click (not double/triple for word/para selection)
      const tableHit = this.#hitTestTable(x, y);

      if (tableHit) {
        const tablePos = this.#getTablePosFromHit(tableHit);
        if (tablePos !== null) {
          this.#setCellAnchor(tableHit, tablePos);
        }
      } else {
        // Clicked outside table - clear any existing cell anchor
        this.#clearCellAnchor();
      }
    } else {
      this.#pendingMarginClick = null;
    }

    this.#dragLastPointer = { clientX: event.clientX, clientY: event.clientY, x, y };
    this.#dragLastRawHit = hit;
    this.#dragUsedPageNotMountedFallback = false;

    this.#isDragging = true;
    if (clickDepth >= 3) {
      this.#dragExtensionMode = 'para';
    } else if (clickDepth === 2) {
      this.#dragExtensionMode = 'word';
    } else {
      this.#dragExtensionMode = 'char';
    }

    debugLog(
      'verbose',
      `Drag selection start ${JSON.stringify({
        pointer: { clientX: event.clientX, clientY: event.clientY, x, y },
        clickDepth,
        extensionMode: this.#dragExtensionMode,
        anchor: this.#dragAnchor,
        anchorPageIndex: this.#dragAnchorPageIndex,
        rawHit: rawHit
          ? {
              pos: rawHit.pos,
              pageIndex: rawHit.pageIndex,
              blockId: rawHit.blockId,
              lineIndex: rawHit.lineIndex,
              layoutEpoch: rawHit.layoutEpoch,
            }
          : null,
        mapped: mapped
          ? mapped.ok
            ? { ok: true, pos: mapped.pos, fromEpoch: mapped.fromEpoch, toEpoch: mapped.toEpoch }
            : {
                ok: false,
                reason: (mapped as { ok: false; reason: string }).reason,
                fromEpoch: mapped.fromEpoch,
                toEpoch: mapped.toEpoch,
              }
          : null,
        hit: hit ? { pos: hit.pos, pageIndex: hit.pageIndex, layoutEpoch: hit.layoutEpoch } : null,
      })}`,
    );

    // Capture pointer for reliable drag tracking even outside viewport
    // Guard for test environments where setPointerCapture may not exist
    if (typeof this.#viewportHost.setPointerCapture === 'function') {
      this.#viewportHost.setPointerCapture(event.pointerId);
    }

    let handledByDepth = false;
    if (this.#session.mode === 'body') {
      // For double/triple clicks, use the stored dragAnchor from the first click
      // to avoid position drift from slight mouse movement between clicks
      const selectionPos = clickDepth >= 2 && this.#dragAnchor !== null ? this.#dragAnchor : hit.pos;

      if (clickDepth >= 3) {
        handledByDepth = this.#selectParagraphAt(selectionPos);
      } else if (clickDepth === 2) {
        handledByDepth = this.#selectWordAt(selectionPos);
      }
    }

    if (!handledByDepth) {
      try {
        const doc = this.#editor.state.doc;
        let nextSelection: Selection = TextSelection.create(doc, hit.pos);
        if (!nextSelection.$from.parent.inlineContent) {
          nextSelection = Selection.near(doc.resolve(hit.pos), 1);
        }
        const tr = this.#editor.state.tr.setSelection(nextSelection);
        this.#editor.view?.dispatch(tr);
      } catch {
        // Position may be invalid during layout updates (e.g., after drag-drop) - ignore
      }
    }

    // Force selection update to clear stale carets even if PM thinks selection didn't change.
    // This handles clicking at/near same position where PM's selection.eq() might return true,
    // which prevents 'selectionUpdate' event from firing and leaves old carets on screen.
    // By forcing the update, we ensure #updateSelection() runs and clears the DOM layer.
    this.#scheduleSelectionUpdate();

    // Blur any currently focused element to ensure the PM editor can receive focus
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const editorDom = this.#editor.view?.dom as HTMLElement | undefined;
    if (!editorDom) {
      return;
    }

    // Try direct DOM focus first
    editorDom.focus();
    this.#editor.view?.focus();
  };

  /**
   * Finds the first valid text position in the document.
   *
   * Traverses the document tree to locate the first textblock node (paragraph, heading, etc.)
   * and returns a position inside it. This is used when focusing the editor but no specific
   * position is available (e.g., clicking outside text content or before layout is ready).
   *
   * @returns The position inside the first textblock, or 1 if no textblock is found
   * @private
   */
  #getFirstTextPosition(): number {
    return getFirstTextPositionFromHelper(this.#editor?.state?.doc ?? null);
  }

  /**
   * Registers a pointer click event and tracks multi-click sequences (double, triple).
   *
   * This method implements multi-click detection by tracking the timing and position
   * of consecutive clicks. Clicks within 400ms and 5px of each other increment the
   * click count, up to a maximum of 3 (single, double, triple).
   *
   * @param event - The mouse event from the pointer down handler
   * @returns The current click count (1 = single, 2 = double, 3 = triple)
   * @private
   */
  #registerPointerClick(event: MouseEvent): number {
    const nextState = registerPointerClickFromHelper(
      event,
      { clickCount: this.#clickCount, lastClickTime: this.#lastClickTime, lastClickPosition: this.#lastClickPosition },
      {
        timeThresholdMs: MULTI_CLICK_TIME_THRESHOLD_MS,
        distanceThresholdPx: MULTI_CLICK_DISTANCE_THRESHOLD_PX,
        maxClickCount: 3,
      },
    );

    this.#clickCount = nextState.clickCount;
    this.#lastClickTime = nextState.lastClickTime;
    this.#lastClickPosition = nextState.lastClickPosition;

    return nextState.clickCount;
  }

  // ============================================================================
  // Cell Selection Utilities
  // ============================================================================

  /**
   * Gets the ProseMirror position at the start of a table cell from a table hit result.
   *
   * This method navigates the ProseMirror document structure to find the exact position where
   * a table cell begins. The position returned is suitable for use with CellSelection.create().
   *
   * Algorithm:
   * 1. Validate input (tableHit structure and cell indices)
   * 2. Traverse document to find the table node matching tableHit.block.id
   * 3. Navigate through table structure (table > row > cell) to target row
   * 4. Track logical column position accounting for colspan (handles merged cells)
   * 5. Return position when target column falls within a cell's span
   *
   * Merged cell handling:
   * - Does NOT assume 1:1 mapping between cell index and logical column
   * - Tracks cumulative logical column position by summing colspan values
   * - A cell with colspan=3 occupies logical columns [n, n+1, n+2]
   * - Finds the cell whose logical span contains the target column index
   *
   * Error handling:
   * - Input validation with console warnings for debugging
   * - Try-catch around document traversal (catches corrupted document errors)
   * - Bounds checking for row indices
   * - Null checks at each navigation step
   *
   * @param tableHit - The table hit result from hitTestTableFragment containing:
   *   - block: TableBlock with the table's block ID
   *   - cellRowIndex: 0-based row index of the target cell
   *   - cellColIndex: 0-based logical column index of the target cell
   * @returns The PM position at the start of the cell, or null if:
   *   - Invalid input (null tableHit, negative indices)
   *   - Table not found in document
   *   - Target row out of bounds
   *   - Target column not found in row
   *   - Document traversal error
   * @private
   *
   * @throws Never throws - all errors are caught and logged, returns null on failure
   */
  #getCellPosFromTableHit(tableHit: TableHitResult): number | null {
    return getCellPosFromTableHitFromHelper(tableHit, this.#editor.state?.doc ?? null, this.#layoutState.blocks);
  }

  /**
   * Gets the table position (start of table node) from a table hit result.
   *
   * @param tableHit - The table hit result from hitTestTableFragment
   * @returns The PM position at the start of the table, or null if not found
   * @private
   */
  #getTablePosFromHit(tableHit: TableHitResult): number | null {
    return getTablePosFromHitFromHelper(tableHit, this.#editor.state?.doc ?? null, this.#layoutState.blocks);
  }

  /**
   * Determines if the current drag should create a CellSelection instead of TextSelection.
   *
   * Implements a state machine for table cell selection:
   * - 'none': Not in a table, use TextSelection
   * - 'pending': Started drag in a table, but haven't crossed cell boundary yet
   * - 'active': Crossed cell boundary, use CellSelection
   *
   * State transitions:
   * - none → pending: When drag starts in a table cell (#setCellAnchor)
   * - pending → active: When drag crosses into a different cell (this method returns true)
   * - active → none: When drag ends (#clearCellAnchor)
   * - * → none: When document changes or clicking outside table
   *
   * Decision logic:
   * 1. No cell anchor → false (not in table drag mode)
   * 2. Current position outside table → return current state (stay in 'active' if already there)
   * 3. Different table → treat as outside table
   * 4. Different cell in same table → true (activate cell selection)
   * 5. Same cell → return current state (stay in 'active' if already there, else false)
   *
   * This state machine ensures:
   * - Text selection works normally within a single cell
   * - Cell selection activates smoothly when crossing cell boundaries
   * - Once activated, cell selection persists even if dragging back to anchor cell
   *
   * @param currentTableHit - The table hit result for the current pointer position, or null if not in a table
   * @returns true if we should create a CellSelection, false for TextSelection
   * @private
   */
  #shouldUseCellSelection(currentTableHit: TableHitResult | null): boolean {
    return shouldUseCellSelectionFromHelper(currentTableHit, this.#cellAnchor, this.#cellDragMode);
  }

  /**
   * Stores the cell anchor when a drag operation starts inside a table cell.
   *
   * @param tableHit - The table hit result for the initial click position
   * @param tablePos - The PM position of the table node
   * @private
   */
  #setCellAnchor(tableHit: TableHitResult, tablePos: number): void {
    const cellPos = this.#getCellPosFromTableHit(tableHit);
    if (cellPos === null) {
      return;
    }

    this.#cellAnchor = {
      tablePos,
      cellPos,
      cellRowIndex: tableHit.cellRowIndex,
      cellColIndex: tableHit.cellColIndex,
      tableBlockId: tableHit.block.id,
    };
    this.#cellDragMode = 'pending';
  }

  /**
   * Clears the cell drag state.
   * Called when drag ends or when clicking outside a table.
   *
   * @private
   */
  #clearCellAnchor(): void {
    this.#cellAnchor = null;
    this.#cellDragMode = 'none';
  }

  /**
   * Attempts to perform a table hit test for the given normalized coordinates.
   *
   * @param normalizedX - X coordinate in layout space
   * @param normalizedY - Y coordinate in layout space
   * @returns TableHitResult if the point is inside a table cell, null otherwise
   * @private
   */
  #hitTestTable(normalizedX: number, normalizedY: number): TableHitResult | null {
    const configuredPageHeight = (this.#layoutOptions.pageSize ?? DEFAULT_PAGE_SIZE).h;
    return hitTestTableFromHelper(
      this.#layoutState.layout,
      this.#layoutState.blocks,
      this.#layoutState.measures,
      normalizedX,
      normalizedY,
      configuredPageHeight,
      this.#getEffectivePageGap(),
      this.#pageGeometryHelper,
    );
  }

  /**
   * Selects the word at the given document position.
   *
   * This method traverses up the document tree to find the nearest textblock ancestor,
   * then expands the selection to word boundaries using Unicode-aware word character
   * detection. This handles cases where the position is within nested structures like
   * list items or table cells.
   *
   * Algorithm:
   * 1. Traverse ancestors until a textblock is found (paragraphs, headings, list items)
   * 2. From the click position, expand backward while characters match word regex
   * 3. Expand forward while characters match word regex
   * 4. Create a text selection spanning the word boundaries
   *
   * @param pos - The absolute document position where the double-click occurred
   * @returns true if a word was selected successfully, false otherwise
   * @private
   */
  #selectWordAt(pos: number): boolean {
    const state = this.#editor.state;
    if (!state?.doc) {
      return false;
    }

    const range = computeWordSelectionRangeAtFromHelper(state, pos);
    if (!range) {
      return false;
    }

    const tr = state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to));
    try {
      this.#editor.view?.dispatch(tr);
      return true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PresentationEditor] Failed to select word:', error);
      }
      return false;
    }
  }

  /**
   * Selects the entire paragraph (textblock) at the given document position.
   *
   * This method traverses up the document tree to find the nearest textblock ancestor,
   * then selects from its start to end position. This handles cases where the position
   * is within nested structures like list items or table cells.
   *
   * Algorithm:
   * 1. Traverse ancestors until a textblock is found (paragraphs, headings, list items)
   * 2. Select from textblock.start() to textblock.end()
   *
   * @param pos - The absolute document position where the triple-click occurred
   * @returns true if a paragraph was selected successfully, false otherwise
   * @private
   */
  #selectParagraphAt(pos: number): boolean {
    const state = this.#editor.state;
    if (!state?.doc) {
      return false;
    }
    const range = computeParagraphSelectionRangeAtFromHelper(state, pos);
    if (!range) {
      return false;
    }
    const tr = state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to));
    try {
      this.#editor.view?.dispatch(tr);
      return true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PresentationEditor] Failed to select paragraph:', error);
      }
      return false;
    }
  }

  /**
   * Calculates extended selection boundaries based on the current extension mode.
   *
   * This helper method consolidates the logic for extending selections to word or paragraph
   * boundaries, used by both shift+click and drag selection handlers. It preserves selection
   * directionality by placing the head on the side where the user is clicking/dragging.
   *
   * @param anchor - The anchor position of the selection (fixed point)
   * @param head - The head position of the selection (moving point)
   * @param mode - The extension mode: 'char' (no extension), 'word', or 'para'
   * @returns Object with selAnchor and selHead positions after applying extension
   * @private
   */
  #calculateExtendedSelection(
    anchor: number,
    head: number,
    mode: 'char' | 'word' | 'para',
  ): { selAnchor: number; selHead: number } {
    return calculateExtendedSelection(this.#layoutState.blocks, anchor, head, mode);
  }

  #handlePointerMove = (event: PointerEvent) => {
    if (!this.#layoutState.layout) return;
    const normalized = this.#normalizeClientPoint(event.clientX, event.clientY);
    if (!normalized) return;

    // Handle drag selection when button is held
    if (this.#isDragging && this.#dragAnchor !== null && event.buttons & 1) {
      this.#pendingMarginClick = null;
      const prevPointer = this.#dragLastPointer;
      const prevRawHit = this.#dragLastRawHit;
      this.#dragLastPointer = { clientX: event.clientX, clientY: event.clientY, x: normalized.x, y: normalized.y };
      const rawHit = clickToPosition(
        this.#layoutState.layout,
        this.#layoutState.blocks,
        this.#layoutState.measures,
        { x: normalized.x, y: normalized.y },
        this.#viewportHost,
        event.clientX,
        event.clientY,
        this.#pageGeometryHelper ?? undefined,
      );

      // If we can't find a position, keep the last selection
      if (!rawHit) {
        debugLog(
          'verbose',
          `Drag selection update (no hit) ${JSON.stringify({
            pointer: { clientX: event.clientX, clientY: event.clientY, x: normalized.x, y: normalized.y },
            prevPointer,
            anchor: this.#dragAnchor,
          })}`,
        );
        return;
      }

      const doc = this.#editor.state?.doc;
      if (!doc) return;

      this.#dragLastRawHit = rawHit;
      const pageMounted = this.#getPageElement(rawHit.pageIndex) != null;
      if (!pageMounted && this.#isSelectionAwareVirtualizationEnabled()) {
        this.#dragUsedPageNotMountedFallback = true;
        debugLog('warn', 'Geometry fallback', { reason: 'page_not_mounted', pageIndex: rawHit.pageIndex });
      }
      this.#updateSelectionVirtualizationPins({ includeDragBuffer: true, extraPages: [rawHit.pageIndex] });

      const mappedHead = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(rawHit.pos, rawHit.layoutEpoch, 1);
      if (!mappedHead.ok) {
        debugLog('warn', 'drag mapping failed', mappedHead);
        debugLog(
          'verbose',
          `Drag selection update (map failed) ${JSON.stringify({
            pointer: { clientX: event.clientX, clientY: event.clientY, x: normalized.x, y: normalized.y },
            prevPointer,
            anchor: this.#dragAnchor,
            rawHit: {
              pos: rawHit.pos,
              pageIndex: rawHit.pageIndex,
              blockId: rawHit.blockId,
              lineIndex: rawHit.lineIndex,
              layoutEpoch: rawHit.layoutEpoch,
            },
            mapped: {
              ok: false,
              reason: (mappedHead as { ok: false; reason: string }).reason,
              fromEpoch: mappedHead.fromEpoch,
              toEpoch: mappedHead.toEpoch,
            },
          })}`,
        );
        return;
      }

      const hit = {
        ...rawHit,
        pos: Math.max(0, Math.min(mappedHead.pos, doc.content.size)),
        layoutEpoch: mappedHead.toEpoch,
      };
      this.#debugLastHit = {
        source: pageMounted ? 'dom' : 'geometry',
        pos: rawHit.pos,
        layoutEpoch: rawHit.layoutEpoch,
        mappedPos: hit.pos,
      };
      this.#updateSelectionDebugHud();

      const anchor = this.#dragAnchor;
      const head = hit.pos;
      const { selAnchor, selHead } = this.#calculateExtendedSelection(anchor, head, this.#dragExtensionMode);
      debugLog(
        'verbose',
        `Drag selection update ${JSON.stringify({
          pointer: { clientX: event.clientX, clientY: event.clientY, x: normalized.x, y: normalized.y },
          prevPointer,
          rawHit: {
            pos: rawHit.pos,
            pageIndex: rawHit.pageIndex,
            blockId: rawHit.blockId,
            lineIndex: rawHit.lineIndex,
            layoutEpoch: rawHit.layoutEpoch,
          },
          prevRawHit: prevRawHit
            ? {
                pos: prevRawHit.pos,
                pageIndex: prevRawHit.pageIndex,
                blockId: prevRawHit.blockId,
                lineIndex: prevRawHit.lineIndex,
                layoutEpoch: prevRawHit.layoutEpoch,
              }
            : null,
          mappedHead: { pos: mappedHead.pos, fromEpoch: mappedHead.fromEpoch, toEpoch: mappedHead.toEpoch },
          hit: { pos: hit.pos, pageIndex: hit.pageIndex, layoutEpoch: hit.layoutEpoch },
          anchor,
          head,
          selAnchor,
          selHead,
          direction: head >= anchor ? 'down' : 'up',
          selectionDirection: selHead >= selAnchor ? 'down' : 'up',
          extensionMode: this.#dragExtensionMode,
          hitSource: pageMounted ? 'dom' : 'geometry',
          pageMounted,
        })}`,
      );

      // Check for cell selection mode (table drag)
      const currentTableHit = this.#hitTestTable(normalized.x, normalized.y);
      const shouldUseCellSel = this.#shouldUseCellSelection(currentTableHit);

      if (shouldUseCellSel && this.#cellAnchor) {
        // Cell selection mode - create CellSelection spanning anchor to current cell
        const headCellPos = currentTableHit ? this.#getCellPosFromTableHit(currentTableHit) : null;

        if (headCellPos !== null) {
          // Transition to active mode if we weren't already
          if (this.#cellDragMode !== 'active') {
            this.#cellDragMode = 'active';
          }

          try {
            const doc = this.#editor.state.doc;
            const anchorCellPos = this.#cellAnchor.cellPos;

            // Validate positions are within document bounds
            const clampedAnchor = Math.max(0, Math.min(anchorCellPos, doc.content.size));
            const clampedHead = Math.max(0, Math.min(headCellPos, doc.content.size));

            const cellSelection = CellSelection.create(doc, clampedAnchor, clampedHead);
            const tr = this.#editor.state.tr.setSelection(cellSelection);
            this.#editor.view?.dispatch(tr);
            this.#scheduleSelectionUpdate();
          } catch (error) {
            // CellSelection creation can fail if positions are invalid
            // Fall back to text selection
            console.warn('[CELL-SELECTION] Failed to create CellSelection, falling back to TextSelection:', error);

            const anchor = this.#dragAnchor;
            const head = hit.pos;
            const { selAnchor, selHead } = this.#calculateExtendedSelection(anchor, head, this.#dragExtensionMode);

            try {
              const tr = this.#editor.state.tr.setSelection(
                TextSelection.create(this.#editor.state.doc, selAnchor, selHead),
              );
              this.#editor.view?.dispatch(tr);
              this.#scheduleSelectionUpdate();
            } catch {
              // Position may be invalid during layout updates - ignore
            }
          }

          return; // Skip header/footer hover logic during drag
        }
      }

      // Text selection mode (default)
      // Apply extension mode to expand selection boundaries, preserving direction

      try {
        const tr = this.#editor.state.tr.setSelection(TextSelection.create(this.#editor.state.doc, selAnchor, selHead));
        this.#editor.view?.dispatch(tr);
        this.#scheduleSelectionUpdate();
      } catch (error) {
        console.warn('[SELECTION] Failed to extend selection during drag:', {
          error,
          anchor,
          head,
          selAnchor,
          selHead,
          mode: this.#dragExtensionMode,
        });
      }

      return; // Skip header/footer hover logic during drag
    }

    if (this.#session.mode !== 'body') {
      this.#clearHoverRegion();
      return;
    }
    if (this.#documentMode === 'viewing') {
      this.#clearHoverRegion();
      return;
    }
    const region = this.#hitTestHeaderFooterRegion(normalized.x, normalized.y);
    if (!region) {
      this.#clearHoverRegion();
      return;
    }
    if (
      this.#hoverRegion &&
      this.#hoverRegion.kind === region.kind &&
      this.#hoverRegion.pageIndex === region.pageIndex &&
      this.#hoverRegion.sectionType === region.sectionType
    ) {
      return;
    }
    this.#hoverRegion = region;
    this.#renderHoverRegion(region);
  };

  #handlePointerLeave = () => {
    this.#clearHoverRegion();
  };

  #handleVisibleHostFocusIn = (event: FocusEvent) => {
    // Avoid stealing focus from toolbars/dropdowns registered as UI surfaces.
    if (isInRegisteredSurface(event)) {
      return;
    }

    if (this.#suppressFocusInFromDraggable) {
      this.#suppressFocusInFromDraggable = false;
      return;
    }

    const target = event.target as Node | null;
    const activeTarget = this.#getActiveDomTarget();
    if (!activeTarget) {
      return;
    }

    const activeNode = activeTarget as unknown as Node;
    const containsFn =
      typeof (activeNode as { contains?: (node: Node | null) => boolean }).contains === 'function'
        ? (activeNode as { contains: (node: Node | null) => boolean }).contains
        : null;

    if (target && (activeNode === target || (containsFn && containsFn.call(activeNode, target)))) {
      return;
    }

    try {
      if (activeTarget instanceof HTMLElement && typeof activeTarget.focus === 'function') {
        // preventScroll supported in modern browsers; fall back silently when not.
        (activeTarget as unknown as { focus?: (opts?: { preventScroll?: boolean }) => void }).focus?.({
          preventScroll: true,
        });
      } else if (typeof (activeTarget as { focus?: () => void }).focus === 'function') {
        (activeTarget as { focus: () => void }).focus();
      }
    } catch {
      // Ignore focus failures (e.g., non-focusable targets in headless tests)
    }

    try {
      this.getActiveEditor().view?.focus();
    } catch {
      // Ignore focus failures
    }
  };

  #handlePointerUp = (event: PointerEvent) => {
    this.#suppressFocusInFromDraggable = false;

    if (!this.#isDragging) return;

    // Release pointer capture if we have it
    // Guard for test environments where pointer capture methods may not exist
    if (
      typeof this.#viewportHost.hasPointerCapture === 'function' &&
      typeof this.#viewportHost.releasePointerCapture === 'function' &&
      this.#viewportHost.hasPointerCapture(event.pointerId)
    ) {
      this.#viewportHost.releasePointerCapture(event.pointerId);
    }

    const pendingMarginClick = this.#pendingMarginClick;
    this.#pendingMarginClick = null;

    const dragAnchor = this.#dragAnchor;
    const dragMode = this.#dragExtensionMode;
    const dragUsedFallback = this.#dragUsedPageNotMountedFallback;
    const dragPointer = this.#dragLastPointer;

    // Clear drag state - but preserve #dragAnchor and #dragExtensionMode
    // because they're needed for double-click word selection (the anchor from
    // the first click must persist to the second click) and for shift+click
    // to extend selection in the same mode (word/para) after a multi-click
    this.#isDragging = false;

    // Reset cell drag mode but preserve #cellAnchor for potential shift+click extension
    // If we were in active cell selection mode, the CellSelection is already dispatched
    // and preserved in the editor state
    if (this.#cellDragMode !== 'none') {
      this.#cellDragMode = 'none';
    }

    if (!pendingMarginClick || pendingMarginClick.pointerId !== event.pointerId) {
      // End of drag selection (non-margin). Drop drag buffer pages and keep endpoints mounted.
      this.#updateSelectionVirtualizationPins({ includeDragBuffer: false });

      if (dragUsedFallback && dragAnchor != null) {
        const pointer = dragPointer ?? { clientX: event.clientX, clientY: event.clientY };
        this.#finalizeDragSelectionWithDom(pointer, dragAnchor, dragMode);
      }

      this.#scheduleA11ySelectionAnnouncement({ immediate: true });

      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      return;
    }
    if (this.#session.mode !== 'body' || this.#isViewLocked()) {
      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      return;
    }

    const doc = this.#editor.state?.doc;
    if (!doc) {
      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      return;
    }

    if (pendingMarginClick.kind === 'aboveFirstLine') {
      const pos = this.#getFirstTextPosition();
      try {
        const tr = this.#editor.state.tr.setSelection(TextSelection.create(doc, pos));
        this.#editor.view?.dispatch(tr);
        this.#scheduleSelectionUpdate();
      } catch {
        // Ignore invalid positions during re-layout
      }
      this.#debugLastHit = { source: 'margin', pos: null, layoutEpoch: null, mappedPos: pos };
      this.#updateSelectionDebugHud();
      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      return;
    }

    if (pendingMarginClick.kind === 'right') {
      const mappedEnd = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(
        pendingMarginClick.pmEnd,
        pendingMarginClick.layoutEpoch,
        1,
      );
      if (!mappedEnd.ok) {
        debugLog('warn', 'right margin mapping failed', mappedEnd);
        this.#pendingDocChange = true;
        this.#scheduleRerender();
        this.#dragLastPointer = null;
        this.#dragLastRawHit = null;
        this.#dragUsedPageNotMountedFallback = false;
        return;
      }
      const caretPos = Math.max(0, Math.min(mappedEnd.pos, doc.content.size));
      try {
        const tr = this.#editor.state.tr.setSelection(TextSelection.create(doc, caretPos));
        this.#editor.view?.dispatch(tr);
        this.#scheduleSelectionUpdate();
      } catch {
        // Ignore invalid positions during re-layout
      }
      this.#debugLastHit = {
        source: 'margin',
        pos: pendingMarginClick.pmEnd,
        layoutEpoch: pendingMarginClick.layoutEpoch,
        mappedPos: caretPos,
      };
      this.#updateSelectionDebugHud();
      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      return;
    }

    const mappedStart = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(
      pendingMarginClick.pmStart,
      pendingMarginClick.layoutEpoch,
      1,
    );
    const mappedEnd = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(
      pendingMarginClick.pmEnd,
      pendingMarginClick.layoutEpoch,
      -1,
    );
    if (!mappedStart.ok || !mappedEnd.ok) {
      if (!mappedStart.ok) debugLog('warn', 'left margin mapping failed (start)', mappedStart);
      if (!mappedEnd.ok) debugLog('warn', 'left margin mapping failed (end)', mappedEnd);
      this.#pendingDocChange = true;
      this.#scheduleRerender();
      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      return;
    }

    const selFrom = Math.max(0, Math.min(Math.min(mappedStart.pos, mappedEnd.pos), doc.content.size));
    const selTo = Math.max(0, Math.min(Math.max(mappedStart.pos, mappedEnd.pos), doc.content.size));
    try {
      const tr = this.#editor.state.tr.setSelection(TextSelection.create(doc, selFrom, selTo));
      this.#editor.view?.dispatch(tr);
      this.#scheduleSelectionUpdate();
    } catch {
      // Ignore invalid positions during re-layout
    }
    this.#debugLastHit = {
      source: 'margin',
      pos: pendingMarginClick.pmStart,
      layoutEpoch: pendingMarginClick.layoutEpoch,
      mappedPos: selFrom,
    };
    this.#updateSelectionDebugHud();

    this.#dragLastPointer = null;
    this.#dragLastRawHit = null;
    this.#dragUsedPageNotMountedFallback = false;
  };

  #handleDragOver = createExternalFieldAnnotationDragOverHandler({
    getActiveEditor: () => this.getActiveEditor(),
    hitTest: (clientX, clientY) => this.hitTest(clientX, clientY),
    scheduleSelectionUpdate: () => this.#scheduleSelectionUpdate(),
  });

  #handleDrop = createExternalFieldAnnotationDropHandler({
    getActiveEditor: () => this.getActiveEditor(),
    hitTest: (clientX, clientY) => this.hitTest(clientX, clientY),
    scheduleSelectionUpdate: () => this.#scheduleSelectionUpdate(),
  });

  #handleDoubleClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    if (!this.#layoutState.layout) return;

    const rect = this.#viewportHost.getBoundingClientRect();
    // Use effective zoom from actual rendered dimensions for accurate coordinate conversion
    const zoom = this.#layoutOptions.zoom ?? 1;
    const scrollLeft = this.#visibleHost.scrollLeft ?? 0;
    const scrollTop = this.#visibleHost.scrollTop ?? 0;
    const x = (event.clientX - rect.left + scrollLeft) / zoom;
    const y = (event.clientY - rect.top + scrollTop) / zoom;

    const region = this.#hitTestHeaderFooterRegion(x, y);
    if (region) {
      event.preventDefault();
      event.stopPropagation();

      // Check if header/footer exists, create if not
      const descriptor = this.#resolveDescriptorForRegion(region);
      if (!descriptor && this.#headerFooterManager) {
        // No header/footer exists - create a default one
        this.#createDefaultHeaderFooter(region);
        // Refresh the manager to pick up the new descriptor
        this.#headerFooterManager.refresh();
      }

      this.#activateHeaderFooterRegion(region);
    } else if (this.#session.mode !== 'body') {
      this.#exitHeaderFooterMode();
    }
  };

  #handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.#session.mode !== 'body') {
      event.preventDefault();
      this.#exitHeaderFooterMode();
      return;
    }
    if (event.ctrlKey && event.altKey && !event.shiftKey) {
      if (event.code === 'KeyH') {
        event.preventDefault();
        this.#focusHeaderFooterShortcut('header');
      } else if (event.code === 'KeyF') {
        event.preventDefault();
        this.#focusHeaderFooterShortcut('footer');
      }
    }
  };

  #focusHeaderFooterShortcut(kind: 'header' | 'footer') {
    const pageIndex = this.#getCurrentPageIndex();
    const region = this.#findRegionForPage(kind, pageIndex);
    if (!region) {
      this.#emitHeaderFooterEditBlocked('missingRegion');
      return;
    }
    this.#activateHeaderFooterRegion(region);
  }

  #scheduleRerender() {
    if (this.#renderScheduled) {
      return;
    }
    this.#renderScheduled = true;
    const win = this.#visibleHost.ownerDocument?.defaultView ?? window;
    this.#rafHandle = win.requestAnimationFrame(() => {
      this.#renderScheduled = false;
      this.#flushRerenderQueue().catch((error) => {
        this.#handleLayoutError('render', error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async #flushRerenderQueue() {
    if (this.#isRerendering) {
      this.#pendingDocChange = true;
      return;
    }
    if (!this.#pendingDocChange) {
      return;
    }
    this.#pendingDocChange = false;
    this.#isRerendering = true;
    try {
      await this.#rerender();
    } finally {
      this.#isRerendering = false;
      if (this.#pendingDocChange) {
        this.#scheduleRerender();
      }
    }
  }

  async #rerender() {
    this.#selectionSync.onLayoutStart();
    let layoutCompleted = false;

    try {
      let docJson;
      const viewWindow = this.#visibleHost.ownerDocument?.defaultView ?? window;
      const perf = viewWindow?.performance ?? GLOBAL_PERFORMANCE;
      const startMark = perf?.now?.();
      try {
        docJson = this.#editor.getJSON();
      } catch (error) {
        this.#handleLayoutError('render', this.#decorateError(error, 'getJSON'));
        return;
      }
      const layoutEpoch = this.#epochMapper.getCurrentEpoch();

      const sectionMetadata: SectionMetadata[] = [];
      let blocks: FlowBlock[] | undefined;
      let bookmarks: Map<string, number> = new Map();
      try {
        const converter = (this.#editor as Editor & { converter?: Record<string, unknown> }).converter;
        const converterContext = converter
          ? {
              docx: converter.convertedXml,
              numbering: converter.numbering,
              linkedStyles: converter.linkedStyles,
            }
          : undefined;
        const atomNodeTypes = getAtomNodeTypesFromSchema(this.#editor?.schema ?? null);
        const positionMap =
          this.#editor?.state?.doc && docJson ? buildPositionMapFromPmDoc(this.#editor.state.doc, docJson) : null;
        const commentsEnabled =
          this.#documentMode !== 'viewing' || this.#layoutOptions.enableCommentsInViewing === true;
        const result = toFlowBlocks(docJson, {
          mediaFiles: (this.#editor?.storage?.image as { media?: Record<string, string> })?.media,
          emitSectionBreaks: true,
          sectionMetadata,
          trackedChangesMode: this.#trackedChangesMode,
          enableTrackedChanges: this.#trackedChangesEnabled,
          enableComments: commentsEnabled,
          enableRichHyperlinks: true,
          themeColors: this.#editor?.converter?.themeColors ?? undefined,
          converterContext,
          ...(positionMap ? { positions: positionMap } : {}),
          ...(atomNodeTypes.length > 0 ? { atomNodeTypes } : {}),
        });
        blocks = result.blocks;
        bookmarks = result.bookmarks ?? new Map();
      } catch (error) {
        this.#handleLayoutError('render', this.#decorateError(error, 'toFlowBlocks'));
        return;
      }

      if (!blocks) {
        this.#handleLayoutError('render', new Error('toFlowBlocks returned undefined blocks'));
        return;
      }

      const layoutOptions = this.#resolveLayoutOptions(blocks, sectionMetadata);
      const previousBlocks = this.#layoutState.blocks;
      const previousLayout = this.#layoutState.layout;

      let layout: Layout;
      let measures: Measure[];
      let headerLayouts: HeaderFooterLayoutResult[] | undefined;
      let footerLayouts: HeaderFooterLayoutResult[] | undefined;
      const headerFooterInput = this.#buildHeaderFooterInput();
      try {
        const result = await incrementalLayout(
          previousBlocks,
          previousLayout,
          blocks,
          layoutOptions,
          (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => measureBlock(block, constraints),
          headerFooterInput ?? undefined,
        );

        // Type guard: validate incrementalLayout return value
        if (!result || typeof result !== 'object') {
          this.#handleLayoutError('render', new Error('incrementalLayout returned invalid result'));
          return;
        }
        if (!result.layout || typeof result.layout !== 'object') {
          this.#handleLayoutError('render', new Error('incrementalLayout returned invalid layout'));
          return;
        }
        if (!Array.isArray(result.measures)) {
          this.#handleLayoutError('render', new Error('incrementalLayout returned invalid measures'));
          return;
        }

        ({ layout, measures } = result);
        // Add pageGap to layout for hit testing to account for gaps between rendered pages.
        // Gap depends on virtualization mode and must be non-negative.
        layout.pageGap = this.#getEffectivePageGap();
        (layout as Layout & { layoutEpoch?: number }).layoutEpoch = layoutEpoch;
        headerLayouts = result.headers;
        footerLayouts = result.footers;
      } catch (error) {
        this.#handleLayoutError('render', this.#decorateError(error, 'incrementalLayout'));
        return;
      }

      this.#sectionMetadata = sectionMetadata;
      // Build multi-section identifier from section metadata for section-aware header/footer selection
      // Pass converter's headerIds/footerIds as fallbacks for dynamically created headers/footers
      const converter = (this.#editor as EditorWithConverter).converter;
      this.#multiSectionIdentifier = buildMultiSectionIdentifier(sectionMetadata, converter?.pageStyles, {
        headerIds: converter?.headerIds,
        footerIds: converter?.footerIds,
      });
      const anchorMap = computeAnchorMapFromHelper(bookmarks, layout, blocks);
      this.#layoutState = { blocks, measures, layout, bookmarks, anchorMap };
      this.#headerLayoutResults = headerLayouts ?? null;
      this.#footerLayoutResults = footerLayouts ?? null;

      // Initialize or update PageGeometryHelper when layout changes
      if (this.#layoutState.layout) {
        const pageGap = this.#layoutState.layout.pageGap ?? this.#getEffectivePageGap();
        if (!this.#pageGeometryHelper) {
          this.#pageGeometryHelper = new PageGeometryHelper({
            layout: this.#layoutState.layout,
            pageGap,
          });
        } else {
          this.#pageGeometryHelper.updateLayout(this.#layoutState.layout, pageGap);
        }
      }

      // Process per-rId header/footer content for multi-section support
      await this.#layoutPerRIdHeaderFooters(headerFooterInput, layout, sectionMetadata);

      this.#updateDecorationProviders(layout);

      const painter = this.#ensurePainter(blocks, measures);
      if (typeof painter.setProviders === 'function') {
        painter.setProviders(this.#headerDecorationProvider, this.#footerDecorationProvider);
      }

      // Extract header/footer blocks and measures from layout results
      const headerBlocks: FlowBlock[] = [];
      const headerMeasures: Measure[] = [];
      if (headerLayouts) {
        for (const headerResult of headerLayouts) {
          headerBlocks.push(...headerResult.blocks);
          headerMeasures.push(...headerResult.measures);
        }
      }
      // Also include per-rId header blocks for multi-section support
      for (const rIdResult of this.#headerLayoutsByRId.values()) {
        headerBlocks.push(...rIdResult.blocks);
        headerMeasures.push(...rIdResult.measures);
      }

      const footerBlocks: FlowBlock[] = [];
      const footerMeasures: Measure[] = [];
      if (footerLayouts) {
        for (const footerResult of footerLayouts) {
          footerBlocks.push(...footerResult.blocks);
          footerMeasures.push(...footerResult.measures);
        }
      }
      // Also include per-rId footer blocks for multi-section support
      for (const rIdResult of this.#footerLayoutsByRId.values()) {
        footerBlocks.push(...rIdResult.blocks);
        footerMeasures.push(...rIdResult.measures);
      }

      // Pass all blocks (main document + headers + footers) to the painter
      painter.setData?.(
        blocks,
        measures,
        headerBlocks.length > 0 ? headerBlocks : undefined,
        headerMeasures.length > 0 ? headerMeasures : undefined,
        footerBlocks.length > 0 ? footerBlocks : undefined,
        footerMeasures.length > 0 ? footerMeasures : undefined,
      );
      // Avoid MutationObserver overhead while repainting large DOM trees.
      this.#domIndexObserverManager?.pause();
      // Pass the transaction mapping for efficient position attribute updates.
      // Consumed here and cleared to prevent stale mappings on subsequent paints.
      const mapping = this.#pendingMapping;
      this.#pendingMapping = null;
      painter.paint(layout, this.#painterHost, mapping ?? undefined);
      this.#applyVertAlignToLayout();
      this.#rebuildDomPositionIndex();
      this.#domIndexObserverManager?.resume();
      this.#layoutEpoch = layoutEpoch;
      this.#epochMapper.onLayoutComplete(layoutEpoch);
      this.#selectionSync.onLayoutComplete(layoutEpoch);
      layoutCompleted = true;
      this.#updatePermissionOverlay();

      // Reset error state on successful layout
      this.#layoutError = null;
      this.#layoutErrorState = 'healthy';
      this.#dismissErrorBanner();

      // Update viewport dimensions after layout (page count may have changed)
      this.#applyZoom();

      const metrics = createLayoutMetricsFromHelper(perf, startMark, layout, blocks);
      const payload = { layout, blocks, measures, metrics };
      this.emit('layoutUpdated', payload);
      this.emit('paginationUpdate', payload);

      // Emit fresh comment positions after layout completes.
      // This ensures positions are always in sync with the current document and layout.
      const allowViewingCommentPositions = this.#layoutOptions.emitCommentPositionsInViewing === true;
      if (this.#documentMode !== 'viewing' || allowViewingCommentPositions) {
        const commentPositions = this.#collectCommentPositions();
        const positionKeys = Object.keys(commentPositions);
        if (positionKeys.length > 0) {
          this.emit('commentPositions', { positions: commentPositions });
        }
      }
      if (this.#telemetryEmitter && metrics) {
        this.#telemetryEmitter({ type: 'layout', data: { layout, blocks, measures, metrics } });
      }
      this.#selectionSync.requestRender({ immediate: true });

      // Trigger cursor re-rendering on layout changes without re-normalizing awareness
      // Layout reflow requires repositioning cursors in the DOM, but awareness states haven't changed
      // This optimization avoids expensive Yjs position conversions on every layout update
      if (this.#remoteCursorState.size > 0) {
        this.#scheduleRemoteCursorReRender();
      }
    } finally {
      if (!layoutCompleted) {
        this.#selectionSync.onLayoutAbort();
      }
    }
  }

  #ensurePainter(blocks: FlowBlock[], measures: Measure[]) {
    if (!this.#domPainter) {
      this.#domPainter = createDomPainter({
        blocks,
        measures,
        layoutMode: this.#layoutOptions.layoutMode ?? 'vertical',
        virtualization: this.#layoutOptions.virtualization,
        pageStyles: this.#layoutOptions.pageStyles,
        headerProvider: this.#headerDecorationProvider,
        footerProvider: this.#footerDecorationProvider,
        ruler: this.#layoutOptions.ruler,
        pageGap: this.#layoutState.layout?.pageGap ?? this.#getEffectivePageGap(),
      });
    }
    return this.#domPainter;
  }

  /**
   * Requests a local selection overlay update.
   *
   * Selection rendering is coordinated by `SelectionSyncCoordinator` so we never
   * render against a layout that's mid-update (pagination/virtualization), and so
   * we only update when `layoutEpoch` has caught up to the current `docEpoch`.
   */
  #scheduleSelectionUpdate(options?: { immediate?: boolean }) {
    this.#selectionSync.requestRender(options);
  }

  /**
   * Updates the visual cursor/selection overlay to match the current editor selection.
   *
   * Handles several edge cases:
   * - Defers cursor clearing until new position is successfully computed
   * - Preserves existing cursor visibility when position cannot be computed
   * - Skips rendering in header/footer mode and viewing mode
   * - Skips rendering when the painted layout is stale (epoch mismatch)
   *
   * This method is called after layout completes to ensure cursor positioning
   * is based on stable layout data.
   *
   * @returns {void}
   *
   * @remarks
   * Edge cases handled:
   * - Position lookup failure: When #computeCaretLayoutRect(from) returns null, keep the existing caret visible.
   * - Layout staleness: When #layoutEpoch doesn't match the current doc epoch, keep the last known-good overlay.
   *
   * Side effects:
   * - Mutates #localSelectionLayer.innerHTML (clears or sets cursor/selection HTML)
   * - Calls #renderCaretOverlay() or #renderSelectionRects() which mutate DOM
   * - DOM manipulation is wrapped in try/catch to prevent errors from breaking editor state
   *
   * @private
   */
  #updateSelection() {
    // In header/footer mode, the ProseMirror editor handles its own caret
    if (this.#session.mode !== 'body') {
      return;
    }

    // Only clear local layer, preserve remote cursor layer
    if (!this.#localSelectionLayer) {
      return;
    }

    // In viewing mode, don't render caret or selection highlights
    if (this.#isViewLocked()) {
      try {
        this.#localSelectionLayer.innerHTML = '';
      } catch (error) {
        // DOM manipulation can fail if element is detached or in invalid state
        // Log but don't throw to prevent breaking editor
        if (process.env.NODE_ENV === 'development') {
          console.warn('[PresentationEditor] Failed to clear selection layer in viewing mode:', error);
        }
      }
      return;
    }
    const layout = this.#layoutState.layout;
    const editorState = this.getActiveEditor().state;
    const selection = editorState?.selection;

    if (!selection) {
      try {
        this.#localSelectionLayer.innerHTML = '';
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[PresentationEditor] Failed to clear selection layer (no selection):', error);
        }
      }
      return;
    }

    if (!layout) {
      // No layout yet - keep existing cursor visible until layout is ready
      return;
    }

    const { from, to } = selection;
    const docEpoch = this.#epochMapper.getCurrentEpoch();
    if (this.#layoutEpoch < docEpoch) {
      // The visible layout DOM does not match the current document state.
      // Avoid rendering a "best effort" caret/selection that would drift.
      return;
    }

    // Ensure selection endpoints remain mounted under virtualization so DOM-first
    // caret/selection rendering stays available during cross-page selection.
    this.#updateSelectionVirtualizationPins({ includeDragBuffer: this.#isDragging });

    // Handle CellSelection - render cell backgrounds for selected table cells
    if (selection instanceof CellSelection) {
      try {
        this.#localSelectionLayer.innerHTML = '';
        this.#renderCellSelectionOverlay(selection, layout);
      } catch (error) {
        console.warn('[PresentationEditor] Failed to render cell selection overlay:', error);
      }
      return;
    }

    if (from === to) {
      const caretLayout = this.#computeCaretLayoutRect(from);
      if (!caretLayout) {
        // Keep existing cursor visible rather than clearing it
        return;
      }
      // Only clear old cursor after successfully computing new position
      try {
        this.#localSelectionLayer.innerHTML = '';
        renderCaretOverlay({
          localSelectionLayer: this.#localSelectionLayer,
          caretLayout,
          convertPageLocalToOverlayCoords: (pageIndex, x, y) => this.#convertPageLocalToOverlayCoords(pageIndex, x, y),
        });
      } catch (error) {
        // DOM manipulation can fail if element is detached or in invalid state
        if (process.env.NODE_ENV === 'development') {
          console.warn('[PresentationEditor] Failed to render caret overlay:', error);
        }
      }
      return;
    }

    const domRects = this.#computeSelectionRectsFromDom(from, to);
    if (domRects == null) {
      // DOM-derived selection failed; keep last known-good overlay instead of drifting.
      debugLog('warn', 'Local selection: DOM rect computation failed', { from, to });
      return;
    }

    try {
      this.#localSelectionLayer.innerHTML = '';
      if (domRects.length > 0) {
        renderSelectionRects({
          localSelectionLayer: this.#localSelectionLayer,
          rects: domRects,
          pageHeight: this.#getBodyPageHeight(),
          pageGap: this.#layoutState.layout?.pageGap ?? 0,
          convertPageLocalToOverlayCoords: (pageIndex, x, y) => this.#convertPageLocalToOverlayCoords(pageIndex, x, y),
        });
      }
    } catch (error) {
      // DOM manipulation can fail if element is detached or in invalid state
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PresentationEditor] Failed to render selection rects:', error);
      }
    }
  }

  /**
   * Updates the permission overlay (w:permStart/w:permEnd) to match the current editor permission ranges.
   *
   * This method is called after layout completes to ensure permission overlay
   * is based on stable permission ranges data.
   */
  #updatePermissionOverlay() {
    const overlay = this.#permissionOverlay;
    if (!overlay) {
      return;
    }

    if (this.#session.mode !== 'body') {
      overlay.innerHTML = '';
      return;
    }

    const permissionStorage = (this.#editor as Editor & { storage?: Record<string, any> })?.storage?.permissionRanges;
    const ranges: Array<{ from: number; to: number }> = permissionStorage?.ranges ?? [];
    const shouldRender = ranges.length > 0;

    if (!shouldRender) {
      overlay.innerHTML = '';
      return;
    }

    const layout = this.#layoutState.layout;
    if (!layout) {
      overlay.innerHTML = '';
      return;
    }

    const docEpoch = this.#epochMapper.getCurrentEpoch();
    // The visible layout DOM does not match the current document state.
    // Avoid rendering a "best effort" permission overlay that would drift.
    if (this.#layoutEpoch < docEpoch) {
      return;
    }

    const pageHeight = this.#getBodyPageHeight();
    const pageGap = layout.pageGap ?? this.#getEffectivePageGap();
    const fragment = overlay.ownerDocument?.createDocumentFragment();
    if (!fragment) {
      overlay.innerHTML = '';
      return;
    }

    ranges.forEach(({ from, to }) => {
      const rects = this.#computeSelectionRectsFromDom(from, to);
      if (!rects?.length) {
        return;
      }
      rects.forEach((rect) => {
        const pageLocalY = rect.y - rect.pageIndex * (pageHeight + pageGap);
        const coords = this.#convertPageLocalToOverlayCoords(rect.pageIndex, rect.x, pageLocalY);
        if (!coords) {
          return;
        }
        const highlight = overlay.ownerDocument?.createElement('div');
        if (!highlight) {
          return;
        }
        highlight.className = 'presentation-editor__permission-highlight';
        Object.assign(highlight.style, {
          position: 'absolute',
          left: `${coords.x}px`,
          top: `${coords.y}px`,
          width: `${Math.max(1, rect.width)}px`,
          height: `${Math.max(1, rect.height)}px`,
          borderRadius: '2px',
          pointerEvents: 'none',
          zIndex: 1,
        });
        fragment.appendChild(highlight);
      });
    });

    overlay.innerHTML = '';
    overlay.appendChild(fragment);
  }

  #resolveLayoutOptions(blocks: FlowBlock[] | undefined, sectionMetadata: SectionMetadata[]) {
    const defaults = this.#computeDefaultLayoutDefaults();
    const firstSection = blocks?.find(
      (block) =>
        block.kind === 'sectionBreak' &&
        (block as FlowBlock & { attrs?: { isFirstSection?: boolean } })?.attrs?.isFirstSection,
    ) as
      | (FlowBlock & {
          kind: 'sectionBreak';
          pageSize?: PageSize;
          columns?: ColumnLayout;
          margins?: { header?: number; footer?: number; top?: number; right?: number; bottom?: number; left?: number };
        })
      | undefined;

    const pageSize = firstSection?.pageSize ?? defaults.pageSize;
    const margins: PageMargins = {
      ...defaults.margins,
      ...(firstSection?.margins?.top != null ? { top: firstSection.margins.top } : {}),
      ...(firstSection?.margins?.right != null ? { right: firstSection.margins.right } : {}),
      ...(firstSection?.margins?.bottom != null ? { bottom: firstSection.margins.bottom } : {}),
      ...(firstSection?.margins?.left != null ? { left: firstSection.margins.left } : {}),
      ...(firstSection?.margins?.header != null ? { header: firstSection.margins.header } : {}),
      ...(firstSection?.margins?.footer != null ? { footer: firstSection.margins.footer } : {}),
    };
    const columns = firstSection?.columns ?? defaults.columns;

    this.#layoutOptions.pageSize = pageSize;
    this.#layoutOptions.margins = margins;

    this.#hiddenHost.style.width = `${pageSize.w}px`;

    return {
      pageSize,
      margins: margins as Required<Pick<PageMargins, 'top' | 'right' | 'bottom' | 'left'>> &
        Partial<Pick<PageMargins, 'header' | 'footer'>>,
      ...(columns ? { columns } : {}),
      sectionMetadata,
    };
  }

  #buildHeaderFooterInput() {
    if (!this.#headerFooterAdapter) {
      return null;
    }
    const headerBlocks = this.#headerFooterAdapter.getBatch('header');
    const footerBlocks = this.#headerFooterAdapter.getBatch('footer');
    // Also get all blocks by rId for multi-section support
    const headerBlocksByRId = this.#headerFooterAdapter.getBlocksByRId('header');
    const footerBlocksByRId = this.#headerFooterAdapter.getBlocksByRId('footer');
    if (!headerBlocks && !footerBlocks && !headerBlocksByRId && !footerBlocksByRId) {
      return null;
    }
    const constraints = this.#computeHeaderFooterConstraints();
    if (!constraints) {
      return null;
    }
    return {
      headerBlocks,
      footerBlocks,
      headerBlocksByRId,
      footerBlocksByRId,
      constraints,
    };
  }

  /**
   * Computes layout constraints for header and footer content.
   *
   * This method calculates the available width and height for laying out header/footer
   * content, following Microsoft Word's layout model:
   * - Headers/footers use the same left/right margins as the body content
   * - Content renders at its natural height and can extend beyond the nominal space
   * - Body text boundaries are adjusted (effectiveTopMargin/effectiveBottomMargin) to prevent overlap
   *
   * The width is constrained to the body content width (page width minus left/right margins).
   * The height represents the maximum available vertical space between top and bottom margins,
   * allowing header/footer content to grow naturally and push body text as needed.
   *
   * @returns Constraint object containing width, height, pageWidth, and margins,
   *          or null if the constraints cannot be computed (e.g., invalid margins that
   *          exceed page dimensions or produce non-positive content width/height).
   */
  #computeHeaderFooterConstraints() {
    const pageSize = this.#layoutOptions.pageSize ?? DEFAULT_PAGE_SIZE;
    const margins = this.#layoutOptions.margins ?? DEFAULT_MARGINS;
    const marginLeft = margins.left ?? DEFAULT_MARGINS.left!;
    const marginRight = margins.right ?? DEFAULT_MARGINS.right!;
    const bodyContentWidth = pageSize.w - (marginLeft + marginRight);
    if (!Number.isFinite(bodyContentWidth) || bodyContentWidth <= 0) {
      return null;
    }

    // Use body content width for header/footer measurement.
    // Headers/footers should respect the same left/right margins as the body.
    // Note: Tables that need to span beyond margins should use negative indents
    // or be handled via table-specific overflow logic, not by expanding the
    // measurement width for all content.
    const measurementWidth = bodyContentWidth;

    // Header/footer content renders at its natural height.
    // In Word's model:
    // - Headers start at headerDistance from page top, footers at footerDistance from page bottom
    // - Content renders at natural height and can extend into the body area if needed
    // - Body text boundaries are adjusted (effectiveTopMargin/effectiveBottomMargin) to prevent overlap
    //
    // Use the full body height for measuring headers/footers so content can grow
    // naturally (Word-style) and push body text as needed.
    const marginTop = margins.top ?? DEFAULT_MARGINS.top!;
    const marginBottom = margins.bottom ?? DEFAULT_MARGINS.bottom!;

    // Validate that margins are finite numbers and don't exceed page height
    if (!Number.isFinite(marginTop) || !Number.isFinite(marginBottom)) {
      console.warn('[PresentationEditor] Invalid top or bottom margin: not a finite number');
      return null;
    }

    const totalVerticalMargins = marginTop + marginBottom;
    if (totalVerticalMargins >= pageSize.h) {
      console.warn(
        `[PresentationEditor] Invalid margins: top (${marginTop}) + bottom (${marginBottom}) = ${totalVerticalMargins} >= page height (${pageSize.h})`,
      );
      return null;
    }

    // Minimum height for header/footer content to prevent degenerate layouts
    const MIN_HEADER_FOOTER_HEIGHT = 1;
    const height = Math.max(MIN_HEADER_FOOTER_HEIGHT, pageSize.h - totalVerticalMargins);
    const headerMargin = margins.header ?? 0;
    const footerMargin = margins.footer ?? 0;
    const headerBand = Math.max(MIN_HEADER_FOOTER_HEIGHT, marginTop - headerMargin);
    const footerBand = Math.max(MIN_HEADER_FOOTER_HEIGHT, marginBottom - footerMargin);

    // overflowBaseHeight: Bounds behindDoc overflow handling in headers/footers.
    //
    // Purpose:
    // - Prevents decorative background assets (images/drawings with behindDoc=true and extreme
    //   offsets) from inflating header/footer layout height and driving excessive page margins.
    // - Without this bound, a decorative image positioned far outside the header/footer band
    //   (e.g., offsetV=5000) would incorrectly expand the header/footer height, pushing body
    //   content and creating unwanted whitespace.
    //
    // Calculation rationale:
    // - Uses the larger of headerBand or footerBand as the base height.
    // - headerBand = marginTop - headerMargin (space between page top and header start)
    // - footerBand = marginBottom - footerMargin (space between footer end and page bottom)
    // - Taking the max ensures consistent overflow handling regardless of whether we're
    //   measuring a header or footer, using the more permissive band size.
    // - This value is passed to layoutHeaderFooter, which allows behindDoc fragments to
    //   overflow by up to 4x this base (or 192pt, whichever is larger) before excluding
    //   them from height calculations.
    const overflowBaseHeight = Math.max(headerBand, footerBand);

    return {
      width: measurementWidth,
      height,
      // Pass actual page dimensions for page-relative anchor positioning in headers/footers
      pageWidth: pageSize.w,
      margins: { left: marginLeft, right: marginRight },
      overflowBaseHeight,
    };
  }

  /**
   * Lays out per-rId header/footer content for multi-section documents.
   *
   * This method processes header/footer content for each unique rId, enabling
   * different sections to have different header/footer content. The layouts
   * are stored in #headerLayoutsByRId and #footerLayoutsByRId for use by
   * the decoration provider.
   */
  async #layoutPerRIdHeaderFooters(
    headerFooterInput: {
      headerBlocks?: unknown;
      footerBlocks?: unknown;
      headerBlocksByRId: Map<string, FlowBlock[]> | undefined;
      footerBlocksByRId: Map<string, FlowBlock[]> | undefined;
      constraints: { width: number; height: number; pageWidth: number; margins: { left: number; right: number } };
    } | null,
    layout: Layout,
    sectionMetadata: SectionMetadata[],
  ): Promise<void> {
    return await layoutPerRIdHeaderFootersFromHelper(headerFooterInput, layout, sectionMetadata, {
      headerLayoutsByRId: this.#headerLayoutsByRId,
      footerLayoutsByRId: this.#footerLayoutsByRId,
    });
  }

  #updateDecorationProviders(layout: Layout) {
    this.#headerDecorationProvider = this.#createDecorationProvider('header', layout);
    this.#footerDecorationProvider = this.#createDecorationProvider('footer', layout);
    this.#rebuildHeaderFooterRegions(layout);
  }

  /**
   * Computes layout metrics for header/footer decoration rendering.
   *
   * This helper consolidates the calculation of layout height, container height, and vertical offset
   * for header/footer content, ensuring consistent metrics across both per-rId and variant-based layouts.
   *
   * For headers:
   * - layoutHeight: The actual measured height of the header content
   * - containerHeight: The larger of the box height (space between headerDistance and topMargin) or layoutHeight
   * - offset: Always positioned at headerDistance from page top (Word's model)
   *
   * For footers:
   * - layoutHeight: The actual measured height of the footer content
   * - containerHeight: The larger of the box height (space between bottomMargin and footerDistance) or layoutHeight
   * - offset: Positioned so the container bottom aligns with footerDistance from page bottom
   *   When content exceeds the nominal space (box.height), the footer extends upward into the body area,
   *   matching Word's behavior where overflow pushes body text up rather than clipping.
   *
   * @param kind - Whether this is a header or footer
   * @param layoutHeight - The measured height of the header/footer content layout (may be 0 if layout has no height)
   * @param box - The computed decoration box containing nominal position and dimensions
   * @param pageHeight - Total page height in points
   * @param footerMargin - Footer margin (footerDistance) from page bottom, used only for footer offset calculation
   * @returns Object containing layoutHeight (validated as non-negative finite number),
   *          containerHeight (max of box height and layout height), and offset (vertical position from page top)
   */
  #computeHeaderFooterMetrics(
    kind: 'header' | 'footer',
    layoutHeight: number,
    box: { height: number; offset: number },
    pageHeight: number,
    footerMargin: number,
  ): { layoutHeight: number; containerHeight: number; offset: number } {
    // Ensure layoutHeight is a valid finite number, default to 0 if not
    const validatedLayoutHeight = Number.isFinite(layoutHeight) && layoutHeight >= 0 ? layoutHeight : 0;

    // Container must accommodate both the nominal box height and the actual content height
    const containerHeight = Math.max(box.height, validatedLayoutHeight);

    // Calculate vertical offset based on header/footer type
    // Headers: Always start at headerDistance (box.offset) from page top
    // Footers: Position so container bottom is at footerDistance from page bottom
    //   - If content is taller than box.height, this extends the footer upward
    //   - This matches Word's behavior where overflow grows into body area
    const offset = kind === 'header' ? box.offset : Math.max(0, pageHeight - footerMargin - containerHeight);

    return {
      layoutHeight: validatedLayoutHeight,
      containerHeight,
      offset,
    };
  }

  #createDecorationProvider(kind: 'header' | 'footer', layout: Layout): PageDecorationProvider | undefined {
    const results = kind === 'header' ? this.#headerLayoutResults : this.#footerLayoutResults;
    const layoutsByRId = kind === 'header' ? this.#headerLayoutsByRId : this.#footerLayoutsByRId;

    if ((!results || results.length === 0) && layoutsByRId.size === 0) {
      return undefined;
    }

    const multiSectionId = this.#multiSectionIdentifier;
    const legacyIdentifier =
      this.#headerFooterIdentifier ??
      extractIdentifierFromConverter((this.#editor as Editor & { converter?: unknown }).converter);

    const sectionFirstPageNumbers = new Map<number, number>();
    for (const p of layout.pages) {
      const idx = p.sectionIndex ?? 0;
      if (!sectionFirstPageNumbers.has(idx)) {
        sectionFirstPageNumbers.set(idx, p.number);
      }
    }

    return (pageNumber, pageMargins, page) => {
      const sectionIndex = page?.sectionIndex ?? 0;
      const firstPageInSection = sectionFirstPageNumbers.get(sectionIndex);
      const sectionPageNumber =
        typeof firstPageInSection === 'number' ? pageNumber - firstPageInSection + 1 : pageNumber;
      const headerFooterType = multiSectionId
        ? getHeaderFooterTypeForSection(pageNumber, sectionIndex, multiSectionId, { kind, sectionPageNumber })
        : getHeaderFooterType(pageNumber, legacyIdentifier, { kind });

      // Resolve the section-specific rId for this header/footer variant.
      // Implements Word's OOXML inheritance model:
      //   1. Try current section's variant (e.g., 'first' header for first page with titlePg)
      //   2. If not found, inherit from previous section's same variant
      //   3. Final fallback: use current section's 'default' variant
      // This ensures documents with multi-section layouts render correctly when sections
      // don't explicitly define all header/footer variants (common in Word documents).
      let sectionRId: string | undefined;
      if (page?.sectionRefs && kind === 'header') {
        sectionRId = page.sectionRefs.headerRefs?.[headerFooterType as keyof typeof page.sectionRefs.headerRefs];
        // Step 2: Inherit from previous section if variant not found
        if (!sectionRId && headerFooterType && headerFooterType !== 'default' && sectionIndex > 0 && multiSectionId) {
          const prevSectionIds = multiSectionId.sectionHeaderIds.get(sectionIndex - 1);
          sectionRId = prevSectionIds?.[headerFooterType as keyof typeof prevSectionIds] ?? undefined;
        }
        // Step 3: Fall back to current section's 'default'
        if (!sectionRId && headerFooterType !== 'default') {
          sectionRId = page.sectionRefs.headerRefs?.default;
        }
      } else if (page?.sectionRefs && kind === 'footer') {
        sectionRId = page.sectionRefs.footerRefs?.[headerFooterType as keyof typeof page.sectionRefs.footerRefs];
        // Step 2: Inherit from previous section if variant not found
        if (!sectionRId && headerFooterType && headerFooterType !== 'default' && sectionIndex > 0 && multiSectionId) {
          const prevSectionIds = multiSectionId.sectionFooterIds.get(sectionIndex - 1);
          sectionRId = prevSectionIds?.[headerFooterType as keyof typeof prevSectionIds] ?? undefined;
        }
        // Step 3: Fall back to current section's 'default'
        if (!sectionRId && headerFooterType !== 'default') {
          sectionRId = page.sectionRefs.footerRefs?.default;
        }
      }

      if (!headerFooterType) {
        return null;
      }

      // PRIORITY 1: Try per-rId layout if we have a section-specific rId
      if (sectionRId && layoutsByRId.has(sectionRId)) {
        const rIdLayout = layoutsByRId.get(sectionRId);
        // Defensive null check: layoutsByRId.has() should guarantee the value exists,
        // but we verify to prevent runtime errors if the Map state is inconsistent
        if (!rIdLayout) {
          console.warn(
            `[PresentationEditor] Inconsistent state: layoutsByRId.has('${sectionRId}') returned true but get() returned undefined`,
          );
          // Fall through to PRIORITY 2 (variant-based layout)
        } else {
          const slotPage = this.#findHeaderFooterPageForPageNumber(rIdLayout.layout.pages, pageNumber);
          if (slotPage) {
            const fragments = slotPage.fragments ?? [];

            const pageHeight =
              page?.size?.h ?? layout.pageSize?.h ?? this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
            const margins = pageMargins ?? layout.pages[0]?.margins ?? this.#layoutOptions.margins ?? DEFAULT_MARGINS;
            const box = this.#computeDecorationBox(kind, margins, pageHeight);

            // Use helper to compute metrics with type safety and consistent logic
            const rawLayoutHeight = rIdLayout.layout.height ?? 0;
            const metrics = this.#computeHeaderFooterMetrics(
              kind,
              rawLayoutHeight,
              box,
              pageHeight,
              margins.footer ?? 0,
            );

            // Normalize fragments to start at y=0 if minY is negative
            const layoutMinY = rIdLayout.layout.minY ?? 0;
            const normalizedFragments =
              layoutMinY < 0 ? fragments.map((f) => ({ ...f, y: f.y - layoutMinY })) : fragments;

            return {
              fragments: normalizedFragments,
              height: metrics.containerHeight,
              contentHeight: metrics.layoutHeight > 0 ? metrics.layoutHeight : metrics.containerHeight,
              offset: metrics.offset,
              marginLeft: box.x,
              contentWidth: box.width,
              headerId: sectionRId,
              sectionType: headerFooterType,
              minY: layoutMinY,
              box: {
                x: box.x,
                y: metrics.offset,
                width: box.width,
                height: metrics.containerHeight,
              },
              hitRegion: {
                x: box.x,
                y: metrics.offset,
                width: box.width,
                height: metrics.containerHeight,
              },
            };
          }
        }
      }

      // PRIORITY 2: Fall back to variant-based layout (legacy behavior)
      if (!results || results.length === 0) {
        return null;
      }

      const variant = results.find((entry) => entry.type === headerFooterType);
      if (!variant || !variant.layout?.pages?.length) {
        return null;
      }

      const slotPage = this.#findHeaderFooterPageForPageNumber(variant.layout.pages, pageNumber);
      if (!slotPage) {
        return null;
      }
      const fragments = slotPage.fragments ?? [];

      const pageHeight = page?.size?.h ?? layout.pageSize?.h ?? this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
      const margins = pageMargins ?? layout.pages[0]?.margins ?? this.#layoutOptions.margins ?? DEFAULT_MARGINS;
      const box = this.#computeDecorationBox(kind, margins, pageHeight);

      // Use helper to compute metrics with type safety and consistent logic
      const rawLayoutHeight = variant.layout.height ?? 0;
      const metrics = this.#computeHeaderFooterMetrics(kind, rawLayoutHeight, box, pageHeight, margins.footer ?? 0);

      const fallbackId = this.#headerFooterManager?.getVariantId(kind, headerFooterType);
      const finalHeaderId = sectionRId ?? fallbackId ?? undefined;

      // Normalize fragments to start at y=0 if minY is negative
      const layoutMinY = variant.layout.minY ?? 0;
      const normalizedFragments = layoutMinY < 0 ? fragments.map((f) => ({ ...f, y: f.y - layoutMinY })) : fragments;

      return {
        fragments: normalizedFragments,
        height: metrics.containerHeight,
        contentHeight: metrics.layoutHeight > 0 ? metrics.layoutHeight : metrics.containerHeight,
        offset: metrics.offset,
        marginLeft: box.x,
        contentWidth: box.width,
        headerId: finalHeaderId,
        sectionType: headerFooterType,
        minY: layoutMinY,
        box: {
          x: box.x,
          y: metrics.offset,
          width: box.width,
          height: metrics.containerHeight,
        },
        hitRegion: {
          x: box.x,
          y: metrics.offset,
          width: box.width,
          height: metrics.containerHeight,
        },
      };
    };
  }

  /**
   * Finds the header/footer page layout for a given page number with bucket fallback.
   *
   * Lookup strategy:
   * 1. Try exact match first (find page with matching number)
   * 2. If bucketing is used, fall back to the bucket's representative page
   * 3. Finally, fall back to the first available page
   *
   * Digit buckets (for large documents):
   * - d1: pages 1-9 → representative page 5
   * - d2: pages 10-99 → representative page 50
   * - d3: pages 100-999 → representative page 500
   * - d4: pages 1000+ → representative page 5000
   *
   * @param pages - Array of header/footer layout pages from the variant
   * @param pageNumber - Physical page number to find layout for (1-indexed)
   * @returns Header/footer page layout, or undefined if no suitable page found
   */
  #findHeaderFooterPageForPageNumber(
    pages: Array<{ number: number; fragments: Fragment[] }>,
    pageNumber: number,
  ): { number: number; fragments: Fragment[] } | undefined {
    if (!pages || pages.length === 0) {
      return undefined;
    }

    // 1. Try exact match first
    const exactMatch = pages.find((p) => p.number === pageNumber);
    if (exactMatch) {
      return exactMatch;
    }

    // 2. If bucketing is used, find the representative for this page's bucket
    const bucket = getBucketForPageNumber(pageNumber);
    const representative = getBucketRepresentative(bucket);
    const bucketMatch = pages.find((p) => p.number === representative);
    if (bucketMatch) {
      return bucketMatch;
    }

    // 3. Final fallback: return the first available page
    return pages[0];
  }

  #computeDecorationBox(kind: 'header' | 'footer', pageMargins?: PageMargins, pageHeight?: number) {
    const margins = pageMargins ?? this.#layoutOptions.margins ?? DEFAULT_MARGINS;
    const pageSize = this.#layoutOptions.pageSize ?? DEFAULT_PAGE_SIZE;
    const left = margins.left ?? DEFAULT_MARGINS.left!;
    const right = margins.right ?? DEFAULT_MARGINS.right!;
    const width = Math.max(pageSize.w - (left + right), 1);
    const totalHeight = pageHeight ?? pageSize.h;

    // MS Word positioning:
    // - Header: ALWAYS starts at headerMargin (headerDistance) from page top
    // - Footer: ends at footerMargin from page bottom, can extend up to bottomMargin
    // Word keeps header at headerDistance regardless of topMargin value.
    // Even for zero-margin docs, the header content starts at headerDistance from page top.
    if (kind === 'header') {
      const headerMargin = margins.header ?? 0;
      const topMargin = margins.top ?? DEFAULT_MARGINS.top ?? 0;
      // Height is the space available for header (between headerMargin and topMargin)
      const height = Math.max(topMargin - headerMargin, 1);
      // Header always starts at headerDistance from page top, matching Word behavior
      const offset = headerMargin;
      return { x: left, width, height, offset };
    } else {
      const footerMargin = margins.footer ?? 0;
      const bottomMargin = margins.bottom ?? DEFAULT_MARGINS.bottom ?? 0;
      // Height is the space available for footer (between bottomMargin and footerMargin)
      const height = Math.max(bottomMargin - footerMargin, 1);
      // Position so container bottom is at footerMargin from page bottom
      const offset = Math.max(0, totalHeight - footerMargin - height);
      return { x: left, width, height, offset };
    }
  }

  /**
   * Computes the expected header/footer section type for a page based on document configuration.
   *
   * Unlike getHeaderFooterType/getHeaderFooterTypeForSection, this returns the appropriate
   * variant even when no header/footer IDs are configured. This is needed to determine
   * what variant to create when the user double-clicks an empty header/footer region.
   *
   * @param kind - Whether this is for a header or footer
   * @param page - The page to compute the section type for
   * @param sectionFirstPageNumbers - Map of section index to first page number in that section
   * @returns The expected section type ('default', 'first', 'even', or 'odd')
   */
  #computeExpectedSectionType(
    kind: 'header' | 'footer',
    page: Page,
    sectionFirstPageNumbers: Map<number, number>,
  ): HeaderFooterType {
    const sectionIndex = page.sectionIndex ?? 0;
    const firstPageInSection = sectionFirstPageNumbers.get(sectionIndex);
    const sectionPageNumber =
      typeof firstPageInSection === 'number' ? page.number - firstPageInSection + 1 : page.number;

    // Get titlePg and alternateHeaders settings from identifiers
    const multiSectionId = this.#multiSectionIdentifier;
    const legacyIdentifier = this.#headerFooterIdentifier;

    let titlePgEnabled = false;
    let alternateHeaders = false;

    if (multiSectionId) {
      titlePgEnabled = multiSectionId.sectionTitlePg?.get(sectionIndex) ?? multiSectionId.titlePg;
      alternateHeaders = multiSectionId.alternateHeaders;
    } else if (legacyIdentifier) {
      titlePgEnabled = legacyIdentifier.titlePg;
      alternateHeaders = legacyIdentifier.alternateHeaders;
    }

    // First page of section with titlePg enabled
    if (sectionPageNumber === 1 && titlePgEnabled) {
      return 'first';
    }

    // Alternate headers (even/odd)
    if (alternateHeaders) {
      return page.number % 2 === 0 ? 'even' : 'odd';
    }

    return 'default';
  }

  #rebuildHeaderFooterRegions(layout: Layout) {
    this.#headerRegions.clear();
    this.#footerRegions.clear();
    const pageHeight = layout.pageSize?.h ?? this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
    if (pageHeight <= 0) return;

    // Build section first page numbers map (same logic as in #createDecorationProvider)
    const sectionFirstPageNumbers = new Map<number, number>();
    for (const p of layout.pages) {
      const idx = p.sectionIndex ?? 0;
      if (!sectionFirstPageNumbers.has(idx)) {
        sectionFirstPageNumbers.set(idx, p.number);
      }
    }

    layout.pages.forEach((page, pageIndex) => {
      const margins = page.margins ?? this.#layoutOptions.margins ?? DEFAULT_MARGINS;
      const actualPageHeight = page.size?.h ?? pageHeight;

      // Try to get payload from decoration provider (may be null if no content exists)
      const headerPayload = this.#headerDecorationProvider?.(page.number, margins, page);

      // Always create a hit region for headers - use payload's hitRegion or compute fallback
      const headerBox = this.#computeDecorationBox('header', margins, actualPageHeight);
      this.#headerRegions.set(pageIndex, {
        kind: 'header',
        headerId: headerPayload?.headerId,
        sectionType:
          headerPayload?.sectionType ?? this.#computeExpectedSectionType('header', page, sectionFirstPageNumbers),
        pageIndex,
        pageNumber: page.number,
        localX: headerPayload?.hitRegion?.x ?? headerBox.x,
        localY: headerPayload?.hitRegion?.y ?? headerBox.offset,
        width: headerPayload?.hitRegion?.width ?? headerBox.width,
        height: headerPayload?.hitRegion?.height ?? headerBox.height,
      });

      // Same for footer - always create a hit region
      const footerPayload = this.#footerDecorationProvider?.(page.number, margins, page);
      const footerBox = this.#computeDecorationBox('footer', margins, actualPageHeight);
      this.#footerRegions.set(pageIndex, {
        kind: 'footer',
        headerId: footerPayload?.headerId,
        sectionType:
          footerPayload?.sectionType ?? this.#computeExpectedSectionType('footer', page, sectionFirstPageNumbers),
        pageIndex,
        pageNumber: page.number,
        localX: footerPayload?.hitRegion?.x ?? footerBox.x,
        localY: footerPayload?.hitRegion?.y ?? footerBox.offset,
        width: footerPayload?.hitRegion?.width ?? footerBox.width,
        height: footerPayload?.hitRegion?.height ?? footerBox.height,
        contentHeight: footerPayload?.contentHeight,
        minY: footerPayload?.minY,
      });
    });
  }

  #hitTestHeaderFooterRegion(x: number, y: number): HeaderFooterRegion | null {
    const layout = this.#layoutState.layout;
    if (!layout) return null;
    const pageHeight = layout.pageSize?.h ?? this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
    const pageGap = layout.pageGap ?? 0;
    if (pageHeight <= 0) return null;
    const pageIndex = Math.max(0, Math.floor(y / (pageHeight + pageGap)));
    const pageLocalY = y - pageIndex * (pageHeight + pageGap);

    const headerRegion = this.#headerRegions.get(pageIndex);
    if (headerRegion && this.#pointInRegion(headerRegion, x, pageLocalY)) {
      return headerRegion;
    }
    const footerRegion = this.#footerRegions.get(pageIndex);
    if (footerRegion && this.#pointInRegion(footerRegion, x, pageLocalY)) {
      return footerRegion;
    }
    return null;
  }

  #pointInRegion(region: HeaderFooterRegion, x: number, localY: number) {
    const withinX = x >= region.localX && x <= region.localX + region.width;
    const withinY = localY >= region.localY && localY <= region.localY + region.height;
    return withinX && withinY;
  }

  #activateHeaderFooterRegion(region: HeaderFooterRegion) {
    const permission = this.#validateHeaderFooterEditPermission();
    if (!permission.allowed) {
      this.#emitHeaderFooterEditBlocked(permission.reason ?? 'restricted');
      return;
    }
    void this.#enterHeaderFooterMode(region);
  }

  async #enterHeaderFooterMode(region: HeaderFooterRegion) {
    try {
      if (!this.#headerFooterManager || !this.#overlayManager) {
        // Clear hover on early exit to prevent stale hover state
        this.#clearHoverRegion();
        return;
      }

      const descriptor = this.#resolveDescriptorForRegion(region);
      if (!descriptor) {
        console.warn('[PresentationEditor] No descriptor found for region:', region);
        // Clear hover on validation failure to prevent stale hover state
        this.#clearHoverRegion();
        return;
      }
      if (!descriptor.id) {
        console.warn('[PresentationEditor] Descriptor missing id:', descriptor);
        // Clear hover on validation failure to prevent stale hover state
        this.#clearHoverRegion();
        return;
      }

      // Virtualized pages may not be mounted - scroll into view if needed
      let pageElement = this.#getPageElement(region.pageIndex);
      if (!pageElement) {
        try {
          this.#scrollPageIntoView(region.pageIndex);
          const mounted = await this.#waitForPageMount(region.pageIndex, { timeout: 2000 });
          if (!mounted) {
            console.error('[PresentationEditor] Failed to mount page for header/footer editing');
            this.#clearHoverRegion();
            this.emit('error', {
              error: new Error('Failed to mount page for editing'),
              context: 'enterHeaderFooterMode',
            });
            return;
          }
          pageElement = this.#getPageElement(region.pageIndex);
        } catch (scrollError) {
          console.error('[PresentationEditor] Error mounting page:', scrollError);
          this.#clearHoverRegion();
          this.emit('error', {
            error: scrollError,
            context: 'enterHeaderFooterMode.pageMount',
          });
          return;
        }
      }

      if (!pageElement) {
        console.error('[PresentationEditor] Page element not found after mount attempt');
        this.#clearHoverRegion();
        this.emit('error', {
          error: new Error('Page element not found after mount'),
          context: 'enterHeaderFooterMode',
        });
        return;
      }

      const { success, editorHost, reason } = this.#overlayManager.showEditingOverlay(
        pageElement,
        region,
        this.#layoutOptions.zoom ?? 1,
      );
      if (!success || !editorHost) {
        console.error('[PresentationEditor] Failed to create editor host:', reason);
        this.#clearHoverRegion();
        this.emit('error', {
          error: new Error(`Failed to create editor host: ${reason}`),
          context: 'enterHeaderFooterMode.showOverlay',
        });
        return;
      }

      const layout = this.#layoutState.layout;
      let editor;
      try {
        editor = await this.#headerFooterManager.ensureEditor(descriptor, {
          editorHost,
          availableWidth: region.width,
          availableHeight: region.height,
          currentPageNumber: region.pageNumber,
          totalPageCount: layout?.pages?.length ?? 1,
        });
      } catch (editorError) {
        console.error('[PresentationEditor] Error creating editor:', editorError);
        // Clean up overlay on error
        this.#overlayManager.hideEditingOverlay();
        this.#clearHoverRegion();
        this.emit('error', {
          error: editorError,
          context: 'enterHeaderFooterMode.ensureEditor',
        });
        return;
      }

      if (!editor) {
        console.warn('[PresentationEditor] Failed to ensure editor for descriptor:', descriptor);
        // Clean up overlay if editor creation failed
        this.#overlayManager.hideEditingOverlay();
        this.#clearHoverRegion();
        this.emit('error', {
          error: new Error('Failed to create editor instance'),
          context: 'enterHeaderFooterMode.ensureEditor',
        });
        return;
      }

      // For footers, apply positioning adjustments to match static rendering.
      // Only adjust for negative minY (content with elements above y=0).
      // Note: Bottom-alignment (footerYOffset) is handled by the shape's own CSS
      // positioning in ProseMirror, so we don't apply container-level transforms for that.
      if (region.kind === 'footer') {
        const editorContainer = editorHost.firstElementChild;
        if (editorContainer instanceof HTMLElement) {
          editorContainer.style.overflow = 'visible';

          // Only compensate for negative minY (content extending above y=0)
          if (region.minY != null && region.minY < 0) {
            const shiftDown = Math.abs(region.minY);
            editorContainer.style.transform = `translateY(${shiftDown}px)`;
          } else {
            // Clear any leftover transform from previous sessions to avoid misalignment
            editorContainer.style.transform = '';
          }
        }
      }

      try {
        editor.setEditable(true);
        editor.setOptions({ documentMode: 'editing' });

        // Move caret to end of content (better UX than starting at position 0)
        try {
          const doc = editor.state?.doc;
          if (doc) {
            const endPos = doc.content.size - 1; // Position at end of content
            const pos = Math.max(1, endPos);
            editor.commands?.setTextSelection?.({ from: pos, to: pos });
          }
        } catch (cursorError) {
          // Non-critical error, log but continue
          console.warn('[PresentationEditor] Could not set cursor to end:', cursorError);
        }
      } catch (editableError) {
        console.error('[PresentationEditor] Error setting editor editable:', editableError);
        // Clean up on error
        this.#overlayManager.hideEditingOverlay();
        this.#clearHoverRegion();
        this.emit('error', {
          error: editableError,
          context: 'enterHeaderFooterMode.setEditable',
        });
        return;
      }

      // Hide layout selection overlay so only the ProseMirror caret is visible
      this.#overlayManager.hideSelectionOverlay();

      this.#activeHeaderFooterEditor = editor;

      this.#session = {
        mode: region.kind,
        kind: region.kind,
        headerId: descriptor.id,
        sectionType: descriptor.variant ?? region.sectionType ?? null,
        pageIndex: region.pageIndex,
        pageNumber: region.pageNumber,
      };

      this.#clearHoverRegion();

      try {
        editor.view?.focus();
      } catch (focusError) {
        // Non-critical error, log but continue
        console.warn('[PresentationEditor] Could not focus editor:', focusError);
      }

      this.#emitHeaderFooterModeChanged();
      this.#emitHeaderFooterEditingContext(editor);
      this.#inputBridge?.notifyTargetChanged();
    } catch (error) {
      // Catch any unexpected errors and clean up
      console.error('[PresentationEditor] Unexpected error in enterHeaderFooterMode:', error);

      // Attempt cleanup
      try {
        this.#overlayManager?.hideEditingOverlay();
        this.#overlayManager?.showSelectionOverlay();
        this.#clearHoverRegion();
        this.#activeHeaderFooterEditor = null;
        this.#session = { mode: 'body' };
      } catch (cleanupError) {
        console.error('[PresentationEditor] Error during cleanup:', cleanupError);
      }

      // Emit error event
      this.emit('error', {
        error,
        context: 'enterHeaderFooterMode',
      });
    }
  }

  #exitHeaderFooterMode() {
    if (this.#session.mode === 'body') return;

    // Capture headerId before clearing session - needed for cache invalidation
    const editedHeaderId = this.#session.headerId;

    if (this.#activeHeaderFooterEditor) {
      this.#activeHeaderFooterEditor.setEditable(false);
      this.#activeHeaderFooterEditor.setOptions({ documentMode: 'viewing' });
    }

    this.#overlayManager?.hideEditingOverlay();
    this.#overlayManager?.showSelectionOverlay();

    this.#activeHeaderFooterEditor = null;
    this.#session = { mode: 'body' };

    this.#emitHeaderFooterModeChanged();
    this.#emitHeaderFooterEditingContext(this.#editor);
    this.#inputBridge?.notifyTargetChanged();

    // Invalidate layout cache and trigger re-render to show updated header/footer content
    if (editedHeaderId) {
      this.#headerFooterAdapter?.invalidate(editedHeaderId);
    }
    this.#headerFooterManager?.refresh();
    this.#pendingDocChange = true;
    this.#scheduleRerender();

    this.#editor.view?.focus();
  }

  #getActiveDomTarget(): HTMLElement | null {
    if (this.#session.mode !== 'body') {
      return this.#activeHeaderFooterEditor?.view?.dom ?? this.#editor.view?.dom ?? null;
    }
    return this.#editor.view?.dom ?? null;
  }

  #emitHeaderFooterModeChanged() {
    this.emit('headerFooterModeChanged', {
      mode: this.#session.mode,
      kind: this.#session.kind,
      headerId: this.#session.headerId,
      sectionType: this.#session.sectionType,
      pageIndex: this.#session.pageIndex,
      pageNumber: this.#session.pageNumber,
    });
    this.#updateAwarenessSession();
    this.#updateModeBanner();
  }

  #emitHeaderFooterEditingContext(editor: Editor) {
    this.emit('headerFooterEditingContext', {
      kind: this.#session.mode,
      editor,
      headerId: this.#session.headerId,
      sectionType: this.#session.sectionType,
    });
    this.#announce(
      this.#session.mode === 'body'
        ? 'Exited header/footer edit mode.'
        : `Editing ${this.#session.kind === 'header' ? 'Header' : 'Footer'} (${this.#session.sectionType ?? 'default'})`,
    );
  }

  #updateAwarenessSession() {
    const provider = this.#options.collaborationProvider;
    const awareness = provider?.awareness;

    // Runtime validation: ensure setLocalStateField method exists
    if (!awareness || typeof awareness.setLocalStateField !== 'function') {
      return;
    }

    if (this.#session.mode === 'body') {
      awareness.setLocalStateField('layoutSession', null);
      return;
    }
    awareness.setLocalStateField('layoutSession', {
      kind: this.#session.kind,
      headerId: this.#session.headerId ?? null,
      pageNumber: this.#session.pageNumber ?? null,
    });
  }

  #updateModeBanner() {
    if (!this.#modeBanner) return;
    if (this.#session.mode === 'body') {
      this.#modeBanner.style.display = 'none';
      this.#modeBanner.textContent = '';
      return;
    }
    const title = this.#session.kind === 'header' ? 'Header' : 'Footer';
    const variant = this.#session.sectionType ?? 'default';
    const page = this.#session.pageNumber != null ? `Page ${this.#session.pageNumber}` : '';
    this.#modeBanner.textContent = `Editing ${title} (${variant}) ${page} – Press Esc to return`;
    this.#modeBanner.style.display = 'block';
  }

  #announce(message: string) {
    if (!this.#ariaLiveRegion) return;
    this.#ariaLiveRegion.textContent = message;
  }

  #syncHiddenEditorA11yAttributes(): void {
    // Keep the hidden ProseMirror surface focusable and well-described for assistive technology.
    syncHiddenEditorA11yAttributesFromHelper(this.#editor?.view?.dom as unknown, this.#documentMode);
  }

  #scheduleA11ySelectionAnnouncement(options?: { immediate?: boolean }) {
    this.#a11ySelectionAnnounceTimeout = scheduleA11ySelectionAnnouncementFromHelper(
      {
        ariaLiveRegion: this.#ariaLiveRegion,
        sessionMode: this.#session.mode,
        isDragging: this.#isDragging,
        visibleHost: this.#visibleHost,
        currentTimeout: this.#a11ySelectionAnnounceTimeout,
        announceNow: () => {
          this.#a11ySelectionAnnounceTimeout = null;
          this.#announceSelectionNow();
        },
      },
      options,
    );
  }

  #announceSelectionNow(): void {
    if (!this.#ariaLiveRegion) return;
    if (this.#session.mode !== 'body') return;
    const announcement = computeA11ySelectionAnnouncementFromHelper(this.getActiveEditor().state);
    if (!announcement) return;

    if (announcement.key === this.#a11yLastAnnouncedSelectionKey) {
      return;
    }
    this.#a11yLastAnnouncedSelectionKey = announcement.key;
    this.#announce(announcement.message);
  }

  #validateHeaderFooterEditPermission(): { allowed: boolean; reason?: string } {
    if (this.#isViewLocked()) {
      return { allowed: false, reason: 'documentMode' };
    }
    if (!this.#editor.isEditable) {
      return { allowed: false, reason: 'readOnly' };
    }
    return { allowed: true };
  }

  #emitHeaderFooterEditBlocked(reason: string) {
    this.emit('headerFooterEditBlocked', { reason });
  }

  #resolveDescriptorForRegion(region: HeaderFooterRegion): HeaderFooterDescriptor | null {
    if (!this.#headerFooterManager) return null;
    if (region.headerId) {
      const descriptor = this.#headerFooterManager.getDescriptorById(region.headerId);
      if (descriptor) return descriptor;
    }
    if (region.sectionType) {
      const descriptors = this.#headerFooterManager.getDescriptors(region.kind);
      const match = descriptors.find((entry) => entry.variant === region.sectionType);
      if (match) return match;
    }
    const descriptors = this.#headerFooterManager.getDescriptors(region.kind);
    if (!descriptors.length) {
      console.warn('[PresentationEditor] No descriptor found for region:', region);
      return null;
    }
    return descriptors[0];
  }

  /**
   * Creates a default header or footer when none exists.
   *
   * This method is called when a user double-clicks a header/footer region
   * but no content exists yet. It uses the converter API to create an empty
   * header/footer document.
   *
   * @param region - The header/footer region containing kind ('header' | 'footer')
   *   and sectionType ('default' | 'first' | 'even' | 'odd') information
   *
   * Side effects:
   * - Calls converter.createDefaultHeader() or converter.createDefaultFooter() to
   *   create a new header/footer document in the underlying document model
   * - Updates this.#headerFooterIdentifier with the new header/footer IDs from
   *   the converter after creation
   *
   * Behavior when converter is unavailable:
   * - Returns early without creating any header/footer if converter is not attached
   * - Returns early if the appropriate create method is not available on the converter
   */
  #createDefaultHeaderFooter(region: HeaderFooterRegion): void {
    const converter = (this.#editor as EditorWithConverter).converter;

    if (!converter) {
      return;
    }

    const variant = region.sectionType ?? 'default';

    if (region.kind === 'header' && typeof converter.createDefaultHeader === 'function') {
      converter.createDefaultHeader(variant);
    } else if (region.kind === 'footer' && typeof converter.createDefaultFooter === 'function') {
      converter.createDefaultFooter(variant);
    }

    // Update legacy identifier for getHeaderFooterType() fallback path
    this.#headerFooterIdentifier = extractIdentifierFromConverter(converter);
  }

  /**
   * Gets the DOM element for a specific page index.
   *
   * @param pageIndex - Zero-based page index
   * @returns The page element or null if not mounted
   */
  #getPageElement(pageIndex: number): HTMLElement | null {
    return getPageElementByIndex(this.#painterHost, pageIndex);
  }

  #isSelectionAwareVirtualizationEnabled(): boolean {
    return Boolean(this.#layoutOptions.virtualization?.enabled && this.#layoutOptions.layoutMode === 'vertical');
  }

  #updateSelectionVirtualizationPins(options?: { includeDragBuffer?: boolean; extraPages?: number[] }): void {
    if (!this.#isSelectionAwareVirtualizationEnabled()) {
      return;
    }
    const painter = this.#domPainter;
    if (!painter || typeof painter.setVirtualizationPins !== 'function') {
      return;
    }
    const layout = this.#layoutState.layout;
    if (!layout) {
      return;
    }

    const state = this.getActiveEditor().state;
    const selection = state?.selection ?? null;
    const docSize = state?.doc?.content.size ?? null;
    const pins = computeSelectionVirtualizationPins({
      layout,
      blocks: this.#layoutState.blocks,
      measures: this.#layoutState.measures,
      selection: selection
        ? {
            from: selection.from,
            to: selection.to,
            anchor: (selection as unknown as { anchor?: number }).anchor,
            head: (selection as unknown as { head?: number }).head,
          }
        : null,
      docSize,
      includeDragBuffer: Boolean(options?.includeDragBuffer),
      isDragging: this.#isDragging,
      dragAnchorPageIndex: this.#dragAnchorPageIndex,
      dragLastHitPageIndex: this.#dragLastRawHit ? this.#dragLastRawHit.pageIndex : null,
      extraPages: options?.extraPages,
    });

    painter.setVirtualizationPins(pins);
  }

  #finalizeDragSelectionWithDom(
    pointer: { clientX: number; clientY: number },
    anchor: number,
    mode: 'char' | 'word' | 'para',
  ): void {
    const layout = this.#layoutState.layout;
    if (!layout) return;

    const selection = this.getActiveEditor().state?.selection;
    if (selection instanceof CellSelection) {
      return;
    }

    const normalized = this.#normalizeClientPoint(pointer.clientX, pointer.clientY);
    if (!normalized) return;

    // Ensure endpoint pages are pinned so DOM hit testing can resolve without scrolling.
    this.#updateSelectionVirtualizationPins({
      includeDragBuffer: false,
      extraPages: this.#dragLastRawHit ? [this.#dragLastRawHit.pageIndex] : undefined,
    });

    const refined = clickToPosition(
      layout,
      this.#layoutState.blocks,
      this.#layoutState.measures,
      { x: normalized.x, y: normalized.y },
      this.#viewportHost,
      pointer.clientX,
      pointer.clientY,
      this.#pageGeometryHelper ?? undefined,
    );
    if (!refined) return;

    if (this.#isSelectionAwareVirtualizationEnabled() && this.#getPageElement(refined.pageIndex) == null) {
      debugLog('warn', 'Drag finalize: endpoint page still not mounted', { pageIndex: refined.pageIndex });
      return;
    }

    const prior = this.#dragLastRawHit;
    if (prior && (prior.pos !== refined.pos || prior.pageIndex !== refined.pageIndex)) {
      debugLog('info', 'Drag finalize refined hit', {
        fromPos: prior.pos,
        toPos: refined.pos,
        fromPageIndex: prior.pageIndex,
        toPageIndex: refined.pageIndex,
      });
    }

    const doc = this.#editor.state?.doc;
    if (!doc) return;

    const mappedHead = this.#epochMapper.mapPosFromLayoutToCurrentDetailed(refined.pos, refined.layoutEpoch, 1);
    if (!mappedHead.ok) {
      debugLog('warn', 'drag finalize mapping failed', mappedHead);
      return;
    }

    const head = Math.max(0, Math.min(mappedHead.pos, doc.content.size));
    const { selAnchor, selHead } = this.#calculateExtendedSelection(anchor, head, mode);

    const current = this.#editor.state.selection;
    const desiredFrom = Math.min(selAnchor, selHead);
    const desiredTo = Math.max(selAnchor, selHead);
    if (current.from === desiredFrom && current.to === desiredTo) {
      return;
    }

    try {
      const tr = this.#editor.state.tr.setSelection(TextSelection.create(this.#editor.state.doc, selAnchor, selHead));
      this.#editor.view?.dispatch(tr);
      this.#scheduleSelectionUpdate();
    } catch {
      // Ignore invalid positions during re-layout
    }
  }

  /**
   * Scrolls a page into view, triggering virtualization to mount it if needed.
   *
   * @param pageIndex - Zero-based page index to scroll to
   */
  #scrollPageIntoView(pageIndex: number): void {
    const layout = this.#layoutState.layout;
    if (!layout) return;

    const pageHeight = layout.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
    const virtualGap = this.#layoutOptions.virtualization?.gap ?? 0;

    // Calculate approximate y position for the page
    const yPosition = pageIndex * (pageHeight + virtualGap);

    // Scroll viewport to the calculated position
    if (this.#visibleHost) {
      this.#visibleHost.scrollTop = yPosition;
    }
  }

  /**
   * Timeout duration for anchor navigation when waiting for page mount (in milliseconds).
   * This allows sufficient time for virtualized pages to render before giving up.
   */
  private static readonly ANCHOR_NAV_TIMEOUT_MS = 2000;

  /**
   * Navigate to a bookmark/anchor in the current document (e.g., TOC links).
   *
   * This method performs asynchronous navigation to support virtualized page rendering:
   * 1. Normalizes the anchor by removing leading '#' if present
   * 2. Looks up the bookmark in the document's bookmark registry
   * 3. Determines which page contains the target position
   * 4. Scrolls the page into view (may be virtualized)
   * 5. Waits up to 2000ms for the page to mount in the DOM
   * 6. Moves the editor caret to the bookmark position
   *
   * @param anchor - Bookmark name or fragment identifier (with or without leading '#')
   * @returns Promise resolving to true if navigation succeeded, false otherwise
   *
   * @remarks
   * Navigation fails and returns false if:
   * - The anchor parameter is empty or becomes empty after normalization
   * - No layout has been computed yet
   * - The bookmark does not exist in the document
   * - The bookmark's page cannot be determined
   * - The page fails to mount within the timeout period (2000ms)
   *
   * Note: This method does not throw errors. All failures are logged and result in
   * a false return value. An 'error' event is emitted for unhandled exceptions.
   *
   * @throws Never throws directly - errors are caught, logged, and emitted as events
   */
  async goToAnchor(anchor: string): Promise<boolean> {
    try {
      return await goToAnchorFromHelper({
        anchor,
        layout: this.#layoutState.layout,
        blocks: this.#layoutState.blocks,
        measures: this.#layoutState.measures,
        bookmarks: this.#layoutState.bookmarks,
        pageGeometryHelper: this.#pageGeometryHelper ?? undefined,
        painterHost: this.#painterHost,
        scrollPageIntoView: (pageIndex) => this.#scrollPageIntoView(pageIndex),
        waitForPageMount: (pageIndex, timeoutMs) => this.#waitForPageMount(pageIndex, { timeout: timeoutMs }),
        getActiveEditor: () => this.getActiveEditor(),
        timeoutMs: PresentationEditor.ANCHOR_NAV_TIMEOUT_MS,
      });
    } catch (error) {
      console.error('[PresentationEditor] goToAnchor failed:', error);
      this.emit('error', {
        error,
        context: 'goToAnchor',
      });
      return false;
    }
  }

  /**
   * Waits for a page to be mounted in the DOM after scrolling.
   *
   * Polls for the page element using requestAnimationFrame until it appears
   * or the timeout is exceeded.
   *
   * @param pageIndex - Zero-based page index to wait for
   * @param options - Configuration options
   * @param options.timeout - Maximum time to wait in milliseconds (default: 2000)
   * @returns Promise that resolves to true if page was mounted, false if timeout
   */
  async #waitForPageMount(pageIndex: number, options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 2000;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const checkPage = () => {
        const pageElement = this.#getPageElement(pageIndex);
        if (pageElement) {
          resolve(true);
          return;
        }

        const elapsed = performance.now() - startTime;
        if (elapsed >= timeout) {
          resolve(false);
          return;
        }

        requestAnimationFrame(checkPage);
      };

      checkPage();
    });
  }

  /**
   * Get effective page gap based on layout mode and virtualization settings.
   * Keeps painter, layout, and geometry in sync.
   */
  #getEffectivePageGap(): number {
    if (this.#layoutOptions.virtualization?.enabled) {
      return Math.max(0, this.#layoutOptions.virtualization.gap ?? DEFAULT_VIRTUALIZED_PAGE_GAP);
    }
    if (this.#layoutOptions.layoutMode === 'horizontal') {
      return DEFAULT_HORIZONTAL_PAGE_GAP;
    }
    return DEFAULT_PAGE_GAP;
  }

  #getBodyPageHeight() {
    return this.#layoutState.layout?.pageSize?.h ?? this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
  }

  /**
   * Get the page height for the current header/footer context.
   * Returns the actual layout height from the header/footer context, or falls back to 1 if unavailable.
   * Used for correct coordinate mapping when rendering selections in header/footer mode.
   */
  #getHeaderFooterPageHeight(): number {
    const context = this.#getHeaderFooterContext();
    if (!context) {
      // Fallback to 1 if context is missing (should rarely happen)
      console.warn('[PresentationEditor] Header/footer context missing when computing page height');
      return 1;
    }
    // Use the actual page height from the header/footer layout
    return context.layout.pageSize?.h ?? context.region.height ?? 1;
  }

  /**
   * Renders visual highlighting for CellSelection (multiple table cells selected).
   *
   * This method creates blue overlay rectangles for each selected cell in a table,
   * accounting for merged cells (colspan/rowspan), multi-page tables, and accurate
   * row/column positioning from layout measurements.
   *
   * Algorithm:
   * 1. Locate the table node by walking up the selection hierarchy
   * 2. Find the corresponding table block in layout state
   * 3. Collect all table fragments (tables can span multiple pages)
   * 4. Use TableMap to convert cell positions to row/column indices
   * 5. For each selected cell:
   *    - Find the fragment containing this cell's row
   *    - Look up column boundary information from fragment metadata
   *    - Calculate cell width (sum widths for colspan > 1)
   *    - Calculate cell height from row measurements (sum heights for rowspan > 1)
   *    - Convert page-local coordinates to overlay coordinates
   *    - Create and append highlight DOM element
   *
   * Edge cases handled:
   * - Tables spanning multiple pages (iterate all fragments)
   * - Merged cells (colspan and rowspan attributes)
   * - Missing measure data (fallback to estimated row heights)
   * - Invalid table structures (TableMap.get wrapped in try-catch)
   * - Cells outside fragment boundaries (skipped)
   *
   * @param selection - The CellSelection from ProseMirror tables plugin
   * @param layout - The current layout containing table fragments and measurements
   * @returns void - Renders directly to this.#localSelectionLayer
   * @private
   *
   * @throws Never throws - all errors are caught and logged, rendering gracefully degrades
   */
  #renderCellSelectionOverlay(selection: CellSelection, layout: Layout): void {
    const localSelectionLayer = this.#localSelectionLayer;
    if (!localSelectionLayer) return;
    renderCellSelectionOverlay({
      selection,
      layout,
      localSelectionLayer,
      blocks: this.#layoutState.blocks,
      measures: this.#layoutState.measures,
      cellAnchorTableBlockId: this.#cellAnchor?.tableBlockId ?? null,
      convertPageLocalToOverlayCoords: (pageIndex, x, y) => this.#convertPageLocalToOverlayCoords(pageIndex, x, y),
    });
  }

  #renderHoverRegion(region: HeaderFooterRegion) {
    if (this.#documentMode === 'viewing') {
      this.#clearHoverRegion();
      return;
    }
    if (!this.#hoverOverlay || !this.#hoverTooltip) return;
    const coords = this.#convertPageLocalToOverlayCoords(region.pageIndex, region.localX, region.localY);
    if (!coords) {
      this.#clearHoverRegion();
      return;
    }
    this.#hoverOverlay.style.display = 'block';
    this.#hoverOverlay.style.left = `${coords.x}px`;
    this.#hoverOverlay.style.top = `${coords.y}px`;
    // Width and height are in layout space - the transform on #selectionOverlay handles scaling
    this.#hoverOverlay.style.width = `${region.width}px`;
    this.#hoverOverlay.style.height = `${region.height}px`;

    const tooltipText = `Double-click to edit ${region.kind === 'header' ? 'header' : 'footer'}`;
    this.#hoverTooltip.textContent = tooltipText;
    this.#hoverTooltip.style.display = 'block';
    this.#hoverTooltip.style.left = `${coords.x}px`;

    // Position tooltip above region by default, but below if too close to viewport top
    // This prevents clipping for headers at the top of the page
    const tooltipHeight = 24; // Approximate tooltip height
    const spaceAbove = coords.y;
    // Height is in layout space - the transform on #selectionOverlay handles scaling
    const regionHeight = region.height;
    const tooltipY =
      spaceAbove < tooltipHeight + 4
        ? coords.y + regionHeight + 4 // Position below if near top (with 4px spacing)
        : coords.y - tooltipHeight; // Position above otherwise
    this.#hoverTooltip.style.top = `${Math.max(0, tooltipY)}px`;
  }

  #clearHoverRegion() {
    this.#hoverRegion = null;
    if (this.#hoverOverlay) {
      this.#hoverOverlay.style.display = 'none';
    }
    if (this.#hoverTooltip) {
      this.#hoverTooltip.style.display = 'none';
    }
  }

  #getHeaderFooterContext(): HeaderFooterLayoutContext | null {
    if (this.#session.mode === 'body') return null;
    if (!this.#headerFooterManager) return null;
    const pageIndex = this.#session.pageIndex;
    if (pageIndex == null) return null;
    const regionMap = this.#session.mode === 'header' ? this.#headerRegions : this.#footerRegions;
    const region = regionMap.get(pageIndex);
    if (!region) {
      console.warn('[PresentationEditor] Header/footer region not found for pageIndex:', pageIndex);
      return null;
    }
    const results = this.#session.mode === 'header' ? this.#headerLayoutResults : this.#footerLayoutResults;
    if (!results || results.length === 0) {
      console.warn('[PresentationEditor] Header/footer layout results not available');
      return null;
    }
    const variant = results.find((entry) => entry.type === this.#session.sectionType) ?? results[0] ?? null;
    if (!variant) {
      console.warn('[PresentationEditor] Header/footer variant not found for sectionType:', this.#session.sectionType);
      return null;
    }
    const pageWidth = Math.max(1, region.width);
    const pageHeight = Math.max(1, variant.layout.height ?? region.height ?? 1);
    const layoutLike: Layout = {
      pageSize: { w: pageWidth, h: pageHeight },
      pages: variant.layout.pages.map((page: Page) => ({
        number: page.number,
        numberText: page.numberText,
        fragments: page.fragments,
      })),
    };
    return {
      layout: layoutLike,
      blocks: variant.blocks,
      measures: variant.measures,
      region,
    };
  }

  #computeHeaderFooterSelectionRects(from: number, to: number): LayoutRect[] {
    const context = this.#getHeaderFooterContext();
    const bodyLayout = this.#layoutState.layout;
    if (!context) {
      // Warn when header/footer context is unavailable to aid debugging
      console.warn('[PresentationEditor] Header/footer context unavailable for selection rects', {
        mode: this.#session.mode,
        pageIndex: this.#session.pageIndex,
      });
      return [];
    }
    if (!bodyLayout) return [];
    const rects = selectionToRects(context.layout, context.blocks, context.measures, from, to, undefined) ?? [];
    const headerPageHeight = context.layout.pageSize?.h ?? context.region.height ?? 1;
    const bodyPageHeight = this.#getBodyPageHeight();
    return rects.map((rect: LayoutRect) => {
      const headerLocalY = rect.y - rect.pageIndex * headerPageHeight;
      return {
        pageIndex: context.region.pageIndex,
        x: rect.x + context.region.localX,
        y: context.region.pageIndex * bodyPageHeight + context.region.localY + headerLocalY,
        width: rect.width,
        height: rect.height,
      };
    });
  }

  #syncTrackedChangesPreferences(): boolean {
    const mode = this.#deriveTrackedChangesMode();
    const enabled = this.#deriveTrackedChangesEnabled();
    const hasChanged = mode !== this.#trackedChangesMode || enabled !== this.#trackedChangesEnabled;
    if (hasChanged) {
      this.#trackedChangesMode = mode;
      this.#trackedChangesEnabled = enabled;
    }
    return hasChanged;
  }

  #deriveTrackedChangesMode(): TrackedChangesMode {
    const overrideMode = this.#trackedChangesOverrides?.mode;
    if (overrideMode) {
      return overrideMode;
    }
    const pluginState = this.#getTrackChangesPluginState();
    if (pluginState?.onlyOriginalShown) {
      return 'original';
    }
    if (pluginState?.onlyModifiedShown) {
      return 'final';
    }
    if (this.#documentMode === 'viewing') {
      return 'final';
    }
    return 'review';
  }

  #deriveTrackedChangesEnabled(): boolean {
    if (typeof this.#trackedChangesOverrides?.enabled === 'boolean') {
      return this.#trackedChangesOverrides.enabled;
    }
    return true;
  }

  #getTrackChangesPluginState(): {
    isTrackChangesActive?: boolean;
    onlyOriginalShown?: boolean;
    onlyModifiedShown?: boolean;
  } | null {
    const state = this.#editor?.state;
    if (!state) return null;
    try {
      const pluginState = TrackChangesBasePluginKey.getState(state);
      return pluginState ?? null;
    } catch (error) {
      // Plugin may not be loaded or state may be invalid
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PresentationEditor] Failed to get track changes plugin state:', error);
      }
      return null;
    }
  }

  #computeDefaultLayoutDefaults(): {
    pageSize: PageSize;
    margins: PageMargins;
    columns?: ColumnLayout;
  } {
    const converter = this.#editor?.converter;
    const pageStyles = converter?.pageStyles ?? {};
    const size = pageStyles.pageSize ?? {};
    const pageMargins = pageStyles.pageMargins ?? {};

    const pageSize: PageSize = {
      w: inchesToPx(size.width) ?? DEFAULT_PAGE_SIZE.w,
      h: inchesToPx(size.height) ?? DEFAULT_PAGE_SIZE.h,
    };

    const margins: PageMargins = {
      top: inchesToPx(pageMargins.top) ?? DEFAULT_MARGINS.top,
      right: inchesToPx(pageMargins.right) ?? DEFAULT_MARGINS.right,
      bottom: inchesToPx(pageMargins.bottom) ?? DEFAULT_MARGINS.bottom,
      left: inchesToPx(pageMargins.left) ?? DEFAULT_MARGINS.left,
      ...(inchesToPx(pageMargins.header) != null ? { header: inchesToPx(pageMargins.header) } : {}),
      ...(inchesToPx(pageMargins.footer) != null ? { footer: inchesToPx(pageMargins.footer) } : {}),
    };

    const columns = parseColumns(pageStyles.columns);
    return { pageSize, margins, columns };
  }

  /**
   * Applies zoom transformation to the document viewport and painter hosts.
   *
   * Handles documents with varying page sizes (multi-section docs with landscape pages)
   * by calculating actual dimensions from per-page sizes rather than assuming uniform pages.
   *
   * The implementation uses two key concepts:
   * - **maxWidth/maxHeight**: Maximum dimension across all pages (for viewport sizing)
   * - **totalWidth/totalHeight**: Sum of all page dimensions + gaps (for full document extent)
   *
   * Layout modes:
   * - Vertical: Uses maxWidth for viewport width, totalHeight for scroll height
   * - Horizontal: Uses totalWidth for viewport width, maxHeight for scroll height
   */
  #applyZoom() {
    // Apply zoom by scaling the children (#painterHost and #selectionOverlay) and
    // setting the viewport dimensions to the scaled size.
    //
    // CSS transform: scale() only affects visual rendering, NOT layout box dimensions.
    // Previously, transform was applied to #viewportHost which caused the parent scroll
    // container to not see the scaled size, resulting in clipping at high zoom levels.
    //
    // The new approach:
    // 1. Apply transform: scale(zoom) to #painterHost and #selectionOverlay (visual scaling)
    // 2. Set #viewportHost width/height to scaled dimensions (layout box scaling)
    // This ensures both visual rendering AND scroll container dimensions are correct.
    const zoom = this.#layoutOptions.zoom ?? 1;

    const layoutMode = this.#layoutOptions.layoutMode ?? 'vertical';

    // Calculate actual document dimensions from per-page sizes.
    // Multi-section documents can have pages with different sizes (e.g., landscape pages).
    const pages = this.#layoutState.layout?.pages;
    // Always use current layout mode's gap - layout.pageGap may be stale if layoutMode changed
    const pageGap = this.#getEffectivePageGap();
    const defaultWidth = this.#layoutOptions.pageSize?.w ?? DEFAULT_PAGE_SIZE.w;
    const defaultHeight = this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;

    let maxWidth = defaultWidth;
    let maxHeight = defaultHeight;
    let totalWidth = 0;
    let totalHeight = 0;

    if (Array.isArray(pages) && pages.length > 0) {
      pages.forEach((page, index) => {
        const pageWidth = page.size && typeof page.size.w === 'number' && page.size.w > 0 ? page.size.w : defaultWidth;
        const pageHeight =
          page.size && typeof page.size.h === 'number' && page.size.h > 0 ? page.size.h : defaultHeight;
        maxWidth = Math.max(maxWidth, pageWidth);
        maxHeight = Math.max(maxHeight, pageHeight);
        totalWidth += pageWidth;
        totalHeight += pageHeight;
        if (index < pages.length - 1) {
          totalWidth += pageGap;
          totalHeight += pageGap;
        }
      });
    } else {
      totalWidth = defaultWidth;
      totalHeight = defaultHeight;
    }

    // Horizontal layout stacks pages in a single row, so width grows with pageCount
    if (layoutMode === 'horizontal') {
      // For horizontal: sum widths, use max height
      const scaledWidth = totalWidth * zoom;
      const scaledHeight = maxHeight * zoom;

      this.#viewportHost.style.width = `${scaledWidth}px`;
      this.#viewportHost.style.minWidth = `${scaledWidth}px`;
      this.#viewportHost.style.minHeight = `${scaledHeight}px`;
      this.#viewportHost.style.transform = '';

      this.#painterHost.style.width = `${totalWidth}px`;
      this.#painterHost.style.minHeight = `${maxHeight}px`;
      this.#painterHost.style.transformOrigin = 'top left';
      this.#painterHost.style.transform = zoom === 1 ? '' : `scale(${zoom})`;

      this.#selectionOverlay.style.width = `${totalWidth}px`;
      this.#selectionOverlay.style.height = `${maxHeight}px`;
      this.#selectionOverlay.style.transformOrigin = 'top left';
      this.#selectionOverlay.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
      return;
    }

    // Vertical layout: use max width, sum heights
    // Zoom implementation:
    // 1. #viewportHost has SCALED dimensions (maxWidth * zoom) for proper scroll container sizing
    // 2. #painterHost has UNSCALED dimensions with transform: scale(zoom) applied
    // 3. When scaled, #painterHost visually fills #viewportHost exactly
    //
    // This ensures the scroll container sees the correct scaled content size while
    // the transform provides visual scaling.
    const scaledWidth = maxWidth * zoom;
    const scaledHeight = totalHeight * zoom;

    // Set viewport to scaled dimensions for scroll container
    this.#viewportHost.style.width = `${scaledWidth}px`;
    this.#viewportHost.style.minWidth = `${scaledWidth}px`;
    this.#viewportHost.style.minHeight = `${scaledHeight}px`;
    this.#viewportHost.style.transform = '';

    // Set painterHost to UNSCALED dimensions and apply transform
    // This way: 816px * scale(1.5) = 1224px visual = matches viewport
    this.#painterHost.style.width = `${maxWidth}px`;
    this.#painterHost.style.minHeight = `${totalHeight}px`;
    this.#painterHost.style.transformOrigin = 'top left';
    this.#painterHost.style.transform = zoom === 1 ? '' : `scale(${zoom})`;

    // Selection overlay also scales - set to unscaled dimensions
    this.#selectionOverlay.style.width = `${maxWidth}px`;
    this.#selectionOverlay.style.height = `${totalHeight}px`;
    this.#selectionOverlay.style.transformOrigin = 'top left';
    this.#selectionOverlay.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
  }

  /**
   * Convert page-local coordinates to overlay-space coordinates.
   *
   * Transforms coordinates from page-local space (x, y relative to a specific page)
   * to overlay-space coordinates (absolute position within the stacked page layout).
   * The returned coordinates are in layout space (unscaled logical pixels), not screen
   * space - the CSS transform: scale() on #painterHost and #selectionOverlay handles zoom scaling.
   *
   * Pages are rendered vertically stacked at y = pageIndex * pageHeight, so the
   * conversion involves:
   * 1. X coordinate passes through unchanged (pages are horizontally aligned)
   * 2. Y coordinate is offset by (pageIndex * pageHeight) to account for stacking
   *
   * @param pageIndex - Zero-based page index (must be finite and non-negative)
   * @param pageLocalX - X coordinate relative to page origin (must be finite)
   * @param pageLocalY - Y coordinate relative to page origin (must be finite)
   * @returns Overlay coordinates {x, y} in layout space, or null if inputs are invalid
   *
   * @example
   * ```typescript
   * // Position at (50, 100) on page 2
   * const coords = this.#convertPageLocalToOverlayCoords(2, 50, 100);
   * // Returns: { x: 50, y: 2 * 792 + 100 } = { x: 50, y: 1684 }
   * ```
   *
   * @private
   */

  #getPageOffsetX(pageIndex: number): number | null {
    return getPageOffsetXFromTransform({
      painterHost: this.#painterHost,
      viewportHost: this.#viewportHost,
      zoom: this.#layoutOptions.zoom ?? 1,
      pageIndex,
    });
  }

  #convertPageLocalToOverlayCoords(
    pageIndex: number,
    pageLocalX: number,
    pageLocalY: number,
  ): { x: number; y: number } | null {
    const pageHeight = this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h;
    const pageGap = this.#layoutState.layout?.pageGap ?? 0;
    return convertPageLocalToOverlayCoordsFromTransform({
      painterHost: this.#painterHost,
      viewportHost: this.#viewportHost,
      zoom: this.#layoutOptions.zoom ?? 1,
      pageIndex,
      pageLocalX,
      pageLocalY,
      pageHeight,
      pageGap,
    });
  }

  /**
   * Computes DOM-derived selection rects for mounted pages using Range.getClientRects().
   *
   * This is the pixel-perfect path: it uses the browser's layout engine as the
   * source of truth for selection geometry when content is mounted.
   *
   * Returns null on failure so callers can keep the last known-good overlay rather
   * than rendering a potentially incorrect geometry-based fallback.
   */
  #computeSelectionRectsFromDom(from: number, to: number): LayoutRect[] | null {
    const layout = this.#layoutState.layout;
    if (!layout) return null;

    return computeSelectionRectsFromDomFromDom(
      {
        painterHost: this.#painterHost,
        layout,
        domPositionIndex: this.#domPositionIndex,
        rebuildDomPositionIndex: () => this.#rebuildDomPositionIndex(),
        zoom: this.#layoutOptions.zoom ?? 1,
        pageHeight: this.#getBodyPageHeight(),
        pageGap: layout.pageGap ?? this.#getEffectivePageGap(),
      },
      from,
      to,
    );
  }

  #computeDomCaretPageLocal(pos: number): { pageIndex: number; x: number; y: number } | null {
    return computeDomCaretPageLocalFromDom(
      {
        painterHost: this.#painterHost,
        domPositionIndex: this.#domPositionIndex,
        rebuildDomPositionIndex: () => this.#rebuildDomPositionIndex(),
        zoom: this.#layoutOptions.zoom ?? 1,
      },
      pos,
    );
  }

  #normalizeClientPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    return normalizeClientPointFromPointer(
      {
        viewportHost: this.#viewportHost,
        visibleHost: this.#visibleHost,
        zoom: this.#layoutOptions.zoom ?? 1,
        getPageOffsetX: (pageIndex) => this.#getPageOffsetX(pageIndex),
      },
      clientX,
      clientY,
    );
  }

  /**
   * Computes caret layout rectangle using geometry-based calculations.
   *
   * This method calculates the caret position and height from layout engine data
   * (fragments, blocks, measures) without querying the DOM. It's used as a fallback
   * when DOM-based measurements are unavailable or as a primary source in non-interactive
   * scenarios (e.g., headless rendering, PDF export).
   *
   * The geometry-based calculation accounts for:
   * - List markers (offset caret by marker width)
   * - Paragraph indents (left, right, first-line, hanging)
   * - Justified text alignment (extra space distributed across spaces)
   * - Multi-column layouts
   * - Table cell content
   *
   * Algorithm:
   * 1. Find the fragment containing the PM position
   * 2. Handle table fragments separately (delegate to #computeTableCaretLayoutRect)
   * 3. For paragraph fragments:
   *    a. Find the line containing the position
   *    b. Convert PM position to character offset
   *    c. Measure X coordinate using Canvas-based text measurement
   *    d. Apply marker width and indent adjustments
   *    e. Calculate Y offset from line heights
   *    f. Return page-local coordinates with line height
   *
   * @param pos - ProseMirror position to compute caret for
   * @param includeDomFallback - Whether to compare with DOM measurements for debugging (default: true).
   *   When true, logs geometry vs DOM deltas for analysis. Has no effect on return value.
   * @returns Object with {pageIndex, x, y, height} in page-local coordinates, or null if position not found
   *
   * @example
   * ```typescript
   * const caretGeometry = this.#computeCaretLayoutRectGeometry(42, false);
   * if (caretGeometry) {
   *   // Render caret at caretGeometry.x, caretGeometry.y with height caretGeometry.height
   * }
   * ```
   */
  #computeCaretLayoutRectGeometry(
    pos: number,
    includeDomFallback = true,
  ): { pageIndex: number; x: number; y: number; height: number } | null {
    return computeCaretLayoutRectGeometryFromHelper(
      {
        layout: this.#layoutState.layout,
        blocks: this.#layoutState.blocks,
        measures: this.#layoutState.measures,
        painterHost: this.#painterHost,
        viewportHost: this.#viewportHost,
        visibleHost: this.#visibleHost,
        zoom: this.#layoutOptions.zoom ?? 1,
      },
      pos,
      includeDomFallback,
    );
  }

  /**
   * Compute caret position, preferring DOM when available, falling back to geometry.
   */
  #computeCaretLayoutRect(pos: number): { pageIndex: number; x: number; y: number; height: number } | null {
    const geometry = this.#computeCaretLayoutRectGeometry(pos, true);
    let dom: { pageIndex: number; x: number; y: number } | null = null;
    try {
      dom = this.#computeDomCaretPageLocal(pos);
    } catch (error) {
      // DOM operations can throw exceptions - fall back to geometry-only positioning
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PresentationEditor] DOM caret computation failed in #computeCaretLayoutRect:', error);
      }
    }
    if (dom && geometry) {
      return {
        pageIndex: dom.pageIndex,
        x: dom.x,
        y: dom.y,
        height: geometry.height,
      };
    }
    return geometry;
  }

  #getCurrentPageIndex(): number {
    if (this.#session.mode !== 'body') {
      return this.#session.pageIndex ?? 0;
    }
    const layout = this.#layoutState.layout;
    const selection = this.#editor.state?.selection;
    if (!layout || !selection) {
      return 0;
    }

    // Try selectionToRects first
    const rects =
      selectionToRects(
        layout,
        this.#layoutState.blocks,
        this.#layoutState.measures,
        selection.from,
        selection.to,
        this.#pageGeometryHelper ?? undefined,
      ) ?? [];

    if (rects.length > 0) {
      return rects[0]?.pageIndex ?? 0;
    }

    // Fallback: scan pages to find which one contains this position via fragments
    // Note: pmStart/pmEnd are only present on some fragment types (ParaFragment, ImageFragment, DrawingFragment)
    const pos = selection.from;
    for (let pageIdx = 0; pageIdx < layout.pages.length; pageIdx++) {
      const page = layout.pages[pageIdx];
      for (const fragment of page.fragments) {
        const frag = fragment as { pmStart?: number; pmEnd?: number };
        if (frag.pmStart != null && frag.pmEnd != null) {
          if (pos >= frag.pmStart && pos <= frag.pmEnd) {
            return pageIdx;
          }
        }
      }
    }

    return 0;
  }

  #findRegionForPage(kind: 'header' | 'footer', pageIndex: number): HeaderFooterRegion | null {
    const map = kind === 'header' ? this.#headerRegions : this.#footerRegions;
    return map.get(pageIndex) ?? map.values().next().value ?? null;
  }

  #handleLayoutError(phase: LayoutError['phase'], error: Error) {
    console.error('[PresentationEditor] Layout error', error);
    this.#layoutError = { phase, error, timestamp: Date.now() };

    // Update error state based on phase
    if (phase === 'initialization') {
      this.#layoutErrorState = 'failed'; // Fatal error during init
    } else {
      // Render errors may be recoverable
      this.#layoutErrorState = this.#layoutState.layout ? 'degraded' : 'failed';
    }

    this.emit('layoutError', this.#layoutError);
    if (this.#telemetryEmitter) {
      this.#telemetryEmitter({ type: 'error', data: this.#layoutError });
    }
    this.#showLayoutErrorBanner(error);
  }

  #decorateError(error: unknown, stage: string): Error {
    if (error instanceof Error) {
      error.message = `[${stage}] ${error.message}`;
      return error;
    }
    return new Error(`[${stage}] ${String(error)}`);
  }

  #showLayoutErrorBanner(error: Error) {
    const doc = this.#visibleHost.ownerDocument ?? document;
    if (!this.#errorBanner) {
      const banner = doc.createElement('div');
      banner.className = 'presentation-editor__layout-error';
      banner.style.display = 'flex';
      banner.style.alignItems = 'center';
      banner.style.justifyContent = 'space-between';
      banner.style.gap = '8px';
      banner.style.padding = '8px 12px';
      banner.style.background = '#FFF6E5';
      banner.style.border = '1px solid #F5B971';
      banner.style.borderRadius = '6px';
      banner.style.marginBottom = '8px';

      const message = doc.createElement('span');
      banner.appendChild(message);

      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Reload layout';
      retry.style.border = 'none';
      retry.style.borderRadius = '4px';
      retry.style.background = '#F5B971';
      retry.style.color = '#3F2D00';
      retry.style.padding = '6px 10px';
      retry.style.cursor = 'pointer';
      retry.addEventListener('click', () => {
        this.#layoutError = null;
        this.#dismissErrorBanner();
        this.#pendingDocChange = true;
        this.#scheduleRerender();
      });

      banner.appendChild(retry);
      this.#visibleHost.prepend(banner);

      this.#errorBanner = banner;
      this.#errorBannerMessage = message;
    }

    if (this.#errorBannerMessage) {
      this.#errorBannerMessage.textContent =
        'Layout engine hit an error. Your document is safe — try reloading layout.';
      if (this.#layoutOptions.debugLabel) {
        this.#errorBannerMessage.textContent += ` (${this.#layoutOptions.debugLabel}: ${error.message})`;
      }
    }
  }

  #dismissErrorBanner() {
    this.#errorBanner?.remove();
    this.#errorBanner = null;
    this.#errorBannerMessage = null;
  }

  /**
   * Determines whether the current viewing mode should block edits.
   * When documentMode is viewing but the active editor has been toggled
   * back to editable (e.g. permission ranges), we treat the view as editable.
   */
  #isViewLocked(): boolean {
    if (this.#documentMode !== 'viewing') return false;
    const hasPermissionOverride = !!(this.#editor as Editor & { storage?: Record<string, any> })?.storage
      ?.permissionRanges?.hasAllowedRanges;
    if (hasPermissionOverride) return false;
    return this.#documentMode === 'viewing';
  }

  /**
   * Applies vertical alignment and font scaling to layout DOM elements for subscript/superscript rendering.
   *
   * This method post-processes the painted DOM layout to apply vertical alignment styles
   * (super, sub, baseline, or custom position) based on run properties and text style marks.
   * It handles both DOCX-style vertAlign ('superscript', 'subscript', 'baseline') and
   * custom position offsets (in half-points).
   *
   * Processing logic:
   * 1. Queries all text spans with ProseMirror position markers
   * 2. For each span, resolves the ProseMirror position to find the containing run node
   * 3. Extracts vertAlign and position from run properties and/or text style marks
   * 4. Applies CSS vertical-align and font-size styles based on the extracted properties
   * 5. Position takes precedence over vertAlign when both are present
   *
   * @throws Does not throw - DOM manipulation errors are silently caught to prevent layout corruption
   * @private
   */
  #applyVertAlignToLayout() {
    const doc = this.#editor?.state?.doc;
    if (!doc || !this.#painterHost) return;

    try {
      const spans = this.#painterHost.querySelectorAll('.superdoc-line span[data-pm-start]') as NodeListOf<HTMLElement>;
      spans.forEach((span) => {
        try {
          // Skip header/footer spans - they belong to separate PM documents
          // and their data-pm-start values don't correspond to the body doc
          if (span.closest('.superdoc-page-header, .superdoc-page-footer')) return;

          const pmStart = Number(span.dataset.pmStart ?? 'NaN');
          if (!Number.isFinite(pmStart)) return;

          const pos = Math.max(0, Math.min(pmStart, doc.content.size));
          const $pos = doc.resolve(pos);

          let runNode: ProseMirrorNode | null = null;
          for (let depth = $pos.depth; depth >= 0; depth--) {
            const node = $pos.node(depth);
            if (node.type.name === 'run') {
              runNode = node;
              break;
            }
          }

          let vertAlign: string | null = runNode?.attrs?.runProperties?.vertAlign ?? null;
          let position: number | null = runNode?.attrs?.runProperties?.position ?? null;
          let fontSizeHalfPts: number | null = runNode?.attrs?.runProperties?.fontSize ?? null;

          if (!vertAlign && position == null && runNode) {
            runNode.forEach((child: ProseMirrorNode) => {
              if (!child.isText || !child.marks?.length) return;
              const rpr = decodeRPrFromMarks(child.marks as Mark[]) as {
                vertAlign?: string;
                position?: number;
                fontSize?: number;
              };
              if (rpr.vertAlign && !vertAlign) vertAlign = rpr.vertAlign;
              if (rpr.position != null && position == null) position = rpr.position;
              if (rpr.fontSize != null && fontSizeHalfPts == null) fontSizeHalfPts = rpr.fontSize;
            });
          }

          if (vertAlign == null && position == null) return;

          const styleEntries: string[] = [];
          if (position != null && Number.isFinite(position)) {
            const pts = halfPointToPoints(position);
            if (Number.isFinite(pts)) {
              styleEntries.push(`vertical-align: ${pts}pt`);
            }
          } else if (vertAlign === 'superscript' || vertAlign === 'subscript') {
            styleEntries.push(`vertical-align: ${vertAlign === 'superscript' ? 'super' : 'sub'}`);
            if (fontSizeHalfPts != null && Number.isFinite(fontSizeHalfPts)) {
              const scaledPts = halfPointToPoints(fontSizeHalfPts * SUBSCRIPT_SUPERSCRIPT_SCALE);
              if (Number.isFinite(scaledPts)) {
                styleEntries.push(`font-size: ${scaledPts}pt`);
              } else {
                styleEntries.push(`font-size: ${SUBSCRIPT_SUPERSCRIPT_SCALE * 100}%`);
              }
            } else {
              styleEntries.push(`font-size: ${SUBSCRIPT_SUPERSCRIPT_SCALE * 100}%`);
            }
          } else if (vertAlign === 'baseline') {
            styleEntries.push('vertical-align: baseline');
          }

          if (!styleEntries.length) return;
          const existing = span.getAttribute('style');
          const merged = existing ? `${existing}; ${styleEntries.join('; ')}` : styleEntries.join('; ');
          span.setAttribute('style', merged);
        } catch (error) {
          // Silently catch errors for individual spans to prevent layout corruption
          // DOM manipulation failures should not break the entire layout process
          console.error('Failed to apply vertical alignment to span:', error);
        }
      });
    } catch (error) {
      // Silently catch errors to prevent layout corruption
      console.error('Failed to apply vertical alignment to layout:', error);
    }
  }
}
