/**
 * EditorInputManager - Handles pointer/input events for PresentationEditor.
 *
 * This manager encapsulates all pointer and focus event handling including:
 * - Pointer down/move/up handlers
 * - Drag selection state machine
 * - Cell selection for tables
 * - Multi-click detection (double/triple click)
 * - Link click handling
 * - Image selection
 * - Focus management
 * - Header/footer hover interactions
 */

import { Selection, TextSelection, NodeSelection } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { CellSelection } from 'prosemirror-tables';
import type { Editor } from '../../Editor.js';
import type { Layout, FlowBlock, Measure } from '@superdoc/contracts';
import type { CellAnchorState, PendingMarginClick, HeaderFooterRegion } from '../types.js';
import type { PositionHit, PageGeometryHelper, TableHitResult } from '@superdoc/layout-bridge';
import type { SelectionDebugHudState } from '../selection/SelectionDebug.js';
import type { EpochPositionMapper } from '../layout/EpochPositionMapper.js';
import type { HeaderFooterSessionManager } from '../header-footer/HeaderFooterSessionManager.js';

import { clickToPosition, getFragmentAtPosition } from '@superdoc/layout-bridge';
import {
  getFirstTextPosition as getFirstTextPositionFromHelper,
  registerPointerClick as registerPointerClickFromHelper,
} from '../input/ClickSelectionUtilities.js';
import { calculateExtendedSelection } from '../selection/SelectionHelpers.js';
import {
  shouldUseCellSelection as shouldUseCellSelectionFromHelper,
  getCellPosFromTableHit as getCellPosFromTableHitFromHelper,
  getTablePosFromHit as getTablePosFromHitFromHelper,
  hitTestTable as hitTestTableFromHelper,
} from '../tables/TableSelectionUtilities.js';
import { debugLog } from '../selection/SelectionDebug.js';

// =============================================================================
// Constants
// =============================================================================

const MULTI_CLICK_TIME_THRESHOLD_MS = 400;
const MULTI_CLICK_DISTANCE_THRESHOLD_PX = 5;
const AUTO_SCROLL_EDGE_PX = 32;
const AUTO_SCROLL_MAX_SPEED_PX = 24;
/** Tolerance for detecting scrollability to handle sub-pixel rounding in browsers */
const SCROLL_DETECTION_TOLERANCE_PX = 1;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

// =============================================================================
// Types
// =============================================================================

/**
 * Layout state provided by PresentationEditor.
 */
export type LayoutState = {
  layout: Layout | null;
  blocks: FlowBlock[];
  measures: Measure[];
};

/**
 * Dependencies injected from PresentationEditor.
 */
export type EditorInputDependencies = {
  /** Get the active editor (body or header/footer) */
  getActiveEditor: () => Editor;
  /** Get the main body editor */
  getEditor: () => Editor;
  /** Get current layout state */
  getLayoutState: () => LayoutState;
  /** Get the epoch mapper for position translation */
  getEpochMapper: () => EpochPositionMapper;
  /** Get viewport host element */
  getViewportHost: () => HTMLElement;
  /** Get visible host element (for scroll) */
  getVisibleHost: () => HTMLElement;
  /** Get current layout mode */
  getLayoutMode: () => 'vertical' | 'horizontal' | 'book';
  /** Get header/footer session manager */
  getHeaderFooterSession: () => HeaderFooterSessionManager | null;
  /** Get page geometry helper */
  getPageGeometryHelper: () => PageGeometryHelper | null;
  /** Get layout options zoom */
  getZoom: () => number;
  /** Check if view is locked */
  isViewLocked: () => boolean;
  /** Get document mode */
  getDocumentMode: () => 'editing' | 'viewing' | 'suggesting';
  /** Get page element by index */
  getPageElement: (pageIndex: number) => HTMLElement | null;
  /** Check if selection-aware virtualization is enabled */
  isSelectionAwareVirtualizationEnabled: () => boolean;
};

/**
 * Callbacks for events that the manager emits.
 * All callbacks are optional to allow incremental setup.
 */
export type EditorInputCallbacks = {
  /** Schedule selection update */
  scheduleSelectionUpdate?: () => void;
  /** Schedule rerender */
  scheduleRerender?: () => void;
  /** Set pending doc change flag */
  setPendingDocChange?: () => void;
  /** Update selection virtualization pins */
  updateSelectionVirtualizationPins?: (options?: { includeDragBuffer?: boolean; extraPages?: number[] }) => void;
  /** Schedule a11y announcement */
  scheduleA11ySelectionAnnouncement?: (options: { immediate: boolean }) => void;
  /** Go to anchor */
  goToAnchor?: (href: string) => void;
  /** Emit event */
  emit?: (event: string, payload: unknown) => void;
  /** Normalize client point to layout coordinates */
  normalizeClientPoint?: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** Hit test header/footer region */
  hitTestHeaderFooterRegion?: (x: number, y: number) => HeaderFooterRegion | null;
  /** Exit header/footer mode */
  exitHeaderFooterMode?: () => void;
  /** Activate header/footer region */
  activateHeaderFooterRegion?: (region: HeaderFooterRegion) => void;
  /** Create default header/footer */
  createDefaultHeaderFooter?: (region: HeaderFooterRegion) => void;
  /** Emit header/footer edit blocked */
  emitHeaderFooterEditBlocked?: (reason: string) => void;
  /** Find region for page */
  findRegionForPage?: (kind: 'header' | 'footer', pageIndex: number) => HeaderFooterRegion | null;
  /** Get current page index */
  getCurrentPageIndex?: () => number;
  /** Resolve descriptor for region */
  resolveDescriptorForRegion?: (region: HeaderFooterRegion) => unknown | null;
  /** Update selection debug HUD */
  updateSelectionDebugHud?: () => void;
  /** Clear hover region */
  clearHoverRegion?: () => void;
  /** Render hover region */
  renderHoverRegion?: (region: HeaderFooterRegion) => void;
  /** Focus editor after image selection */
  focusEditorAfterImageSelection?: () => void;
  /** Resolve field annotation from element */
  resolveFieldAnnotationSelectionFromElement?: (el: HTMLElement) => { node: unknown; pos: number } | null;
  /** Compute pending margin click */
  computePendingMarginClick?: (pointerId: number, x: number, y: number) => PendingMarginClick | null;
  /** Select word at position */
  selectWordAt?: (pos: number) => boolean;
  /** Select paragraph at position */
  selectParagraphAt?: (pos: number) => boolean;
  /** Finalize drag selection with DOM */
  finalizeDragSelectionWithDom?: (
    pointer: { clientX: number; clientY: number },
    dragAnchor: number,
    dragMode: 'char' | 'word' | 'para',
  ) => void;
  /** Hit test table at coordinates */
  hitTestTable?: (x: number, y: number) => TableHitResult | null;
};

// =============================================================================
// EditorInputManager Class
// =============================================================================

export class EditorInputManager {
  // Dependencies
  #deps: EditorInputDependencies | null = null;
  #callbacks: EditorInputCallbacks = {};

  // Drag selection state
  #isDragging = false;
  #dragAnchor: number | null = null;
  #dragAnchorPageIndex: number | null = null;
  #dragExtensionMode: 'char' | 'word' | 'para' = 'char';
  #dragLastPointer: SelectionDebugHudState['lastPointer'] = null;
  #dragLastRawHit: PositionHit | null = null;
  #dragUsedPageNotMountedFallback = false;
  #autoScrollActive = false;
  #autoScrollTimer: { id: number; kind: 'raf' | 'timeout' } | null = null;
  #autoScrollVelocity: { x: number; y: number } = { x: 0, y: 0 };
  #lastPointerClient: { clientX: number; clientY: number } | null = null;

