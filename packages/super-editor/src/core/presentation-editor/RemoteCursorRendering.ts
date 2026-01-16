import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import { selectionToRects, type PageGeometryHelper } from '@superdoc/layout-bridge';

import type { RemoteCursorState } from './PresentationEditor.js';
import { validateCursorColor } from './RemoteCursorColors.js';

/**
 * Rectangle in layout space representing a selection highlight area.
 */
type LayoutRect = { x: number; y: number; width: number; height: number; pageIndex: number };

/**
 * Caret geometry in page-local layout space.
 */
type CaretLayout = { pageIndex: number; x: number; y: number; height: number };

/**
 * Style constants for remote cursor rendering.
 *
 * @remarks
 * These values are centralized to ensure consistent visual appearance across all remote cursors.
 */
type CursorStyles = {
  /** Width of the caret line in pixels */
  CARET_WIDTH: number;
  /** Font size for user name labels in pixels */
  LABEL_FONT_SIZE: number;
  /** CSS padding value for labels (e.g., "2px 4px") */
  LABEL_PADDING: string;
  /** CSS offset value for label positioning (e.g., "-18px") */
  LABEL_OFFSET: string;
  /** CSS border-radius value for selection highlights */
  SELECTION_BORDER_RADIUS: string;
  /** Maximum character length for user name labels before truncation */
  MAX_LABEL_LENGTH: number;
};

/**
 * Presence feature configuration options.
 *
 * @remarks
 * This type mirrors the public API's presence options but is defined locally to avoid
 * circular dependencies and maintain flexibility for internal implementation changes.
 */
type PresenceOptionsLike = {
  /** Whether presence rendering is enabled */
  enabled?: boolean;
  /** Maximum number of remote cursors to render simultaneously (performance guardrail) */
  maxVisible?: number;
  /** Whether to show user name labels above carets */
  showLabels?: boolean;
  /** Opacity value for selection highlights (0-1 range) */
  highlightOpacity?: number;
  /** Custom formatter for user name labels */
  labelFormatter?: (user: RemoteCursorState['user']) => string;
};

/**
 * Renders all remote cursors and selections for collaborative editing.
 *
 * This function is the main entry point for rendering presence awareness. It orchestrates
 * the rendering of carets and selection highlights for all connected remote users, applying
 * performance guardrails and managing the lifecycle of DOM elements.
 *
 * @param options - Configuration object containing all dependencies and state
 *
 * @remarks
 * Performance guardrails:
 * - Limits the number of visible remote cursors using maxVisible (default: 20)
 * - Sorts cursors by most recent update to show the most active users
 * - Limits selection rectangles per user to prevent DOM explosion
 * - Uses GPU-accelerated transforms for smooth cursor movement
 * - Reuses existing DOM elements when possible to minimize DOM churn
 *
 * Rendering strategy:
 * - Clears old selection rectangles before rendering new state to prevent "stuck" selections
 * - Distinguishes between collapsed selections (caret-only) and range selections
 * - Removes DOM elements for clients that are no longer in the visible set
 * - Gracefully handles virtualized pages by fading out cursors on unmounted pages
 *
 * The function delegates to renderRemoteCaret for caret rendering and renderRemoteSelection
 * for selection highlight rendering, maintaining separation of concerns.
 *
 * @example
 * ```typescript
 * renderRemoteCursors({
 *   layout,
 *   blocks,
 *   measures,
 *   pageGeometryHelper,
 *   presence: { enabled: true, maxVisible: 10, showLabels: true },
 *   remoteCursorState: stateMap,
 *   remoteCursorElements: elementMap,
 *   remoteCursorOverlay: overlayElement,
 *   doc: document,
 *   computeCaretLayoutRect,
 *   convertPageLocalToOverlayCoords,
 *   fallbackColors,
 *   cursorStyles,
 *   maxSelectionRectsPerUser: 50,
 *   defaultPageHeight: 792,
 *   fallbackPageHeight: 792
 * });
 * ```
 */
