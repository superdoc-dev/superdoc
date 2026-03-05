import type { Layout, Page } from '@superdoc/contracts';

/**
 * Finds the page index containing a given PM position by scanning fragment ranges.
 */
export function findPageIndexForPosition(layout: Layout, pos: number): number | null {
  for (let idx = 0; idx < layout.pages.length; idx++) {
    const page = layout.pages[idx];
    for (const fragment of page.fragments) {
      const frag = fragment as { pmStart?: number; pmEnd?: number };
      if (frag.pmStart != null && frag.pmEnd != null && pos >= frag.pmStart && pos <= frag.pmEnd) {
        return idx;
      }
    }
  }
  return null;
}

/**
 * Computes the scroll Y offset for a given page index using cumulative page heights.
 * Matches the DomPainter virtualizer's prefix-sum approach.
 */
export function computePageScrollOffset(
  layout: Layout,
  pageIndex: number,
  pageGap: number,
  defaultPageHeight: number,
): number {
  let yPosition = 0;
  for (let i = 0; i < pageIndex; i++) {
    const pageHeight = layout.pages[i]?.size?.h ?? defaultPageHeight;
    yPosition += pageHeight + pageGap;
  }
  return yPosition;
}

/**
 * Finds the most specific DOM element containing a position within a page element.
 * Returns the element with the smallest [data-pm-start, data-pm-end] range that
 * contains pos, skipping header/footer fragments.
 */
export function findElementAtPosition(pageEl: HTMLElement, pos: number): HTMLElement | null {
  const elements = Array.from(pageEl.querySelectorAll('[data-pm-start][data-pm-end]'));
  let bestMatch: HTMLElement | null = null;
  let smallestRange = Infinity;

  for (const el of elements) {
    const htmlEl = el as HTMLElement;
    if (htmlEl.closest('.superdoc-page-header, .superdoc-page-footer')) continue;

    const start = Number(htmlEl.dataset.pmStart);
    const end = Number(htmlEl.dataset.pmEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    if (pos >= start && pos <= end) {
      const range = end - start;
      if (range < smallestRange) {
        smallestRange = range;
        bestMatch = htmlEl;
      }
    }
  }
  return bestMatch;
}

/**
 * Polls for a page element to appear in the DOM (for virtualized pages).
 * Returns true if the page mounted within the timeout, false otherwise.
 */
export function waitForPageMount(
  getPageElement: (pageIndex: number) => HTMLElement | null,
  pageIndex: number,
  timeout = 2000,
): Promise<boolean> {
  const startTime = performance.now();

  return new Promise((resolve) => {
    const checkPage = () => {
      if (getPageElement(pageIndex)) {
        resolve(true);
        return;
      }
      if (performance.now() - startTime >= timeout) {
        resolve(false);
        return;
      }
      requestAnimationFrame(checkPage);
    };
    checkPage();
  });
}
