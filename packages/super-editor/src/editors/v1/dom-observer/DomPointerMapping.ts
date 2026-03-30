/**
 * DOM-based pointer-to-position mapping for the v1 editor.
 *
 * Maps viewport click coordinates to ProseMirror document positions by reading
 * the rendered DOM produced by the painter (`data-pm-start`, `data-pm-end`).
 * This is more accurate than geometry-based mapping because it uses the
 * browser's actual rendering and correctly handles PM position gaps that occur
 * after document edits (e.g. paragraph joins).
 *
 * @module dom-observer/DomPointerMapping
 */

import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';

// ---------------------------------------------------------------------------
// Debug logging (disabled by default — flip to true for click-mapping traces)
// ---------------------------------------------------------------------------

const DEBUG = false;
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[DOM-MAP]', ...args);
};

// ---------------------------------------------------------------------------
// Constants & shared types
// ---------------------------------------------------------------------------

/** Painter class names used to locate structural elements in the rendered DOM. */
const CLASS = {
  page: DOM_CLASS_NAMES.PAGE,
  fragment: DOM_CLASS_NAMES.FRAGMENT,
  line: DOM_CLASS_NAMES.LINE,
  tableFragment: DOM_CLASS_NAMES.TABLE_FRAGMENT,
  inlineSdtWrapper: DOM_CLASS_NAMES.INLINE_SDT_WRAPPER,
} as const;

/** Augmented Document type for the `elementsFromPoint` API. */
type ElementsFromPointDocument = Document & {
  elementsFromPoint?(x: number, y: number): Element[];
};

type CaretAwareDocument = ElementsFromPointDocument & {
  caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?(x: number, y: number): Range | null;
};

// ---------------------------------------------------------------------------
// Low-level DOM utilities
// ---------------------------------------------------------------------------

/**
 * Safe wrapper around `document.elementsFromPoint` that handles missing API
 * and runtime errors. Returns an empty array on failure.
 */
function safeElementsFromPoint(doc: ElementsFromPointDocument, x: number, y: number): Element[] {
  if (typeof doc.elementsFromPoint !== 'function') return [];
  try {
    return doc.elementsFromPoint(x, y) ?? [];
  } catch {
    return [];
  }
}

/** Whether `elementsFromPoint` is available on the given document. */
function hasElementsFromPoint(doc: ElementsFromPointDocument): boolean {
  return typeof doc.elementsFromPoint === 'function';
}

function getContainerDocument(domContainer: HTMLElement): CaretAwareDocument | null {
  return (domContainer.ownerDocument as CaretAwareDocument | null) ?? null;
}

function getNodeDocument(node: Node): CaretAwareDocument | null {
  return (node.ownerDocument as CaretAwareDocument | null) ?? null;
}

function createRangeForNode(node: Node): Range | null {
  return getNodeDocument(node)?.createRange() ?? null;
}

function isVisibleRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function isRtlLine(lineEl: HTMLElement): boolean {
  return getComputedStyle(lineEl).direction === 'rtl';
}

/**
 * Reads PM position data from an element's dataset, returning NaN for
 * missing or non-numeric values.
 */
function readPmRange(el: HTMLElement): { start: number; end: number } {
  return {
    start: Number(el.dataset.pmStart ?? 'NaN'),
    end: Number(el.dataset.pmEnd ?? 'NaN'),
  };
}

/**
 * Collects clickable span/anchor elements inside a line.
 *
 * Filters to elements with PM position data and excludes inline SDT wrapper
 * elements — their child spans provide more accurate character-level
 * positioning.
 */
