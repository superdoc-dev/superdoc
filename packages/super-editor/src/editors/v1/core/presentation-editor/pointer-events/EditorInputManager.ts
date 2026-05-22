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
import { comments_module_events } from '@superdoc/common';
import type { CellAnchorState, PendingMarginClick, HeaderFooterRegion } from '../types.js';
import type { PositionHit, PageGeometryHelper, TableHitResult } from '@superdoc/layout-bridge';
import type { SelectionDebugHudState } from '../selection/SelectionDebug.js';
import type { EpochPositionMapper } from '../layout/EpochPositionMapper.js';
import type { HeaderFooterSessionManager } from '../header-footer/HeaderFooterSessionManager.js';
import type { StoryPresentationSession } from '../story-session/types.js';

import { getFragmentAtPosition } from '@superdoc/layout-bridge';
import { resolvePointerPositionHit } from '../input/PositionHitResolver.js';
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
import { DOM_CLASS_NAMES, buildAnnotationSelector, DRAGGABLE_SELECTOR } from '@superdoc/dom-contract';
import { applyEditableSlotAtInlineBoundary } from '@helpers/ensure-editable-slot-inline-boundary.js';
import { isSemanticFootnoteBlockId } from '../semantic-flow-constants.js';
import { CommentsPluginKey } from '@extensions/comment/comments-plugin.js';
import {
  findStructuredContentBlockAtPos,
  findStructuredContentBlockById,
  findStructuredContentInlineAtPos,
  findStructuredContentInlineById,
  type StructuredContentSelection,
} from '../input/structured-content-resolution.js';

// =============================================================================
// Constants
// =============================================================================

const MULTI_CLICK_TIME_THRESHOLD_MS = 400;
const MULTI_CLICK_DISTANCE_THRESHOLD_PX = 5;
const DRAG_SELECTION_DISTANCE_THRESHOLD_PX = 5;
const AUTO_SCROLL_EDGE_PX = 32;
const AUTO_SCROLL_MAX_SPEED_PX = 24;
/** Tolerance for detecting scrollability to handle sub-pixel rounding in browsers */
const SCROLL_DETECTION_TOLERANCE_PX = 1;
const DEFAULT_PAGE_MARGIN_PX = 72;
const COMMENT_HIGHLIGHT_SELECTOR = '.superdoc-comment-highlight';
const TRACK_CHANGE_SELECTOR = '[data-track-change-id]';
const PM_TRACK_CHANGE_SELECTOR = '.track-insert[data-id], .track-delete[data-id], .track-format[data-id]';
const VISIBLE_HEADER_FOOTER_SELECTOR = '.superdoc-page-header, .superdoc-page-footer';
const VISIBLE_BODY_CONTENT_SELECTOR = '.superdoc-line, .superdoc-fragment, [data-block-id]';
const COMMENT_THREAD_HIT_TOLERANCE_PX = 3;
const COMMENT_THREAD_HIT_SAMPLE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-COMMENT_THREAD_HIT_TOLERANCE_PX, 0],
  [COMMENT_THREAD_HIT_TOLERANCE_PX, 0],
  [0, -COMMENT_THREAD_HIT_TOLERANCE_PX],
  [0, COMMENT_THREAD_HIT_TOLERANCE_PX],
];
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const DRAG_SOURCE_SELECTOR = '[data-draggable="true"], [data-drag-source-kind]';

type CommentThreadHit = {
  isAmbiguous: boolean;
  threadId: string | null;
};

/**
 * Block IDs for note content use `footnote-{id}-` / `endnote-{id}-` prefixes.
 * Semantic footnote blocks use the {@link isSemanticFootnoteBlockId} helper from
 * shared constants — it matches both heading and body footnote block IDs.
 */
function isRenderedNoteBlockId(blockId: string): boolean {
  return (
    typeof blockId === 'string' &&
    (blockId.startsWith('footnote-') || blockId.startsWith('endnote-') || isSemanticFootnoteBlockId(blockId))
  );
}

type RenderedNoteTarget = {
  storyType: 'footnote' | 'endnote';
  noteId: string;
};

function parseRenderedNoteTarget(blockId: string): RenderedNoteTarget | null {
  if (typeof blockId !== 'string' || blockId.length === 0) {
    return null;
  }

  if (blockId.startsWith('footnote-')) {
    const noteId = blockId.slice('footnote-'.length).split('-')[0] ?? '';
    return noteId ? { storyType: 'footnote', noteId } : null;
  }

  if (blockId.startsWith('__sd_semantic_footnote-')) {
    const noteId = blockId.slice('__sd_semantic_footnote-'.length).split('-')[0] ?? '';
    return noteId ? { storyType: 'footnote', noteId } : null;
  }

  if (blockId.startsWith('endnote-')) {
    const noteId = blockId.slice('endnote-'.length).split('-')[0] ?? '';
    return noteId ? { storyType: 'endnote', noteId } : null;
  }

  return null;
}

function isSameRenderedNoteTarget(
  left: RenderedNoteTarget | null | undefined,
  right: RenderedNoteTarget | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.storyType === right.storyType && left.noteId === right.noteId;
}

function isOutsidePageBodyContent(layout: Layout, x: number, pageIndex?: number, pageLocalY?: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(pageIndex) || !Number.isFinite(pageLocalY)) {
    return false;
  }

  const page = layout?.pages?.[pageIndex];
  if (!page) {
    return false;
  }

  const pageWidth = page.size?.w ?? layout.pageSize.w;
  const pageHeight = page.size?.h ?? layout.pageSize.h;
  if (!Number.isFinite(pageWidth) || pageWidth <= 0 || !Number.isFinite(pageHeight) || pageHeight <= 0) {
    return false;
  }

  const margins = page.margins ?? null;
  const marginLeft = Number.isFinite(margins?.left) ? (margins!.left as number) : DEFAULT_PAGE_MARGIN_PX;
  const marginRight = Number.isFinite(margins?.right) ? (margins!.right as number) : DEFAULT_PAGE_MARGIN_PX;
  const marginTop = Number.isFinite(margins?.top) ? (margins!.top as number) : DEFAULT_PAGE_MARGIN_PX;
  const marginBottom = Number.isFinite(margins?.bottom) ? (margins!.bottom as number) : DEFAULT_PAGE_MARGIN_PX;

  const bodyLeft = Math.max(0, marginLeft);
  const bodyRight = Math.min(pageWidth, pageWidth - Math.max(0, marginRight));
  const bodyTop = Math.max(0, marginTop);
  const bodyBottom = Math.min(pageHeight, pageHeight - Math.max(0, marginBottom));

  if (bodyLeft >= bodyRight || bodyTop >= bodyBottom) {
    return false;
  }

  return x < bodyLeft || x > bodyRight || pageLocalY < bodyTop || pageLocalY > bodyBottom;
}

function getCommentHighlightThreadIds(target: EventTarget | null): string[] {
  if (!(target instanceof Element)) {
    return [];
  }

  const highlight = target.closest(COMMENT_HIGHLIGHT_SELECTOR);
  const threadIds = highlight?.getAttribute('data-comment-ids');

  if (!threadIds) {
    return [];
  }

  return threadIds
    .split(',')
    .map((threadId) => threadId.trim())
    .filter(Boolean);
}

function isDirectSingleCommentHighlightHit(target: EventTarget | null): boolean {
  return getCommentHighlightThreadIds(target).length === 1;
}

function isDirectTrackedChangeHit(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`${TRACK_CHANGE_SELECTOR}, ${PM_TRACK_CHANGE_SELECTOR}`) != null;
}

