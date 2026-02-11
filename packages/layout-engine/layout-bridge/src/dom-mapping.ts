/**
 * DOM-based click-to-position mapping utilities.
 *
 * This module provides pixel-perfect click-to-position mapping by reading actual
 * DOM elements with data attributes (`data-pm-start`, `data-pm-end`). This approach
 * is more accurate than pure geometry-based mapping because it uses the browser's
 * actual rendering and correctly handles ProseMirror position gaps that may occur
 * after document operations like paragraph joins.
 *
 * @module dom-mapping
 */

import { DOM_CLASS_NAMES } from '@superdoc/painter-dom';

// Debug logging for click-to-position pipeline (disabled - enable for debugging)
const DEBUG_CLICK_MAPPING = false;
const log = (...args: unknown[]) => {
  if (DEBUG_CLICK_MAPPING) {
    console.log('[DOM-MAP]', ...args);
  }
};

/**
 * Class names used by the DOM painter for layout elements.
 * These must match the painter's output structure.
 */
const CLASS_NAMES = {
  page: DOM_CLASS_NAMES.PAGE,
  fragment: DOM_CLASS_NAMES.FRAGMENT,
  line: DOM_CLASS_NAMES.LINE,
  tableFragment: DOM_CLASS_NAMES.TABLE_FRAGMENT,
} as const;

/**
 * Maps a click coordinate to a ProseMirror document position using DOM data attributes.
 *
 * This function provides pixel-perfect accuracy by:
 * 1. Finding the fragment element under the click point using `elementsFromPoint`
 * 2. Finding the line element at the Y coordinate
 * 3. Finding the span (text run) at the X coordinate
 * 4. Using binary search with `document.createRange()` to find the exact character boundary
 *
 * The DOM structure must follow this pattern (as produced by the DOM painter):
 * ```
 * <div class="superdoc-page" data-page-index="0">
 *   <div class="superdoc-fragment" data-block-id="...">
 *     <div class="superdoc-line" data-pm-start="2" data-pm-end="19">
 *       <span data-pm-start="2" data-pm-end="12">text content</span>
 *       <span data-pm-start="14" data-pm-end="19">more text</span>
 *     </div>
 *   </div>
 * </div>
 * ```
 *
 * **Important:** This function correctly handles PM position gaps (e.g., 12→14 in the example
 * above) that can occur after document edits. The geometry-based mapping in `clickToPosition`
 * may produce incorrect positions in these cases, which is why DOM mapping should be preferred
 * when available.
 *
 * **Inline SDT Filtering:** Inline structured content (SDT) wrapper elements are automatically
 * excluded from click-to-position mapping. These wrappers (identified by the class
 * `superdoc-structured-content-inline`) have PM position attributes for selection highlighting,
 * but their child spans provide more accurate character-level positioning for clicks. This
 * ensures the caret is placed at the exact clicked character rather than at wrapper boundaries.
 *
 * @param domContainer - The DOM container element (typically the viewport or page element)
 * @param clientX - X coordinate in viewport space (from MouseEvent.clientX)
 * @param clientY - Y coordinate in viewport space (from MouseEvent.clientY)
 * @returns ProseMirror document position, or null if mapping fails (no DOM data, invalid structure, etc.)
 *
 * @example
 * ```typescript
 * const pos = clickToPositionDom(viewportElement, event.clientX, event.clientY);
 * if (pos !== null) {
 *   editor.setSelection(pos, pos);
 * }
 * ```
 */
