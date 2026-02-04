import { getPageElementByIndex } from './PageDom.js';

/**
 * Calculates the offset of a page element within the viewport.
 *
 * Pages are horizontally centered within the painter host container. When the viewport
 * is wider than the page, this offset must be included in overlay coordinate calculations
 * to prevent selections from appearing shifted left of the actual content.
 *
 * With virtualization enabled, pages may not start at y=0, so we also return the
 * actual Y offset of the page element relative to the viewport.
 *
 * @param options - Configuration object containing DOM elements and page information
 * @returns The offsets in layout-space units, or null if calculation fails
 *
 * @remarks
 * Coordinate spaces:
 * - getBoundingClientRect returns values in screen space (includes zoom transform)
 * - Return values are in layout space (divided by zoom to normalize)
 * - Layout space matches the coordinate system used for overlay positioning
 *
 * The function accounts for:
 * - Horizontal centering of pages within the painter container
 * - Zoom transformation applied to the viewport
 * - Variable page widths (narrower than viewport)
 * - Virtualization spacers that offset page positions
 *
 * Returns null if:
 * - painterHost or viewportHost is null
 * - Page element with matching data-page-index is not found
 */
function getPageOffsets(options: {
  painterHost: HTMLElement | null;
  viewportHost: HTMLElement | null;
  zoom: number;
  pageIndex: number;
}): { x: number; y: number } | null {
  if (!options.painterHost || !options.viewportHost) {
    return null;
  }

  const pageEl = getPageElementByIndex(options.painterHost, options.pageIndex);
  if (!pageEl) return null;

  const pageRect = pageEl.getBoundingClientRect();
  const viewportRect = options.viewportHost.getBoundingClientRect();

  // getBoundingClientRect includes the applied zoom transform; divide by zoom to return
  // layout-space units that match the rest of the overlay math.
  const offsetX = (pageRect.left - viewportRect.left) / options.zoom;
  const offsetY = (pageRect.top - viewportRect.top) / options.zoom;

  return { x: offsetX, y: offsetY };
}

/**
 * Calculates the horizontal offset of a page element within the viewport.
 * @deprecated Use getPageOffsets for both X and Y offsets.
 */
export function getPageOffsetX(options: {
  painterHost: HTMLElement | null;
  viewportHost: HTMLElement | null;
  zoom: number;
  pageIndex: number;
}): number | null {
  return getPageOffsets(options)?.x ?? null;
}

/**
 * Calculates the vertical offset of a page element within the viewport.
 *
 * @param options - Configuration object containing DOM elements and page information.
 * @returns The Y offset in layout-space units, or null if calculation fails.
 */
export function getPageOffsetY(options: {
  painterHost: HTMLElement | null;
  viewportHost: HTMLElement | null;
  zoom: number;
  pageIndex: number;
}): number | null {
  return getPageOffsets(options)?.y ?? null;
}