export function renderRemoteCursors(options: {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  pageGeometryHelper: PageGeometryHelper | null;
  presence: PresenceOptionsLike | undefined;
  remoteCursorState: Map<number, RemoteCursorState>;
  remoteCursorElements: Map<number, HTMLElement>;
  remoteCursorOverlay: HTMLElement | null;
  doc: Document;
  computeCaretLayoutRect: (pos: number) => CaretLayout | null;
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => { x: number; y: number } | null;
  fallbackColors: readonly string[];
  cursorStyles: CursorStyles;
  maxSelectionRectsPerUser: number;
  defaultPageHeight: number;
  fallbackPageHeight: number;
}): void {
  const layout = options.layout;
  const blocks = options.blocks;
  const measures = options.measures;

  // Apply performance guardrails: maxVisible limit
  const maxVisible = options.presence?.maxVisible ?? 20;
  const sortedCursors = Array.from(options.remoteCursorState.values())
    .sort((a, b) => b.updatedAt - a.updatedAt) // Most recent first
    .slice(0, maxVisible);

  // Track which clientIds are currently visible
  const visibleClientIds = new Set<number>();

  // Render/update each remote cursor
  sortedCursors.forEach((cursor) => {
    visibleClientIds.add(cursor.clientId);

    // Clear old selection rectangles for this user before rendering new state.
    // Selection rects are not tracked in remoteCursorElements (only carets are),
    // so we must query and remove them to prevent "stuck" selections when a user's
    // selection changes position or collapses to a caret.
    const oldSelections = options.remoteCursorOverlay?.querySelectorAll(
      `.presentation-editor__remote-selection[data-client-id="${cursor.clientId}"]`,
    );
    oldSelections?.forEach((el) => el.remove());

    if (cursor.anchor === cursor.head) {
      // Render caret only
      renderRemoteCaret({
        cursor,
        presence: options.presence,
        remoteCursorElements: options.remoteCursorElements,
        remoteCursorOverlay: options.remoteCursorOverlay,
        doc: options.doc,
        computeCaretLayoutRect: options.computeCaretLayoutRect,
        convertPageLocalToOverlayCoords: options.convertPageLocalToOverlayCoords,
        fallbackColors: options.fallbackColors,
        cursorStyles: options.cursorStyles,
      });
    } else {
      // Render selection + caret at head
      renderRemoteSelection({
        cursor,
        layout,
        blocks,
        measures,
        pageGeometryHelper: options.pageGeometryHelper,
        presence: options.presence,
        remoteCursorOverlay: options.remoteCursorOverlay,
        doc: options.doc,
        convertPageLocalToOverlayCoords: options.convertPageLocalToOverlayCoords,
        fallbackColors: options.fallbackColors,
        cursorStyles: options.cursorStyles,
        maxSelectionRectsPerUser: options.maxSelectionRectsPerUser,
        defaultPageHeight: options.defaultPageHeight,
        fallbackPageHeight: options.fallbackPageHeight,
        renderCaret: () =>
          renderRemoteCaret({
            cursor,
            presence: options.presence,
            remoteCursorElements: options.remoteCursorElements,
            remoteCursorOverlay: options.remoteCursorOverlay,
            doc: options.doc,
            computeCaretLayoutRect: options.computeCaretLayoutRect,
            convertPageLocalToOverlayCoords: options.convertPageLocalToOverlayCoords,
            fallbackColors: options.fallbackColors,
            cursorStyles: options.cursorStyles,
          }),
      });
    }
  });

  // Remove DOM elements for clients that are no longer visible
  options.remoteCursorElements.forEach((element, clientId) => {
    if (!visibleClientIds.has(clientId)) {
      element.remove();
      options.remoteCursorElements.delete(clientId);
    }
  });
}