export function clickToPositionDom(domContainer: HTMLElement, clientX: number, clientY: number): number | null {
  log('=== clickToPositionDom START ===');
  log('Input coords:', { clientX, clientY });

  // Find the page element that contains the click point
  const pageEl = findPageElement(domContainer, clientX, clientY);
  if (!pageEl) {
    log('No page element found');
    return null;
  }

  const pageRect = pageEl.getBoundingClientRect();
  const pageLocalX = clientX - pageRect.left;
  const pageLocalY = clientY - pageRect.top;
  const viewX = pageRect.left + pageLocalX;
  const viewY = pageRect.top + pageLocalY;

  log('Page found:', {
    pageIndex: pageEl.dataset.pageIndex,
    pageRect: { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
    viewCoords: { viewX, viewY },
  });

  // Use elementsFromPoint to find all elements under the click
  // Note: Must call directly on document to maintain proper 'this' context
  interface DocumentWithElementsFromPoint {
    elementsFromPoint?(x: number, y: number): Element[];
  }

  let hitChain: Element[] = [];
  const doc = document as Document & DocumentWithElementsFromPoint;
  const hasElementsFromPoint = typeof doc.elementsFromPoint === 'function';
  if (hasElementsFromPoint) {
    try {
      hitChain = doc.elementsFromPoint(viewX, viewY) ?? [];
    } catch {
      // elementsFromPoint failed, hitChain remains empty
    }
  }

  if (!Array.isArray(hitChain)) {
    log('elementsFromPoint returned non-array');
    return null;
  }

  const hitChainData = hitChain.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      classes: el.className,
      blockId: (el as HTMLElement).dataset?.blockId,
      pmStart: (el as HTMLElement).dataset?.pmStart,
      pmEnd: (el as HTMLElement).dataset?.pmEnd,
      rect: {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        height: Math.round(rect.height),
      },
    };
  });
  log('Hit chain elements:', JSON.stringify(hitChainData, null, 2));

  // Log all fragments on the page to see overlap
  const allFragments = Array.from(pageEl.querySelectorAll(`.${CLASS_NAMES.fragment}`)) as HTMLElement[];
  const fragmentData = allFragments.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      blockId: el.dataset.blockId,
      pmStart: el.dataset.pmStart,
      pmEnd: el.dataset.pmEnd,
      rect: {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        height: Math.round(rect.height),
      },
    };
  });
  log('All fragments on page:', JSON.stringify(fragmentData, null, 2));

  // Find the fragment element under the click
  const fragmentEl = hitChain.find((el) => el.classList?.contains?.(CLASS_NAMES.fragment)) as HTMLElement | null;

  if (!fragmentEl) {
    if (hasElementsFromPoint) {
      log('No fragment found in hit chain; returning null to allow geometry mapping');
      return null;
    }

    // Fallback for environments without elementsFromPoint (e.g., JSDOM tests)
    const fallbackFragment = pageEl.querySelector(`.${CLASS_NAMES.fragment}`) as HTMLElement | null;
    if (!fallbackFragment) {
      log('No fragment found in hit chain or fallback');
      return null;
    }

    log('Using fallback fragment (no elementsFromPoint):', {
      blockId: fallbackFragment.dataset.blockId,
      pmStart: fallbackFragment.dataset.pmStart,
      pmEnd: fallbackFragment.dataset.pmEnd,
    });
    const result = processFragment(fallbackFragment, viewX, viewY);
    log('=== clickToPositionDom END (fallback) ===', { result });
    return result;
  }

  log('Fragment found:', {
    blockId: fragmentEl.dataset.blockId,
    pmStart: fragmentEl.dataset.pmStart,
    pmEnd: fragmentEl.dataset.pmEnd,
  });

  // For table fragments (or any fragment without direct PM positions), check if the hit chain
  // contains a line element with valid PM positions. This handles the case where table cells
  // contain lines that have PM positions but the table fragment itself doesn't.
  const hitChainLine = hitChain.find(
    (el) =>
      el.classList?.contains?.(CLASS_NAMES.line) &&
      (el as HTMLElement).dataset?.pmStart !== undefined &&
      (el as HTMLElement).dataset?.pmEnd !== undefined,
  ) as HTMLElement | null;

  if (hitChainLine) {
    log('Using hit chain line directly:', {
      pmStart: hitChainLine.dataset.pmStart,
      pmEnd: hitChainLine.dataset.pmEnd,
    });
    const result = processLineElement(hitChainLine, viewX);
    log('=== clickToPositionDom END (hitChainLine) ===', { result });
    return result;
  }

  // For table fragments without a direct line hit, return null so the caller
  // (clickToPosition in index.ts) falls back to geometry-based hit testing via
  // hitTestTableFragment, which correctly resolves the cell by column. processFragment
  // would search all lines across all cells using only Y matching, picking the wrong
  // column when multiple cells share the same row height.
  if (fragmentEl.classList.contains(CLASS_NAMES.tableFragment)) {
    log('Table fragment without line in hit chain, deferring to geometry fallback');
    return null;
  }

  const result = processFragment(fragmentEl, viewX, viewY);
  log('=== clickToPositionDom END ===', { result });
  return result;
}

