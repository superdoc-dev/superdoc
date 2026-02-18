/**
 * Convert a client (screen) point into layout coordinates relative to the
 * document content.
 *
 * The result accounts for the viewport's scroll offsets, zoom factor, and
 * optional per-page X offsets when the pointer is over a page element.
 *
 * @param options - Context needed to map between client and layout coordinates.
 * @param clientX - The client X position, in screen pixels.
 * @param clientY - The client Y position, in screen pixels.
 * @returns The normalized layout point, or null if inputs are not finite.
 */
export function normalizeClientPoint(
  options: {
    viewportHost: HTMLElement;
    visibleHost: HTMLElement;
    zoom: number;
    getPageOffsetX: (pageIndex: number) => number | null;
    getPageOffsetY: (pageIndex: number) => number | null;
  },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }

  const rect = options.viewportHost.getBoundingClientRect();
  const scrollLeft = options.visibleHost.scrollLeft ?? 0;
  const scrollTop = options.visibleHost.scrollTop ?? 0;

  // Convert from screen coordinates to layout coordinates by dividing by zoom
  const baseX = (clientX - rect.left + scrollLeft) / options.zoom;
  const baseY = (clientY - rect.top + scrollTop) / options.zoom;

  // Adjust X by the actual page offset if the pointer is over a page. This keeps
  // geometry-based hit testing aligned with the centered page content.
  let adjustedX = baseX;
  let adjustedY = baseY;
  const doc = options.visibleHost.ownerDocument ?? document;
  const hitChain = typeof doc.elementsFromPoint === 'function' ? doc.elementsFromPoint(clientX, clientY) : [];
  const pageEl = Array.isArray(hitChain)
    ? (hitChain.find((el) => (el as HTMLElement)?.classList?.contains('superdoc-page')) as HTMLElement | null)
    : null;
  if (pageEl) {
    const pageIndex = Number(pageEl.dataset.pageIndex ?? 'NaN');
    if (Number.isFinite(pageIndex)) {
      const pageOffsetX = options.getPageOffsetX(pageIndex);
      if (pageOffsetX != null) {
        adjustedX = baseX - pageOffsetX;
      }
      const pageOffsetY = options.getPageOffsetY(pageIndex);
      if (pageOffsetY != null) {
        adjustedY = baseY - pageOffsetY;
      }
    }
  }

  return {
    x: adjustedX,
    y: adjustedY,
  };
}

/**
 * Convert layout coordinates back into client (screen) coordinates.
 *
 * The result accounts for zoom, viewport scroll, and optional per-page offsets.
 * When a height is provided, it is scaled by the zoom factor.
 *
 * @param options - Context needed to map between layout and client coordinates.
 * @param layoutX - The layout X position, in document units.
 * @param layoutY - The layout Y position, in document units.
 * @param pageIndex - Optional page index used to apply per-page offsets.
 * @param height - Optional layout height to scale into screen pixels.
 * @returns The client-space point (and optional height), or null if inputs are not finite.
 */
export function denormalizeClientPoint(
  options: {
    viewportHost: HTMLElement;
    visibleHost: HTMLElement;
    zoom: number;
    getPageOffsetX: (pageIndex: number) => number | null;
    getPageOffsetY: (pageIndex: number) => number | null;
  },
  layoutX: number,
  layoutY: number,
  pageIndex?: number,
  height?: number,
): { x: number; y: number; height?: number } | null {
  if (!Number.isFinite(layoutX) || !Number.isFinite(layoutY)) {
    return null;
  }

  let pageOffsetX = 0;
  let pageOffsetY = 0;

  // Convert from layout coordinates to screen coordinates by multiplying by zoom
  // and reversing the scroll/viewport offsets.
  if (Number.isFinite(pageIndex)) {
    pageOffsetX = options.getPageOffsetX(Number(pageIndex)) ?? 0;

    pageOffsetY = options.getPageOffsetY(Number(pageIndex)) ?? 0;
  }

  const rect = options.viewportHost.getBoundingClientRect();
  const scrollLeft = options.visibleHost.scrollLeft ?? 0;
  const scrollTop = options.visibleHost.scrollTop ?? 0;
  const result: { x: number; y: number; height?: number } = {
    x: (layoutX + pageOffsetX) * options.zoom + rect.left - scrollLeft,
    y: (layoutY + pageOffsetY) * options.zoom + rect.top - scrollTop,
  };
  if (Number.isFinite(height)) {
    result['height'] = height * options.zoom;
  }
  return result;
}