/**
 * Renders or updates a single remote caret (cursor position indicator).
 *
 * This function creates a vertical colored line representing another user's cursor position,
 * optionally with a user name label above it. It uses GPU-accelerated CSS transforms for
 * smooth movement and handles visibility states for virtualized pages.
 *
 * @param options - Configuration object containing cursor state and rendering dependencies
 *
 * @remarks
 * GPU-accelerated positioning:
 * - Uses CSS transform: translate() instead of left/top for smooth 60fps movement
 * - Sets will-change: transform to hint browser optimization
 * - Applies 50ms transition for smooth interpolation between positions
 *
 * Element lifecycle:
 * - Reuses existing DOM elements when available to minimize DOM churn
 * - Creates new elements only for first-time cursors
 * - Sets opacity: 0 when caret layout cannot be computed (virtualized pages)
 * - Sets opacity: 1 when caret is successfully positioned
 *
 * Label rendering:
 * - Labels are rendered as child elements of the caret
 * - Positioned above the caret using CSS offset
 * - Truncated to MAX_LABEL_LENGTH to prevent oversized labels
 * - Formatted using presence.labelFormatter if provided
 * - Can be disabled via presence.showLabels option
 *
 * Styling:
 * - Border-left with color and width to create vertical line
 * - Height matches the line height at the cursor position
 * - Pointer-events: none to allow clicks to pass through
 * - ARIA-hidden for accessibility (not meaningful to screen readers)
 *
 * @example
 * ```typescript
 * renderRemoteCaret({
 *   cursor: { clientId: 123, head: 42, anchor: 42, user: { name: "Alice", color: "#ff0000" } },
 *   presence: { showLabels: true },
 *   remoteCursorElements,
 *   remoteCursorOverlay,
 *   doc: document,
 *   computeCaretLayoutRect,
 *   convertPageLocalToOverlayCoords,
 *   fallbackColors,
 *   cursorStyles
 * });
 * ```
 */
function renderRemoteCaret(options: {
  cursor: RemoteCursorState;
  presence: PresenceOptionsLike | undefined;
  remoteCursorElements: Map<number, HTMLElement>;
  remoteCursorOverlay: HTMLElement | null;
  doc: Document;
  computeCaretLayoutRect: (pos: number) => CaretLayout | null;
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => { x: number; y: number } | null;
  fallbackColors: readonly string[];
  cursorStyles: CursorStyles;
}): void {
  // Use existing geometry helper to get caret layout rect
  const caretLayout = options.computeCaretLayoutRect(options.cursor.head);
  const color = validateCursorColor(options.cursor.user.color, options.cursor.clientId, options.fallbackColors);

  // Check if we already have a DOM element for this client
  let caretEl = options.remoteCursorElements.get(options.cursor.clientId);
  const isNewElement = !caretEl;

  if (isNewElement) {
    // Create new caret element
    caretEl = options.doc.createElement('div');
    caretEl.className = 'presentation-editor__remote-caret';
    caretEl.style.position = 'absolute';
    caretEl.style.width = `${options.cursorStyles.CARET_WIDTH}px`;
    caretEl.style.borderLeft = `${options.cursorStyles.CARET_WIDTH}px solid ${color}`;
    caretEl.style.pointerEvents = 'none';
    // GPU-accelerated transitions for smooth movement
    caretEl.style.transition = 'transform 50ms ease-out, height 50ms ease-out, opacity 100ms ease-out';
    caretEl.style.willChange = 'transform';
    caretEl.setAttribute('data-client-id', options.cursor.clientId.toString());
    caretEl.setAttribute('aria-hidden', 'true');

    // Add label if enabled
    if (options.presence?.showLabels !== false) {
      renderRemoteCursorLabel({
        caretEl,
        cursor: options.cursor,
        presence: options.presence,
        doc: options.doc,
        fallbackColors: options.fallbackColors,
        cursorStyles: options.cursorStyles,
      });
    }

    options.remoteCursorElements.set(options.cursor.clientId, caretEl);
    options.remoteCursorOverlay?.appendChild(caretEl);
  }

  // Handle case where position can't be computed or page is virtualized
  if (!caretLayout) {
    caretEl!.style.opacity = '0';
    return;
  }

  const coords = options.convertPageLocalToOverlayCoords(caretLayout.pageIndex, caretLayout.x, caretLayout.y);
  if (!coords) {
    caretEl!.style.opacity = '0';
    return;
  }

  // Update position using transform for GPU acceleration
  caretEl!.style.opacity = '1';
  caretEl!.style.transform = `translate(${coords.x}px, ${coords.y}px)`;
  // Height is in layout space - the transform on the viewport handles scaling
  caretEl!.style.height = `${Math.max(1, caretLayout.height)}px`;

  // Update color in case it changed
  caretEl!.style.borderLeftColor = color;

  // Update label background color if it exists
  const labelEl = caretEl!.querySelector('.presentation-editor__remote-label') as HTMLElement | null;
  if (labelEl) {
    labelEl.style.backgroundColor = color;
  }
}

