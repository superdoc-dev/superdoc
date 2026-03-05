interface Page {
  size?: { w?: number; h?: number };
}

interface ViewportElements {
  viewportHost: HTMLElement;
  painterHost: HTMLElement;
  selectionOverlay: HTMLElement;
}

interface ZoomParams {
  zoom: number;
  layoutMode: 'vertical' | 'horizontal' | 'book';
  isSemanticFlow: boolean;
  pages: Page[] | undefined;
  pageGap: number;
  defaultWidth: number;
  defaultHeight: number;
}

/**
 * Applies CSS transform zoom to viewport elements.
 *
 * Computes document dimensions from per-page sizes and applies:
 * 1. Scaled dimensions on viewportHost (for scroll container sizing)
 * 2. Unscaled dimensions + transform:scale on painterHost and selectionOverlay
 *
 * This ensures both visual rendering AND scroll container dimensions are correct.
 * CSS transform:scale() only affects visual rendering, not layout box dimensions,
 * so negative marginBottom compensates for the difference at zoom < 1.
 */
export function applyViewportZoom(elements: ViewportElements, params: ZoomParams): void {
  const { viewportHost, painterHost, selectionOverlay } = elements;
  const { zoom, layoutMode, isSemanticFlow, pages, pageGap, defaultWidth, defaultHeight } = params;

  if (isSemanticFlow) {
    viewportHost.style.width = '100%';
    viewportHost.style.minWidth = '';
    viewportHost.style.minHeight = '';
    viewportHost.style.transform = '';

    painterHost.style.width = '100%';
    painterHost.style.minHeight = '';
    painterHost.style.transformOrigin = '';
    painterHost.style.transform = '';

    selectionOverlay.style.width = '100%';
    selectionOverlay.style.height = '100%';
    selectionOverlay.style.transformOrigin = '';
    selectionOverlay.style.transform = '';
    return;
  }

  let maxWidth = defaultWidth;
  let maxHeight = defaultHeight;
  let totalWidth = 0;
  let totalHeight = 0;

  if (Array.isArray(pages) && pages.length > 0) {
    pages.forEach((page, index) => {
      const pageWidth = page.size && typeof page.size.w === 'number' && page.size.w > 0 ? page.size.w : defaultWidth;
      const pageHeight = page.size && typeof page.size.h === 'number' && page.size.h > 0 ? page.size.h : defaultHeight;
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

  if (layoutMode === 'horizontal') {
    const scaledWidth = totalWidth * zoom;
    const scaledHeight = maxHeight * zoom;

    viewportHost.style.width = `${scaledWidth}px`;
    viewportHost.style.minWidth = `${scaledWidth}px`;
    viewportHost.style.minHeight = `${scaledHeight}px`;
    viewportHost.style.height = '';
    viewportHost.style.overflow = '';
    viewportHost.style.transform = '';

    painterHost.style.width = `${totalWidth}px`;
    painterHost.style.minHeight = `${maxHeight}px`;
    painterHost.style.marginBottom = zoom !== 1 ? `${maxHeight * zoom - maxHeight}px` : '';
    painterHost.style.transformOrigin = 'top left';
    painterHost.style.transform = zoom === 1 ? '' : `scale(${zoom})`;

    selectionOverlay.style.width = `${totalWidth}px`;
    selectionOverlay.style.height = `${maxHeight}px`;
    selectionOverlay.style.transformOrigin = 'top left';
    selectionOverlay.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
    return;
  }

  // Vertical layout
  const scaledWidth = maxWidth * zoom;
  const scaledHeight = totalHeight * zoom;

  viewportHost.style.width = `${scaledWidth}px`;
  viewportHost.style.minWidth = `${scaledWidth}px`;
  viewportHost.style.minHeight = `${scaledHeight}px`;
  viewportHost.style.height = '';
  viewportHost.style.overflow = '';
  viewportHost.style.transform = '';

  painterHost.style.width = `${maxWidth}px`;
  painterHost.style.minHeight = `${totalHeight}px`;
  painterHost.style.marginBottom = zoom !== 1 ? `${totalHeight * zoom - totalHeight}px` : '';
  painterHost.style.transformOrigin = 'top left';
  painterHost.style.transform = zoom === 1 ? '' : `scale(${zoom})`;

  selectionOverlay.style.width = `${maxWidth}px`;
  selectionOverlay.style.height = `${totalHeight}px`;
  selectionOverlay.style.transformOrigin = 'top left';
  selectionOverlay.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
}