function getClickableSpans(lineEl: HTMLElement): HTMLElement[] {
  return (Array.from(lineEl.querySelectorAll('span, a')) as HTMLElement[]).filter(
    (el) =>
      el.dataset.pmStart !== undefined &&
      el.dataset.pmEnd !== undefined &&
      !el.classList.contains(CLASS.inlineSdtWrapper),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps a click coordinate to a ProseMirror document position using DOM data
 * attributes.
 *
 * Resolution strategy:
 * 1. Find the page element containing the click via `elementsFromPoint`.
 * 2. Find the fragment (or table-cell line) in the hit chain.
 * 3. Find the line at the Y coordinate within the fragment.
 * 4. Find the span at the X coordinate within the line.
 * 5. Use the browser caret API (or binary-search fallback) to resolve the
 *    exact character boundary.
 *
 * Returns `null` when the DOM does not contain enough data to resolve a
 * position — the caller should fall back to geometry-based mapping.
 */
export function clickToPositionDom(domContainer: HTMLElement, clientX: number, clientY: number): number | null {
  log('=== clickToPositionDom START ===', { clientX, clientY });

  const pageEl = findPageElement(domContainer, clientX, clientY);
  if (!pageEl) {
    log('No page element found');
    return null;
  }

  log('Page found:', { pageIndex: pageEl.dataset.pageIndex });

  const doc = getContainerDocument(domContainer);
  if (!doc) {
    log('No owner document found');
    return null;
  }
  const hitChain = safeElementsFromPoint(doc, clientX, clientY);

  if (!Array.isArray(hitChain)) {
    log('elementsFromPoint returned non-array');
    return null;
  }

  logHitChain(hitChain);

  // --- Locate the fragment under the click ---

  const fragmentEl = hitChain.find((el) => el.classList?.contains?.(CLASS.fragment)) as HTMLElement | null;

  if (!fragmentEl) {
    if (hasElementsFromPoint(doc)) {
      log('No fragment in hit chain; deferring to geometry');
      return null;
    }

    // JSDOM fallback — no elementsFromPoint, use first fragment on the page
    const fallback = pageEl.querySelector(`.${CLASS.fragment}`) as HTMLElement | null;
    if (!fallback) return null;

    log('Using fallback fragment (no elementsFromPoint)');
    return resolveFragment(fallback, clientX, clientY);
  }

  // --- If a line is directly hit (e.g. inside a table cell), use it ---

  const hitChainLine = hitChain.find(
    (el) =>
      el.classList?.contains?.(CLASS.line) &&
      (el as HTMLElement).dataset?.pmStart !== undefined &&
      (el as HTMLElement).dataset?.pmEnd !== undefined,
  ) as HTMLElement | null;

  if (hitChainLine) {
    log('Using hit-chain line directly');
    return resolveLineAtX(hitChainLine, clientX);
  }

  // For table fragments without a direct line hit, defer to geometry
  // (hitTestTableFragment resolves the correct cell by column).
  if (fragmentEl.classList.contains(CLASS.tableFragment)) {
    log('Table fragment without line in hit chain — deferring to geometry');
    return null;
  }

  return resolveFragment(fragmentEl, clientX, clientY);
}

/**
 * Finds the page element containing the given viewport coordinates.
 *
 * Tries `elementsFromPoint` first, then falls back to bounding-rect checks
 * on all page elements, and finally returns the first page as a last resort.
 */
export function findPageElement(domContainer: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  if (domContainer.classList?.contains?.(CLASS.page)) {
    return domContainer;
  }

  const doc = getContainerDocument(domContainer);
  if (!doc) {
    return null;
  }
  const hitChain = safeElementsFromPoint(doc, clientX, clientY);
  const pageFromHit = hitChain.find((el) => el.classList?.contains?.(CLASS.page)) as HTMLElement | null;
  if (pageFromHit) return pageFromHit;

  // Fallback: check all pages by bounding rect
  const pages = Array.from(domContainer.querySelectorAll(`.${CLASS.page}`)) as HTMLElement[];
  for (const page of pages) {
    const r = page.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return page;
    }
  }

  return pages[0] ?? null;
}

/**
 * Reads the layout epoch from DOM `data-layout-epoch` attributes at the given
 * viewport point. Returns the newest (highest) epoch in the hit chain so that
 * stale descendants don't block mapping.
 */
export function readLayoutEpochFromDom(domContainer: HTMLElement, clientX: number, clientY: number): number | null {
  const doc = getContainerDocument(domContainer);
  if (!doc || !hasElementsFromPoint(doc)) {
    return null;
  }

  const hitChain = safeElementsFromPoint(doc, clientX, clientY);

  let latestEpoch: number | null = null;
  for (const el of hitChain) {
    if (!(el instanceof HTMLElement)) continue;
    if (!domContainer.contains(el)) continue;
    const epoch = Number((el as HTMLElement).dataset.layoutEpoch);
    if (!Number.isFinite(epoch)) continue;
    if (latestEpoch == null || epoch > latestEpoch) {
      latestEpoch = epoch;
    }
  }

  return latestEpoch;
}

// ---------------------------------------------------------------------------
// Fragment / line resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a click within a fragment by finding the line at Y, then the
 * position at X within that line.
 */
function resolveFragment(fragmentEl: HTMLElement, viewX: number, viewY: number): number | null {
  const lineEls = Array.from(fragmentEl.querySelectorAll(`.${CLASS.line}`)) as HTMLElement[];
  if (lineEls.length === 0) {
    log('No lines in fragment');
    return null;
  }

  const lineEl = findLineAtY(lineEls, viewY);
  if (!lineEl) return null;

  return resolveLineAtX(lineEl, viewX);
}

/**
 * Given a known line element, resolves the PM position at the given X
 * coordinate.
 *
 * Shared by both the fragment path (line found by Y) and the hit-chain path
 * (line found directly via `elementsFromPoint`).
 */
function resolveLineAtX(lineEl: HTMLElement, viewX: number): number | null {
  const { start: lineStart, end: lineEnd } = readPmRange(lineEl);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    log('Line has invalid PM positions');
    return null;
  }

  const spanEls = getClickableSpans(lineEl);
  return resolvePositionInLine(lineEl, lineStart, lineEnd, spanEls, viewX);
}