/**
 * Renders a user name label above a remote caret.
 *
 * This function creates a small colored badge displaying the remote user's name or email.
 * The label uses the same color as the caret for visual consistency.
 *
 * @param options - Configuration object containing caret element, user data, and styling
 *
 * @remarks
 * Label text priority:
 * 1. Custom labelFormatter result if provided in presence options
 * 2. User name if available
 * 3. User email if name is unavailable
 * 4. "Anonymous" as final fallback
 *
 * Label truncation:
 * - Long names are truncated to MAX_LABEL_LENGTH characters
 * - Truncated names end with an ellipsis (…) for clarity
 * - Prevents layout issues from oversized labels
 *
 * Styling:
 * - Background color matches the caret color for visual consistency
 * - White text for contrast against colored background
 * - Positioned above the caret using absolute positioning
 * - Border-radius for rounded corners
 * - WhiteSpace: nowrap prevents text wrapping
 * - Pointer-events: none allows clicks to pass through
 * - Title attribute shows full name on hover
 *
 * @example
 * ```typescript
 * renderRemoteCursorLabel({
 *   caretEl: caretDomElement,
 *   cursor: { user: { name: "Alice Cooper", email: "alice@example.com", color: "#ff0000" } },
 *   presence: { labelFormatter: (user) => user.name.split(' ')[0] },
 *   doc: document,
 *   fallbackColors,
 *   cursorStyles
 * });
 * ```
 */
function renderRemoteCursorLabel(options: {
  caretEl: HTMLElement;
  cursor: RemoteCursorState;
  presence: PresenceOptionsLike | undefined;
  doc: Document;
  fallbackColors: readonly string[];
  cursorStyles: CursorStyles;
}): void {
  const labelFormatter = options.presence?.labelFormatter;
  let labelText = labelFormatter
    ? labelFormatter(options.cursor.user)
    : options.cursor.user.name || options.cursor.user.email || 'Anonymous';

  // Truncate very long names to prevent layout issues with oversized labels
  if (labelText.length > options.cursorStyles.MAX_LABEL_LENGTH) {
    labelText = labelText.substring(0, options.cursorStyles.MAX_LABEL_LENGTH - 1) + '…';
  }

  const color = validateCursorColor(options.cursor.user.color, options.cursor.clientId, options.fallbackColors);

  const labelEl = options.doc.createElement('div');
  labelEl.className = 'presentation-editor__remote-label';
  labelEl.textContent = labelText;
  labelEl.style.position = 'absolute';
  labelEl.style.top = options.cursorStyles.LABEL_OFFSET;
  labelEl.style.left = '-1px';
  labelEl.style.fontSize = `${options.cursorStyles.LABEL_FONT_SIZE}px`;
  labelEl.style.backgroundColor = color;
  labelEl.style.color = 'white';
  labelEl.style.padding = options.cursorStyles.LABEL_PADDING;
  labelEl.style.borderRadius = '3px';
  labelEl.style.whiteSpace = 'nowrap';
  labelEl.style.pointerEvents = 'none';
  labelEl.title = `${options.cursor.user.name || options.cursor.user.email} – editing`;

  options.caretEl.appendChild(labelEl);
}