  // Click tracking for multi-click detection
  #clickCount = 0;
  #lastClickTime = 0;
  #lastClickPosition: { x: number; y: number } | null = null;

  // Cell selection state
  #cellAnchor: CellAnchorState | null = null;
  #cellDragMode: 'none' | 'pending' | 'active' = 'none';

  // Margin click state
  #pendingMarginClick: PendingMarginClick | null = null;

  // Image selection state
  #lastSelectedImageBlockId: string | null = null;

  // Focus suppression (for draggable annotations)
  #suppressFocusInFromDraggable = false;

  // Debug state
  #debugLastPointer: { clientX: number; clientY: number; x: number; y: number } | null = null;
  #debugLastHit: {
    source: 'dom' | 'geometry' | 'margin' | 'none';
    pos: number | null;
    layoutEpoch: number | null;
    mappedPos: number | null;
  } | null = null;

  // Bound handlers for event listener cleanup
  #boundHandlePointerDown: ((e: PointerEvent) => void) | null = null;
  #boundHandlePointerMove: ((e: PointerEvent) => void) | null = null;
  #boundHandlePointerUp: ((e: PointerEvent) => void) | null = null;
  #boundHandlePointerLeave: (() => void) | null = null;
  #boundHandleDoubleClick: ((e: MouseEvent) => void) | null = null;
  #boundHandleClick: ((e: MouseEvent) => void) | null = null;
  #boundHandleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  #boundHandleFocusIn: ((e: FocusEvent) => void) | null = null;
  #boundHandleEditorFocus: ((payload: unknown) => void) | null = null;
  #boundHandleEditorBlur: ((payload: unknown) => void) | null = null;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor() {
    // Handlers will be bound when dependencies are set
  }

  // ==========================================================================
  // Setup Methods
  // ==========================================================================

  /**
   * Set dependencies from PresentationEditor.
   */
  setDependencies(deps: EditorInputDependencies): void {
    this.#deps = deps;
  }

  /**
   * Set callbacks for events.
   */
  setCallbacks(callbacks: EditorInputCallbacks): void {
    this.#callbacks = callbacks;
  }

  /**
   * Bind event listeners to DOM elements.
   */
  bind(): void {
    if (!this.#deps) return;

    const viewportHost = this.#deps.getViewportHost();
    const visibleHost = this.#deps.getVisibleHost();
    const doc = viewportHost.ownerDocument ?? document;

    // Create bound handlers
    this.#boundHandlePointerDown = this.#handlePointerDown.bind(this);
    this.#boundHandlePointerMove = this.#handlePointerMove.bind(this);
    this.#boundHandlePointerUp = this.#handlePointerUp.bind(this);
    this.#boundHandlePointerLeave = this.#handlePointerLeave.bind(this);
    this.#boundHandleDoubleClick = this.#handleDoubleClick.bind(this);
    this.#boundHandleClick = this.#handleClick.bind(this);
    this.#boundHandleKeyDown = this.#handleKeyDown.bind(this);
    this.#boundHandleFocusIn = this.#handleFocusIn.bind(this);
    this.#boundHandleEditorFocus = this.#handleEditorFocus.bind(this);
    this.#boundHandleEditorBlur = this.#handleEditorBlur.bind(this);

    // Attach pointer event listeners
    viewportHost.addEventListener('pointerdown', this.#boundHandlePointerDown);
    viewportHost.addEventListener('pointermove', this.#boundHandlePointerMove);
    viewportHost.addEventListener('pointerup', this.#boundHandlePointerUp);
    viewportHost.addEventListener('pointerleave', this.#boundHandlePointerLeave);
    viewportHost.addEventListener('dblclick', this.#boundHandleDoubleClick);
    viewportHost.addEventListener('click', this.#boundHandleClick);

    // Keyboard events on container
    const container = viewportHost.closest('.presentation-editor') as HTMLElement | null;
    if (container) {
      container.addEventListener('keydown', this.#boundHandleKeyDown);
    }

    // Focus events on visible host
    visibleHost.addEventListener('focusin', this.#boundHandleFocusIn);
    const editor = this.#deps.getEditor();
    editor.on?.('focus', this.#boundHandleEditorFocus);
    editor.on?.('blur', this.#boundHandleEditorBlur);
  }

  /**
   * Unbind event listeners.
   */
  unbind(): void {
    if (!this.#deps) return;

    const viewportHost = this.#deps.getViewportHost();
    const visibleHost = this.#deps.getVisibleHost();

    if (this.#boundHandlePointerDown) {
      viewportHost.removeEventListener('pointerdown', this.#boundHandlePointerDown);
    }
    if (this.#boundHandlePointerMove) {
      viewportHost.removeEventListener('pointermove', this.#boundHandlePointerMove);
    }
    if (this.#boundHandlePointerUp) {
      viewportHost.removeEventListener('pointerup', this.#boundHandlePointerUp);
    }
    if (this.#boundHandlePointerLeave) {
      viewportHost.removeEventListener('pointerleave', this.#boundHandlePointerLeave);
    }
    if (this.#boundHandleDoubleClick) {
      viewportHost.removeEventListener('dblclick', this.#boundHandleDoubleClick);
    }
    if (this.#boundHandleClick) {
      viewportHost.removeEventListener('click', this.#boundHandleClick);
    }
    if (this.#boundHandleKeyDown) {
      const container = viewportHost.closest('.presentation-editor') as HTMLElement | null;
      if (container) {
        container.removeEventListener('keydown', this.#boundHandleKeyDown);
      }
    }
    if (this.#boundHandleFocusIn) {
      visibleHost.removeEventListener('focusin', this.#boundHandleFocusIn);
    }
    if (this.#boundHandleEditorFocus) {
      this.#deps.getEditor().off?.('focus', this.#boundHandleEditorFocus);
    }
    if (this.#boundHandleEditorBlur) {
      this.#deps.getEditor().off?.('blur', this.#boundHandleEditorBlur);
    }

    // Clear bound handlers
    this.#boundHandlePointerDown = null;
    this.#boundHandlePointerMove = null;
    this.#boundHandlePointerUp = null;
    this.#boundHandlePointerLeave = null;
    this.#boundHandleDoubleClick = null;
    this.#boundHandleClick = null;
    this.#boundHandleKeyDown = null;
    this.#boundHandleFocusIn = null;
    this.#boundHandleEditorFocus = null;
    this.#boundHandleEditorBlur = null;
  }

  /**
   * Destroy the manager and clean up.
   */
  destroy(): void {
    this.unbind();
    this.#deps = null;
    this.#callbacks = {};
    this.#clearDragState();
    this.#clearCellAnchor();
  }

  // ==========================================================================
  // Public Getters
  // ==========================================================================

  /** Whether currently dragging */
  get isDragging(): boolean {
    return this.#isDragging;
  }

  /** Current drag anchor position */
  get dragAnchor(): number | null {
    return this.#dragAnchor;
  }

  /** Cell anchor state for table selection */
  get cellAnchor(): CellAnchorState | null {
    return this.#cellAnchor;
  }

  /** Debug last pointer position */
  get debugLastPointer(): { clientX: number; clientY: number; x: number; y: number } | null {
    return this.#debugLastPointer;
  }

  /** Debug last hit */
  get debugLastHit(): {
    source: 'dom' | 'geometry' | 'margin' | 'none';
    pos: number | null;
    layoutEpoch: number | null;
    mappedPos: number | null;
  } | null {
    return this.#debugLastHit;
  }

  /** Last selected image block ID */
  get lastSelectedImageBlockId(): string | null {
    return this.#lastSelectedImageBlockId;
  }

  /** Drag anchor page index */
  get dragAnchorPageIndex(): number | null {
    return this.#dragAnchorPageIndex;
  }

  /** Get the page index from the last raw hit during drag */
  get dragLastHitPageIndex(): number | null {
    return this.#dragLastRawHit?.pageIndex ?? null;
  }

  /** Get the last raw hit during drag (for finalization) */
  get dragLastRawHit(): PositionHit | null {
    return this.#dragLastRawHit;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Clear cell anchor (used when document changes).
   */
  clearCellAnchor(): void {
    this.#clearCellAnchor();
  }

  /**
   * Set suppress focus in flag (for draggable annotations).
   */
  setSuppressFocusInFromDraggable(value: boolean): void {
    this.#suppressFocusInFromDraggable = value;
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  #clearDragState(): void {
    this.#isDragging = false;
    this.#dragAnchor = null;
    this.#dragAnchorPageIndex = null;
    this.#dragExtensionMode = 'char';
    this.#dragLastPointer = null;
    this.#dragLastRawHit = null;
    this.#dragUsedPageNotMountedFallback = false;
    this.#lastPointerClient = null;
    this.#stopAutoScroll();
  }

  #clearCellAnchor(): void {
    this.#cellAnchor = null;
    this.#cellDragMode = 'none';
  }

  #registerPointerClick(event: MouseEvent): number {
    const nextState = registerPointerClickFromHelper(
      event,
      {
        clickCount: this.#clickCount,
        lastClickTime: this.#lastClickTime,
        lastClickPosition: this.#lastClickPosition ?? { x: 0, y: 0 },
      },
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

  #getFirstTextPosition(): number {
    const editor = this.#deps?.getEditor();
    return getFirstTextPositionFromHelper(editor?.state?.doc ?? null);
  }

  #calculateExtendedSelection(
    anchor: number,
    head: number,
    mode: 'char' | 'word' | 'para',
  ): { selAnchor: number; selHead: number } {
    const layoutState = this.#deps?.getLayoutState();
    return calculateExtendedSelection(layoutState?.blocks ?? [], anchor, head, mode);
  }

  #shouldUseCellSelection(currentTableHit: TableHitResult | null): boolean {
    return shouldUseCellSelectionFromHelper(currentTableHit, this.#cellAnchor, this.#cellDragMode);
  }

  #getCellPosFromTableHit(tableHit: TableHitResult): number | null {
    const editor = this.#deps?.getEditor();
    const layoutState = this.#deps?.getLayoutState();
    return getCellPosFromTableHitFromHelper(tableHit, editor?.state?.doc ?? null, layoutState?.blocks ?? []);
  }

  #getTablePosFromHit(tableHit: TableHitResult): number | null {
    const editor = this.#deps?.getEditor();
    const layoutState = this.#deps?.getLayoutState();
    return getTablePosFromHitFromHelper(tableHit, editor?.state?.doc ?? null, layoutState?.blocks ?? []);
  }

  #setCellAnchor(tableHit: TableHitResult, tablePos: number): void {
    const cellPos = this.#getCellPosFromTableHit(tableHit);
    if (cellPos === null) return;

    this.#cellAnchor = {
      tablePos,
      cellPos,
      cellRowIndex: tableHit.cellRowIndex,
      cellColIndex: tableHit.cellColIndex,
      tableBlockId: tableHit.block.id,
    };
    this.#cellDragMode = 'pending';
  }

  #hitTestTable(x: number, y: number): TableHitResult | null {
    return this.#callbacks.hitTestTable?.(x, y) ?? null;
  }

  #getAutoScrollWindow(): Window | null {
    const host = this.#deps?.getVisibleHost();
    return host?.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  }

  #getScrollTarget(): {
    kind: 'element' | 'window';
    rect: { top: number; bottom: number; left: number; right: number };
    canScrollX: boolean;
    canScrollY: boolean;
    win: Window | null;
    element?: HTMLElement;
    scrollWidth?: number;
    scrollHeight?: number;
  } | null {
    if (!this.#deps) return null;
    const visibleHost = this.#deps.getVisibleHost();
    const doc = visibleHost.ownerDocument ?? document;
    const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : null);
    if (!win) return null;

    const scrollContainer = this.#findScrollableAncestor(visibleHost);
    if (scrollContainer) {
      const elementCanScrollX =
        scrollContainer.scrollWidth > scrollContainer.clientWidth + SCROLL_DETECTION_TOLERANCE_PX;
      const elementCanScrollY =
        scrollContainer.scrollHeight > scrollContainer.clientHeight + SCROLL_DETECTION_TOLERANCE_PX;
      const rect = scrollContainer.getBoundingClientRect();
      return {
        kind: 'element',
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        canScrollX: elementCanScrollX,
        canScrollY: elementCanScrollY,
        win,
        element: scrollContainer,
      };
    }

    const docEl = doc.documentElement;
    const body = doc.body;
    const scrollWidth = Math.max(docEl?.scrollWidth ?? 0, body?.scrollWidth ?? 0);
    const scrollHeight = Math.max(docEl?.scrollHeight ?? 0, body?.scrollHeight ?? 0);
    const clientWidth = win.innerWidth;
    const clientHeight = win.innerHeight;
    const canScrollX = scrollWidth > clientWidth + SCROLL_DETECTION_TOLERANCE_PX;
    const canScrollY = scrollHeight > clientHeight + SCROLL_DETECTION_TOLERANCE_PX;

    return {
      kind: 'window',
      rect: { top: 0, bottom: clientHeight, left: 0, right: clientWidth },
      canScrollX,
      canScrollY,
      win,
      scrollWidth,
      scrollHeight,
    };
  }

  #findScrollableAncestor(host: HTMLElement): HTMLElement | null {
    const doc = host.ownerDocument ?? document;
    const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : null);
    let node: HTMLElement | null = host;
    while (node && node !== doc.body) {
      const style = win?.getComputedStyle ? win.getComputedStyle(node) : null;
      const overflowY = style?.overflowY ?? style?.overflow ?? '';
      const overflowX = style?.overflowX ?? style?.overflow ?? '';
      const canScrollY = node.scrollHeight > node.clientHeight + SCROLL_DETECTION_TOLERANCE_PX;
      const canScrollX = node.scrollWidth > node.clientWidth + SCROLL_DETECTION_TOLERANCE_PX;
      const allowsY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
      const allowsX = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';

      if ((canScrollY && allowsY) || (canScrollX && allowsX)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  #scheduleAutoScrollTick(): void {
    if (this.#autoScrollTimer) return;
    const win = this.#getAutoScrollWindow();
    if (win?.requestAnimationFrame) {
      const id = win.requestAnimationFrame(() => this.#tickAutoScroll());
      this.#autoScrollTimer = { id, kind: 'raf' };
      return;
    }

    const timeoutId = (
      win?.setTimeout ? win.setTimeout(() => this.#tickAutoScroll(), 16) : setTimeout(() => this.#tickAutoScroll(), 16)
    ) as number;
    this.#autoScrollTimer = { id: timeoutId, kind: 'timeout' };
  }

  #startAutoScroll(): void {
    if (this.#autoScrollActive) return;
    this.#autoScrollActive = true;
    this.#scheduleAutoScrollTick();
  }

  #stopAutoScroll(): void {
    this.#autoScrollActive = false;
    this.#autoScrollVelocity = { x: 0, y: 0 };
    if (!this.#autoScrollTimer) return;
    const win = this.#getAutoScrollWindow();
    if (this.#autoScrollTimer.kind === 'raf') {
      const cancel =
        win?.cancelAnimationFrame ?? (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : undefined);
      cancel?.(this.#autoScrollTimer.id);
    } else {
      clearTimeout(this.#autoScrollTimer.id);
    }
    this.#autoScrollTimer = null;
  }

  #updateAutoScrollFromPointer(clientX: number, clientY: number): void {
    if (!this.#deps || !this.#isDragging) {
      this.#stopAutoScroll();
      return;
    }

    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    if (sessionMode !== 'body' || this.#deps.isViewLocked()) {
      this.#stopAutoScroll();
      return;
    }

    const target = this.#getScrollTarget();
    if (!target || (!target.canScrollX && !target.canScrollY)) {
      this.#stopAutoScroll();
      return;
    }

    const { rect } = target;
    const topDist = clientY - rect.top;
    const bottomDist = rect.bottom - clientY;
    const leftDist = clientX - rect.left;
    const rightDist = rect.right - clientX;

    let vx = 0;
    let vy = 0;

    if (target.canScrollY) {
      const topFactor = clamp((AUTO_SCROLL_EDGE_PX - topDist) / AUTO_SCROLL_EDGE_PX, 0, 1);
      const bottomFactor = clamp((AUTO_SCROLL_EDGE_PX - bottomDist) / AUTO_SCROLL_EDGE_PX, 0, 1);
      if (topFactor > 0) {
        vy = -AUTO_SCROLL_MAX_SPEED_PX * topFactor;
      } else if (bottomFactor > 0) {
        vy = AUTO_SCROLL_MAX_SPEED_PX * bottomFactor;
      }
    }

    const layoutMode = this.#deps.getLayoutMode();
    if (layoutMode !== 'vertical' && target.canScrollX) {
      const leftFactor = clamp((AUTO_SCROLL_EDGE_PX - leftDist) / AUTO_SCROLL_EDGE_PX, 0, 1);
      const rightFactor = clamp((AUTO_SCROLL_EDGE_PX - rightDist) / AUTO_SCROLL_EDGE_PX, 0, 1);
      if (leftFactor > 0) {
        vx = -AUTO_SCROLL_MAX_SPEED_PX * leftFactor;
      } else if (rightFactor > 0) {
        vx = AUTO_SCROLL_MAX_SPEED_PX * rightFactor;
      }
    }

    if (vx === 0 && vy === 0) {
      this.#stopAutoScroll();
      return;
    }

    this.#autoScrollVelocity = { x: vx, y: vy };
    this.#startAutoScroll();
  }

  #tickAutoScroll(): void {
    this.#autoScrollTimer = null;
    if (!this.#autoScrollActive || !this.#deps || !this.#isDragging) {
      this.#stopAutoScroll();
      return;
    }

    const target = this.#getScrollTarget();
    if (!target || (!target.canScrollX && !target.canScrollY)) {
      this.#stopAutoScroll();
      return;
    }

    const { x, y } = this.#autoScrollVelocity;
    if (x === 0 && y === 0) {
      this.#stopAutoScroll();
      return;
    }

    let didScroll = false;
    if (target.kind === 'element' && target.element) {
      const maxScrollTop = Math.max(0, target.element.scrollHeight - target.element.clientHeight);
      const maxScrollLeft = Math.max(0, target.element.scrollWidth - target.element.clientWidth);
      const nextTop = clamp(target.element.scrollTop + y, 0, maxScrollTop);
      const nextLeft = clamp(target.element.scrollLeft + x, 0, maxScrollLeft);
      didScroll = nextTop !== target.element.scrollTop || nextLeft !== target.element.scrollLeft;
      if (didScroll) {
        target.element.scrollTop = nextTop;
        target.element.scrollLeft = nextLeft;
      }
    } else if (target.kind === 'window' && target.win) {
      const scrollWidth = target.scrollWidth ?? 0;
      const scrollHeight = target.scrollHeight ?? 0;
      const maxScrollTop = Math.max(0, scrollHeight - target.win.innerHeight);
      const maxScrollLeft = Math.max(0, scrollWidth - target.win.innerWidth);
      const currentTop = target.win.scrollY ?? 0;
      const currentLeft = target.win.scrollX ?? 0;
      const nextTop = clamp(currentTop + y, 0, maxScrollTop);
      const nextLeft = clamp(currentLeft + x, 0, maxScrollLeft);
      didScroll = nextTop !== currentTop || nextLeft !== currentLeft;
      if (didScroll) {
        target.win.scrollTo(nextLeft, nextTop);
      }
    }

    if (didScroll) {
      const lastPointer = this.#lastPointerClient;
      if (lastPointer) {
        this.#handleDragSelectionAt(lastPointer.clientX, lastPointer.clientY);
      }
      this.#scheduleAutoScrollTick();
      return;
    }

    this.#stopAutoScroll();
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle click events - specifically for link navigation prevention.
   *
   * Link handling is split between pointerdown and click:
   * - pointerdown: dispatches superdoc-link-click event (for popover/UI response)
   * - click: prevents default navigation (preventDefault only works on click, not pointerdown)
   *
   * This also handles keyboard activation (Enter/Space) which triggers click but not pointerdown.
   */
  #handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    const linkEl = target?.closest?.('a.superdoc-link') as HTMLAnchorElement | null;
    if (linkEl) {
      // Prevent browser navigation - this is the only place it can be reliably prevented
      event.preventDefault();

      // For keyboard activation (Enter/Space), dispatch the custom event
      // Mouse clicks already dispatched the event on pointerdown
      // We detect keyboard by checking if this wasn't preceded by a recent pointerdown
      if (!(event as PointerEvent).pointerId && event.detail === 0) {
        // detail === 0 indicates keyboard activation, not mouse click
        this.#handleLinkClick(event, linkEl);
      }
    }
  }

  #handlePointerDown(event: PointerEvent): void {
    if (!this.#deps) return;

    // Return early for non-left clicks
    if (event.button !== 0) return;

    // On Mac, Ctrl+Click triggers the context menu
    if (event.ctrlKey && navigator.platform.includes('Mac')) return;

    this.#pendingMarginClick = null;

    const target = event.target as HTMLElement;

    // Skip ruler handle clicks
    if (target?.closest?.('.superdoc-ruler-handle') != null) return;

    // Handle link clicks - dispatch custom event on pointerdown for immediate UI response
    // Navigation prevention happens in #handleClick (on 'click' event)
    const linkEl = target?.closest?.('a.superdoc-link') as HTMLAnchorElement | null;
    if (linkEl) {
      this.#handleLinkClick(event, linkEl);
      return;
    }

    // Handle field annotation clicks
    const annotationEl = target?.closest?.('.annotation[data-pm-start]') as HTMLElement | null;
    const isDraggableAnnotation = target?.closest?.('[data-draggable="true"]') != null;
    this.#suppressFocusInFromDraggable = isDraggableAnnotation;

    if (annotationEl) {
      this.#handleAnnotationClick(event, annotationEl);
      return;
    }

    const layoutState = this.#deps.getLayoutState();
    if (!layoutState.layout) {
      this.#handleClickWithoutLayout(event, isDraggableAnnotation);
      return;
    }

    const normalizedPoint = this.#callbacks.normalizeClientPoint?.(event.clientX, event.clientY);
    if (!normalizedPoint) return;

    const { x, y } = normalizedPoint;
    this.#debugLastPointer = { clientX: event.clientX, clientY: event.clientY, x, y };

    // Check header/footer session state
    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    if (sessionMode !== 'body') {
      if (this.#handleClickInHeaderFooterMode(event, x, y)) return;
    }

    // Check for header/footer region hit
    const headerFooterRegion = this.#callbacks.hitTestHeaderFooterRegion?.(x, y);
    if (headerFooterRegion) return; // Will be handled by double-click

    // Get hit position
    const viewportHost = this.#deps.getViewportHost();
    const pageGeometryHelper = this.#deps.getPageGeometryHelper();
    const rawHit = clickToPosition(
      layoutState.layout,
      layoutState.blocks,
      layoutState.measures,
      { x, y },
      viewportHost,
      event.clientX,
      event.clientY,
      pageGeometryHelper ?? undefined,
    );

    const editor = this.#deps.getEditor();
    const doc = editor.state?.doc;
    const epochMapper = this.#deps.getEpochMapper();
    const mapped =
      rawHit && doc ? epochMapper.mapPosFromLayoutToCurrentDetailed(rawHit.pos, rawHit.layoutEpoch, 1) : null;

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
    this.#callbacks.updateSelectionDebugHud?.();

    // Don't preventDefault for draggable annotations
    if (!isDraggableAnnotation) {
      event.preventDefault();
    }

    // Handle click outside text content
    if (!rawHit) {
      this.#focusEditorAtFirstPosition();
      return;
    }

    if (!hit || !doc) {
      this.#callbacks.setPendingDocChange?.();
      this.#callbacks.scheduleRerender?.();
      return;
    }

    // Check for image/fragment hit
    const fragmentHit = getFragmentAtPosition(layoutState.layout, layoutState.blocks, layoutState.measures, rawHit.pos);

    // Handle inline image click
    const targetImg = (event.target as HTMLElement | null)?.closest?.('img') as HTMLImageElement | null;
    if (this.#handleInlineImageClick(event, targetImg, rawHit, doc, epochMapper)) return;

    // Handle atomic fragment (image/drawing) click
    if (this.#handleFragmentClick(event, fragmentHit, hit, doc)) return;

    // Deselect image if clicking elsewhere
    if (this.#lastSelectedImageBlockId) {
      this.#callbacks.emit?.('imageDeselected', { blockId: this.#lastSelectedImageBlockId });
      this.#lastSelectedImageBlockId = null;
    }

    // Handle shift+click to extend selection
    if (event.shiftKey && editor.state.selection.$anchor) {
      this.#handleShiftClick(event, hit.pos);
      return;
    }

    // Track click depth for multi-click
    const clickDepth = this.#registerPointerClick(event);

    // Set up drag selection state
    if (clickDepth === 1) {
      this.#dragAnchor = hit.pos;
      this.#dragAnchorPageIndex = hit.pageIndex;
      this.#pendingMarginClick = this.#callbacks.computePendingMarginClick?.(event.pointerId, x, y) ?? null;

      // Check for table cell selection
      const tableHit = this.#hitTestTable(x, y);
      if (tableHit) {
        const tablePos = this.#getTablePosFromHit(tableHit);
        if (tablePos !== null) {
          this.#setCellAnchor(tableHit, tablePos);
        }
      } else {
        this.#clearCellAnchor();
      }
    } else {
      this.#pendingMarginClick = null;
    }

    this.#dragLastPointer = { clientX: event.clientX, clientY: event.clientY, x, y };
    this.#dragLastRawHit = hit;
    this.#dragUsedPageNotMountedFallback = false;
    this.#lastPointerClient = { clientX: event.clientX, clientY: event.clientY };

    this.#isDragging = true;
    if (clickDepth >= 3) {
      this.#dragExtensionMode = 'para';
    } else if (clickDepth === 2) {
      this.#dragExtensionMode = 'word';
    } else {
      this.#dragExtensionMode = 'char';
    }

    // Capture pointer for reliable drag tracking
    if (typeof viewportHost.setPointerCapture === 'function') {
      viewportHost.setPointerCapture(event.pointerId);
    }

    // Handle double/triple click selection
    let handledByDepth = false;
    const sessionModeForDepth = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    if (sessionModeForDepth === 'body') {
      const selectionPos = clickDepth >= 2 && this.#dragAnchor !== null ? this.#dragAnchor : hit.pos;

      if (clickDepth >= 3) {
        handledByDepth = this.#callbacks.selectParagraphAt?.(selectionPos) ?? false;
      } else if (clickDepth === 2) {
        handledByDepth = this.#callbacks.selectWordAt?.(selectionPos) ?? false;
      }
    }

    const hasFocus = editor.view?.hasFocus?.() ?? false;
    if (!hasFocus) {
      this.#focusEditor();
    }

    // Set selection for single click
    if (!handledByDepth) {
      try {
        let nextSelection: Selection = TextSelection.create(doc, hit.pos);
        if (!nextSelection.$from.parent.inlineContent) {
          nextSelection = Selection.near(doc.resolve(hit.pos), 1);
        }
        const tr = editor.state.tr.setSelection(nextSelection);
        // Preserve stored marks (e.g., formatting selected from toolbar before clicking)
        if (nextSelection instanceof TextSelection && nextSelection.empty && editor.state.storedMarks) {
          tr.setStoredMarks(editor.state.storedMarks);
        }
        editor.view?.dispatch(tr);
      } catch {
        // Position may be invalid during layout updates
      }
    }

    this.#callbacks.scheduleSelectionUpdate?.();
  }

  #handlePointerMove(event: PointerEvent): void {
    if (!this.#deps) return;

    const layoutState = this.#deps.getLayoutState();
    if (!layoutState.layout) return;

    // Handle drag selection
    if (this.#isDragging && this.#dragAnchor !== null && event.buttons & 1) {
      this.#lastPointerClient = { clientX: event.clientX, clientY: event.clientY };
      this.#handleDragSelectionAt(event.clientX, event.clientY);
      this.#updateAutoScrollFromPointer(event.clientX, event.clientY);
      return;
    }

    // Handle header/footer hover
    const normalized = this.#callbacks.normalizeClientPoint?.(event.clientX, event.clientY);
    if (!normalized) return;
    this.#handleHover(normalized);
  }

  #handlePointerUp(event: PointerEvent): void {
    if (!this.#deps) return;

    this.#suppressFocusInFromDraggable = false;

    if (!this.#isDragging) {
      this.#stopAutoScroll();
      return;
    }

    // Release pointer capture
    const viewportHost = this.#deps.getViewportHost();
    if (
      typeof viewportHost.hasPointerCapture === 'function' &&
      typeof viewportHost.releasePointerCapture === 'function' &&
      viewportHost.hasPointerCapture(event.pointerId)
    ) {
      viewportHost.releasePointerCapture(event.pointerId);
    }

    const pendingMarginClick = this.#pendingMarginClick;
    this.#pendingMarginClick = null;

    const dragAnchor = this.#dragAnchor;
    const dragMode = this.#dragExtensionMode;
    const dragUsedFallback = this.#dragUsedPageNotMountedFallback;
    const dragPointer = this.#dragLastPointer;

    this.#isDragging = false;
    this.#stopAutoScroll();

    // Reset cell drag mode
    if (this.#cellDragMode !== 'none') {
      this.#cellDragMode = 'none';
    }

    // Handle non-margin click end
    if (!pendingMarginClick || pendingMarginClick.pointerId !== event.pointerId) {
      this.#callbacks.updateSelectionVirtualizationPins?.({ includeDragBuffer: false });

      if (dragUsedFallback && dragAnchor != null) {
        const pointer = dragPointer ?? { clientX: event.clientX, clientY: event.clientY };
        this.#callbacks.finalizeDragSelectionWithDom?.(pointer, dragAnchor, dragMode);
      }

      this.#callbacks.scheduleA11ySelectionAnnouncement?.({ immediate: true });

      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      this.#lastPointerClient = null;
      return;
    }

    // Handle margin clicks
    this.#handleMarginClickEnd(event, pendingMarginClick);
  }

  #handlePointerLeave(): void {
    if (!this.#isDragging) {
      this.#stopAutoScroll();
    }
    this.#callbacks.clearHoverRegion?.();
  }

  #handleDoubleClick(event: MouseEvent): void {
    if (!this.#deps) return;
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    const annotationEl = target?.closest?.('.annotation[data-pm-start]') as HTMLElement | null;

    if (annotationEl) {
      event.preventDefault();
      event.stopPropagation();
      this.#handleAnnotationDoubleClick(event, annotationEl);
      return;
    }

    const layoutState = this.#deps.getLayoutState();
    if (!layoutState.layout) return;

    const viewportHost = this.#deps.getViewportHost();
    const visibleHost = this.#deps.getVisibleHost();
    const zoom = this.#deps.getZoom();
    const rect = viewportHost.getBoundingClientRect();
    const scrollLeft = visibleHost.scrollLeft ?? 0;
    const scrollTop = visibleHost.scrollTop ?? 0;
    const x = (event.clientX - rect.left + scrollLeft) / zoom;
    const y = (event.clientY - rect.top + scrollTop) / zoom;

    const region = this.#callbacks.hitTestHeaderFooterRegion?.(x, y);
    if (region) {
      event.preventDefault();
      event.stopPropagation();

      // Create default header/footer if none exists
      const descriptor = this.#callbacks.resolveDescriptorForRegion?.(region);
      const hfManager = this.#deps.getHeaderFooterSession()?.manager;
      if (!descriptor && hfManager) {
        this.#callbacks.createDefaultHeaderFooter?.(region);
        hfManager.refresh();
      }

      this.#callbacks.activateHeaderFooterRegion?.(region);
    } else if ((this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body') !== 'body') {
      this.#callbacks.exitHeaderFooterMode?.();
    }
  }

  #handleAnnotationDoubleClick(event: MouseEvent, annotationEl: HTMLElement): void {
    const editor = this.#deps?.getEditor();
    if (!editor?.isEditable) return;

    const resolved = this.#callbacks.resolveFieldAnnotationSelectionFromElement?.(annotationEl);
    if (resolved) {
      try {
        const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, resolved.pos));
        editor.view?.dispatch(tr);
      } catch {}

      editor.emit('fieldAnnotationDoubleClicked', {
        editor,
        node: resolved.node,
        nodePos: resolved.pos,
        event,
        currentTarget: annotationEl,
      });
    }
  }

  #handleKeyDown(event: KeyboardEvent): void {
    if (!this.#deps) return;

    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    if (event.key === 'Escape' && sessionMode !== 'body') {
      event.preventDefault();
      this.#callbacks.exitHeaderFooterMode?.();
      return;
    }

    // Ctrl+Alt+H/F shortcuts
    if (event.ctrlKey && event.altKey && !event.shiftKey) {
      if (event.code === 'KeyH') {
        event.preventDefault();
        this.#focusHeaderFooterShortcut('header');
      } else if (event.code === 'KeyF') {
        event.preventDefault();
        this.#focusHeaderFooterShortcut('footer');
      }
    }
  }

  #handleFocusIn(event: FocusEvent): void {
    if (!this.#deps) return;

    if (this.#suppressFocusInFromDraggable) {
      this.#suppressFocusInFromDraggable = false;
      return;
    }

    try {
      this.#deps.getActiveEditor().view?.focus();
    } catch {
      // Ignore focus failures
    }
    this.#callbacks.scheduleSelectionUpdate?.();
  }

  #handleEditorFocus(): void {
    if (!this.#deps) return;
    this.#callbacks.scheduleSelectionUpdate?.();
  }

  #handleEditorBlur(): void {
    if (!this.#deps) return;
    this.#callbacks.scheduleSelectionUpdate?.();
  }

  // ==========================================================================
  // Handler Helpers
  // ==========================================================================

  #handleLinkClick(event: MouseEvent, linkEl: HTMLAnchorElement): void {
    const href = linkEl.getAttribute('href') ?? '';
    const isAnchorLink = href.startsWith('#') && href.length > 1;
    const isTocLink = linkEl.closest('.superdoc-toc-entry') !== null;

    if (isAnchorLink && isTocLink) {
      event.preventDefault();
      event.stopPropagation();
      this.#callbacks.goToAnchor?.(href);
      return;
    }

    // Dispatch link click event
    event.preventDefault();
    event.stopPropagation();

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href,
        target: linkEl.getAttribute('target'),
        rel: linkEl.getAttribute('rel'),
        tooltip: linkEl.getAttribute('title'),
        element: linkEl,
        clientX: event.clientX,
        clientY: event.clientY,
      },
    });
    linkEl.dispatchEvent(linkClickEvent);
  }

  #handleAnnotationClick(event: PointerEvent, annotationEl: HTMLElement): void {
    const editor = this.#deps?.getEditor();
    if (!editor?.isEditable) return;

    const resolved = this.#callbacks.resolveFieldAnnotationSelectionFromElement?.(annotationEl);
    if (resolved) {
      try {
        const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, resolved.pos));
        editor.view?.dispatch(tr);
      } catch {}

      editor.emit('fieldAnnotationClicked', {
        editor,
        node: resolved.node,
        nodePos: resolved.pos,
        event,
        currentTarget: annotationEl,
      });
    }
  }

  #handleClickWithoutLayout(event: PointerEvent, isDraggableAnnotation: boolean): void {
    if (!isDraggableAnnotation) {
      event.preventDefault();
    }

    // Blur and focus editor
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    this.#focusEditorAtFirstPosition();
  }

  #handleClickInHeaderFooterMode(event: PointerEvent, x: number, y: number): boolean {
    const session = this.#deps?.getHeaderFooterSession();
    const activeEditorHost = session?.overlayManager?.getActiveEditorHost?.();
    const clickedInsideEditorHost =
      activeEditorHost && (activeEditorHost.contains(event.target as Node) || activeEditorHost === event.target);

    if (clickedInsideEditorHost) {
      return true; // Let editor handle it
    }

    const headerFooterRegion = this.#callbacks.hitTestHeaderFooterRegion?.(x, y);
    if (!headerFooterRegion) {
      this.#callbacks.exitHeaderFooterMode?.();
      return false; // Continue to body click handling
    }

    return true; // In header/footer region
  }

  #handleInlineImageClick(
    event: PointerEvent,
    targetImg: HTMLImageElement | null,
    rawHit: PositionHit,
    doc: ProseMirrorNode,
    epochMapper: EpochPositionMapper,
  ): boolean {
    if (!targetImg) return false;

    const imgPmStart = targetImg.dataset?.pmStart ? Number(targetImg.dataset.pmStart) : null;
    if (Number.isNaN(imgPmStart) || imgPmStart == null) return false;

    const imgLayoutEpochRaw = targetImg.dataset?.layoutEpoch;
    const imgLayoutEpoch = imgLayoutEpochRaw != null ? Number(imgLayoutEpochRaw) : NaN;
    const rawLayoutEpoch = Number.isFinite(rawHit.layoutEpoch) ? rawHit.layoutEpoch : NaN;
    const effectiveEpoch =
      Number.isFinite(imgLayoutEpoch) && Number.isFinite(rawLayoutEpoch)
        ? Math.max(imgLayoutEpoch, rawLayoutEpoch)
        : Number.isFinite(imgLayoutEpoch)
          ? imgLayoutEpoch
          : rawHit.layoutEpoch;

    const mappedImg = epochMapper.mapPosFromLayoutToCurrentDetailed(imgPmStart, effectiveEpoch, 1);
    if (!mappedImg.ok) {
      debugLog('warn', 'inline image mapping failed', mappedImg);
      this.#callbacks.setPendingDocChange?.();
      this.#callbacks.scheduleRerender?.();
      return true;
    }

    const clampedImgPos = Math.max(0, Math.min(mappedImg.pos, doc.content.size));
    if (clampedImgPos < 0 || clampedImgPos >= doc.content.size) return true;

    // Emit deselect for previous image
    const newSelectionId = `inline-${clampedImgPos}`;
    if (this.#lastSelectedImageBlockId && this.#lastSelectedImageBlockId !== newSelectionId) {
      this.#callbacks.emit?.('imageDeselected', { blockId: this.#lastSelectedImageBlockId });
    }

    const editor = this.#deps?.getEditor();
    try {
      const tr = editor!.state.tr.setSelection(NodeSelection.create(doc, clampedImgPos));
      editor!.view?.dispatch(tr);

      const selector = `.superdoc-inline-image[data-pm-start="${imgPmStart}"]`;
      const viewportHost = this.#deps?.getViewportHost();
      const targetElement = viewportHost?.querySelector(selector);
      this.#callbacks.emit?.('imageSelected', {
        element: targetElement ?? targetImg,
        blockId: null,
        pmStart: clampedImgPos,
      });
      this.#lastSelectedImageBlockId = newSelectionId;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[EditorInputManager] Failed to create NodeSelection for inline image:`, error);
      }
    }

    this.#callbacks.focusEditorAfterImageSelection?.();
    return true;
  }

  #handleFragmentClick(
    event: PointerEvent,
    fragmentHit: ReturnType<typeof getFragmentAtPosition>,
    hit: PositionHit,
    doc: ProseMirrorNode,
  ): boolean {
    if (!fragmentHit) return false;
    if (fragmentHit.fragment.kind !== 'image' && fragmentHit.fragment.kind !== 'drawing') return false;

    const editor = this.#deps?.getEditor();
    try {
      const tr = editor!.state.tr.setSelection(NodeSelection.create(doc, hit.pos));
      editor!.view?.dispatch(tr);

      if (this.#lastSelectedImageBlockId && this.#lastSelectedImageBlockId !== fragmentHit.fragment.blockId) {
        this.#callbacks.emit?.('imageDeselected', { blockId: this.#lastSelectedImageBlockId });
      }

      if (fragmentHit.fragment.kind === 'image') {
        const viewportHost = this.#deps?.getViewportHost();
        const targetElement = viewportHost?.querySelector(
          `.superdoc-image-fragment[data-pm-start="${fragmentHit.fragment.pmStart}"]`,
        );
        if (targetElement) {
          this.#callbacks.emit?.('imageSelected', {
            element: targetElement,
            blockId: fragmentHit.fragment.blockId,
            pmStart: fragmentHit.fragment.pmStart,
          });
          this.#lastSelectedImageBlockId = fragmentHit.fragment.blockId;
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[EditorInputManager] Failed to create NodeSelection for atomic fragment:', error);
      }
    }

    this.#callbacks.focusEditorAfterImageSelection?.();
    return true;
  }

  #handleShiftClick(event: PointerEvent, headPos: number): void {
    const editor = this.#deps?.getEditor();
    if (!editor) return;

    const anchor = editor.state.selection.anchor;
    const { selAnchor, selHead } = this.#calculateExtendedSelection(anchor, headPos, this.#dragExtensionMode);

    try {
      const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, selAnchor, selHead));
      editor.view?.dispatch(tr);
      this.#callbacks.scheduleSelectionUpdate?.();
    } catch (error) {
      console.warn('[SELECTION] Failed to extend selection on shift+click:', error);
    }

    this.#focusEditor();
  }

  #handleDragSelectionAt(clientX: number, clientY: number): void {
    if (!this.#deps) return;

    const layoutState = this.#deps.getLayoutState();
    if (!layoutState.layout) return;

    const normalized = this.#callbacks.normalizeClientPoint?.(clientX, clientY);
    if (!normalized) return;

    this.#pendingMarginClick = null;
    this.#dragLastPointer = { clientX, clientY, x: normalized.x, y: normalized.y };

    const viewportHost = this.#deps.getViewportHost();
    const pageGeometryHelper = this.#deps.getPageGeometryHelper();

    const rawHit = clickToPosition(
      layoutState.layout,
      layoutState.blocks,
      layoutState.measures,
      { x: normalized.x, y: normalized.y },
      viewportHost,
      clientX,
      clientY,
      pageGeometryHelper ?? undefined,
    );

    if (!rawHit) return;

    const editor = this.#deps.getEditor();
    const doc = editor.state?.doc;
    if (!doc) return;

    this.#dragLastRawHit = rawHit;

    const pageMounted = this.#deps.getPageElement(rawHit.pageIndex) != null;
    if (!pageMounted && this.#deps.isSelectionAwareVirtualizationEnabled()) {
      this.#dragUsedPageNotMountedFallback = true;
    }

    this.#callbacks.updateSelectionVirtualizationPins?.({ includeDragBuffer: true, extraPages: [rawHit.pageIndex] });

    const epochMapper = this.#deps.getEpochMapper();
    const mappedHead = epochMapper.mapPosFromLayoutToCurrentDetailed(rawHit.pos, rawHit.layoutEpoch, 1);
    if (!mappedHead.ok) {
      debugLog('warn', 'drag mapping failed', mappedHead);
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
    this.#callbacks.updateSelectionDebugHud?.();

    // Check for cell selection
    const currentTableHit = this.#hitTestTable(normalized.x, normalized.y);
    const shouldUseCellSel = this.#shouldUseCellSelection(currentTableHit);

    if (shouldUseCellSel && this.#cellAnchor) {
      this.#handleCellDragSelection(currentTableHit, hit);
      return;
    }

    // Text selection mode
    const anchor = this.#dragAnchor!;
    const head = hit.pos;
    const { selAnchor, selHead } = this.#calculateExtendedSelection(anchor, head, this.#dragExtensionMode);

    try {
      const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, selAnchor, selHead));
      editor.view?.dispatch(tr);
      this.#callbacks.scheduleSelectionUpdate?.();
    } catch (error) {
      console.warn('[SELECTION] Failed to extend selection during drag:', error);
    }
  }

  #handleCellDragSelection(currentTableHit: TableHitResult | null, hit: PositionHit): void {
    const headCellPos = currentTableHit ? this.#getCellPosFromTableHit(currentTableHit) : null;
    if (headCellPos === null) return;

    if (this.#cellDragMode !== 'active') {
      this.#cellDragMode = 'active';
    }

    const editor = this.#deps?.getEditor();
    if (!editor) return;

    try {
      const doc = editor.state.doc;
      const anchorCellPos = this.#cellAnchor!.cellPos;
      const clampedAnchor = Math.max(0, Math.min(anchorCellPos, doc.content.size));
      const clampedHead = Math.max(0, Math.min(headCellPos, doc.content.size));

      const cellSelection = CellSelection.create(doc, clampedAnchor, clampedHead);
      const tr = editor.state.tr.setSelection(cellSelection);
      editor.view?.dispatch(tr);
      this.#callbacks.scheduleSelectionUpdate?.();
    } catch (error) {
      console.warn('[CELL-SELECTION] Failed to create CellSelection, falling back to TextSelection:', error);
      // Fall back to text selection
      const anchor = this.#dragAnchor!;
      const head = hit.pos;
      const { selAnchor, selHead } = this.#calculateExtendedSelection(anchor, head, this.#dragExtensionMode);

      try {
        const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, selAnchor, selHead));
        editor.view?.dispatch(tr);
        this.#callbacks.scheduleSelectionUpdate?.();
      } catch {}
    }
  }

  #handleHover(normalized: { x: number; y: number }): void {
    if (!this.#deps) return;

    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    if (sessionMode !== 'body') {
      this.#callbacks.clearHoverRegion?.();
      return;
    }

    if (this.#deps.getDocumentMode() === 'viewing') {
      this.#callbacks.clearHoverRegion?.();
      return;
    }

    const region = this.#callbacks.hitTestHeaderFooterRegion?.(normalized.x, normalized.y);
    if (!region) {
      this.#callbacks.clearHoverRegion?.();
      return;
    }

    const currentHover = this.#deps.getHeaderFooterSession()?.hoverRegion;
    if (
      currentHover &&
      currentHover.kind === region.kind &&
      currentHover.pageIndex === region.pageIndex &&
      currentHover.sectionType === region.sectionType
    ) {
      return;
    }

    this.#deps.getHeaderFooterSession()?.renderHover(region);
    this.#callbacks.renderHoverRegion?.(region);
  }

  #handleMarginClickEnd(event: PointerEvent, pendingMarginClick: PendingMarginClick): void {
    const sessionMode = this.#deps?.getHeaderFooterSession()?.session?.mode ?? 'body';
    if (sessionMode !== 'body' || this.#deps?.isViewLocked()) {
      this.#clearDragPointerState();
      return;
    }

    const editor = this.#deps?.getEditor();
    const doc = editor?.state?.doc;
    if (!doc) {
      this.#clearDragPointerState();
      return;
    }

    const epochMapper = this.#deps?.getEpochMapper();
    if (!epochMapper) {
      this.#clearDragPointerState();
      return;
    }

    if (pendingMarginClick.kind === 'aboveFirstLine') {
      const pos = this.#getFirstTextPosition();
      try {
        const tr = editor!.state.tr.setSelection(TextSelection.create(doc, pos));
        editor!.view?.dispatch(tr);
        this.#callbacks.scheduleSelectionUpdate?.();
      } catch {}
      this.#debugLastHit = { source: 'margin', pos: null, layoutEpoch: null, mappedPos: pos };
      this.#callbacks.updateSelectionDebugHud?.();
      this.#clearDragPointerState();
      return;
    }

    if (pendingMarginClick.kind === 'right') {
      const mappedEnd = epochMapper.mapPosFromLayoutToCurrentDetailed(
        pendingMarginClick.pmEnd,
        pendingMarginClick.layoutEpoch,
        1,
      );
      if (!mappedEnd.ok) {
        this.#callbacks.setPendingDocChange?.();
        this.#callbacks.scheduleRerender?.();
        this.#clearDragPointerState();
        return;
      }
      const caretPos = Math.max(0, Math.min(mappedEnd.pos, doc.content.size));
      try {
        const tr = editor!.state.tr.setSelection(TextSelection.create(doc, caretPos));
        editor!.view?.dispatch(tr);
        this.#callbacks.scheduleSelectionUpdate?.();
      } catch {}
      this.#debugLastHit = {
        source: 'margin',
        pos: pendingMarginClick.pmEnd,
        layoutEpoch: pendingMarginClick.layoutEpoch,
        mappedPos: caretPos,
      };
      this.#callbacks.updateSelectionDebugHud?.();
      this.#clearDragPointerState();
      return;
    }

    // Left margin click - select line
    const mappedStart = epochMapper.mapPosFromLayoutToCurrentDetailed(
      pendingMarginClick.pmStart,
      pendingMarginClick.layoutEpoch,
      1,
    );
    const mappedEnd = epochMapper.mapPosFromLayoutToCurrentDetailed(
      pendingMarginClick.pmEnd,
      pendingMarginClick.layoutEpoch,
      -1,
    );

    if (!mappedStart.ok || !mappedEnd.ok) {
      this.#callbacks.setPendingDocChange?.();
      this.#callbacks.scheduleRerender?.();
      this.#clearDragPointerState();
      return;
    }

    const selFrom = Math.max(0, Math.min(Math.min(mappedStart.pos, mappedEnd.pos), doc.content.size));
    const selTo = Math.max(0, Math.min(Math.max(mappedStart.pos, mappedEnd.pos), doc.content.size));
    try {
      const tr = editor!.state.tr.setSelection(TextSelection.create(doc, selFrom, selTo));
      editor!.view?.dispatch(tr);
      this.#callbacks.scheduleSelectionUpdate?.();
    } catch {}
    this.#debugLastHit = {
      source: 'margin',
      pos: pendingMarginClick.pmStart,
      layoutEpoch: pendingMarginClick.layoutEpoch,
      mappedPos: selFrom,
    };
    this.#callbacks.updateSelectionDebugHud?.();
    this.#clearDragPointerState();
  }

  #clearDragPointerState(): void {
    this.#dragLastPointer = null;
    this.#dragLastRawHit = null;
    this.#dragUsedPageNotMountedFallback = false;
    this.#lastPointerClient = null;
    this.#stopAutoScroll();
  }

  #focusHeaderFooterShortcut(kind: 'header' | 'footer'): void {
    const pageIndex = this.#callbacks.getCurrentPageIndex?.() ?? 0;
    const region = this.#callbacks.findRegionForPage?.(kind, pageIndex);
    if (!region) {
      this.#callbacks.emitHeaderFooterEditBlocked?.('missingRegion');
      return;
    }
    this.#callbacks.activateHeaderFooterRegion?.(region);
  }

  #focusEditorAtFirstPosition(): void {
    const editor = this.#deps?.getEditor();
    const editorDom = editor?.view?.dom as HTMLElement | undefined;
    if (!editorDom) return;

    const validPos = this.#getFirstTextPosition();
    const doc = editor?.state?.doc;

    if (doc) {
      try {
        const tr = editor!.state.tr.setSelection(TextSelection.create(doc, validPos));
        editor!.view?.dispatch(tr);
      } catch {}
    }

    editorDom.focus();
    editor?.view?.focus();
    this.#callbacks.scheduleSelectionUpdate?.();
  }

  /**
   * Focuses the editor DOM element if it doesn't already have focus.
   *
   * This method performs a focus check before calling blur/focus to prevent
   * unnecessary focus cycles that can disrupt selection state during list
   * operations with tracked changes.
   */
  #focusEditor(): void {
    const editor = this.#deps?.getEditor();
    const view = editor?.view;
    const editorDom = view?.dom as HTMLElement | undefined;
    if (!editorDom) return;

    const active = document.activeElement as HTMLElement | null;
    const activeIsEditor = active === editorDom || (!!active && editorDom.contains?.(active));
    const hasFocus = typeof view.hasFocus === 'function' && view.hasFocus();

    if (activeIsEditor || hasFocus) {
      return;
    }

    if (active instanceof HTMLElement) {
      active.blur();
    }

    editorDom.focus();
    view?.focus();
  }
}