// ---------------------------------------------------------------------------
// Position resolution within a line
// ---------------------------------------------------------------------------

/**
 * Core logic for mapping an X coordinate to a PM position within a line.
 *
 * Handles RTL-aware boundary snapping, hidden-span filtering, empty-element
 * snapping, and character-level resolution via `findCharIndexAtX`.
 */
function resolvePositionInLine(
  lineEl: HTMLElement,
  lineStart: number,
  lineEnd: number,
  spanEls: HTMLElement[],
  viewX: number,
): number | null {
  if (spanEls.length === 0) {
    log('No spans in line, returning lineStart:', lineStart);
    return lineStart;
  }

  const rtl = isRtlLine(lineEl);

  // Filter out non-rendered spans (display:none, hidden tracked changes, etc.)
  // whose zero-sized rects would collapse bounds. Fall back to the full set in
  // JSDOM where every rect is zero-sized.
  const allRects = spanEls.map((el) => el.getBoundingClientRect());
  const visibleRects = allRects.filter(isVisibleRect);
  const boundsRects = visibleRects.length > 0 ? visibleRects : allRects;

  const visualLeft = Math.min(...boundsRects.map((r) => r.left));
  const visualRight = Math.max(...boundsRects.map((r) => r.right));

  // Boundary snapping: click outside all spans → return line start/end (RTL-aware)
  if (viewX <= visualLeft) return rtl ? lineEnd : lineStart;
  if (viewX >= visualRight) return rtl ? lineStart : lineEnd;

  const targetEl = findSpanAtX(spanEls, viewX);
  if (!targetEl) return lineStart;

  const { start: spanStart, end: spanEnd } = readPmRange(targetEl);
  if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) return null;

  // Non-text or empty element → snap to nearest edge
  const firstChild = targetEl.firstChild;
  if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE || !firstChild.textContent) {
    const targetRect = targetEl.getBoundingClientRect();
    const closerToLeft = Math.abs(viewX - targetRect.left) <= Math.abs(viewX - targetRect.right);
    return rtl ? (closerToLeft ? spanEnd : spanStart) : closerToLeft ? spanStart : spanEnd;
  }

  const textNode = firstChild as Text;
  const charIndex = findCharIndexAtX(textNode, viewX, rtl);
  return mapCharIndexToPm(spanStart, spanEnd, textNode.length, charIndex);
}

// ---------------------------------------------------------------------------
// Spatial lookup helpers
// ---------------------------------------------------------------------------

/**
 * Finds the line element at a given Y coordinate. Returns the last line as
 * a fallback when Y is below all lines (clicking below content).
 */
function findLineAtY(lineEls: HTMLElement[], viewY: number): HTMLElement | null {
  if (lineEls.length === 0) return null;

  for (const lineEl of lineEls) {
    const r = lineEl.getBoundingClientRect();
    if (viewY >= r.top && viewY <= r.bottom) return lineEl;
  }

  return lineEls[lineEls.length - 1];
}

/**
 * Finds the span/anchor element at a given X coordinate. Returns the nearest
 * element when X doesn't fall inside any visible span.
 */
