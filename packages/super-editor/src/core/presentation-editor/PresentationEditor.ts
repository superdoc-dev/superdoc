import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { ContextMenuPluginKey } from '@extensions/context-menu/context-menu.js';
import { CellSelection } from 'prosemirror-tables';
import { DecorationBridge } from './dom/DecorationBridge.js';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node as ProseMirrorNode, Mark } from 'prosemirror-model';
import type { Mapping } from 'prosemirror-transform';
import { Editor } from '../Editor.js';
import { EventEmitter } from '../EventEmitter.js';
import { EpochPositionMapper } from './layout/EpochPositionMapper.js';
import { DomPositionIndex } from './dom/DomPositionIndex.js';
import { DomPositionIndexObserverManager } from './dom/DomPositionIndexObserverManager.js';
import {
  computeDomCaretPageLocal as computeDomCaretPageLocalFromDom,
  computeSelectionRectsFromDom as computeSelectionRectsFromDomFromDom,
} from './dom/DomSelectionGeometry.js';
import {
  convertPageLocalToOverlayCoords as convertPageLocalToOverlayCoordsFromTransform,
  getPageOffsetX as getPageOffsetXFromTransform,
  getPageOffsetY as getPageOffsetYFromTransform,
} from './dom/CoordinateTransform.js';
import {
  normalizeClientPoint as normalizeClientPointFromPointer,
  denormalizeClientPoint as denormalizeClientPointFromPointer,
} from './dom/PointerNormalization.js';
import { getPageElementByIndex } from './dom/PageDom.js';
import { inchesToPx, parseColumns } from './layout/LayoutOptionParsing.js';
import { createLayoutMetrics as createLayoutMetricsFromHelper } from './layout/PresentationLayoutMetrics.js';
import { buildFootnotesInput } from './layout/FootnotesBuilder.js';
import { safeCleanup } from './utils/SafeCleanup.js';
import { createHiddenHost } from './dom/HiddenHost.js';
import { RemoteCursorManager, type RenderDependencies } from './remote-cursors/RemoteCursorManager.js';
import { EditorInputManager } from './pointer-events/EditorInputManager.js';
import { SelectionSyncCoordinator } from './selection/SelectionSyncCoordinator.js';
import { PresentationInputBridge } from './input/PresentationInputBridge.js';
import { calculateExtendedSelection } from './selection/SelectionHelpers.js';
import { getAtomNodeTypes as getAtomNodeTypesFromSchema } from './utils/SchemaNodeTypes.js';
import { buildPositionMapFromPmDoc } from './utils/PositionMapFromPm.js';
import {
  computeParagraphSelectionRangeAt as computeParagraphSelectionRangeAtFromHelper,
  computeWordSelectionRangeAt as computeWordSelectionRangeAtFromHelper,
  getFirstTextPosition as getFirstTextPositionFromHelper,
  registerPointerClick as registerPointerClickFromHelper,
} from './input/ClickSelectionUtilities.js';
import {
  computeA11ySelectionAnnouncement as computeA11ySelectionAnnouncementFromHelper,
  scheduleA11ySelectionAnnouncement as scheduleA11ySelectionAnnouncementFromHelper,
  syncHiddenEditorA11yAttributes as syncHiddenEditorA11yAttributesFromHelper,
} from './utils/A11ySupport.js';
import { computeSelectionVirtualizationPins } from './selection/SelectionVirtualizationPins.js';
import { debugLog, updateSelectionDebugHud, type SelectionDebugHudState } from './selection/SelectionDebug.js';
import { renderCellSelectionOverlay } from './selection/CellSelectionOverlay.js';
import { renderCaretOverlay, renderSelectionRects } from './selection/LocalSelectionOverlayRendering.js';
import { computeCaretLayoutRectGeometry as computeCaretLayoutRectGeometryFromHelper } from './selection/CaretGeometry.js';
import { collectCommentPositions as collectCommentPositionsFromHelper } from './utils/CommentPositionCollection.js';
import { getCurrentSectionPageStyles as getCurrentSectionPageStylesFromHelper } from './layout/SectionPageStyles.js';
import {
  computeAnchorMap as computeAnchorMapFromHelper,
  goToAnchor as goToAnchorFromHelper,
} from './utils/AnchorNavigation.js';
import {
  getCellPosFromTableHit as getCellPosFromTableHitFromHelper,
  getTablePosFromHit as getTablePosFromHitFromHelper,
  hitTestTable as hitTestTableFromHelper,
  shouldUseCellSelection as shouldUseCellSelectionFromHelper,
} from './tables/TableSelectionUtilities.js';
import { DragDropManager } from './input/DragDropManager.js';
import { HeaderFooterSessionManager } from './header-footer/HeaderFooterSessionManager.js';
import { decodeRPrFromMarks } from '../super-converter/styles.js';
import { halfPointToPoints } from '../super-converter/helpers.js';
import { toFlowBlocks, ConverterContext, FlowBlockCache } from '@superdoc/pm-adapter';
import {
  incrementalLayout,
  selectionToRects,
  clickToPosition,
  getFragmentAtPosition,
  extractIdentifierFromConverter,
  buildMultiSectionIdentifier,
  layoutHeaderFooterWithCache as _layoutHeaderFooterWithCache,
  PageGeometryHelper,
} from '@superdoc/layout-bridge';
import type {
  HeaderFooterIdentifier,
  HeaderFooterLayoutResult,
  HeaderFooterType,
  PositionHit,
  TableHitResult,
} from '@superdoc/layout-bridge';

import { createDomPainter } from '@superdoc/painter-dom';

import type { LayoutMode, PaintSnapshot } from '@superdoc/painter-dom';
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
// TrackChangesBasePluginKey is used by #syncTrackedChangesPreferences and getTrackChangesPluginState.
import { TrackChangesBasePluginKey } from '@extensions/track-changes/plugins/index.js';

// Collaboration cursor imports
import { ySyncPluginKey } from 'y-prosemirror';
import type * as Y from 'yjs';
import type { HeaderFooterDescriptor } from '../header-footer/HeaderFooterRegistry.js';
import { isInRegisteredSurface } from './utils/uiSurfaceRegistry.js';

// Types
import type {
  PageSize,
  PageMargins,
  VirtualizationOptions,
  RemoteUserInfo,
  RemoteCursorState,
  PresenceOptions,
  LayoutEngineOptions,
  TrackedChangesOverrides,
  PresentationEditorOptions,
  RemoteCursorsRenderPayload,
  LayoutUpdatePayload,
  ImageSelectedEvent,
  ImageDeselectedEvent,
  TelemetryEvent,
  CellAnchorState,
  EditorWithConverter,
  LayoutState,
  FootnoteReference,
  FootnotesLayoutInput,
  LayoutMetrics,
  LayoutError,
  LayoutRect,
  RangeRect,
  HeaderFooterMode,
  HeaderFooterSession,
  HeaderFooterRegion,
  HeaderFooterLayoutContext,
  PendingMarginClick,
  EditorViewWithScrollFlag,
  PotentiallyMockedFunction,
} from './types.js';

// Re-export public types for backward compatibility
export type {
  PageSize,
  PageMargins,
  VirtualizationOptions,
  RemoteUserInfo,
  RemoteCursorState,
  PresenceOptions,
  LayoutEngineOptions,
  TrackedChangesOverrides,
  PresentationEditorOptions,
  RemoteCursorsRenderPayload,
  LayoutUpdatePayload,
  ImageSelectedEvent,
  ImageDeselectedEvent,
  TelemetryEvent,
} from './types.js';

// Mark name constants
import { CommentMarkName } from '@extensions/comment/comments-constants.js';
import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '@extensions/track-changes/constants.js';

/**
 * Font size scaling factor for subscript and superscript text.
 * This value (0.65 or 65%) matches Microsoft Word's default rendering behavior
 * for vertical alignment (w:vertAlign) when set to 'superscript' or 'subscript'.
 * Applied to the base font size to reduce text size for sub/superscripts.
 */
const SUBSCRIPT_SUPERSCRIPT_SCALE = 0.65;

const DEFAULT_PAGE_SIZE: PageSize = { w: 612, h: 792 }; // Letter @ 72dpi
const DEFAULT_MARGINS: PageMargins = { top: 72, right: 72, bottom: 72, left: 72 };
/** Default gap between pages (from containerStyles in styles.ts) */
const DEFAULT_PAGE_GAP = 24;
/** Default gap for horizontal layout mode */
const DEFAULT_HORIZONTAL_PAGE_GAP = 20;