/**
 * Finds the page element containing the click coordinates.
 *
 * @param domContainer - The container element to search within
 * @param clientX - X coordinate in viewport space
 * @param clientY - Y coordinate in viewport space
 * @returns The page element, or null if not found
 */
export function findPageElement(domContainer: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  // Check if the container itself is a page element
  if (domContainer.classList?.contains?.(CLASS_NAMES.page)) {
    return domContainer;
  }

  // First try elementsFromPoint to find the page directly
  interface DocumentWithElementsFromPoint {
    elementsFromPoint?(x: number, y: number): Element[];
  }

  const doc = document as Document & DocumentWithElementsFromPoint;
  if (typeof doc.elementsFromPoint === 'function') {
    try {
      const hitChain = doc.elementsFromPoint(clientX, clientY);
      if (Array.isArray(hitChain)) {
        const pageEl = hitChain.find((el) => el.classList?.contains?.(CLASS_NAMES.page)) as HTMLElement | null;

        if (pageEl) {
          return pageEl;
        }
      }
    } catch {
      // elementsFromPoint may fail in some environments, fall through to fallback
    }
  }

  // Fallback: find the closest page element in the container
  const pages = Array.from(domContainer.querySelectorAll(`.${CLASS_NAMES.page}`)) as HTMLElement[];

  for (const page of pages) {
    const rect = page.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return page;
    }
  }

  // Last resort: return first page if one exists
  if (pages.length > 0) {
    return pages[0];
  }

  return null;
}

/**
 * Processes a fragment element to extract the PM position from a click.
 *
 * Finds the line at the Y coordinate, then the span at the X coordinate, and finally
 * uses binary search to find the exact character boundary within the span's text node.
 *
 * @param fragmentEl - The fragment element containing lines and spans with PM data attributes
 * @param viewX - X coordinate in viewport space
 * @param viewY - Y coordinate in viewport space
 * @returns ProseMirror position, or null if processing fails (missing elements or invalid data)
 *
 * @internal
 */