function resolveTrackChangeThreadId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const trackedChangeElement = target.closest(`${TRACK_CHANGE_SELECTOR}, ${PM_TRACK_CHANGE_SELECTOR}`);
  const threadId =
    trackedChangeElement?.getAttribute('data-track-change-id')?.trim() ??
    trackedChangeElement?.getAttribute('data-id')?.trim();

  return threadId ? threadId : null;
}

function resolveCommentThreadHit(target: EventTarget | null): CommentThreadHit {
  const threadIds = getCommentHighlightThreadIds(target);
  if (threadIds.length > 1) {
    return {
      isAmbiguous: true,
      threadId: null,
    };
  }

  if (threadIds.length === 1) {
    return {
      isAmbiguous: false,
      threadId: threadIds[0],
    };
  }

  return {
    isAmbiguous: false,
    threadId: resolveTrackChangeThreadId(target),
  };
}

function collectElementsNearPointerTarget(target: EventTarget | null, clientX: number, clientY: number): Element[] {
  const candidates: Element[] = [];
  const seen = new Set<Element>();
  const ownerDocument = target instanceof Element ? target.ownerDocument : document;
  const ownerWindow = ownerDocument.defaultView;

  const addCandidate = (candidate: Element | null): void => {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  };

  if (target instanceof Element) {
    addCandidate(target);
  }

  if (typeof ownerDocument.elementsFromPoint !== 'function' || !ownerWindow) {
    return candidates;
  }

  const maxX = Math.max(ownerWindow.innerWidth - 1, 0);
  const maxY = Math.max(ownerWindow.innerHeight - 1, 0);

  for (const [offsetX, offsetY] of COMMENT_THREAD_HIT_SAMPLE_OFFSETS) {
    const sampleX = clamp(clientX + offsetX, 0, maxX);
    const sampleY = clamp(clientY + offsetY, 0, maxY);
    const elements = ownerDocument.elementsFromPoint(sampleX, sampleY);

    for (const element of elements) {
      addCandidate(element);
    }
  }

  return candidates;
}

function elementContainsPointerSample(element: Element, clientX: number, clientY: number): boolean {
  const rect = element.getBoundingClientRect();
  if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  for (const [offsetX, offsetY] of COMMENT_THREAD_HIT_SAMPLE_OFFSETS) {
    const sampleX = clientX + offsetX;
    const sampleY = clientY + offsetY;
    if (sampleX >= rect.left && sampleX <= rect.right && sampleY >= rect.top && sampleY <= rect.bottom) {
      return true;
    }
  }

  return false;
}

function resolveCommentThreadIdFromGeometry(
  elements: Iterable<HTMLElement>,
  clientX: number,
  clientY: number,
): string | null {
  let resolvedThreadId: string | null = null;

  for (const element of elements) {
    if (!elementContainsPointerSample(element, clientX, clientY)) {
      continue;
    }

    const hit = resolveCommentThreadHit(element);
    if (hit.isAmbiguous) {
      return null;
    }

    if (!hit.threadId) {
      continue;
    }

    if (resolvedThreadId && resolvedThreadId !== hit.threadId) {
      return null;
    }

    resolvedThreadId = hit.threadId;
  }

  return resolvedThreadId;
}

function resolveCommentThreadIdNearPointer(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
): string | null {
  const directHit = resolveCommentThreadHit(target);
  if (directHit.isAmbiguous || directHit.threadId) {
    return directHit.threadId;
  }

  // Painter output can split one visible annotation into adjacent runs. Sampling
  // a few nearby points keeps narrow gaps from falling through to generic caret
  // placement while still refusing ambiguous overlapping highlights.
  const nearbyElements = collectElementsNearPointerTarget(target, clientX, clientY);
  for (const element of nearbyElements) {
    const hit = resolveCommentThreadHit(element);
    if (hit.isAmbiguous) {
      return null;
    }
    if (hit.threadId) {
      return hit.threadId;
    }
  }

  return null;
}

type VisiblePointerSurfaceHit = { kind: 'headerFooter'; surface: HTMLElement } | { kind: 'bodyContent' };

function resolveVisibleSurfaceAtPointer(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
): VisiblePointerSurfaceHit | null {
  const ownerDocument = target instanceof Element ? target.ownerDocument : document;
  const ownerWindow = ownerDocument.defaultView;

  if (typeof ownerDocument.elementFromPoint !== 'function' || !ownerWindow) {
    return null;
  }

  const sampleX = clamp(clientX, 0, Math.max(ownerWindow.innerWidth - 1, 0));
  const sampleY = clamp(clientY, 0, Math.max(ownerWindow.innerHeight - 1, 0));
  const sampledElements =
    typeof ownerDocument.elementsFromPoint === 'function'
      ? ownerDocument.elementsFromPoint(sampleX, sampleY)
      : [ownerDocument.elementFromPoint(sampleX, sampleY)];

  for (const element of sampledElements) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    const visibleHeaderFooterSurface = element.closest(VISIBLE_HEADER_FOOTER_SELECTOR) as HTMLElement | null;
    if (visibleHeaderFooterSurface) {
      return { kind: 'headerFooter', surface: visibleHeaderFooterSurface };
    }

    if (element.closest(VISIBLE_BODY_CONTENT_SELECTOR)) {
      return { kind: 'bodyContent' };
    }
  }

  return null;
}

function getActiveCommentThreadId(editor: Editor): string | null {
  const pluginState = CommentsPluginKey.getState(editor.state) as { activeThreadId?: unknown } | null;
  const activeThreadId = pluginState?.activeThreadId;

  if (typeof activeThreadId !== 'string' || activeThreadId.length === 0) {
    return null;
  }

  return activeThreadId;
}