/**
 * Renders selection highlight rectangles for a remote user's text selection.
 *
 * This function creates semi-transparent colored rectangles over the text ranges selected by
 * a remote user. It handles multi-line selections, multi-page selections, and backward selections,
 * and includes a caret at the head position to indicate selection direction.
 *
 * @param options - Configuration object containing cursor state, layout data, and rendering dependencies
 *
 * @remarks
 * Selection rectangle generation:
 * - Uses selectionToRects from layout-bridge to compute accurate rectangles
 * - Handles multi-line selections (multiple rects per selection)
 * - Handles multi-page selections (rects on different pages)
 * - Normalizes anchor/head order to handle backward selections
 *
 * Performance guardrails:
 * - Limits the number of rectangles per user to maxSelectionRectsPerUser (prevents DOM explosion)
 * - Skips rendering rectangles on virtualized (unmounted) pages
 * - Creates fresh DOM elements for each render (old ones were removed in renderRemoteCursors)
 *
 * Coordinate transformation:
 * - Converts layout-space coordinates to overlay-space coordinates
 * - Accounts for page stacking (multi-page layout with gaps)
 * - Handles zoom transforms applied to the viewport
 *
 * Styling:
 * - Semi-transparent background using user's color and presence.highlightOpacity
 * - Border-radius for slightly rounded corners
 * - Pointer-events: none allows clicks to pass through
 * - Data attribute data-client-id for debugging and cleanup
 * - ARIA-hidden for accessibility
 *
 * Caret rendering:
 * - Also renders a caret at the head position to indicate selection direction
 * - Helps users understand which end of the selection is being extended
 * - Delegates to renderCaret callback
 *
 * @example
 * ```typescript
 * renderRemoteSelection({
 *   cursor: { clientId: 123, anchor: 10, head: 50, user: { color: "#ff0000" } },
 *   layout,
 *   blocks,
 *   measures,
 *   pageGeometryHelper,
 *   presence: { highlightOpacity: 0.35 },
 *   remoteCursorOverlay,
 *   doc: document,
 *   convertPageLocalToOverlayCoords,
 *   fallbackColors,
 *   cursorStyles,
 *   maxSelectionRectsPerUser: 50,
 *   defaultPageHeight: 792,
 *   fallbackPageHeight: 792,
 *   renderCaret: () => renderRemoteCaret(...)
 * });
 * ```
 */
function renderRemoteSelection(options: {
  cursor: RemoteCursorState;
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  pageGeometryHelper: PageGeometryHelper | null;
  presence: PresenceOptionsLike | undefined;
  remoteCursorOverlay: HTMLElement | null;
  doc: Document;
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => { x: number; y: number } | null;
  fallbackColors: readonly string[];
  cursorStyles: CursorStyles;
  maxSelectionRectsPerUser: number;
  defaultPageHeight: number;
  fallbackPageHeight: number;
  renderCaret: () => void;
}): void {
  // Normalize anchor/head order for backward selections
  const start = Math.min(options.cursor.anchor, options.cursor.head);
  const end = Math.max(options.cursor.anchor, options.cursor.head);

  // Get selection rectangles using layout-bridge helper
  const rects =
    selectionToRects(
      options.layout,
      options.blocks,
      options.measures,
      start,
      end,
      options.pageGeometryHelper ?? undefined,
    ) ?? [];

  const color = validateCursorColor(options.cursor.user.color, options.cursor.clientId, options.fallbackColors);
  const opacity = options.presence?.highlightOpacity ?? 0.35;
  const pageHeight = options.layout.pageSize?.h ?? options.fallbackPageHeight ?? options.defaultPageHeight;
  const pageGap = options.layout.pageGap ?? 0;

  // Performance guardrail: max rects per user to prevent DOM explosion
  const limitedRects = rects.slice(0, options.maxSelectionRectsPerUser) as LayoutRect[];

  limitedRects.forEach((rect) => {
    // Calculate page-local Y (rect.y is absolute from top of all pages)
    const pageLocalY = rect.y - rect.pageIndex * (pageHeight + pageGap);

    // Convert to overlay coordinates (handles zoom, scroll, virtualization)
    const coords = options.convertPageLocalToOverlayCoords(rect.pageIndex, rect.x, pageLocalY);
    if (!coords) return; // Page not mounted (virtualized)

    // Create selection rectangle
    const selectionEl = options.doc.createElement('div');
    selectionEl.className = 'presentation-editor__remote-selection';
    selectionEl.style.position = 'absolute';
    selectionEl.style.left = `${coords.x}px`;
    selectionEl.style.top = `${coords.y}px`;
    // Width and height are in layout space - the transform on the viewport handles scaling
    selectionEl.style.width = `${Math.max(1, rect.width)}px`;
    selectionEl.style.height = `${Math.max(1, rect.height)}px`;
    selectionEl.style.backgroundColor = color;
    selectionEl.style.opacity = opacity.toString();
    selectionEl.style.borderRadius = options.cursorStyles.SELECTION_BORDER_RADIUS;
    selectionEl.style.pointerEvents = 'none';
    selectionEl.setAttribute('data-client-id', options.cursor.clientId.toString());
    selectionEl.setAttribute('aria-hidden', 'true');

    options.remoteCursorOverlay?.appendChild(selectionEl);
  });

  // Also render caret at head position to indicate selection direction
  options.renderCaret();
}