function processFragment(fragmentEl: HTMLElement, viewX: number, viewY: number): number | null {
  log('processFragment:', { viewX, viewY, blockId: fragmentEl.dataset.blockId });

  // Find the line element at the Y position
  const lineEls = Array.from(fragmentEl.querySelectorAll(`.${CLASS_NAMES.line}`)) as HTMLElement[];

  log(
    'Lines in fragment:',
    lineEls.map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        index: i,
        pmStart: el.dataset.pmStart,
        pmEnd: el.dataset.pmEnd,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      };
    }),
  );

  if (lineEls.length === 0) {
    log('No lines in fragment');
    return null;
  }

  const lineEl = findLineAtY(lineEls, viewY);
  if (!lineEl) {
    log('No line found at Y:', viewY);
    return null;
  }

  const lineStart = Number(lineEl.dataset.pmStart ?? 'NaN');
  const lineEnd = Number(lineEl.dataset.pmEnd ?? 'NaN');
  const lineRect = lineEl.getBoundingClientRect();

  log('Selected line:', {
    pmStart: lineStart,
    pmEnd: lineEnd,
    rect: { top: lineRect.top, bottom: lineRect.bottom, left: lineRect.left, right: lineRect.right },
  });

  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    log('Line has invalid PM positions');
    return null;
  }

  // Find the span or anchor (run slice) at the X position
  // Include both <span> and <a> elements since links are rendered as <a> tags with PM position data
  // Filter to only elements with PM position data (excludes nested content spans like annotation-content)
  // Exclude inline SDT wrapper elements - they have PM positions for selection highlighting but their
  // child spans should be the click targets for accurate character-level positioning
  const spanEls = (Array.from(lineEl.querySelectorAll('span, a')) as HTMLElement[]).filter(
    (el) =>
      el.dataset.pmStart !== undefined &&
      el.dataset.pmEnd !== undefined &&
      !el.classList.contains(DOM_CLASS_NAMES.INLINE_SDT_WRAPPER),
  );

  log(
    'Spans/anchors in line:',
    spanEls.map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        index: i,
        tag: el.tagName,
        pmStart: el.dataset.pmStart,
        pmEnd: el.dataset.pmEnd,
        text: el.textContent?.substring(0, 20) + (el.textContent && el.textContent.length > 20 ? '...' : ''),
        visibility: el.style.visibility,
        rect: { left: rect.left, right: rect.right, width: rect.width },
      };
    }),
  );

  if (spanEls.length === 0) {
    log('No spans in line, returning lineStart:', lineStart);
    return lineStart;
  }

  // Check if click is before first span or after last span
  const firstRect = spanEls[0].getBoundingClientRect();
  if (viewX <= firstRect.left) {
    log('Click before first span, returning lineStart:', lineStart);
    return lineStart;
  }

  const lastRect = spanEls[spanEls.length - 1].getBoundingClientRect();
  if (viewX >= lastRect.right) {
    log('Click after last span, returning lineEnd:', lineEnd);
    return lineEnd;
  }

  // Find the target element (span or anchor) containing or nearest to the X coordinate
  const targetEl = findSpanAtX(spanEls, viewX);
  if (!targetEl) {
    log('No target element found, returning lineStart:', lineStart);
    return lineStart;
  }

  const spanStart = Number(targetEl.dataset.pmStart ?? 'NaN');
  const spanEnd = Number(targetEl.dataset.pmEnd ?? 'NaN');
  const targetRect = targetEl.getBoundingClientRect();

  log('Target element:', {
    tag: targetEl.tagName,
    pmStart: spanStart,
    pmEnd: spanEnd,
    text: targetEl.textContent?.substring(0, 30),
    visibility: targetEl.style.visibility,
    rect: { left: targetRect.left, right: targetRect.right, width: targetRect.width },
    pageX: viewX,
    pageY: viewY,
  });

  if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) {
    log('Element has invalid PM positions');
    return null;
  }

  // Get the text node and find the character index
  const firstChild = targetEl.firstChild;
  if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE || !firstChild.textContent) {
    // Empty element or non-text node: choose closer edge
    const elRect = targetEl.getBoundingClientRect();
    const closerToLeft = Math.abs(viewX - elRect.left) <= Math.abs(viewX - elRect.right);
    const snapPos = closerToLeft ? spanStart : spanEnd;
    log('Empty/non-text element, snapping to:', { closerToLeft, snapPos });
    return snapPos;
  }

  const textNode = firstChild as Text;
  const charIndex = findCharIndexAtX(textNode, targetEl, viewX);
  const pos = mapCharIndexToPm(spanStart, spanEnd, textNode.length, charIndex);

  log('Character position:', { charIndex, spanStart, finalPos: pos });

  return pos;
}

function mapCharIndexToPm(spanStart: number, spanEnd: number, textLength: number, charIndex: number): number {
  if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) {
    return spanStart;
  }
  if (textLength <= 0) {
    return spanStart;
  }
  const pmRange = spanEnd - spanStart;
  if (!Number.isFinite(pmRange) || pmRange <= 0) {
    return spanStart;
  }
  if (pmRange === textLength) {
    const mapped = spanStart + charIndex;
    return Math.min(spanEnd, Math.max(spanStart, mapped));
  }

  const ratio = charIndex / textLength;
  return ratio <= 0.5 ? spanStart : spanEnd;
}

/**
 * Processes a line element directly to extract the PM position from a click X coordinate.
 *
 * This is used when we have a direct hit on a line element (e.g., from elementsFromPoint)
 * and don't need to search for the line by Y coordinate.
 *
 * @param lineEl - The line element with `data-pm-start` and `data-pm-end` attributes
 * @param viewX - X coordinate in viewport space
 * @returns ProseMirror position, or null if processing fails
 *
 * @internal
 */