/**
 * Converts page-local coordinates to overlay-absolute coordinates.
 *
 * This function transforms coordinates from page-relative layout space to the absolute
 * positioning system used by the selection overlay. It handles multi-page layouts,
 * horizontal centering, and validates all input parameters for safety.
 *
 * @param options - Configuration object containing coordinate system parameters
 * @returns Overlay coordinates as {x, y}, or null if validation fails
 *
 * @remarks
 * Coordinate transformation process:
 * 1. Validate input parameters (pageIndex, pageLocalX, pageLocalY must be finite)
 * 2. Calculate horizontal offset for page centering (via getPageOffsetX)
 * 3. Add page stacking offset for multi-page layout (pageIndex * (pageHeight + pageGap))
 * 4. Return final overlay coordinates in layout space
 *
 * Coordinate spaces explained:
 * - Page-local space: Coordinates relative to the top-left corner of a single page
 * - Overlay space: Absolute coordinates within the selection overlay container
 * - Both spaces use layout units (not screen pixels)
 * - Zoom transform is applied to the viewport container (not to coordinate values)
 *
 * Input validation:
 * - pageIndex must be finite and non-negative (warns and returns null otherwise)
 * - pageLocalX must be finite (warns and returns null otherwise)
 * - pageLocalY must be finite (warns and returns null otherwise)
 * - Warnings include diagnostic information for debugging
 *
 * Multi-page layout:
 * - Pages are stacked vertically with gaps between them
 * - Y coordinate includes offset for all pages above the target page
 * - Page stacking formula: pageIndex * (pageHeight + pageGap)
 *
 * Horizontal centering:
 * - Pages are centered within the painter host container
 * - getPageOffsetX calculates the centering offset dynamically
 * - Falls back to 0 offset if calculation fails
 *
 * The zoom transform is applied via CSS transform: scale() on the viewport container,
 * so coordinate calculations remain in layout space rather than screen space.
 *
 * @example
 * ```typescript
 * // Convert a caret position to overlay coordinates
 * const overlayCoords = convertPageLocalToOverlayCoords({
 *   painterHost,
 *   viewportHost,
 *   zoom: 1.0,
 *   pageIndex: 0,
 *   pageLocalX: 100,
 *   pageLocalY: 200,
 *   pageHeight: 792,
 *   pageGap: 20
 * });
 *
 * if (overlayCoords) {
 *   caretElement.style.left = `${overlayCoords.x}px`;
 *   caretElement.style.top = `${overlayCoords.y}px`;
 * }
 * ```
 */
export function convertPageLocalToOverlayCoords(options: {
  painterHost: HTMLElement | null;
  viewportHost: HTMLElement | null;
  zoom: number;
  pageIndex: number;
  pageLocalX: number;
  pageLocalY: number;
  pageHeight: number;
  pageGap: number;
}): { x: number; y: number } | null {
  // Validate pageIndex: must be finite and non-negative
  if (!Number.isFinite(options.pageIndex) || options.pageIndex < 0) {
    console.warn(
      `[PresentationEditor] #convertPageLocalToOverlayCoords: Invalid pageIndex ${options.pageIndex}. ` +
        'Expected a finite non-negative number.',
    );
    return null;
  }

  // Validate pageLocalX: must be finite
  if (!Number.isFinite(options.pageLocalX)) {
    console.warn(
      `[PresentationEditor] #convertPageLocalToOverlayCoords: Invalid pageLocalX ${options.pageLocalX}. ` +
        'Expected a finite number.',
    );
    return null;
  }

  // Validate pageLocalY: must be finite
  if (!Number.isFinite(options.pageLocalY)) {
    console.warn(
      `[PresentationEditor] #convertPageLocalToOverlayCoords: Invalid pageLocalY ${options.pageLocalY}. ` +
        'Expected a finite number.',
    );
    return null;
  }

  // Since zoom is now applied via transform: scale() on #viewportHost (which contains
  // BOTH #painterHost and #selectionOverlay), both are in the same coordinate system.
  // We position overlay elements in layout-space coordinates, and the transform handles scaling.
  //
  // With virtualization, pages may not be at their "natural" y position (pageIndex * (pageHeight + pageGap))
  // because unmounted pages are represented by spacer elements. We use the actual DOM position
  // of the page element to get accurate coordinates that work with both virtualized and non-virtualized modes.
  const pageOffsets = getPageOffsets({
    painterHost: options.painterHost,
    viewportHost: options.viewportHost,
    zoom: options.zoom,
    pageIndex: options.pageIndex,
  });

  // If we can get the actual DOM offsets, use them for accurate positioning
  if (pageOffsets) {
    return {
      x: pageOffsets.x + options.pageLocalX,
      y: pageOffsets.y + options.pageLocalY,
    };
  }

  // Fallback to mathematical calculation for non-mounted pages (shouldn't happen in practice
  // since we return null if the page isn't in the DOM, but kept for safety)
  return {
    x: options.pageLocalX,
    y: options.pageIndex * (options.pageHeight + options.pageGap) + options.pageLocalY,
  };
}