// Constants for interaction timing and thresholds
/** Maximum time between clicks to register as multi-click (milliseconds) */
const MULTI_CLICK_TIME_THRESHOLD_MS = 400;
/** Maximum distance between clicks to register as multi-click (pixels) */
const MULTI_CLICK_DISTANCE_THRESHOLD_PX = 5;

/** Debug flag for performance logging - enable with SD_DEBUG_LAYOUT env variable */
const layoutDebugEnabled =
  typeof process !== 'undefined' && typeof process.env !== 'undefined' && Boolean(process.env.SD_DEBUG_LAYOUT);

/** Log performance metrics when debug is enabled */
const perfLog = (...args: unknown[]): void => {
  if (!layoutDebugEnabled) return;
  console.log(...args);
};
/** Budget for header/footer initialization before warning (milliseconds) */
const HEADER_FOOTER_INIT_BUDGET_MS = 200;
/** Maximum zoom level before warning */
const MAX_ZOOM_WARNING_THRESHOLD = 10;
/** Maximum number of selection rectangles per user (performance guardrail) */
const MAX_SELECTION_RECTS_PER_USER = 100;

const GLOBAL_PERFORMANCE: Performance | undefined = typeof performance !== 'undefined' ? performance : undefined;

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
  /** Cache for incremental toFlowBlocks conversion */
  #flowBlockCache: FlowBlockCache = new FlowBlockCache();
  #footnoteNumberSignature: string | null = null;
  #domPainter: ReturnType<typeof createDomPainter> | null = null;
  #pageGeometryHelper: PageGeometryHelper | null = null;
  #dragDropManager: DragDropManager | null = null;
  #layoutError: LayoutError | null = null;
  #layoutErrorState: 'healthy' | 'degraded' | 'failed' = 'healthy';
  #errorBanner: HTMLElement | null = null;
  #errorBannerMessage: HTMLElement | null = null;
  #renderScheduled = false;
  #pendingDocChange = false;
  #pendingMapping: Mapping | null = null;
  #isRerendering = false;
  #selectionSync = new SelectionSyncCoordinator();
  #epochMapper = new EpochPositionMapper();
  #layoutEpoch = 0;
  #htmlAnnotationHeights: Map<string, number> = new Map();
  #htmlAnnotationMeasureEpoch = -1;
  #htmlAnnotationMeasureAttempts = 0;
  #domPositionIndex = new DomPositionIndex();
  #domIndexObserverManager: DomPositionIndexObserverManager | null = null;
  /** Bridges external PM plugin decorations onto painted DOM elements. */
  #decorationBridge = new DecorationBridge();
  /** RAF handle for coalesced decoration sync scheduling. */
  #decorationSyncRafHandle: number | null = null;
  #rafHandle: number | null = null;
  #editorListeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];
  #scrollHandler: (() => void) | null = null;
  #scrollContainer: Element | Window | null = null;
  #sectionMetadata: SectionMetadata[] = [];
  #documentMode: 'editing' | 'viewing' | 'suggesting' = 'editing';
  #inputBridge: PresentationInputBridge | null = null;
  #trackedChangesMode: TrackedChangesMode = 'review';
  #trackedChangesEnabled = true;
  #trackedChangesOverrides: TrackedChangesOverrides | undefined;
  // Header/footer session management
  #headerFooterSession: HeaderFooterSessionManager | null = null;
  #hoverOverlay: HTMLElement | null = null;
  #hoverTooltip: HTMLElement | null = null;
  #modeBanner: HTMLElement | null = null;
  #ariaLiveRegion: HTMLElement | null = null;
  #a11ySelectionAnnounceTimeout: number | null = null;
  #a11yLastAnnouncedSelectionKey: string | null = null;
  #lastSelectedFieldAnnotation: {
    element: HTMLElement;
    pmStart: number;
  } | null = null;
  #lastSelectedStructuredContentBlock: {
    id: string | null;
    elements: HTMLElement[];
  } | null = null;
  #lastSelectedStructuredContentInline: {
    id: string | null;
    elements: HTMLElement[];
  } | null = null;
  #lastHoveredStructuredContentBlock: {
    id: string | null;
    elements: HTMLElement[];
  } | null = null;

  // Remote cursor/presence state management
  /** Manager for remote cursor rendering and awareness subscriptions */
  #remoteCursorManager: RemoteCursorManager | null = null;
  /** Debounce timer for local cursor awareness updates (avoids ~190ms Liveblocks overhead per keystroke) */
  #cursorUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  /** DOM element for rendering remote cursor overlays */
  #remoteCursorOverlay: HTMLElement | null = null;
  /** DOM element for rendering local selection/caret (dual-layer overlay architecture) */
  #localSelectionLayer: HTMLElement | null = null;

  // Editor input management
  /** Manager for pointer events, focus, drag selection, and click handling */
  #editorInputManager: EditorInputManager | null = null;

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

    // Add event listeners for structured content hover coordination
    this.#painterHost.addEventListener('mouseover', this.#handleStructuredContentBlockMouseEnter);
    this.#painterHost.addEventListener('mouseout', this.#handleStructuredContentBlockMouseLeave);

    const win = this.#visibleHost?.ownerDocument?.defaultView ?? window;
    this.#domIndexObserverManager = new DomPositionIndexObserverManager({
      windowRoot: win,
      getPainterHost: () => this.#painterHost,
      onRebuild: () => {
        this.#rebuildDomPositionIndex();
        this.#syncDecorations();
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

    // Initialize remote cursor manager
    this.#remoteCursorManager = new RemoteCursorManager({
      visibleHost: this.#visibleHost,
      remoteCursorOverlay: this.#remoteCursorOverlay,
      presence: validatedPresence,
      collaborationProvider: options.collaborationProvider,
      fallbackColors: PresentationEditor.FALLBACK_COLORS,
      cursorStyles: PresentationEditor.CURSOR_STYLES,
      maxSelectionRectsPerUser: MAX_SELECTION_RECTS_PER_USER,
      defaultPageHeight: DEFAULT_PAGE_SIZE.h,
    });

    // Wire up manager callbacks to use PresentationEditor methods
    this.#remoteCursorManager.setUpdateCallback(() => this.#updateRemoteCursors());

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

    // Initialize header/footer session manager
    this.#headerFooterSession = new HeaderFooterSessionManager({
      painterHost: this.#painterHost,
      visibleHost: this.#visibleHost,
      selectionOverlay: this.#selectionOverlay,
      editor: null as unknown as Editor, // Set after editor is created
      isDebug: this.#options.isDebug,
      initBudgetMs: HEADER_FOOTER_INIT_BUDGET_MS,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      defaultMargins: DEFAULT_MARGINS,
    });
    this.#headerFooterSession.setHoverElements({
      hoverOverlay: this.#hoverOverlay,
      hoverTooltip: this.#hoverTooltip,
      modeBanner: this.#modeBanner,
    });
    this.#headerFooterSession.setDocumentMode(this.#documentMode);

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

      this.#setupHeaderFooterSession();
      this.#applyZoom();
      this.#setupEditorListeners();
      this.#initializeEditorInputManager();
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
   * This enables components like ContextMenu to access document
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
   * context menu configuration.
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
    const session = this.#headerFooterSession?.session;
    const activeHfEditor = this.#headerFooterSession?.activeEditor;
    if (!session || session.mode === 'body' || !activeHfEditor) {
      return this.#editor;
    }
    return activeHfEditor;
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
    this.#headerFooterSession?.setDocumentMode(mode);
    this.#syncDocumentModeClass();
    this.#syncHiddenEditorA11yAttributes();
    const trackedChangesChanged = this.#syncTrackedChangesPreferences();
    // Re-render if mode changed OR tracked changes preferences changed.
    // Mode change affects enableComments in toFlowBlocks even if tracked changes didn't change.
    if (modeChanged || trackedChangesChanged) {
      // Clear flow block cache since conversion-affecting settings changed
      this.#flowBlockCache.clear();
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
      // Clear flow block cache since conversion-affecting settings changed
      this.#flowBlockCache.clear();
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
      // Clear flow block cache since comment settings affect block conversion
      this.#flowBlockCache.clear();
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
    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';
    const layoutRectSource = () => {
      if (sessionMode !== 'body') {
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
    const pageHeight = sessionMode === 'body' ? this.#getBodyPageHeight() : this.#getHeaderFooterPageHeight();
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
   * Return a snapshot of painter output captured during the latest paint cycle.
   */
  getPaintSnapshot(): PaintSnapshot | null {
    return this.#domPainter?.getPaintSnapshot?.() ?? null;
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
    return Array.from(this.#remoteCursorManager?.state.values() ?? []);
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

    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';
    if (sessionMode !== 'body') {
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
        lastPointer: this.#editorInputManager?.debugLastPointer ?? null,
        lastHit: this.#editorInputManager?.debugLastHit ?? null,
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

    const pageEl = getPageElementByIndex(this.#viewportHost, pageIndex);
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
    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';
    if (sessionMode !== 'body') {
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
    if (rects && rects.length > 0) {
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

    // Fallback: getRangeRects returns empty for collapsed selections on empty
    // lines (no painted inline content to measure). Use caret geometry which
    // combines DOM position data with layout metrics for these cases.
    const caretRect = this.#computeCaretLayoutRect(pos);
    if (caretRect) {
      // caretRect is in page-local layout units; convert to viewport pixels.
      const viewport = this.denormalizeClientPoint(caretRect.x, caretRect.y, caretRect.pageIndex, caretRect.height);
      if (viewport) {
        const h = viewport.height ?? caretRect.height;
        return {
          top: viewport.y,
          bottom: viewport.y + h,
          left: viewport.x,
          right: viewport.x + 1, // caret is zero-width; use 1px so callers get a valid rect
          width: 1,
          height: h,
        };
      }
    }

    return null;
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
    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';
    if (sessionMode !== 'body') return null;

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
    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';

    if (layout && sessionMode === 'body') {
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
    if (this.#remoteCursorManager?.hasRemoteCursors()) {
      this.#remoteCursorManager.markDirty();
      this.#remoteCursorManager.scheduleUpdate();
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

    // Cancel pending decoration sync RAF
    if (this.#decorationSyncRafHandle != null) {
      safeCleanup(() => {
        const win = this.#visibleHost?.ownerDocument?.defaultView ?? window;
        win.cancelAnimationFrame(this.#decorationSyncRafHandle!);
        this.#decorationSyncRafHandle = null;
      }, 'Decoration sync RAF');
    }
    this.#decorationBridge.destroy();

    // Cancel pending cursor awareness update
    if (this.#cursorUpdateTimer !== null) {
      clearTimeout(this.#cursorUpdateTimer);
      this.#cursorUpdateTimer = null;
    }

    // Clean up remote cursor manager
    if (this.#remoteCursorManager) {
      safeCleanup(() => {
        this.#remoteCursorManager?.destroy();
        this.#remoteCursorManager = null;
      }, 'Remote cursor manager');
    }
    this.#remoteCursorOverlay = null;

    this.#selectionSync.destroy();

    this.#editorListeners.forEach(({ event, handler }) => this.#editor?.off(event, handler));
    this.#editorListeners = [];

    this.#domIndexObserverManager?.destroy();
    this.#domIndexObserverManager = null;

    // Clean up editor input manager (handles event listeners and drag/cell state)
    if (this.#editorInputManager) {
      safeCleanup(() => {
        this.#editorInputManager?.destroy();
        this.#editorInputManager = null;
      }, 'Editor input manager');
    }

    if (this.#scrollHandler) {
      if (this.#scrollContainer) {
        this.#scrollContainer.removeEventListener('scroll', this.#scrollHandler);
      }
      const win = this.#visibleHost?.ownerDocument?.defaultView;
      win?.removeEventListener('scroll', this.#scrollHandler);
      this.#scrollHandler = null;
      this.#scrollContainer = null;
    }
    this.#inputBridge?.notifyTargetChanged();
    this.#inputBridge?.destroy();
    this.#inputBridge = null;

    if (this.#a11ySelectionAnnounceTimeout != null) {
      clearTimeout(this.#a11ySelectionAnnounceTimeout);
      this.#a11ySelectionAnnounceTimeout = null;
    }

    // Unregister from static registry
    if (this.#options?.documentId) {
      PresentationEditor.#instances.delete(this.#options.documentId);
    }

    // Clean up header/footer session manager
    safeCleanup(() => {
      this.#headerFooterSession?.destroy();
      this.#headerFooterSession = null;
    }, 'Header/footer session manager');

    // Clear flow block cache to free memory
    this.#flowBlockCache.clear();

    this.#domPainter = null;
    this.#pageGeometryHelper = null;
    this.#dragDropManager?.destroy();
    this.#dragDropManager = null;
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

  /**
   * Runs a full decoration bridge sync: reads external plugin decorations and
   * reconciles them onto painted DOM elements (add/update/remove).
   *
   * Called synchronously from post-paint and observer-rebuild paths where the
   * DOM index is guaranteed to be fresh.
   */
  #syncDecorations(): void {
    const state = this.#editor?.view?.state;
    if (!state) return;

    try {
      this.#decorationBridge.sync(state, this.#domPositionIndex);
    } catch (error) {
      debugLog('warn', 'Decoration bridge sync failed', { error: String(error) });
    }
  }

  /**
   * Schedules a decoration sync on the next animation frame, coalesced so
   * rapid transactions (cursor movement, selection changes) don't cause
   * redundant work.
   *
   * Skips scheduling when:
   * - A rerender is already pending (post-paint will sync).
   * - No DecorationSet references have actually changed (identity check).
   */
  #scheduleDecorationSync(): void {
    // If a full rerender is pending, the post-paint path will sync. Skip.
    if (this.#renderScheduled || this.#isRerendering) return;

    // Cheap identity check: bail if no DecorationSet references changed.
    const state = this.#editor?.view?.state;
    if (!state || !this.#decorationBridge.hasChanges(state)) return;

    // Already scheduled — RAF will handle it.
    if (this.#decorationSyncRafHandle != null) return;

    const win = this.#visibleHost?.ownerDocument?.defaultView ?? window;
    this.#decorationSyncRafHandle = win.requestAnimationFrame(() => {
      this.#decorationSyncRafHandle = null;
      // Re-check: a rerender may have been scheduled between when we queued
      // this RAF and when it fires. The post-paint path will sync instead.
      if (this.#renderScheduled || this.#isRerendering) return;
      this.#syncDecorations();
    });
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
        this.#editorInputManager?.clearCellAnchor();
      }
    };
    const handleSelection = () => {
      // Use immediate rendering for selection-only changes (clicks, arrow keys).
      // Without immediate, the render is RAF-deferred — leaving a window where
      // a remote collaborator's edit can cancel the pending render via
      // setDocEpoch → cancelScheduledRender. Immediate rendering is safe here:
      // if layout is updating (due to a concurrent doc change), flushNow()
      // is a no-op and the render will be picked up after layout completes.
      this.#scheduleSelectionUpdate({ immediate: true });
      // Update local cursor in awareness for collaboration
      // This bypasses y-prosemirror's focus check which may fail for hidden PM views
      this.#updateLocalAwarenessCursor();
      this.#scheduleA11ySelectionAnnouncement();
    };

    // The 'transaction' event fires for ALL transactions (doc changes,
    // selection changes, meta-only). The 'update' event only fires for
    // docChanged transactions, and 'selectionUpdate' only for selection
    // changes. A meta-only transaction (e.g., a custom command that sets
    // plugin state without editing text) fires neither.
    //
    // We listen on 'transaction' so the decoration bridge picks up changes
    // from any transaction type. The bridge's own identity check + RAF
    // coalescing prevent unnecessary work.
    const handleTransaction = () => {
      this.#scheduleDecorationSync();
    };

    this.#editor.on('update', handleUpdate);
    this.#editor.on('selectionUpdate', handleSelection);
    this.#editor.on('transaction', handleTransaction);
    this.#editorListeners.push({ event: 'update', handler: handleUpdate as (...args: unknown[]) => void });
    this.#editorListeners.push({ event: 'selectionUpdate', handler: handleSelection as (...args: unknown[]) => void });
    this.#editorListeners.push({ event: 'transaction', handler: handleTransaction as (...args: unknown[]) => void });

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
      this.#headerFooterSession?.adapter?.invalidate(payload.sectionId);
      this.#headerFooterSession?.manager?.refresh();
      this.#pendingDocChange = true;
      this.#scheduleRerender();
    };
    this.#editor.on('remoteHeaderFooterChanged', handleRemoteHeaderFooterChanged);
    this.#editorListeners.push({
      event: 'remoteHeaderFooterChanged',
      handler: handleRemoteHeaderFooterChanged as (...args: unknown[]) => void,
    });

    // Listen for comment selection changes to update Layout Engine highlighting
    const handleCommentsUpdate = (payload: { activeCommentId?: string | null }) => {
      if (this.#domPainter?.setActiveComment) {
        // Only update active comment when the field is explicitly present in the payload.
        // This prevents unrelated events (like tracked change updates) from clearing
        // the active comment selection unexpectedly.
        if ('activeCommentId' in payload) {
          const activeId = payload.activeCommentId ?? null;
          this.#domPainter.setActiveComment(activeId);
          // Mark as needing re-render to apply the new active comment highlighting
          this.#pendingDocChange = true;
          this.#scheduleRerender();
        }
      }
    };
    this.#editor.on('commentsUpdate', handleCommentsUpdate);
    this.#editorListeners.push({
      event: 'commentsUpdate',
      handler: handleCommentsUpdate as (...args: unknown[]) => void,
    });
  }

  /**
   * Setup awareness event subscriptions for remote cursor tracking.
   * Delegates to RemoteCursorManager.
   * @private
   */
  #setupCollaborationCursors() {
    this.#remoteCursorManager?.setup();
  }

  /**
   * Update local cursor position in awareness.
   * Delegates to RemoteCursorManager.
   * @private
   */
  #updateLocalAwarenessCursor(): void {
    // Debounce awareness cursor updates to avoid per-keystroke overhead.
    // Collaboration providers (e.g. Liveblocks) can spend ~190ms encoding and
    // syncing awareness state per setLocalStateField call. Batching rapid
    // cursor movements into a single update every 100ms keeps typing responsive
    // while maintaining real-time cursor sharing for other participants.
    if (this.#cursorUpdateTimer !== null) {
      clearTimeout(this.#cursorUpdateTimer);
    }
    this.#cursorUpdateTimer = setTimeout(() => {
      this.#cursorUpdateTimer = null;
      this.#remoteCursorManager?.updateLocalCursor(this.#editor?.state ?? null);
    }, 100);
  }

  /**
   * Get render dependencies for the RemoteCursorManager.
   * @private
   */
  #getRemoteCursorRenderDeps(): RenderDependencies {
    return {
      layout: this.#layoutState?.layout ?? null,
      blocks: this.#layoutState?.blocks ?? [],
      measures: this.#layoutState?.measures ?? [],
      pageGeometryHelper: this.#pageGeometryHelper,
      pageHeight: this.#layoutOptions.pageSize?.h ?? DEFAULT_PAGE_SIZE.h,
      computeCaretLayoutRect: (pos) => this.#computeCaretLayoutRect(pos),
      convertPageLocalToOverlayCoords: (pageIndex, x, y) => this.#convertPageLocalToOverlayCoords(pageIndex, x, y),
    };
  }

  /**
   * Update remote cursor state, render overlays, and emit event for host consumption.
   * Delegates to RemoteCursorManager.
   * @private
   */
  #updateRemoteCursors() {
    if (!this.#remoteCursorManager) return;

    this.#remoteCursorManager.update(this.#editor?.state ?? null, this.#getRemoteCursorRenderDeps());

    // Emit event for host consumption
    this.emit('remoteCursorsUpdate', {
      cursors: Array.from(this.#remoteCursorManager.state.values()),
    });
  }

  /**
   * Render remote cursors from existing state without normalization.
   * Delegates to RemoteCursorManager.
   * @private
   */
  #renderRemoteCursors() {
    this.#remoteCursorManager?.render(this.#getRemoteCursorRenderDeps());
  }

  /**
   * Initialize the EditorInputManager with dependencies and callbacks.
   * @private
   */
  #initializeEditorInputManager(): void {
    this.#editorInputManager = new EditorInputManager();

    // Set dependencies - getters that provide access to PresentationEditor state
    this.#editorInputManager.setDependencies({
      getActiveEditor: () => this.getActiveEditor(),
      getEditor: () => this.#editor,
      getLayoutState: () => this.#layoutState,
      getEpochMapper: () => this.#epochMapper,
      getViewportHost: () => this.#viewportHost,
      getVisibleHost: () => this.#visibleHost,
      getLayoutMode: () => this.#layoutOptions.layoutMode ?? 'vertical',
      getHeaderFooterSession: () => this.#headerFooterSession,
      getPageGeometryHelper: () => this.#pageGeometryHelper,
      getZoom: () => this.#layoutOptions.zoom ?? 1,
      isViewLocked: () => this.#isViewLocked(),
      getDocumentMode: () => this.#documentMode,
      getPageElement: (pageIndex: number) => this.#getPageElement(pageIndex),
      isSelectionAwareVirtualizationEnabled: () => this.#isSelectionAwareVirtualizationEnabled(),
    });

    // Set callbacks - functions that the manager calls to interact with PresentationEditor
    this.#editorInputManager.setCallbacks({
      scheduleSelectionUpdate: () => this.#scheduleSelectionUpdate(),
      scheduleRerender: () => this.#scheduleRerender(),
      setPendingDocChange: () => {
        this.#pendingDocChange = true;
      },
      updateSelectionVirtualizationPins: (options) => this.#updateSelectionVirtualizationPins(options),
      scheduleA11ySelectionAnnouncement: (options) => this.#scheduleA11ySelectionAnnouncement(options),
      goToAnchor: (href: string) => this.goToAnchor(href),
      emit: (event: string, payload: unknown) => this.emit(event, payload),
      normalizeClientPoint: (clientX: number, clientY: number) => this.#normalizeClientPoint(clientX, clientY),
      hitTestHeaderFooterRegion: (x: number, y: number) => this.#hitTestHeaderFooterRegion(x, y),
      exitHeaderFooterMode: () => this.#exitHeaderFooterMode(),
      activateHeaderFooterRegion: (region) => this.#activateHeaderFooterRegion(region),
      createDefaultHeaderFooter: (region) => this.#createDefaultHeaderFooter(region),
      emitHeaderFooterEditBlocked: (reason: string) => this.#emitHeaderFooterEditBlocked(reason),
      findRegionForPage: (kind, pageIndex) => this.#findRegionForPage(kind, pageIndex),
      getCurrentPageIndex: () => this.#getCurrentPageIndex(),
      resolveDescriptorForRegion: (region) => this.#resolveDescriptorForRegion(region),
      updateSelectionDebugHud: () => this.#updateSelectionDebugHud(),
      clearHoverRegion: () => this.#clearHoverRegion(),
      renderHoverRegion: (region) => this.#renderHoverRegion(region),
      focusEditorAfterImageSelection: () => this.#focusEditorAfterImageSelection(),
      resolveFieldAnnotationSelectionFromElement: (el) => this.#resolveFieldAnnotationSelectionFromElement(el),
      computePendingMarginClick: (pointerId, x, y) => this.#computePendingMarginClick(pointerId, x, y),
      selectWordAt: (pos: number) => this.#selectWordAt(pos),
      selectParagraphAt: (pos: number) => this.#selectParagraphAt(pos),
      finalizeDragSelectionWithDom: (pointer, dragAnchor, dragMode) =>
        this.#finalizeDragSelectionWithDom(pointer, dragAnchor, dragMode),
      hitTestTable: (x: number, y: number) => this.#hitTestTable(x, y),
    });
  }

  #setupPointerHandlers() {
    // Delegate to EditorInputManager for pointer events
    this.#editorInputManager?.bind();

    // Scroll handler for virtualization - find the actual scroll container
    // by walking up the DOM tree to find the first scrollable ancestor
    this.#scrollHandler = () => {
      this.#domPainter?.onScroll?.();
    };

    // Find the scrollable ancestor and attach listener there
    this.#scrollContainer = this.#findScrollableAncestor(this.#visibleHost);
    if (this.#scrollContainer) {
      this.#scrollContainer.addEventListener('scroll', this.#scrollHandler, { passive: true });
    }

    // Also listen on window as fallback
    const win = this.#visibleHost.ownerDocument?.defaultView;
    if (win && this.#scrollContainer !== win) {
      win.addEventListener('scroll', this.#scrollHandler, { passive: true });
    }
  }

  /**
   * Finds the first scrollable ancestor of an element.
   * Returns the element itself if it's scrollable, or walks up the tree.
   *
   * Note: We only check for overflow CSS property, not whether content currently
   * overflows. At setup time, content may not be laid out yet, but the element
   * with overflow:auto/scroll will become the scroll container once content grows.
   */
  #findScrollableAncestor(element: HTMLElement): Element | Window | null {
    const win = element.ownerDocument?.defaultView;
    if (!win) return null;

    let current: Element | null = element;
    while (current) {
      const style = win.getComputedStyle(current);
      const overflowY = style.overflowY;
      // Check for scrollable overflow property - don't require hasScroll since
      // content may not be laid out yet at setup time
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return current;
      }
      current = current.parentElement;
    }

    // If no scrollable ancestor found, return window
    return win;
  }

  /**
   * Sets up drag and drop handlers for field annotations.
   */
  #setupDragHandlers() {
    // Clean up any existing manager
    this.#dragDropManager?.destroy();

    this.#dragDropManager = new DragDropManager();
    this.#dragDropManager.setDependencies({
      getActiveEditor: () => this.getActiveEditor(),
      hitTest: (clientX, clientY) => this.hitTest(clientX, clientY),
      scheduleSelectionUpdate: () => this.#scheduleSelectionUpdate(),
      getViewportHost: () => this.#viewportHost,
      getPainterHost: () => this.#painterHost,
    });
    this.#dragDropManager.bind();
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

  /**
   * Set up the header/footer session manager with dependencies and callbacks.
   */
  #setupHeaderFooterSession() {
    if (!this.#headerFooterSession) return;

    // Update the editor reference (was set to null during construction)
    this.#headerFooterSession.setEditor(this.#editor);

    // Set up dependencies
    this.#headerFooterSession.setDependencies({
      getLayoutOptions: () => this.#layoutOptions,
      getPageElement: (pageIndex) => this.#getPageElement(pageIndex),
      scrollPageIntoView: (pageIndex) => this.#scrollPageIntoView(pageIndex),
      waitForPageMount: (pageIndex, options) => this.#waitForPageMount(pageIndex, options),
      convertPageLocalToOverlayCoords: (pageIndex, x, y) => this.#convertPageLocalToOverlayCoords(pageIndex, x, y),
      isViewLocked: () => this.#isViewLocked(),
      getBodyPageHeight: () => this.#getBodyPageHeight(),
      notifyInputBridgeTargetChanged: () => this.#inputBridge?.notifyTargetChanged(),
      scheduleRerender: () => this.#scheduleRerender(),
      setPendingDocChange: () => {
        this.#pendingDocChange = true;
      },
    });

    // Set up callbacks
    this.#headerFooterSession.setCallbacks({
      onModeChanged: (session) => {
        this.emit('headerFooterModeChanged', {
          mode: session.mode,
          kind: session.kind,
          headerId: session.headerId,
          sectionType: session.sectionType,
          pageIndex: session.pageIndex,
          pageNumber: session.pageNumber,
        });
        this.#updateAwarenessSession();
      },
      onEditingContext: (data) => {
        this.emit('headerFooterEditingContext', data);
        this.#announce(
          data.kind === 'body'
            ? 'Exited header/footer edit mode.'
            : `Editing ${data.kind === 'header' ? 'Header' : 'Footer'} (${data.sectionType ?? 'default'})`,
        );
      },
      onEditBlocked: (reason) => {
        this.emit('headerFooterEditBlocked', { reason });
      },
      onError: (data) => {
        this.emit('error', data);
      },
      onAnnounce: (message) => {
        this.#announce(message);
      },
      onUpdateAwarenessSession: () => {
        this.#updateAwarenessSession();
      },
    });

    // Initialize the registry
    this.#headerFooterSession.initialize();
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
      const perfNow = () => (perf?.now ? perf.now() : Date.now());
      const startMark = perf?.now?.();
      try {
        const getJsonStart = perfNow();
        docJson = this.#editor.getJSON();
        const getJsonEnd = perfNow();
        perfLog(`[Perf] getJSON: ${(getJsonEnd - getJsonStart).toFixed(2)}ms`);
      } catch (error) {
        this.#handleLayoutError('render', this.#decorateError(error, 'getJSON'));
        return;
      }
      const layoutEpoch = this.#epochMapper.getCurrentEpoch();

      const sectionMetadata: SectionMetadata[] = [];
      let blocks: FlowBlock[] | undefined;
      let bookmarks: Map<string, number> = new Map();
      let converterContext: ConverterContext | undefined = undefined;
      try {
        const converter = (this.#editor as Editor & { converter?: Record<string, unknown> }).converter;
        // Compute visible footnote numbering (1-based) by first appearance in the document.
        // This matches Word behavior even when OOXML ids are non-contiguous or start at 0.
        const footnoteNumberById: Record<string, number> = {};
        const footnoteOrder: string[] = [];
        try {
          const seen = new Set<string>();
          let counter = 1;
          this.#editor?.state?.doc?.descendants?.((node: any) => {
            if (node?.type?.name !== 'footnoteReference') return;
            const rawId = node?.attrs?.id;
            if (rawId == null) return;
            const key = String(rawId);
            if (!key || seen.has(key)) return;
            seen.add(key);
            footnoteNumberById[key] = counter;
            footnoteOrder.push(key);
            counter += 1;
          });
        } catch (e) {
          // Log traversal errors - footnote numbering may be incorrect if this fails
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[PresentationEditor] Failed to compute footnote numbering:', e);
          }
        }
        // Invalidate flow block cache when footnote order changes, since footnote
        // numbers are embedded in cached blocks and must be recomputed.
        const footnoteSignature = footnoteOrder.join('|');
        if (footnoteSignature !== this.#footnoteNumberSignature) {
          this.#flowBlockCache.clear();
          this.#footnoteNumberSignature = footnoteSignature;
        }
        // Expose numbering to node views and layout adapter.
        try {
          if (converter && typeof converter === 'object') {
            converter['footnoteNumberById'] = footnoteNumberById;
          }
        } catch {}

        converterContext = converter
          ? {
              docx: converter.convertedXml,
              ...(Object.keys(footnoteNumberById).length ? { footnoteNumberById } : {}),
              translatedLinkedStyles: converter.translatedLinkedStyles,
              translatedNumbering: converter.translatedNumbering,
            }
          : undefined;
        const atomNodeTypes = getAtomNodeTypesFromSchema(this.#editor?.schema ?? null);
        const positionMapStart = perfNow();
        const positionMap =
          this.#editor?.state?.doc && docJson ? buildPositionMapFromPmDoc(this.#editor.state.doc, docJson) : null;
        const positionMapEnd = perfNow();
        perfLog(`[Perf] buildPositionMapFromPmDoc: ${(positionMapEnd - positionMapStart).toFixed(2)}ms`);
        const commentsEnabled =
          this.#documentMode !== 'viewing' || this.#layoutOptions.enableCommentsInViewing === true;
        const toFlowBlocksStart = perfNow();
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
          flowBlockCache: this.#flowBlockCache,
          ...(positionMap ? { positions: positionMap } : {}),
          ...(atomNodeTypes.length > 0 ? { atomNodeTypes } : {}),
        });
        const toFlowBlocksEnd = perfNow();
        perfLog(
          `[Perf] toFlowBlocks: ${(toFlowBlocksEnd - toFlowBlocksStart).toFixed(2)}ms (blocks=${result.blocks.length})`,
        );
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

      this.#applyHtmlAnnotationMeasurements(blocks);

      const baseLayoutOptions = this.#resolveLayoutOptions(blocks, sectionMetadata);
      const footnotesLayoutInput = buildFootnotesInput(
        this.#editor?.state,
        (this.#editor as EditorWithConverter)?.converter,
        converterContext,
        this.#editor?.converter?.themeColors ?? undefined,
      );
      const layoutOptions = footnotesLayoutInput
        ? { ...baseLayoutOptions, footnotes: footnotesLayoutInput }
        : baseLayoutOptions;
      const previousBlocks = this.#layoutState.blocks;
      const previousLayout = this.#layoutState.layout;
      const previousMeasures = this.#layoutState.measures;

      let layout: Layout;
      let measures: Measure[];
      let headerLayouts: HeaderFooterLayoutResult[] | undefined;
      let footerLayouts: HeaderFooterLayoutResult[] | undefined;
      let extraBlocks: FlowBlock[] | undefined;
      let extraMeasures: Measure[] | undefined;
      const headerFooterInput = this.#buildHeaderFooterInput();
      try {
        const incrementalLayoutStart = perfNow();
        const result = await incrementalLayout(
          previousBlocks,
          previousLayout,
          blocks,
          layoutOptions,
          (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => measureBlock(block, constraints),
          headerFooterInput ?? undefined,
          previousMeasures,
        );
        const incrementalLayoutEnd = perfNow();
        perfLog(`[Perf] incrementalLayout: ${(incrementalLayoutEnd - incrementalLayoutStart).toFixed(2)}ms`);

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
        extraBlocks = Array.isArray(result.extraBlocks) ? result.extraBlocks : undefined;
        extraMeasures = Array.isArray(result.extraMeasures) ? result.extraMeasures : undefined;
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
      const multiSectionId = buildMultiSectionIdentifier(sectionMetadata, converter?.pageStyles, {
        headerIds: converter?.headerIds,
        footerIds: converter?.footerIds,
      });
      if (this.#headerFooterSession) {
        this.#headerFooterSession.multiSectionIdentifier = multiSectionId;
      }
      const anchorMap = computeAnchorMapFromHelper(bookmarks, layout, blocks);
      this.#layoutState = { blocks, measures, layout, bookmarks, anchorMap };
      if (this.#headerFooterSession) {
        this.#headerFooterSession.headerLayoutResults = headerLayouts ?? null;
        this.#headerFooterSession.footerLayoutResults = footerLayouts ?? null;
      }

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
        painter.setProviders(
          this.#headerFooterSession?.headerDecorationProvider,
          this.#headerFooterSession?.footerDecorationProvider,
        );
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
      const headerLayoutsByRId = this.#headerFooterSession?.headerLayoutsByRId;
      if (headerLayoutsByRId) {
        for (const rIdResult of headerLayoutsByRId.values()) {
          headerBlocks.push(...rIdResult.blocks);
          headerMeasures.push(...rIdResult.measures);
        }
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
      const footerLayoutsByRId = this.#headerFooterSession?.footerLayoutsByRId;
      if (footerLayoutsByRId) {
        for (const rIdResult of footerLayoutsByRId.values()) {
          footerBlocks.push(...rIdResult.blocks);
          footerMeasures.push(...rIdResult.measures);
        }
      }

      // Merge any extra lookup blocks (e.g., footnotes injected into page fragments)
      if (extraBlocks && extraMeasures && extraBlocks.length === extraMeasures.length && extraBlocks.length > 0) {
        footerBlocks.push(...extraBlocks);
        footerMeasures.push(...extraMeasures);
      }

      // Pass all blocks (main document + headers + footers + extras) to the painter
      const painterSetDataStart = perfNow();
      painter.setData?.(
        blocks,
        measures,
        headerBlocks.length > 0 ? headerBlocks : undefined,
        headerMeasures.length > 0 ? headerMeasures : undefined,
        footerBlocks.length > 0 ? footerBlocks : undefined,
        footerMeasures.length > 0 ? footerMeasures : undefined,
      );
      const painterSetDataEnd = perfNow();
      perfLog(`[Perf] painter.setData: ${(painterSetDataEnd - painterSetDataStart).toFixed(2)}ms`);
      // Avoid MutationObserver overhead while repainting large DOM trees.
      this.#domIndexObserverManager?.pause();
      // Pass the transaction mapping for efficient position attribute updates.
      // Consumed here and cleared to prevent stale mappings on subsequent paints.
      const mapping = this.#pendingMapping;
      this.#pendingMapping = null;
      const painterPaintStart = perfNow();
      painter.paint(layout, this.#painterHost, mapping ?? undefined);
      const painterPaintEnd = perfNow();
      perfLog(`[Perf] painter.paint: ${(painterPaintEnd - painterPaintStart).toFixed(2)}ms`);
      const painterPostStart = perfNow();
      this.#applyVertAlignToLayout();
      this.#rebuildDomPositionIndex();
      this.#syncDecorations();
      this.#domIndexObserverManager?.resume();
      const painterPostEnd = perfNow();
      perfLog(`[Perf] painter.postPaint: ${(painterPostEnd - painterPostStart).toFixed(2)}ms`);
      this.#layoutEpoch = layoutEpoch;
      if (this.#updateHtmlAnnotationMeasurements(layoutEpoch)) {
        this.#pendingDocChange = true;
        this.#scheduleRerender();
      }
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

      this.#selectionSync.requestRender({ immediate: true });

      // Re-normalize remote cursor positions after layout completes.
      // Local document changes shift absolute positions, so Yjs relative positions
      // must be re-resolved against the updated editor state. Without this,
      // remote cursors appear offset by the number of characters the local user typed.
      if (this.#remoteCursorManager?.hasRemoteCursors()) {
        this.#remoteCursorManager.markDirty();
        this.#remoteCursorManager.scheduleUpdate();
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
        headerProvider: this.#headerFooterSession?.headerDecorationProvider,
        footerProvider: this.#headerFooterSession?.footerDecorationProvider,
        ruler: this.#layoutOptions.ruler,
        pageGap: this.#layoutState.layout?.pageGap ?? this.#getEffectivePageGap(),
      });
    }
    return this.#domPainter;
  }

  #applyHtmlAnnotationMeasurements(blocks: FlowBlock[]) {
    if (this.#htmlAnnotationHeights.size === 0) return;

    blocks.forEach((block) => {
      if (block.kind !== 'paragraph') return;

      block.runs.forEach((run) => {
        if (run.kind !== 'fieldAnnotation' || run.variant !== 'html') {
          return;
        }
        if (run.pmStart == null || run.pmEnd == null) {
          return;
        }

        const key = `${run.pmStart}-${run.pmEnd}`;
        const height = this.#htmlAnnotationHeights.get(key);
        if (!height || height <= 0) {
          return;
        }

        const currentSize = run.size ?? {};
        if (currentSize.height === height) {
          return;
        }

        run.size = { ...currentSize, height };
      });
    });
  }

  #updateHtmlAnnotationMeasurements(layoutEpoch: number): boolean {
    const nextHeights = new Map(this.#htmlAnnotationHeights);
    const annotations = this.#painterHost.querySelectorAll('.annotation[data-type="html"]');
    const threshold = 1;

    let changed = false;
    annotations.forEach((annotation) => {
      const element = annotation as HTMLElement;
      const pmStart = element.dataset.pmStart;
      const pmEnd = element.dataset.pmEnd;
      if (!pmStart || !pmEnd) {
        return;
      }
      const height = element.offsetHeight;
      if (height <= 0) {
        return;
      }
      const key = `${pmStart}-${pmEnd}`;
      const prev = nextHeights.get(key);
      if (prev != null && Math.abs(prev - height) <= threshold) {
        return;
      }
      nextHeights.set(key, height);
      changed = true;
    });

    if (layoutEpoch !== this.#htmlAnnotationMeasureEpoch) {
      this.#htmlAnnotationMeasureEpoch = layoutEpoch;
      this.#htmlAnnotationMeasureAttempts = 0;
    }

    this.#htmlAnnotationHeights = nextHeights;
    if (!changed) {
      return false;
    }

    if (this.#htmlAnnotationMeasureAttempts >= 2) {
      return false;
    }

    this.#htmlAnnotationMeasureAttempts += 1;
    return true;
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

  #clearSelectedFieldAnnotationClass() {
    if (this.#lastSelectedFieldAnnotation?.element?.classList?.contains('ProseMirror-selectednode')) {
      this.#lastSelectedFieldAnnotation.element.classList.remove('ProseMirror-selectednode');
    }
    this.#lastSelectedFieldAnnotation = null;
  }

  #setSelectedFieldAnnotationClass(element: HTMLElement, pmStart: number) {
    if (this.#lastSelectedFieldAnnotation?.element && this.#lastSelectedFieldAnnotation.element !== element) {
      this.#lastSelectedFieldAnnotation.element.classList.remove('ProseMirror-selectednode');
    }
    element.classList.add('ProseMirror-selectednode');
    this.#lastSelectedFieldAnnotation = { element, pmStart };
  }

  #syncSelectedFieldAnnotationClass(selection: Selection | null | undefined) {
    if (!selection || !(selection instanceof NodeSelection)) {
      this.#clearSelectedFieldAnnotationClass();
      return;
    }

    const node = selection.node;
    if (!node || node.type?.name !== 'fieldAnnotation') {
      this.#clearSelectedFieldAnnotationClass();
      return;
    }

    if (!this.#painterHost) {
      this.#clearSelectedFieldAnnotationClass();
      return;
    }

    const pmStart = selection.from;
    if (this.#lastSelectedFieldAnnotation?.pmStart === pmStart && this.#lastSelectedFieldAnnotation.element) {
      return;
    }

    const selector = `.annotation[data-pm-start="${pmStart}"]`;
    const element = this.#painterHost.querySelector(selector) as HTMLElement | null;
    if (!element) {
      this.#clearSelectedFieldAnnotationClass();
      return;
    }

    this.#setSelectedFieldAnnotationClass(element, pmStart);
  }

  #clearSelectedStructuredContentBlockClass() {
    if (!this.#lastSelectedStructuredContentBlock) return;
    this.#lastSelectedStructuredContentBlock.elements.forEach((element) => {
      element.classList.remove('ProseMirror-selectednode');
    });
    this.#lastSelectedStructuredContentBlock = null;
  }

  #setSelectedStructuredContentBlockClass(elements: HTMLElement[], id: string | null) {
    if (
      this.#lastSelectedStructuredContentBlock &&
      this.#lastSelectedStructuredContentBlock.id === id &&
      this.#lastSelectedStructuredContentBlock.elements.length === elements.length &&
      this.#lastSelectedStructuredContentBlock.elements.every((el) => elements.includes(el))
    ) {
      return;
    }

    this.#clearSelectedStructuredContentBlockClass();
    elements.forEach((element) => element.classList.add('ProseMirror-selectednode'));
    this.#lastSelectedStructuredContentBlock = { id, elements };
  }

  #syncSelectedStructuredContentBlockClass(selection: Selection | null | undefined) {
    if (!selection) {
      this.#clearSelectedStructuredContentBlockClass();
      return;
    }

    let node: ProseMirrorNode | null = null;
    let id: string | null = null;

    if (selection instanceof NodeSelection) {
      if (selection.node?.type?.name !== 'structuredContentBlock') {
        this.#clearSelectedStructuredContentBlockClass();
        return;
      }
      node = selection.node;
    } else {
      const $pos = selection.$from;
      for (let depth = $pos.depth; depth > 0; depth--) {
        const candidate = $pos.node(depth);
        if (candidate.type?.name === 'structuredContentBlock') {
          node = candidate;
          break;
        }
      }
      if (!node) {
        this.#clearSelectedStructuredContentBlockClass();
        return;
      }
    }

    if (!this.#painterHost) {
      this.#clearSelectedStructuredContentBlockClass();
      return;
    }

    const rawId = (node.attrs as { id?: unknown } | null | undefined)?.id;
    id = rawId != null ? String(rawId) : null;
    let elements: HTMLElement[] = [];

    if (id) {
      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
      elements = Array.from(
        this.#painterHost.querySelectorAll(`.superdoc-structured-content-block[data-sdt-id="${escapedId}"]`),
      ) as HTMLElement[];
    }

    if (elements.length === 0) {
      const elementAtPos = this.getElementAtPos(selection.from, { fallbackToCoords: true });
      const container = elementAtPos?.closest?.('.superdoc-structured-content-block') as HTMLElement | null;
      if (container) {
        elements = [container];
      }
    }

    if (elements.length === 0) {
      this.#clearSelectedStructuredContentBlockClass();
      return;
    }

    this.#setSelectedStructuredContentBlockClass(elements, id);
  }

  #handleStructuredContentBlockMouseEnter = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const block = target.closest('.superdoc-structured-content-block');

    if (!block || !(block instanceof HTMLElement)) return;

    // Don't show hover effect if already selected
    if (block.classList.contains('ProseMirror-selectednode')) return;

    const rawId = block.dataset.sdtId;
    if (!rawId) return;

    this.#setHoveredStructuredContentBlockClass(rawId);
  };

  #handleStructuredContentBlockMouseLeave = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const block = target.closest('.superdoc-structured-content-block') as HTMLElement | null;

    if (!block) return;

    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (
      relatedTarget &&
      block.dataset.sdtId &&
      relatedTarget.closest(`.superdoc-structured-content-block[data-sdt-id="${block.dataset.sdtId}"]`)
    ) {
      return;
    }

    this.#clearHoveredStructuredContentBlockClass();
  };

  #clearHoveredStructuredContentBlockClass() {
    if (!this.#lastHoveredStructuredContentBlock) return;
    this.#lastHoveredStructuredContentBlock.elements.forEach((element) => {
      element.classList.remove('sdt-group-hover');
    });
    this.#lastHoveredStructuredContentBlock = null;
  }

  #setHoveredStructuredContentBlockClass(id: string) {
    if (this.#lastHoveredStructuredContentBlock?.id === id) return;

    this.#clearHoveredStructuredContentBlockClass();

    if (!this.#painterHost) return;

    const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    const elements = Array.from(
      this.#painterHost.querySelectorAll(`.superdoc-structured-content-block[data-sdt-id="${escapedId}"]`),
    ) as HTMLElement[];

    if (elements.length === 0) return;

    elements.forEach((element) => {
      if (!element.classList.contains('ProseMirror-selectednode')) {
        element.classList.add('sdt-group-hover');
      }
    });

    this.#lastHoveredStructuredContentBlock = { id, elements };
  }

  #clearSelectedStructuredContentInlineClass() {
    if (!this.#lastSelectedStructuredContentInline) return;
    this.#lastSelectedStructuredContentInline.elements.forEach((element) => {
      element.classList.remove('ProseMirror-selectednode');
    });
    this.#lastSelectedStructuredContentInline = null;
  }

  #setSelectedStructuredContentInlineClass(elements: HTMLElement[], id: string | null) {
    if (
      this.#lastSelectedStructuredContentInline &&
      this.#lastSelectedStructuredContentInline.id === id &&
      this.#lastSelectedStructuredContentInline.elements.length === elements.length &&
      this.#lastSelectedStructuredContentInline.elements.every((el) => elements.includes(el))
    ) {
      return;
    }

    this.#clearSelectedStructuredContentInlineClass();
    elements.forEach((element) => element.classList.add('ProseMirror-selectednode'));
    this.#lastSelectedStructuredContentInline = { id, elements };
  }

  #syncSelectedStructuredContentInlineClass(selection: Selection | null | undefined) {
    if (!selection) {
      this.#clearSelectedStructuredContentInlineClass();
      return;
    }

    let node: ProseMirrorNode | null = null;
    let id: string | null = null;
    let pos: number | null = null;

    if (selection instanceof NodeSelection) {
      if (selection.node?.type?.name !== 'structuredContent') {
        this.#clearSelectedStructuredContentInlineClass();
        return;
      }
      node = selection.node;
      pos = selection.from;
    } else {
      const $pos = selection.$from;
      for (let depth = $pos.depth; depth > 0; depth--) {
        const candidate = $pos.node(depth);
        if (candidate.type?.name === 'structuredContent') {
          node = candidate;
          pos = $pos.before(depth);
          break;
        }
      }
      if (!node || pos == null) {
        this.#clearSelectedStructuredContentInlineClass();
        return;
      }
    }

    if (!this.#painterHost) {
      this.#clearSelectedStructuredContentInlineClass();
      return;
    }

    const rawId = (node.attrs as { id?: unknown } | null | undefined)?.id;
    id = rawId != null ? String(rawId) : null;
    let elements: HTMLElement[] = [];

    if (id) {
      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
      elements = Array.from(
        this.#painterHost.querySelectorAll(`.superdoc-structured-content-inline[data-sdt-id="${escapedId}"]`),
      ) as HTMLElement[];
    }

    if (elements.length === 0) {
      const elementAtPos = this.getElementAtPos(pos, { fallbackToCoords: true });
      const container = elementAtPos?.closest?.('.superdoc-structured-content-inline') as HTMLElement | null;
      if (container) {
        elements = [container];
      }
    }

    if (elements.length === 0) {
      this.#clearSelectedStructuredContentInlineClass();
      return;
    }

    this.#setSelectedStructuredContentInlineClass(elements, id);
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
    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';
    if (sessionMode !== 'body') {
      this.#clearSelectedFieldAnnotationClass();
      return;
    }

    // Only clear local layer, preserve remote cursor layer
    if (!this.#localSelectionLayer) {
      return;
    }

    // In viewing mode, don't render caret or selection highlights
    if (this.#isViewLocked()) {
      try {
        this.#clearSelectedFieldAnnotationClass();
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

    const activeEditor = this.getActiveEditor();
    const hasFocus = activeEditor?.view?.hasFocus?.() ?? false;
    // Keep selection visible when context menu is open.
    const contextMenuOpen = activeEditor?.state ? !!ContextMenuPluginKey.getState(activeEditor.state)?.open : false;

    // Keep selection visible when focus is on editor UI surfaces (toolbar, dropdowns).
    // Naive-UI portals dropdown content under .v-binder-follower-content at <body> level,
    // so it won't be inside [data-editor-ui-surface]. Check both.
    const activeEl = document.activeElement;
    const isOnEditorUi = !!(activeEl as Element)?.closest?.('[data-editor-ui-surface], .v-binder-follower-content');

    if (!hasFocus && !contextMenuOpen && !isOnEditorUi) {
      try {
        this.#clearSelectedFieldAnnotationClass();
        this.#localSelectionLayer.innerHTML = '';
      } catch {}
      return;
    }

    const layout = this.#layoutState.layout;
    const editorState = activeEditor.state;
    const selection = editorState?.selection;

    if (!selection) {
      try {
        this.#clearSelectedFieldAnnotationClass();
        this.#clearSelectedStructuredContentBlockClass();
        this.#clearSelectedStructuredContentInlineClass();
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

    this.#syncSelectedFieldAnnotationClass(selection);
    this.#syncSelectedStructuredContentBlockClass(selection);
    this.#syncSelectedStructuredContentInlineClass(selection);

    // Ensure selection endpoints remain mounted under virtualization so DOM-first
    // caret/selection rendering stays available during cross-page selection.
    this.#updateSelectionVirtualizationPins({ includeDragBuffer: this.#editorInputManager?.isDragging ?? false });

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
      const isFieldAnnotationSelection =
        selection instanceof NodeSelection && selection.node?.type?.name === 'fieldAnnotation';
      if (domRects.length > 0 && !isFieldAnnotationSelection) {
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

    const sessionModeForPerm = this.#headerFooterSession?.session?.mode ?? 'body';
    if (sessionModeForPerm !== 'body') {
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
    const adapter = this.#headerFooterSession?.adapter;
    if (!adapter) {
      return null;
    }
    const headerBlocks = adapter.getBatch('header');
    const footerBlocks = adapter.getBatch('footer');
    // Also get all blocks by rId for multi-section support
    const headerBlocksByRId = adapter.getBlocksByRId('header');
    const footerBlocksByRId = adapter.getBlocksByRId('footer');
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
    if (this.#headerFooterSession) {
      await this.#headerFooterSession.layoutPerRId(headerFooterInput, layout, sectionMetadata);
    }
  }

  /**
   * Update decoration providers for header/footer.
   * Delegates to HeaderFooterSessionManager which handles provider creation.
   */
  #updateDecorationProviders(layout: Layout) {
    this.#headerFooterSession?.updateDecorationProviders(layout);
  }

  /**
   * Hit test for header/footer regions at a given point.
   * Delegates to HeaderFooterSessionManager which manages region tracking.
   */
  #hitTestHeaderFooterRegion(x: number, y: number): HeaderFooterRegion | null {
    return this.#headerFooterSession?.hitTestRegion(x, y, this.#layoutState.layout) ?? null;
  }

  #activateHeaderFooterRegion(region: HeaderFooterRegion) {
    // Delegate to session manager
    this.#headerFooterSession?.activateRegion(region);
  }

  #exitHeaderFooterMode() {
    // Delegate to session manager
    this.#headerFooterSession?.exitMode();
    this.#pendingDocChange = true;
    this.#scheduleRerender();

    this.#editor.view?.focus();
  }

  #getActiveDomTarget(): HTMLElement | null {
    const session = this.#headerFooterSession?.session;
    if (session && session.mode !== 'body') {
      const activeEditor = this.#headerFooterSession?.activeEditor;
      return activeEditor?.view?.dom ?? this.#editor.view?.dom ?? null;
    }
    return this.#editor.view?.dom ?? null;
  }

  #updateAwarenessSession() {
    const provider = this.#options.collaborationProvider;
    const awareness = provider?.awareness;

    // Runtime validation: ensure setLocalStateField method exists
    if (!awareness || typeof awareness.setLocalStateField !== 'function') {
      return;
    }

    const session = this.#headerFooterSession?.session;
    if (!session || session.mode === 'body') {
      awareness.setLocalStateField('layoutSession', null);
      return;
    }
    awareness.setLocalStateField('layoutSession', {
      kind: session.kind,
      headerId: session.headerId ?? null,
      pageNumber: session.pageNumber ?? null,
    });
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
    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';
    this.#a11ySelectionAnnounceTimeout = scheduleA11ySelectionAnnouncementFromHelper(
      {
        ariaLiveRegion: this.#ariaLiveRegion,
        sessionMode,
        isDragging: this.#editorInputManager?.isDragging ?? false,
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
    const sessionMode = this.#headerFooterSession?.session?.mode ?? 'body';
    if (sessionMode !== 'body') return;
    const announcement = computeA11ySelectionAnnouncementFromHelper(this.getActiveEditor().state);
    if (!announcement) return;

    if (announcement.key === this.#a11yLastAnnouncedSelectionKey) {
      return;
    }
    this.#a11yLastAnnouncedSelectionKey = announcement.key;
    this.#announce(announcement.message);
  }

  #emitHeaderFooterEditBlocked(reason: string) {
    this.emit('headerFooterEditBlocked', { reason });
  }

  #resolveDescriptorForRegion(region: HeaderFooterRegion): HeaderFooterDescriptor | null {
    return this.#headerFooterSession?.resolveDescriptorForRegion(region) ?? null;
  }

  /**
   * Creates a default header or footer when none exists.
   * Delegates to HeaderFooterSessionManager which handles converter API calls.
   */
  #createDefaultHeaderFooter(region: HeaderFooterRegion): void {
    this.#headerFooterSession?.createDefault(region);
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
      isDragging: this.#editorInputManager?.isDragging ?? false,
      dragAnchorPageIndex: this.#editorInputManager?.dragAnchorPageIndex ?? null,
      dragLastHitPageIndex: this.#editorInputManager?.dragLastHitPageIndex ?? null,
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
    const dragLastRawHit = this.#editorInputManager?.dragLastRawHit;
    this.#updateSelectionVirtualizationPins({
      includeDragBuffer: false,
      extraPages: dragLastRawHit ? [dragLastRawHit.pageIndex] : undefined,
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

    const prior = dragLastRawHit;
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
   * Uses DEFAULT_PAGE_GAP for both virtualized and non-virtualized modes for visual consistency.
   */
  #getEffectivePageGap(): number {
    if (this.#layoutOptions.virtualization?.enabled) {
      // Use explicit gap if provided, otherwise use same default as non-virtualized for consistency
      return Math.max(0, this.#layoutOptions.virtualization.gap ?? DEFAULT_PAGE_GAP);
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
   * Delegates to HeaderFooterSessionManager which handles context lookup and fallbacks.
   */
  #getHeaderFooterPageHeight(): number {
    return this.#headerFooterSession?.getPageHeight() ?? 1;
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
      cellAnchorTableBlockId: this.#editorInputManager?.cellAnchor?.tableBlockId ?? null,
      convertPageLocalToOverlayCoords: (pageIndex, x, y) => this.#convertPageLocalToOverlayCoords(pageIndex, x, y),
    });
  }

  /**
   * Render header/footer hover highlight for a region.
   * Delegates to HeaderFooterSessionManager which manages the hover UI elements.
   */
  #renderHoverRegion(region: HeaderFooterRegion) {
    this.#headerFooterSession?.renderHover(region);
  }

  /**
   * Clear header/footer hover highlight.
   * Delegates to HeaderFooterSessionManager which manages the hover UI elements.
   */
  #clearHoverRegion() {
    this.#headerFooterSession?.clearHover();
  }

  #getHeaderFooterContext(): HeaderFooterLayoutContext | null {
    return this.#headerFooterSession?.getContext() ?? null;
  }

  /**
   * Compute selection rectangles in header/footer mode.
   * Delegates to HeaderFooterSessionManager which handles context lookup and coordinate transformation.
   */
  #computeHeaderFooterSelectionRects(from: number, to: number): LayoutRect[] {
    return this.#headerFooterSession?.computeSelectionRects(from, to) ?? [];
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

  #getPageOffsetY(pageIndex: number): number | null {
    return getPageOffsetYFromTransform({
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
        getPageOffsetY: (pageIndex) => this.#getPageOffsetY(pageIndex),
      },
      clientX,
      clientY,
    );
  }

  denormalizeClientPoint(
    layoutX: number,
    layoutY: number,
    pageIndex?: number,
    height?: number,
  ): { x: number; y: number; height?: number } | null {
    return denormalizeClientPointFromPointer(
      {
        viewportHost: this.#viewportHost,
        visibleHost: this.#visibleHost,
        zoom: this.#layoutOptions.zoom ?? 1,
        getPageOffsetX: (pageIndex) => this.#getPageOffsetX(pageIndex),
        getPageOffsetY: (pageIndex) => this.#getPageOffsetY(pageIndex),
      },
      layoutX,
      layoutY,
      pageIndex,
      height,
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

  computeCaretLayoutRect(pos: number): { pageIndex: number; x: number; y: number; height: number } | null {
    return this.#computeCaretLayoutRect(pos);
  }

  #getCurrentPageIndex(): number {
    const session = this.#headerFooterSession?.session;
    if (session && session.mode !== 'body') {
      return session.pageIndex ?? 0;
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
    return this.#headerFooterSession?.findRegionForPage(kind, pageIndex) ?? null;
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