function processLineElement(lineEl: HTMLElement, viewX: number): number | null {
  const lineStart = Number(lineEl.dataset.pmStart ?? 'NaN');
  const lineEnd = Number(lineEl.dataset.pmEnd ?? 'NaN');
  const lineRect = lineEl.getBoundingClientRect();

  log('processLineElement:', {
    pmStart: lineStart,
    pmEnd: lineEnd,
    rect: { top: lineRect.top, bottom: lineRect.bottom, left: lineRect.left, right: lineRect.right },
  });

  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    log('Line has invalid PM positions');
    return null;
  }

  // Find the span or anchor (run slice) at the X position
  // Filter to only elements with PM position data (excludes nested content spans)
  // Exclude inline SDT wrapper elements - they have PM positions for selection highlighting but their
  // child spans should be the click targets for accurate character-level positioning
  const spanEls = (Array.from(lineEl.querySelectorAll('span, a')) as HTMLElement[]).filter(
    (el) =>
      el.dataset.pmStart !== undefined &&
      el.dataset.pmEnd !== undefined &&
      !el.classList.contains(DOM_CLASS_NAMES.INLINE_SDT_WRAPPER),
  );

  log(
    'Spans/anchors in line:',
    spanEls.map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        index: i,
        tag: el.tagName,
        pmStart: el.dataset.pmStart,
        pmEnd: el.dataset.pmEnd,
        text: el.textContent?.substring(0, 20) + (el.textContent && el.textContent.length > 20 ? '...' : ''),
        visibility: el.style.visibility,
        rect: { left: rect.left, right: rect.right, width: rect.width },
      };
    }),
  );

  if (spanEls.length === 0) {
    log('No spans in line, returning lineStart:', lineStart);
    return lineStart;
  }

  // Check if click is before first span or after last span
  const firstRect = spanEls[0].getBoundingClientRect();
  if (viewX <= firstRect.left) {
    log('Click before first span, returning lineStart:', lineStart);
    return lineStart;
  }

  const lastRect = spanEls[spanEls.length - 1].getBoundingClientRect();
  if (viewX >= lastRect.right) {
    log('Click after last span, returning lineEnd:', lineEnd);
    return lineEnd;
  }

  // Find the target element containing or nearest to the X coordinate
  const targetEl = findSpanAtX(spanEls, viewX);
  if (!targetEl) {
    log('No target element found, returning lineStart:', lineStart);
    return lineStart;
  }

  const spanStart = Number(targetEl.dataset.pmStart ?? 'NaN');
  const spanEnd = Number(targetEl.dataset.pmEnd ?? 'NaN');
  const targetRect = targetEl.getBoundingClientRect();

  log('Target element:', {
    tag: targetEl.tagName,
    pmStart: spanStart,
    pmEnd: spanEnd,
    text: targetEl.textContent?.substring(0, 30),
    visibility: targetEl.style.visibility,
    rect: { left: targetRect.left, right: targetRect.right, width: targetRect.width },
  });

  if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) {
    log('Element has invalid PM positions');
    return null;
  }

  // Get the text node and find the character index
  const firstChild = targetEl.firstChild;
  if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE || !firstChild.textContent) {
    // Empty element or non-text node: choose closer edge
    const elRect = targetEl.getBoundingClientRect();
    const closerToLeft = Math.abs(viewX - elRect.left) <= Math.abs(viewX - elRect.right);
    const snapPos = closerToLeft ? spanStart : spanEnd;
    log('Empty/non-text element, snapping to:', { closerToLeft, snapPos });
    return snapPos;
  }

  const textNode = firstChild as Text;
  const charIndex = findCharIndexAtX(textNode, targetEl, viewX);
  const pos = spanStart + charIndex;

  log('Character position:', { charIndex, spanStart, finalPos: pos });

  return pos;
}

/**
 * Finds the line element at a given Y coordinate.
 *
 * Compares the Y coordinate against each line's bounding rectangle. If no line
 * contains the Y coordinate, returns the last line as a fallback (clicking below content).
 *
 * @param lineEls - Array of line elements with `data-pm-start` and `data-pm-end` attributes
 * @param viewY - Y coordinate in viewport space
 * @returns The matching line element, or last line if Y is below all lines, or null if no lines
 *
 * @internal
 */