function findSpanAtX(spanEls: HTMLElement[], viewX: number): HTMLElement | null {
  if (spanEls.length === 0) return null;

  let nearest: HTMLElement = spanEls[0];
  let minDist = Infinity;

  for (const span of spanEls) {
    const r = span.getBoundingClientRect();
    if (!isVisibleRect(r)) continue;
    if (viewX >= r.left && viewX <= r.right) return span;

    const dist = Math.min(Math.abs(viewX - r.left), Math.abs(viewX - r.right));
    if (dist < minDist) {
      minDist = dist;
      nearest = span;
    }
  }

  return nearest;
}

// ---------------------------------------------------------------------------
// Character-level position resolution
// ---------------------------------------------------------------------------

/**
 * Maps a character index within a text node to a ProseMirror position.
 *
 * When the PM range length matches the text length, the mapping is 1:1.
 * Otherwise (e.g. ligatures or collapsed content) falls back to a midpoint
 * heuristic.
 */
function mapCharIndexToPm(spanStart: number, spanEnd: number, textLength: number, charIndex: number): number {
  if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) return spanStart;
  if (textLength <= 0) return spanStart;

  const pmRange = spanEnd - spanStart;
  if (!Number.isFinite(pmRange) || pmRange <= 0) return spanStart;

  if (pmRange === textLength) {
    return Math.min(spanEnd, Math.max(spanStart, spanStart + charIndex));
  }

  // PM range ≠ text length — snap to closer half
  return charIndex / textLength <= 0.5 ? spanStart : spanEnd;
}

/**
 * Finds the character index in a text node closest to a given X coordinate.
 *
 * Strategy 1: Browser caret API (`caretPositionFromPoint` / `caretRangeFromPoint`)
 * — correctly handles RTL, bidi, and contextual shaping (Arabic ligatures).
 *
 * Strategy 2: Binary search over per-character Range rects — fallback when the
 * caret API is unavailable or returns a node outside the target.
 */
function findCharIndexAtX(textNode: Text, targetX: number, rtl: boolean): number {
  const text = textNode.textContent ?? '';
  if (text.length === 0) return 0;

  const container = textNode.parentElement;
  if (!container) return 0;
  const containerRect = container.getBoundingClientRect();
  const targetY = containerRect.top + containerRect.height / 2;

  // Strategy 1: native caret API
  const caretIndex = caretOffsetFromPoint(targetX, targetY, textNode);
  if (caretIndex != null) return caretIndex;

  // Strategy 2: binary search using cumulative Range rects
  return binarySearchCharIndex(textNode, text.length, targetX, rtl, containerRect);
}

/**
 * Uses the browser's native caret-from-point API to find a character offset.
 * Returns null when the API is unavailable or reports a different node.
 */
function caretOffsetFromPoint(x: number, y: number, expectedNode: Text): number | null {
  const doc = getNodeDocument(expectedNode);
  if (!doc) {
    return null;
  }

  // Firefox / spec-track
  if (typeof doc.caretPositionFromPoint === 'function') {
    const cp = doc.caretPositionFromPoint(x, y);
    if (cp && cp.offsetNode === expectedNode) return cp.offset;
  }

  // WebKit / Blink
  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y);
    if (r && r.startContainer === expectedNode) return r.startOffset;
  }

  return null;
}

/**
 * Binary search fallback for character index resolution.
 *
 * Measures the boundary edge of Range(0, i) — right edge for LTR, left edge
 * for RTL — and binary-searches for the index closest to `targetX`.
 */
function binarySearchCharIndex(
  textNode: Text,
  length: number,
  targetX: number,
  rtl: boolean,
  containerRect: DOMRect,
): number {
  const range = createRangeForNode(textNode);
  if (!range) {
    return 0;
  }

  const measureX = (i: number): number => {
    if (i <= 0) return rtl ? containerRect.right : containerRect.left;
    range.setStart(textNode, 0);
    range.setEnd(textNode, i);
    const r = range.getBoundingClientRect();
    return rtl ? r.left : r.right;
  };

  let lo = 0;
  let hi = length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rtl ? measureX(mid) > targetX : measureX(mid) < targetX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const index = Math.max(0, Math.min(length, lo));
  if (index > 0 && Math.abs(measureX(index - 1) - targetX) < Math.abs(measureX(index) - targetX)) {
    return index - 1;
  }

  return index;
}

// ---------------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------------

function logHitChain(hitChain: Element[]): void {
  if (!DEBUG) return;
  const data = hitChain.map((el) => {
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
      },
    };
  });
  log('Hit chain:', JSON.stringify(data, null, 2));
}
