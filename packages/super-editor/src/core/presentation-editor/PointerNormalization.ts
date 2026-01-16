export function normalizeClientPoint(
  options: {
    viewportHost: HTMLElement;
    visibleHost: HTMLElement;
    zoom: number;
    getPageOffsetX: (pageIndex: number) => number | null;
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
    }
  }

  return {
    x: adjustedX,
    y: baseY,
  };
}