function findLineAtY(lineEls: HTMLElement[], viewY: number): HTMLElement | null {
  if (lineEls.length === 0) {
    return null;
  }

  for (let i = 0; i < lineEls.length; i++) {
    const lineEl = lineEls[i];
    const rect = lineEl.getBoundingClientRect();
    if (viewY >= rect.top && viewY <= rect.bottom) {
      log('findLineAtY: Found line at index', i, {
        pmStart: lineEl.dataset.pmStart,
        pmEnd: lineEl.dataset.pmEnd,
        rect: { top: rect.top, bottom: rect.bottom },
        viewY,
      });
      return lineEl;
    }
  }

  // If Y is beyond all lines, return the last line
  const lastLine = lineEls[lineEls.length - 1];
  log('findLineAtY: Y beyond all lines, using last line:', {
    pmStart: lastLine.dataset.pmStart,
    pmEnd: lastLine.dataset.pmEnd,
    viewY,
  });
  return lastLine;
}

/**
 * Finds the text run element (span or anchor) at a given X coordinate.
 *
 * Iterates through elements to find one whose bounding rectangle contains the X coordinate.
 * If no element contains X, returns the last element encountered (nearest to the right of X).
 * This handles bidirectional text and overlapping spans correctly.
 *
 * @param spanEls - Array of span or anchor elements with `data-pm-start` and `data-pm-end` attributes
 * @param viewX - X coordinate in viewport space
 * @returns The matching or nearest element, or null if array is empty
 *
 * @internal
 */
function findSpanAtX(spanEls: HTMLElement[], viewX: number): HTMLElement | null {
  if (spanEls.length === 0) {
    return null;
  }

  let targetSpan: HTMLElement = spanEls[0];

  for (let i = 0; i < spanEls.length; i++) {
    const span = spanEls[i];
    const rect = span.getBoundingClientRect();
    if (viewX >= rect.left && viewX <= rect.right) {
      log('findSpanAtX: Found containing element at index', i, {
        tag: span.tagName,
        pmStart: span.dataset.pmStart,
        pmEnd: span.dataset.pmEnd,
        rect: { left: rect.left, right: rect.right },
        viewX,
      });
      return span;
    }
    // Track nearest element to the right if none contain X
    if (viewX > rect.right) {
      targetSpan = span;
    }
  }

  log('findSpanAtX: No containing element, using nearest:', {
    tag: targetSpan.tagName,
    pmStart: targetSpan.dataset.pmStart,
    pmEnd: targetSpan.dataset.pmEnd,
    viewX,
  });
  return targetSpan;
}

/**
 * Finds the character index in a text node closest to a given X coordinate.
 *
 * Uses binary search with `document.createRange()` to efficiently find the
 * character boundary nearest to the target X position. This provides accurate
 * click-to-character mapping even with variable-width fonts, ligatures, and
 * letter-spacing.
 *
 * @param textNode - The Text node containing the characters
 * @param container - The element containing the text node (span or anchor, for position reference)
 * @param targetX - The target X coordinate in viewport space
 * @returns Character index (0-based) within the text node
 *
 * @example
 * ```typescript
 * const textNode = element.firstChild as Text;
 * const charIndex = findCharIndexAtX(textNode, element, 150);
 * // charIndex might be 5 if the click was near the 5th character
 * ```
 */
function findCharIndexAtX(textNode: Text, container: HTMLElement, targetX: number): number {
  const text = textNode.textContent ?? '';
  const baseLeft = container.getBoundingClientRect().left;
  const range = document.createRange();

  // Binary search for the first character where measured X >= target X
  let lo = 0;
  let hi = text.length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    range.setStart(textNode, 0);
    range.setEnd(textNode, mid);
    const w = range.getBoundingClientRect().width;
    const x = baseLeft + w;
    if (x < targetX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // lo is the first index where measured X >= click X
  // Compare with previous boundary to find nearest
  const index = Math.max(0, Math.min(text.length, lo));

  const measureAt = (i: number): number => {
    range.setStart(textNode, 0);
    range.setEnd(textNode, i);
    return baseLeft + range.getBoundingClientRect().width;
  };

  const xAt = measureAt(index);
  const distAt = Math.abs(xAt - targetX);

  // Check if previous boundary is closer
  if (index > 0) {
    const xPrev = measureAt(index - 1);
    const distPrev = Math.abs(xPrev - targetX);
    if (distPrev < distAt) {
      return index - 1;
    }
  }

  return index;
}
