/**
 * Coordinates in overlay space (absolute positioning relative to the overlay container).
 */
type OverlayCoords = { x: number; y: number };

/**
 * Represents a rectangular selection region in layout space.
 *
 * @remarks
 * Coordinates are in layout-space units and must be converted to overlay coordinates
 * for rendering. The pageIndex identifies which page the rectangle belongs to.
 */
export type LayoutRect = { pageIndex: number; x: number; y: number; width: number; height: number };

/**
 * Represents a caret position in layout space.
 *
 * @remarks
 * Unlike LayoutRect, caret has no width (rendered as a 2px line). The height represents
 * the visual height of the caret at the insertion point.
 */
export type CaretLayoutRect = { pageIndex: number; x: number; y: number; height: number };

/**
 * Dependencies required for rendering selection rectangles.
 */
export type RenderSelectionRectsDeps = {
  /** The DOM element that will contain the rendered selection rectangles */
  localSelectionLayer: HTMLElement;
  /** Array of layout-space rectangles representing the selection regions */
  rects: LayoutRect[];
  /** Height of each page in layout units */
  pageHeight: number;
  /** Vertical gap between pages in layout units */
  pageGap: number;
  /** Function to convert page-local coordinates to overlay coordinates, returns null if page is not visible */
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => OverlayCoords | null;
};

/**
 * Renders selection highlight rectangles by creating and appending DOM elements to the overlay layer.
 *
 * @param deps - Dependencies containing the selection layer, rectangles, and coordinate conversion function
 *
 * @remarks
 * This function creates individual div elements for each selection rectangle with:
 * - Semi-transparent blue background (rgba(51, 132, 255, 0.35))
 * - 2px border radius for visual polish
 * - Absolute positioning in overlay coordinates
 * - Pointer-events: none to allow interaction with underlying content
 *
 * Rectangles for pages that are not currently visible (convertPageLocalToOverlayCoords returns null)
 * are silently skipped. Width and height are in layout space; CSS transforms on the viewport
 * host handle scaling to screen coordinates.
 *
 * The function does not clear existing children from localSelectionLayer - callers should
 * clear it before calling if needed.
 */
export function renderSelectionRects({
  localSelectionLayer,
  rects,
  pageHeight,
  pageGap,
  convertPageLocalToOverlayCoords,
}: RenderSelectionRectsDeps): void {
  rects.forEach((rect) => {
    const pageLocalY = rect.y - rect.pageIndex * (pageHeight + pageGap);
    const coords = convertPageLocalToOverlayCoords(rect.pageIndex, rect.x, pageLocalY);
    if (!coords) {
      return;
    }
    const highlight = localSelectionLayer.ownerDocument?.createElement('div');
    if (!highlight) {
      return;
    }
    highlight.className = 'presentation-editor__selection-rect';
    highlight.style.position = 'absolute';
    highlight.style.left = `${coords.x}px`;
    highlight.style.top = `${coords.y}px`;
    // Width and height are in layout space - the transform on #viewportHost handles scaling
    highlight.style.width = `${Math.max(1, rect.width)}px`;
    highlight.style.height = `${Math.max(1, rect.height)}px`;
    highlight.style.backgroundColor = 'rgba(51, 132, 255, 0.35)';
    highlight.style.borderRadius = '2px';
    highlight.style.pointerEvents = 'none';
    localSelectionLayer.appendChild(highlight);
  });
}

/**
 * Dependencies required for rendering the caret overlay.
 */
export type RenderCaretOverlayDeps = {
  /** The DOM element that will contain the rendered caret */
  localSelectionLayer: HTMLElement;
  /** The caret position and dimensions in layout space */
  caretLayout: CaretLayoutRect;
  /** Function to convert page-local coordinates to overlay coordinates, returns null if page is not visible */
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => OverlayCoords | null;
};

/**
 * Renders the text cursor (caret) by creating and appending a DOM element to the overlay layer.
 *
 * @param deps - Dependencies containing the selection layer, caret position, and coordinate conversion function
 *
 * @remarks
 * This function creates a single div element representing the text cursor with:
 * - 2px width and height from caretLayout
 * - Black color (#000000)
 * - 1px border radius for visual polish
 * - Absolute positioning in overlay coordinates
 * - Pointer-events: none to allow interaction with underlying content
 *
 * If the caret's page is not currently visible (convertPageLocalToOverlayCoords returns null),
 * no caret element is created. The height is in layout space; CSS transforms on the viewport
 * host handle scaling to screen coordinates.
 *
 * The function does not clear existing children from localSelectionLayer - callers should
 * clear it before calling if a fresh render is needed.
 */
export function renderCaretOverlay({
  localSelectionLayer,
  caretLayout,
  convertPageLocalToOverlayCoords,
}: RenderCaretOverlayDeps): void {
  const coords = convertPageLocalToOverlayCoords(caretLayout.pageIndex, caretLayout.x, caretLayout.y);
  if (!coords) {
    return;
  }

  // Height is in layout space - the transform on #viewportHost handles scaling
  const finalHeight = Math.max(1, caretLayout.height);

  const caretEl = localSelectionLayer.ownerDocument?.createElement('div');
  if (!caretEl) {
    return;
  }
  caretEl.className = 'presentation-editor__selection-caret';
  caretEl.style.position = 'absolute';
  caretEl.style.left = `${coords.x}px`;
  caretEl.style.top = `${coords.y}px`;
  caretEl.style.width = '2px';
  caretEl.style.height = `${finalHeight}px`;
  caretEl.style.backgroundColor = '#000000';
  caretEl.style.borderRadius = '1px';
  caretEl.style.pointerEvents = 'none';
  localSelectionLayer.appendChild(caretEl);
}
