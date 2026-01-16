/**
 * Finds a page element in the painter host by its page index.
 *
 * Searches through all elements with data-page-index attributes in the painter host
 * and returns the first element whose data-page-index matches the requested pageIndex.
 *
 * @param painterHost - The DOM container hosting the rendered pages
 * @param pageIndex - The zero-based index of the page to find
 * @returns The page element if found, null otherwise
 *
 * @remarks
 * - Returns null if painterHost is null
 * - Uses querySelectorAll with [data-page-index] to find all page elements
 * - Parses data-page-index attribute as base-10 integer for comparison
 * - Returns the first matching element (pages should have unique indices)
 */
export function getPageElementByIndex(painterHost: HTMLElement | null, pageIndex: number): HTMLElement | null {
  if (!painterHost) return null;
  // Page elements have data-page-index attribute
  const pageElements = painterHost.querySelectorAll('[data-page-index]');
  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i] as HTMLElement;
    const dataPageIndex = el.getAttribute('data-page-index');
    if (dataPageIndex && parseInt(dataPageIndex, 10) === pageIndex) {
      return el;
    }
  }
  return null;
}