function shouldIgnoreRepeatClickOnActiveComment(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  activeThreadId: string | null,
): boolean {
  if (!activeThreadId) {
    return false;
  }

  // Direct clicks on single-thread comment text or tracked-change text should
  // place a caret at the clicked position and let comment/thread activation be
  // inferred from the resulting selection. Only preserve the pointerdown
  // short-circuit for nearby non-text surfaces, such as split-run gaps.
  if (isDirectSingleCommentHighlightHit(target) || isDirectTrackedChangeHit(target)) {
    return false;
  }

  return resolveCommentThreadIdNearPointer(target, clientX, clientY) === activeThreadId;
}

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
  /** Get the currently active non-body story session, if any */
  getActiveStorySession?: () => StoryPresentationSession | null;
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
  normalizeClientPoint?: (
    clientX: number,
    clientY: number,
  ) => { x: number; y: number; pageIndex?: number; pageLocalY?: number } | null;
  /** Hit test header/footer region */
  hitTestHeaderFooterRegion?: (
    x: number,
    y: number,
    pageIndex?: number,
    pageLocalY?: number,
  ) => HeaderFooterRegion | null;
  /** Exit header/footer mode */
  exitHeaderFooterMode?: () => void;
  /** Activate header/footer region */
  activateHeaderFooterRegion?: (
    region: HeaderFooterRegion,
    options?: { clientX: number; clientY: number; pageIndex?: number; source?: 'pointerDoubleClick' | 'programmatic' },
  ) => void;
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
  /** Resolve a mounted inline image element by pmStart */
  resolveInlineImageElementByPmStart?: (pmStart: number) => HTMLElement | null;
  /** Resolve a mounted image fragment element by pmStart */
  resolveImageFragmentElementByPmStart?: (pmStart: number) => HTMLElement | null;
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
  /**
   * Called when a pointer text-drag selection ends.
   * Used to scroll the selection into view once after auto-scroll stops; during drag,
   * selection-driven scroll is suppressed to avoid fighting edge auto-scroll.
   */
  notifyDragSelectionEnded?: () => void;
  /** Hit test table at coordinates */
  hitTestTable?: (x: number, y: number) => TableHitResult | null;
  /** Hit test the currently active editing surface */
  hitTest?: (clientX: number, clientY: number) => PositionHit | null;
  /** Activate a rendered note session from a visible note block click */
  activateRenderedNoteSession?: (
    target: RenderedNoteTarget,
    options: { clientX: number; clientY: number; pageIndex?: number },
  ) => boolean;
  /** Exit the active generic story session */
  exitActiveStorySession?: () => void;
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
  #dragStartClient: { clientX: number; clientY: number } | null = null;
  #dragThresholdExceeded = false;
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
  #boundHandleStructuredContentLabelPointerDown: ((e: PointerEvent) => void) | null = null;
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
    this.#boundHandleStructuredContentLabelPointerDown = this.#handleStructuredContentLabelPointerDown.bind(this);
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
    visibleHost.addEventListener('pointerdown', this.#boundHandleStructuredContentLabelPointerDown, true);
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

    if (this.#boundHandleStructuredContentLabelPointerDown) {
      visibleHost.removeEventListener('pointerdown', this.#boundHandleStructuredContentLabelPointerDown, true);
    }
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
    this.#boundHandleStructuredContentLabelPointerDown = null;
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

  /**
   * Resets click-derived interaction state when the active editing surface
   * changes (for example body -> footnote or footnote -> header).
   *
   * Without this, a single click in the previous surface can be mistaken for
   * the first click of a double/triple click in the next surface.
   */
  notifyTargetChanged(): void {
    this.#resetMultiClickTracking();
    this.#pendingMarginClick = null;
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
    this.#dragStartClient = null;
    this.#dragThresholdExceeded = false;
    this.#lastPointerClient = null;
    this.#stopAutoScroll();
  }

  #hasExceededDragSelectionThreshold(clientX: number, clientY: number): boolean {
    if (this.#dragThresholdExceeded) return true;
    if (!this.#dragStartClient) return true;

    const deltaX = clientX - this.#dragStartClient.clientX;
    const deltaY = clientY - this.#dragStartClient.clientY;
    const thresholdSquared = DRAG_SELECTION_DISTANCE_THRESHOLD_PX * DRAG_SELECTION_DISTANCE_THRESHOLD_PX;

    if (deltaX * deltaX + deltaY * deltaY < thresholdSquared) {
      return false;
    }

    this.#dragThresholdExceeded = true;
    return true;
  }

  #clearCellAnchor(): void {
    this.#cellAnchor = null;
    this.#cellDragMode = 'none';
  }

  #resetMultiClickTracking(): void {
    this.#clickCount = 0;
    this.#lastClickTime = 0;
    this.#lastClickPosition = null;
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
    const editor = this.#deps?.getActiveEditor() ?? this.#deps?.getEditor();
    return getFirstTextPositionFromHelper(editor?.state?.doc ?? null);
  }

  #resolveBodyPointerHit(
    layoutState: ReturnType<EditorInputDependencies['getLayoutState']>,
    normalized: { x: number; y: number },
    clientX: number,
    clientY: number,
  ): PositionHit | null {
    const viewportHost = this.#deps?.getViewportHost();
    const pageGeometryHelper = this.#deps?.getPageGeometryHelper();
    if (!viewportHost) {
      return null;
    }

    return (
      resolvePointerPositionHit({
        layout: layoutState.layout,
        blocks: layoutState.blocks,
        measures: layoutState.measures,
        containerPoint: normalized,
        domContainer: viewportHost,
        clientX,
        clientY,
        geometryHelper: pageGeometryHelper ?? undefined,
      }) ?? null
    );
  }

  #resolveSelectionPointerHit(options: {
    layoutState: ReturnType<EditorInputDependencies['getLayoutState']>;
    normalized: { x: number; y: number };
    clientX: number;
    clientY: number;
    editor: Editor;
    useActiveSurfaceHitTest: boolean;
  }): { rawHit: PositionHit | null; hit: PositionHit | null } {
    const { layoutState, normalized, clientX, clientY, editor, useActiveSurfaceHitTest } = options;
    const doc = editor.state?.doc;
    const rawHit =
      useActiveSurfaceHitTest && this.#callbacks.hitTest
        ? this.#callbacks.hitTest(clientX, clientY)
        : this.#resolveBodyPointerHit(layoutState, normalized, clientX, clientY);

    if (!rawHit || !doc) {
      return { rawHit, hit: null };
    }

    if (useActiveSurfaceHitTest) {
      return {
        rawHit,
        hit: {
          ...rawHit,
          pos: clamp(rawHit.pos, 0, doc.content.size),
        },
      };
    }

    const epochMapper = this.#deps?.getEpochMapper();
    if (!epochMapper) {
      return { rawHit, hit: null };
    }

    const mapped = epochMapper.mapPosFromLayoutToCurrentDetailed(rawHit.pos, rawHit.layoutEpoch, 1);
    if (!mapped.ok) {
      debugLog('warn', 'pointer mapping failed', mapped);
      return { rawHit, hit: null };
    }

    return {
      rawHit,
      hit: {
        ...rawHit,
        pos: clamp(mapped.pos, 0, doc.content.size),
        layoutEpoch: mapped.toEpoch,
      },
    };
  }

  #calculateExtendedSelection(
    anchor: number,
    head: number,
    mode: 'char' | 'word' | 'para',
  ): { selAnchor: number; selHead: number } {
    const layoutState = this.#deps?.getLayoutState();
    return calculateExtendedSelection(layoutState?.blocks ?? [], anchor, head, mode);
  }

  /**
   * When the drag anchor is outside an isolating node (table), prevent the head
   * from resolving inside one. If the head is inside a table cell, clamp it to
   * just before or after the table boundary (depending on drag direction).
   *
   * Selections that span PAST a table (anchor before, head after) are allowed —
   * only positions resolving INSIDE the table are clamped.
   */
  #clampHeadAtIsolatingBoundary(doc: ProseMirrorNode, anchor: number, head: number): number {
    const forward = head >= anchor;

    try {
      const $head = doc.resolve(head);
      // Find the outermost isolating ancestor. Walk from innermost to outermost,
      // tracking the shallowest isolating depth. Using the outermost ensures that
      // we clamp to just before/after the entire table, not to a boundary between
      // cells within the same table.
      let isolatingDepth = -1;
      for (let d = $head.depth; d > 0; d--) {
        const node = $head.node(d);
        if (node.type.spec.isolating || node.type.spec.tableRole === 'table') {
          isolatingDepth = d;
        }
      }

      if (isolatingDepth > 0) {
        const boundary = forward ? $head.before(isolatingDepth) : $head.after(isolatingDepth);
        const near = Selection.near(doc.resolve(boundary), forward ? -1 : 1);
        if (near instanceof TextSelection) return near.head;
        return anchor;
      }
    } catch {
      /* position resolution failed */
    }

    return head;
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

    // Emit local-only pointer events for external consumers (e.g. debugging trackpad issues)
    // Emit directly on the Editor instance so consumers can use editor.on('pointerDown', ...)
    const bodyEditor = this.#deps.getEditor();
    bodyEditor.emit?.('pointerDown', { editor: bodyEditor, event });

    // Emit rightClick for secondary button (button 2) or Ctrl+Click on Mac
    if (event.button === 2 || (event.ctrlKey && navigator.platform.includes('Mac'))) {
      bodyEditor.emit?.('rightClick', { editor: bodyEditor, event });
    }

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
    const annotationEl = target?.closest?.(buildAnnotationSelector()) as HTMLElement | null;
    const isDraggableAnnotation = target?.closest?.(DRAGGABLE_SELECTOR) != null;
    const isNativeDragSource = target?.closest?.(DRAG_SOURCE_SELECTOR) != null;
    const suppressFocusForDrag = isDraggableAnnotation || isNativeDragSource;
    this.#suppressFocusInFromDraggable = suppressFocusForDrag;

    if (annotationEl) {
      this.#handleAnnotationClick(event, annotationEl);
      return;
    }

    const layoutState = this.#deps.getLayoutState();
    const clickedNoteTarget = this.#resolveRenderedNoteTargetAtPointer(target, event.clientX, event.clientY);

    // Check header/footer session state
    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    let activeStorySession = this.#deps.getActiveStorySession?.() ?? null;
    let activeNoteSession = activeStorySession?.kind === 'note' ? activeStorySession : null;
    const activeNoteTarget = this.#getActiveRenderedNoteTarget();

    if (!layoutState.layout) {
      if (clickedNoteTarget && !isSameRenderedNoteTarget(activeNoteTarget, clickedNoteTarget)) {
        if (!suppressFocusForDrag) {
          event.preventDefault();
        }
        const activated = this.#callbacks.activateRenderedNoteSession?.(clickedNoteTarget, {
          clientX: event.clientX,
          clientY: event.clientY,
        });
        if (activated) {
          this.#syncNonBodyCommentActivation(event, target, bodyEditor);
          return;
        }
        this.#focusEditor();
        return;
      }

      if (!clickedNoteTarget && activeNoteSession) {
        this.#callbacks.exitActiveStorySession?.();
      }

      const isActiveStorySurface = sessionMode !== 'body' || activeNoteSession != null;
      if (!isActiveStorySurface) {
        if (this.#handleSingleCommentHighlightClick(event, target, bodyEditor)) {
          return;
        }

        if (this.#handleRepeatClickOnActiveComment(event, target, bodyEditor)) {
          return;
        }
      } else {
        this.#syncNonBodyCommentActivation(event, target, bodyEditor);
      }

      this.#handleClickWithoutLayout(event, suppressFocusForDrag);
      return;
    }

    const normalizedPoint = this.#callbacks.normalizeClientPoint?.(event.clientX, event.clientY);
    if (!normalizedPoint) return;

    const { x, y } = normalizedPoint;
    this.#debugLastPointer = { clientX: event.clientX, clientY: event.clientY, x, y };

    if (clickedNoteTarget) {
      const isSameActiveNote = isSameRenderedNoteTarget(activeNoteTarget, clickedNoteTarget);
      if (!isSameActiveNote) {
        if (!suppressFocusForDrag) event.preventDefault();
        const activated = this.#callbacks.activateRenderedNoteSession?.(clickedNoteTarget, {
          clientX: event.clientX,
          clientY: event.clientY,
          pageIndex: normalizedPoint.pageIndex,
        });
        if (activated) {
          this.#syncNonBodyCommentActivation(event, target, bodyEditor);
          return;
        }
        this.#focusEditor();
        return;
      }
    } else if (activeNoteSession) {
      this.#callbacks.exitActiveStorySession?.();
      activeStorySession = null;
      activeNoteSession = null;
    }

    const isActiveStorySurface = sessionMode !== 'body' || activeStorySession != null;
    if (!isActiveStorySurface) {
      if (this.#handleSingleCommentHighlightClick(event, target, bodyEditor)) {
        return;
      }

      if (this.#handleRepeatClickOnActiveComment(event, target, bodyEditor)) {
        return;
      }
    } else {
      this.#syncNonBodyCommentActivation(event, target, bodyEditor);
    }

    const isNoteEditing = activeNoteSession != null;
    let currentSessionMode = sessionMode;
    let useActiveSurfaceHitTest = currentSessionMode !== 'body' || activeStorySession != null;
    let editor = currentSessionMode === 'body' && !isNoteEditing ? bodyEditor : this.#deps.getActiveEditor();
    if (currentSessionMode !== 'body') {
      if (this.#handleClickInHeaderFooterMode(event, x, y, normalizedPoint.pageIndex, normalizedPoint.pageLocalY))
        return;
      // SD-2749: clicking on body content from inside a header/footer session
      // exits the session synchronously, which also clears the backing story
      // session. Re-read both so subsequent hit testing and selection dispatch
      // target the body editor — otherwise ProseMirror's scrollIntoView would
      // pull the viewport back to the header/footer the user just exited.
      const refreshedSessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
      if (refreshedSessionMode === 'body' && !isNoteEditing) {
        activeStorySession = this.#deps.getActiveStorySession?.() ?? null;
        currentSessionMode = 'body';
        useActiveSurfaceHitTest = activeStorySession != null;
        editor = bodyEditor;
      }
    }

    if (this.#handleStructuredContentLabelClick(event, target, bodyEditor)) {
      return;
    }

    // Check for header/footer region hit
    const headerFooterRegion = this.#callbacks.hitTestHeaderFooterRegion?.(
      x,
      y,
      normalizedPoint.pageIndex,
      normalizedPoint.pageLocalY,
    );
    if (headerFooterRegion) {
      if (sessionMode === 'body') {
        event.preventDefault(); // Prevent native selection before double-click handles it
        return; // Will be handled by double-click
      }
    }

    // Bail when the click did not land on any page body. Two cases:
    // - SD-2356: click inside a page's bounding box but in the margin/header/footer area.
    // - SD-2749: click in the gap between pages (no .superdoc-page under the cursor),
    //   in which case normalizeClientPoint leaves pageIndex undefined.
    // Both should preserve the current selection and scroll position.
    if (!useActiveSurfaceHitTest) {
      const pointerOffAnyPage = !Number.isFinite(normalizedPoint.pageIndex);
      if (
        pointerOffAnyPage ||
        isOutsidePageBodyContent(layoutState.layout, x, normalizedPoint.pageIndex, normalizedPoint.pageLocalY)
      ) {
        event.preventDefault();
        this.#focusEditor();
        return;
      }
    }

    const { rawHit, hit } = this.#resolveSelectionPointerHit({
      layoutState,
      normalized: { x, y },
      clientX: event.clientX,
      clientY: event.clientY,
      editor,
      useActiveSurfaceHitTest,
    });
    const doc = editor.state?.doc;

    this.#debugLastHit = hit
      ? { source: 'dom', pos: rawHit?.pos ?? null, layoutEpoch: rawHit?.layoutEpoch ?? null, mappedPos: hit.pos }
      : { source: 'none', pos: rawHit?.pos ?? null, layoutEpoch: rawHit?.layoutEpoch ?? null, mappedPos: null };
    this.#callbacks.updateSelectionDebugHud?.();

    // Don't preventDefault for draggable annotations
    if (!suppressFocusForDrag) {
      event.preventDefault();
    }

    // Handle click outside text content — keep cursor and scroll position unchanged.
    if (!rawHit) {
      this.#focusEditor();
      return;
    }

    // Guard against stale note hits after a session switch or partial rerender.
    // Compare both storyType and noteId so a footnote-N session does not
    // mistake a hit on endnote-N as the same target.
    if (
      isNoteEditing &&
      activeNoteTarget &&
      !isSameRenderedNoteTarget(parseRenderedNoteTarget(rawHit.blockId), activeNoteTarget)
    ) {
      this.#callbacks.exitActiveStorySession?.();
      this.#focusEditor();
      return;
    }

    // Disallow entering read-only note content unless it has been activated into a story session.
    if (isRenderedNoteBlockId(rawHit.blockId) && !isNoteEditing) {
      this.#focusEditor();
      return;
    }

    if (!hit || !doc) {
      this.#callbacks.setPendingDocChange?.();
      this.#callbacks.scheduleRerender?.();
      return;
    }

    // Check for image/fragment hit
    const fragmentHit = useActiveSurfaceHitTest
      ? null
      : getFragmentAtPosition(layoutState.layout, layoutState.blocks, layoutState.measures, rawHit.pos);

    // Handle inline image click
    const targetImg = (event.target as HTMLElement | null)?.closest?.('img') as HTMLImageElement | null;
    if (!useActiveSurfaceHitTest) {
      const epochMapper = this.#deps.getEpochMapper();
      if (this.#handleInlineImageClick(event, targetImg, rawHit, doc, epochMapper)) return;
    }

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

      // Check for table cell selection.
      // Verify that the resolved click position is actually inside the table before
      // activating cell selection. hitTestTable uses geometry-based coordinates that
      // may have small offsets from the DOM, causing false positives for clicks on
      // paragraphs near table boundaries.
      const tableHit = this.#hitTestTable(x, y);
      if (tableHit) {
        const tablePos = this.#getTablePosFromHit(tableHit);
        const hitIsInsideTable =
          tablePos !== null &&
          doc &&
          hit.pos >= tablePos &&
          hit.pos <= tablePos + (doc.nodeAt(tablePos)?.nodeSize ?? 0);
        if (tablePos !== null && hitIsInsideTable) {
          this.#setCellAnchor(tableHit, tablePos);
        } else {
          this.#clearCellAnchor();
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
    this.#dragStartClient = { clientX: event.clientX, clientY: event.clientY };
    this.#dragThresholdExceeded = false;
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
    const viewportHost = this.#deps.getViewportHost();
    if (typeof viewportHost.setPointerCapture === 'function') {
      viewportHost.setPointerCapture(event.pointerId);
    }

    // Handle double/triple click selection
    let handledByDepth = false;
    const selectionPos = clickDepth >= 2 && this.#dragAnchor !== null ? this.#dragAnchor : hit.pos;

    if (clickDepth >= 3) {
      handledByDepth = this.#callbacks.selectParagraphAt?.(selectionPos) ?? false;
    } else if (clickDepth === 2) {
      handledByDepth = this.#callbacks.selectWordAt?.(selectionPos) ?? false;
    }

    // `EditorView.hasFocus()` is not strong enough here for hidden story
    // surfaces. A reused note editor can keep an internal "focused" state even
    // after its DOM host was torn down and remounted elsewhere. The actual
    // browser `activeElement` still decides where native selection and keyboard
    // input go, so always let `#focusEditor()` reconcile real DOM focus.
    this.#focusEditor();

    // Set selection for single click
    if (!handledByDepth) {
      try {
        let nextSelection: Selection;
        let inlineSdtBoundaryPos: number | null = null;
        let inlineSdtBoundaryDirection: 'before' | 'after' | null = null;
        const inlineSdt = clickDepth === 1 ? findStructuredContentInlineAtPos(doc, hit.pos) : null;
        if (inlineSdt && hit.pos >= inlineSdt.end) {
          const afterInlineSdt = inlineSdt.pos + inlineSdt.node.nodeSize;
          inlineSdtBoundaryPos = afterInlineSdt;
          inlineSdtBoundaryDirection = 'after';
          nextSelection = TextSelection.create(doc, afterInlineSdt);
        } else if (inlineSdt && hit.pos <= inlineSdt.start) {
          inlineSdtBoundaryPos = inlineSdt.pos;
          inlineSdtBoundaryDirection = 'before';
          nextSelection = TextSelection.create(doc, inlineSdt.pos);
        } else {
          nextSelection = TextSelection.create(doc, hit.pos);
        }
        if (!nextSelection.$from.parent.inlineContent) {
          nextSelection = Selection.near(doc.resolve(hit.pos), 1);
        }
        let tr = editor.state.tr.setSelection(nextSelection);
        if (inlineSdtBoundaryPos != null && inlineSdtBoundaryDirection) {
          tr = applyEditableSlotAtInlineBoundary(tr, inlineSdtBoundaryPos, inlineSdtBoundaryDirection);
          nextSelection = tr.selection;
        }
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

  #handleStructuredContentLabelPointerDown(event: PointerEvent): void {
    if (!this.#deps) return;
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    const editor = this.#deps.getEditor();
    if (this.#handleStructuredContentLabelClick(event, target, editor)) {
      event.stopImmediatePropagation();
    }
  }

  #handlePointerMove(event: PointerEvent): void {
    if (!this.#deps) return;

    const layoutState = this.#deps.getLayoutState();
    if (!layoutState.layout) return;

    // Handle drag selection
    if (this.#isDragging && this.#dragAnchor !== null && event.buttons & 1) {
      if (!this.#hasExceededDragSelectionThreshold(event.clientX, event.clientY)) {
        return;
      }

      this.#lastPointerClient = { clientX: event.clientX, clientY: event.clientY };
      this.#handleDragSelectionAt(event.clientX, event.clientY);
      this.#updateAutoScrollFromPointer(event.clientX, event.clientY);
      return;
    }

    // Handle header/footer hover
    const normalized = this.#callbacks.normalizeClientPoint?.(event.clientX, event.clientY);
    if (!normalized) return;
    if (this.#deps.getActiveStorySession?.()?.kind === 'note') {
      this.#callbacks.clearHoverRegion?.();
      return;
    }
    this.#handleHover(normalized);
  }

  #handlePointerUp(event: PointerEvent): void {
    if (!this.#deps) return;

    // Emit local-only pointer event for external consumers (e.g. debugging trackpad issues)
    // Emit directly on the Editor instance so consumers can use editor.on('pointerUp', ...)
    const editor = this.#deps.getEditor();
    editor.emit?.('pointerUp', { editor, event });

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

      this.#callbacks.notifyDragSelectionEnded?.();

      this.#callbacks.scheduleA11ySelectionAnnouncement?.({ immediate: true });

      this.#dragLastPointer = null;
      this.#dragLastRawHit = null;
      this.#dragUsedPageNotMountedFallback = false;
      this.#dragStartClient = null;
      this.#dragThresholdExceeded = false;
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
    const annotationEl = target?.closest?.(buildAnnotationSelector()) as HTMLElement | null;

    if (annotationEl) {
      event.preventDefault();
      event.stopPropagation();
      this.#handleAnnotationDoubleClick(event, annotationEl);
      return;
    }

    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';

    const layoutState = this.#deps.getLayoutState();
    if (!layoutState.layout) return;

    const normalized = this.#callbacks.normalizeClientPoint?.(event.clientX, event.clientY);
    if (!normalized) return;

    const clickedNoteTarget = this.#resolveRenderedNoteTargetAtPointer(target, event.clientX, event.clientY);
    if (clickedNoteTarget) {
      if (isSameRenderedNoteTarget(this.#getActiveRenderedNoteTarget(), clickedNoteTarget)) {
        // Pointerdown already updated selection inside the live note session.
        // Re-activating the same note here would remount the hidden editor and
        // wipe out the word/paragraph selection that the multi-click logic just set.
        //
        // The activation gesture itself only registers one click inside the live
        // note, so its trailing dblclick can leave a stale single-click marker
        // behind. Clear only that activation residue and preserve genuine active
        // multi-click state for triple-click paragraph selection.
        if (this.#clickCount <= 1) {
          this.#resetMultiClickTracking();
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.#callbacks.activateRenderedNoteSession?.(clickedNoteTarget, {
        clientX: event.clientX,
        clientY: event.clientY,
        pageIndex: normalized.pageIndex,
      });
      return;
    }

    const region = this.#callbacks.hitTestHeaderFooterRegion?.(
      normalized.x,
      normalized.y,
      normalized.pageIndex,
      normalized.pageLocalY,
    );
    if (region) {
      if (sessionMode === 'body' || this.#isDifferentHeaderFooterRegionFromActiveSession(region)) {
        event.preventDefault();
        event.stopPropagation();

        // Materialization (if needed) now happens inside #enterMode via
        // ensureExplicitHeaderFooterSlot. The pointer handler only triggers
        // activation — it is not responsible for slot creation.
        this.#callbacks.activateHeaderFooterRegion?.(region, {
          clientX: event.clientX,
          clientY: event.clientY,
          pageIndex: normalized.pageIndex,
          source: 'pointerDoubleClick',
        });
      }
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
    const activeStorySession = this.#deps.getActiveStorySession?.() ?? null;
    if (event.key === 'Escape' && sessionMode !== 'body') {
      event.preventDefault();
      this.#callbacks.exitHeaderFooterMode?.();
      return;
    }
    if (event.key === 'Escape' && activeStorySession?.kind === 'note') {
      event.preventDefault();
      this.#callbacks.exitActiveStorySession?.();
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

    this.#focusEditorView(this.#deps.getActiveEditor().view);
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

    // SD-2495: route any internal-anchor click (`#<bookmark>`) to in-document
    // navigation. Covers TOC entries, heading/bookmark cross-references
    // (REF fields with `\h`), and any other internal-hyperlink case — they all
    // should scroll to the bookmark target instead of navigating the browser.
    if (isAnchorLink) {
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

  #handleStructuredContentLabelClick(event: PointerEvent, target: HTMLElement | null, editor: Editor): boolean {
    const doc = editor.state?.doc;
    if (!doc) return false;

    const labelTarget = this.#resolveStructuredContentLabelTarget(event, target);
    const inlineLabel = labelTarget?.closest?.('.superdoc-structured-content-inline__label') as HTMLElement | null;
    if (inlineLabel) {
      const resolved = this.#resolveStructuredContentInlineFromElement(doc, inlineLabel);
      if (resolved) {
        event.preventDefault();
        const applyNodeSelection = () => {
          const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, resolved.pos));
          editor.view?.dispatch(tr);
        };
        try {
          applyNodeSelection();
        } catch {
          const tr = editor.state.tr.setSelection(TextSelection.create(doc, resolved.start, resolved.end));
          editor.view?.dispatch(tr);
        }

        this.#callbacks.scheduleSelectionUpdate?.();
        this.#focusEditor();
        return true;
      }
    }

    const blockLabel = labelTarget?.closest?.('.superdoc-structured-content__label') as HTMLElement | null;
    if (blockLabel) {
      const resolved = this.#resolveStructuredContentBlockFromElement(doc, blockLabel);
      if (resolved) {
        event.preventDefault();
        const applySelection = () => {
          const selection = NodeSelection.create(editor.state.doc, resolved.pos);
          const tr = editor.state.tr.setSelection(selection);
          editor.view?.dispatch(tr);
          if (editor.state.selection.from !== resolved.pos) {
            // Painted block labels carry the layout-mapped start. In fragmented
            // blocks that hint can resolve to the selectable wrapper even when
            // the canonical doc position is normalized back to the prior caret.
            const labelPmStart = Number(blockLabel.dataset?.pmStart);
            if (Number.isFinite(labelPmStart)) {
              const retry = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, labelPmStart));
              editor.view?.dispatch(retry);
            }
          }
        };

        try {
          applySelection();
        } catch {
          const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, resolved.start, resolved.end));
          editor.view?.dispatch(tr);
        }
        globalThis.setTimeout(() => {
          const selection = editor.state.selection;
          if (selection.node?.type?.name !== 'structuredContentBlock' || selection.from !== resolved.pos) {
            try {
              applySelection();
            } catch {}
          }
        }, 0);

        this.#focusEditor();
        return true;
      }
    }

    return false;
  }

  #resolveStructuredContentLabelTarget(event: PointerEvent, target: HTMLElement | null): HTMLElement | null {
    const labelSelector = '.superdoc-structured-content-inline__label, .superdoc-structured-content__label';
    const directLabel = target?.closest?.(labelSelector) as HTMLElement | null;
    if (directLabel) return directLabel;

    const doc = target?.ownerDocument ?? document;
    const elementsFromPoint = doc.elementsFromPoint?.bind(doc);
    if (!elementsFromPoint) return null;

    for (const element of elementsFromPoint(event.clientX, event.clientY)) {
      if (!(element instanceof HTMLElement)) continue;
      const label = element.closest?.(labelSelector) as HTMLElement | null;
      if (label) return label;
    }

    return null;
  }

  #resolveStructuredContentBlockFromElement(
    doc: ProseMirrorNode,
    element: HTMLElement,
  ): StructuredContentSelection | null {
    const elementSdtId = element.dataset?.sdtId;
    if (elementSdtId) {
      const match = findStructuredContentBlockById(doc, elementSdtId);
      if (match) return match;
    }

    const elementPmStartRaw = element.dataset?.pmStart;
    const elementPmStart = elementPmStartRaw != null ? Number(elementPmStartRaw) : NaN;
    if (Number.isFinite(elementPmStart)) {
      const match = findStructuredContentBlockAtPos(doc, elementPmStart);
      if (match) return match;
    }

    const container = element.closest?.('.superdoc-structured-content-block') as HTMLElement | null;
    if (!container) return null;

    const sdtId = container.dataset?.sdtId;
    if (sdtId) {
      const match = findStructuredContentBlockById(doc, sdtId);
      if (match) return match;
    }

    const containerSdtId = container.dataset?.sdtContainerId;
    if (containerSdtId) {
      const match = findStructuredContentBlockById(doc, containerSdtId);
      if (match) return match;
    }

    const pmStartRaw = container.dataset?.pmStart;
    const pmStart = pmStartRaw != null ? Number(pmStartRaw) : NaN;
    if (Number.isFinite(pmStart)) {
      return findStructuredContentBlockAtPos(doc, pmStart);
    }

    return null;
  }

  #resolveStructuredContentInlineFromElement(
    doc: ProseMirrorNode,
    element: HTMLElement,
  ): StructuredContentSelection | null {
    const elementSdtId = element.dataset?.sdtId;
    if (elementSdtId) {
      const match = findStructuredContentInlineById(doc, elementSdtId);
      if (match) return match;
    }

    const elementPmStartRaw = element.dataset?.pmStart;
    const elementPmStart = elementPmStartRaw != null ? Number(elementPmStartRaw) : NaN;
    if (Number.isFinite(elementPmStart)) {
      const match = findStructuredContentInlineAtPos(doc, elementPmStart);
      if (match) return match;
    }

    const container = element.closest?.('.superdoc-structured-content-inline') as HTMLElement | null;
    if (!container) return null;

    const sdtId = container.dataset?.sdtId;
    if (sdtId) {
      const match = findStructuredContentInlineById(doc, sdtId);
      if (match) return match;
    }

    const pmStartRaw = container.dataset?.pmStart;
    const pmStart = pmStartRaw != null ? Number(pmStartRaw) : NaN;
    if (Number.isFinite(pmStart)) {
      return findStructuredContentInlineAtPos(doc, pmStart);
    }

    return null;
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

  #handleClickInHeaderFooterMode(
    event: PointerEvent,
    x: number,
    y: number,
    pageIndex?: number,
    pageLocalY?: number,
  ): boolean {
    const session = this.#deps?.getHeaderFooterSession();
    const activeSurfaceSelector =
      session?.session?.mode === 'footer' ? '.superdoc-page-footer' : '.superdoc-page-header';
    const visiblePointerSurface = resolveVisibleSurfaceAtPointer(event.target, event.clientX, event.clientY);
    const clickedInsideVisibleActiveSurface =
      visiblePointerSurface?.kind === 'headerFooter' &&
      visiblePointerSurface.surface.closest(activeSurfaceSelector) != null;

    if (visiblePointerSurface?.kind === 'bodyContent') {
      this.#callbacks.exitHeaderFooterMode?.();
      return false; // Continue to body click handling after exiting the active H/F session
    }

    const headerFooterRegion = this.#callbacks.hitTestHeaderFooterRegion?.(x, y, pageIndex, pageLocalY);
    if (!headerFooterRegion) {
      this.#callbacks.exitHeaderFooterMode?.();
      return false; // Continue to body click handling
    }

    if (visiblePointerSurface?.kind === 'headerFooter' && !clickedInsideVisibleActiveSurface) {
      if (this.#isDifferentHeaderFooterRegionFromActiveSession(headerFooterRegion)) {
        event.preventDefault();
        return true;
      }

      this.#callbacks.exitHeaderFooterMode?.();
      return false; // Continue to body click handling
    }

    this.#syncNonBodyCommentSelection(event, event.target as HTMLElement | null, this.#deps.getEditor(), {
      clearOnMiss: true,
    });

    // Click is in the active rendered header/footer surface. Keep the story
    // session active, update any tracked-change/comment bubble state, and let
    // the normal rendered-surface hit testing place the selection/caret.
    return false;
  }

  #isDifferentHeaderFooterRegionFromActiveSession(region: HeaderFooterRegion): boolean {
    const session = this.#deps?.getHeaderFooterSession()?.session;
    if (!session || session.mode === 'body') {
      return true;
    }

    if (session.mode !== region.kind) {
      return true;
    }

    if (
      session.headerFooterRefId &&
      region.headerFooterRefId &&
      session.headerFooterRefId !== region.headerFooterRefId
    ) {
      return true;
    }

    if (
      Number.isFinite(session.pageIndex) &&
      Number.isFinite(region.pageIndex) &&
      session.pageIndex !== region.pageIndex
    ) {
      return true;
    }

    return (session.sectionType ?? null) !== (region.sectionType ?? null);
  }

  #isSameHeaderFooterRegion(
    left: HeaderFooterRegion | null | undefined,
    right: HeaderFooterRegion | null | undefined,
  ): boolean {
    if (!left || !right) {
      return false;
    }

    if (left.kind !== right.kind || left.pageIndex !== right.pageIndex) {
      return false;
    }

    if ((left.sectionId ?? null) !== (right.sectionId ?? null)) {
      return false;
    }

    if ((left.sectionType ?? null) !== (right.sectionType ?? null)) {
      return false;
    }

    const leftRefId = left.headerFooterRefId ?? null;
    const rightRefId = right.headerFooterRefId ?? null;
    if (leftRefId && rightRefId && leftRefId !== rightRefId) {
      return false;
    }

    return true;
  }

  #handleInlineImageClick(
    event: PointerEvent,
    targetImg: HTMLImageElement | null,
    rawHit: PositionHit,
    doc: ProseMirrorNode,
    epochMapper: EpochPositionMapper,
  ): boolean {
    if (!targetImg) return false;

    // When image has clipPath it is wrapped in a clip-wrapper; pm-start is on the wrapper
    const wrapper = targetImg.closest?.(`.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}`) as HTMLElement | null;
    const pmStartSource = wrapper ?? targetImg;
    const imgPmStart = pmStartSource?.dataset?.pmStart ? Number(pmStartSource.dataset.pmStart) : null;
    if (Number.isNaN(imgPmStart) || imgPmStart == null) return false;

    const imgLayoutEpochRaw = pmStartSource?.dataset?.layoutEpoch;
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

      // Prefer wrapper (clip container) so selection outline is on the visible cropped box only, not the full image.
      // The compound selector lists wrapper before inline-image; querySelector returns the first DOM-order
      // match, and the wrapper is always an ancestor of the image, so it is found first when present.
      const targetElement = this.#callbacks.resolveInlineImageElementByPmStart?.(imgPmStart) ?? null;
      const elementForHighlight = (wrapper ?? targetElement ?? targetImg) as HTMLElement;
      this.#callbacks.emit?.('imageSelected', {
        element: elementForHighlight,
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
        const targetElement =
          fragmentHit.fragment.pmStart != null
            ? (this.#callbacks.resolveImageFragmentElementByPmStart?.(fragmentHit.fragment.pmStart) ?? null)
            : null;
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
    const editor = this.#deps?.getActiveEditor() ?? this.#deps?.getEditor();
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

    const activeStorySession = this.#deps.getActiveStorySession?.() ?? null;
    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    const useActiveSurfaceHitTest = sessionMode !== 'body' || activeStorySession != null;
    const editor = useActiveSurfaceHitTest
      ? this.#deps.getActiveEditor()
      : (this.#deps.getEditor() as ReturnType<EditorInputDependencies['getEditor']>);
    const { rawHit, hit } = this.#resolveSelectionPointerHit({
      layoutState,
      normalized: { x: normalized.x, y: normalized.y },
      clientX,
      clientY,
      editor,
      useActiveSurfaceHitTest,
    });

    if (!rawHit || !hit) return;

    // Don't extend a body selection into read-only footnote content.
    if (!useActiveSurfaceHitTest && isRenderedNoteBlockId(rawHit.blockId)) return;

    const doc = editor.state?.doc;
    if (!doc) return;

    this.#dragLastRawHit = rawHit;

    const pageMounted = this.#deps.getPageElement(rawHit.pageIndex) != null;
    if (!pageMounted && this.#deps.isSelectionAwareVirtualizationEnabled()) {
      this.#dragUsedPageNotMountedFallback = true;
    }

    this.#callbacks.updateSelectionVirtualizationPins?.({ includeDragBuffer: true, extraPages: [rawHit.pageIndex] });

    this.#debugLastHit = {
      source: useActiveSurfaceHitTest || pageMounted ? 'dom' : 'geometry',
      pos: rawHit.pos,
      layoutEpoch: rawHit.layoutEpoch,
      mappedPos: hit.pos,
    };
    this.#callbacks.updateSelectionDebugHud?.();

    // Check for cell selection
    const currentTableHit = useActiveSurfaceHitTest ? null : this.#hitTestTable(normalized.x, normalized.y);
    const shouldUseCellSel = this.#shouldUseCellSelection(currentTableHit);

    if (shouldUseCellSel && this.#cellAnchor) {
      this.#handleCellDragSelection(currentTableHit, hit);
      return;
    }

    // Text selection mode
    const anchor = this.#dragAnchor!;
    let head = hit.pos;

    // When the drag started outside a table, prevent the head from entering an isolating
    // node (table). If the head resolves inside a table, ProseMirror-tables' appendTransaction
    // converts the TextSelection into a CellSelection, causing the anchor to jump.
    if (!this.#cellAnchor) {
      head = this.#clampHeadAtIsolatingBoundary(doc, anchor, head);
    }

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

  #handleHover(normalized: { x: number; y: number; pageIndex?: number; pageLocalY?: number }): void {
    if (!this.#deps) return;

    if (this.#deps.getDocumentMode() === 'viewing') {
      this.#callbacks.clearHoverRegion?.();
      return;
    }

    const sessionMode = this.#deps.getHeaderFooterSession()?.session?.mode ?? 'body';
    const region = this.#callbacks.hitTestHeaderFooterRegion?.(
      normalized.x,
      normalized.y,
      normalized.pageIndex,
      normalized.pageLocalY,
    );
    if (!region) {
      this.#callbacks.clearHoverRegion?.();
      return;
    }

    if (sessionMode !== 'body' && !this.#isDifferentHeaderFooterRegionFromActiveSession(region)) {
      this.#callbacks.clearHoverRegion?.();
      return;
    }

    const currentHover = this.#deps.getHeaderFooterSession()?.hoverRegion;
    if (this.#isSameHeaderFooterRegion(currentHover, region)) {
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
    this.#dragStartClient = null;
    this.#dragThresholdExceeded = false;
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

  #getActiveRenderedNoteTarget(): RenderedNoteTarget | null {
    const activeStorySession = this.#deps?.getActiveStorySession?.() ?? null;
    if (activeStorySession?.kind !== 'note') {
      return null;
    }

    const locator = activeStorySession.locator;
    if (locator.storyType !== 'footnote' && locator.storyType !== 'endnote') {
      return null;
    }

    return {
      storyType: locator.storyType,
      noteId: locator.noteId,
    };
  }

  #resolveRenderedNoteTargetAtPointer(
    target: HTMLElement | null,
    clientX: number,
    clientY: number,
  ): RenderedNoteTarget | null {
    const blockIdFromTarget = target?.closest?.('[data-block-id]')?.getAttribute?.('data-block-id') ?? '';
    const parsedFromTarget = parseRenderedNoteTarget(blockIdFromTarget);
    if (parsedFromTarget) {
      return parsedFromTarget;
    }

    const doc = this.#deps?.getViewportHost()?.ownerDocument ?? document;
    if (typeof doc.elementsFromPoint !== 'function') {
      return null;
    }

    for (const element of doc.elementsFromPoint(clientX, clientY)) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const blockId = element.closest('[data-block-id]')?.getAttribute('data-block-id') ?? '';
      const parsed = parseRenderedNoteTarget(blockId);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  #focusEditorAtFirstPosition(): void {
    const editor = this.#deps?.getActiveEditor() ?? this.#deps?.getEditor();
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
    this.#focusEditorView(editor?.view);
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
    const editor = this.#deps?.getActiveEditor() ?? this.#deps?.getEditor();
    const view = editor?.view;
    const editorDom = view?.dom as HTMLElement | undefined;
    if (!editorDom) return;

    const active = document.activeElement as HTMLElement | null;
    const activeIsEditor = active === editorDom || (!!active && editorDom.contains?.(active));

    // In presentation mode the hidden editor can keep an in-DOM selection while
    // native focus still sits on a stale body editor or a layout surface. The
    // actual activeElement decides where keyboard input goes, so only skip the
    // focus handoff when the browser is already focused inside this editor.
    if (activeIsEditor) {
      // Hidden story editors still need ProseMirror to replay the current PM
      // selection into the off-screen DOM after pointer-driven selection
      // updates on the rendered surface.
      this.#focusEditorView(view);
      return;
    }

    if (active instanceof HTMLElement) {
      active.blur();
    }

    editorDom.focus();
    this.#focusEditorView(view);
  }

  #focusEditorView(view: { focus?: (() => void) | undefined } | null | undefined): void {
    if (typeof view?.focus !== 'function') {
      return;
    }

    try {
      view.focus();
    } catch {
      // Ignore focus failures from stale or test-only views.
    }
  }

  #handleRepeatClickOnActiveComment(event: PointerEvent, target: HTMLElement | null, editor: Editor): boolean {
    const activeThreadId = getActiveCommentThreadId(editor);

    if (!shouldIgnoreRepeatClickOnActiveComment(target, event.clientX, event.clientY, activeThreadId)) {
      return false;
    }

    event.preventDefault();
    editor.emit?.('commentsUpdate', {
      type: comments_module_events.SELECTED,
      activeCommentId: activeThreadId,
    });

    return true;
  }

  #syncNonBodyCommentActivation(event: PointerEvent, target: HTMLElement | null, editor: Editor): void {
    this.#syncNonBodyCommentSelection(event, target, editor);
  }

  #resolveHeaderFooterCommentThreadIdFromGeometry(clientX: number, clientY: number): string | null {
    const sessionMode = this.#deps?.getHeaderFooterSession()?.session?.mode ?? 'body';
    if (sessionMode !== 'header' && sessionMode !== 'footer') {
      return null;
    }

    const viewportHost = this.#deps?.getViewportHost();
    if (!viewportHost) {
      return null;
    }

    const activeSurfaceSelector = sessionMode === 'footer' ? '.superdoc-page-footer' : '.superdoc-page-header';
    const annotationSelector = [
      `${activeSurfaceSelector} ${COMMENT_HIGHLIGHT_SELECTOR}`,
      `${activeSurfaceSelector} ${TRACK_CHANGE_SELECTOR}`,
      `${activeSurfaceSelector} ${PM_TRACK_CHANGE_SELECTOR}`,
    ].join(', ');
    const annotationElements = Array.from(viewportHost.querySelectorAll<HTMLElement>(annotationSelector));

    return resolveCommentThreadIdFromGeometry(annotationElements, clientX, clientY);
  }

  #syncNonBodyCommentSelection(
    event: PointerEvent,
    target: HTMLElement | null,
    editor: Editor,
    { clearOnMiss = false }: { clearOnMiss?: boolean } = {},
  ): void {
    const clickedThreadId =
      resolveCommentThreadIdNearPointer(target, event.clientX, event.clientY) ??
      this.#resolveHeaderFooterCommentThreadIdFromGeometry(event.clientX, event.clientY);
    const activeThreadId = getActiveCommentThreadId(editor);

    if (!clickedThreadId) {
      if (!clearOnMiss || !activeThreadId) {
        return;
      }

      editor.emit?.('commentsUpdate', {
        type: comments_module_events.SELECTED,
        activeCommentId: null,
      });
      return;
    }

    if (clickedThreadId === activeThreadId) {
      return;
    }

    editor.emit?.('commentsUpdate', {
      type: comments_module_events.SELECTED,
      activeCommentId: clickedThreadId,
    });
  }

  #handleSingleCommentHighlightClick(event: PointerEvent, target: HTMLElement | null, editor: Editor): boolean {
    // Direct hits on inline annotated text should not be intercepted here.
    // Let generic click-to-position place the caret at the clicked pixel.
    if (isDirectSingleCommentHighlightHit(target) || isDirectTrackedChangeHit(target)) {
      return false;
    }

    const clickedThreadId = resolveCommentThreadIdNearPointer(target, event.clientX, event.clientY);
    if (!clickedThreadId) {
      return false;
    }

    const activeThreadId = getActiveCommentThreadId(editor);
    if (clickedThreadId === activeThreadId) {
      return false;
    }

    event.preventDefault();

    const didSetCursor = editor.commands?.setCursorById?.(clickedThreadId, {
      activeCommentId: clickedThreadId,
    });

    if (!didSetCursor) {
      editor.emit?.('commentsUpdate', {
        type: comments_module_events.SELECTED,
        activeCommentId: clickedThreadId,
      });
    }

    return true;
  }
}
