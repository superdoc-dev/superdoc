import type { Layout } from '@superdoc/contracts';
import { DOM_CLASS_NAMES } from '@superdoc/painter-dom';

import type { DomPositionIndex, DomPositionIndexEntry } from './DomPositionIndex.js';
import { debugLog, getSelectionDebugConfig } from './SelectionDebug.js';

/**
 * A rectangle representing a selection highlight in document layout coordinates.
 */
export type LayoutRect = { x: number; y: number; width: number; height: number; pageIndex: number };

/**
 * A caret position in page-local coordinates.
 */
export type PageLocalCaretPosition = { pageIndex: number; x: number; y: number };

/**
 * Options for computing selection rectangles from DOM.
 */
export type ComputeSelectionRectsFromDomOptions = {
  /** The DOM container hosting the rendered pages */
  painterHost: HTMLElement | null;
  /** The layout object containing page and fragment information */
  layout: Layout | null;
  /** Index mapping PM positions to DOM elements */
  domPositionIndex: DomPositionIndex;
  /** Function to rebuild the DOM position index when stale */
  rebuildDomPositionIndex: () => void;
  /** Current zoom level (1.0 = 100%) */
  zoom: number;
  /** Height of each page in layout units */
  pageHeight: number;
  /** Gap between pages in layout units */
  pageGap: number;
};

/**
 * Computes visual selection rectangles by querying the browser's DOM Range API.
 *
 * This function maps a ProseMirror selection range (from, to) to DOM elements using the
 * DomPositionIndex, creates a DOM Range spanning those elements, and extracts the visual
 * bounding rectangles. The rectangles are returned in document layout coordinates (not
 * viewport coordinates), suitable for rendering custom selection overlays.
 *
 * @param options - Configuration including painter host, layout, position index, and zoom
 * @param from - Start position of the selection in ProseMirror coordinates
 * @param to - End position of the selection in ProseMirror coordinates
 * @returns Array of rectangles representing the selection, or null if computation fails
 *
 * @remarks
 * - Automatically rebuilds the DOM position index if it's stale due to virtualization
 * - Deduplicates overlapping rectangles to avoid "double selection" visual artifacts
 * - Returns null on error (invalid positions, stale DOM, or Range API failures)
 * - Returns empty array if from === to (collapsed selection)
 * - Clamps selection to page boundaries using fragment PM ranges from layout
 */
export function computeSelectionRectsFromDom(
  options: ComputeSelectionRectsFromDomOptions,
  from: number,
  to: number,
): LayoutRect[] | null {
  const painterHost = options.painterHost;
  if (!painterHost) return null;
  const layout = options.layout;
  if (!layout) return null;

  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return [];

  // Ensure the DOM index is available (rebuilt after paint and on virtualization window changes).
  if (options.domPositionIndex.size === 0) {
    options.rebuildDomPositionIndex();
  }

  const zoom = options.zoom;
  const pageHeight = options.pageHeight;
  const pageGap = options.pageGap;

  const pageEls = Array.from(
    painterHost.querySelectorAll(`.${DOM_CLASS_NAMES.PAGE}[data-page-index]`),
  ) as HTMLElement[];

  const out: LayoutRect[] = [];
  let rebuiltOnce = false;
  const debugConfig = getSelectionDebugConfig();
  const isVerbose = debugConfig.logLevel === 'verbose';
  const dumpRects = isVerbose && debugConfig.dumpRects;
  const disableRectDedupe = debugConfig.disableRectDedupe;

  type EntryDebugInfo = {
    pmStart: number;
    pmEnd: number;
    pageIndex: string | null;
    section: 'header' | 'footer' | 'body';
    connected: boolean;
    layoutEpoch: string | null;
    pageEpoch: string | null;
    text: string;
  };

  type RectDebugInfo = {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  };

  const entryDebugInfo = (entry: DomPositionIndexEntry): EntryDebugInfo => {
    const pageEl = entry.el.closest(`.${DOM_CLASS_NAMES.PAGE}`) as HTMLElement | null;
    const section = entry.el.closest('.superdoc-page-header')
      ? 'header'
      : entry.el.closest('.superdoc-page-footer')
        ? 'footer'
        : 'body';
    return {
      pmStart: entry.pmStart,
      pmEnd: entry.pmEnd,
      pageIndex: pageEl?.dataset.pageIndex ?? null,
      section,
      connected: entry.el.isConnected,
      layoutEpoch: entry.el.dataset.layoutEpoch ?? null,
      pageEpoch: pageEl?.dataset.layoutEpoch ?? null,
      text: (entry.el.textContent ?? '').slice(0, 80),
    };
  };
  const rectDebugInfo = (rect: DOMRect): RectDebugInfo => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
  });

  for (const pageEl of pageEls) {
    const pageIndex = Number(pageEl.dataset.pageIndex ?? 'NaN');
    if (!Number.isFinite(pageIndex)) continue;
    const page = layout.pages[pageIndex];
    if (!page) continue;

    // Compute the PM range covered by this page from layout fragments.
    let pagePmStart = Infinity;
    let pagePmEnd = -Infinity;
    for (const fragment of page.fragments) {
      const pmStart = (fragment as { pmStart?: unknown }).pmStart;
      const pmEnd = (fragment as { pmEnd?: unknown }).pmEnd;
      if (typeof pmStart === 'number' && Number.isFinite(pmStart)) pagePmStart = Math.min(pagePmStart, pmStart);
      if (typeof pmEnd === 'number' && Number.isFinite(pmEnd)) pagePmEnd = Math.max(pagePmEnd, pmEnd);
    }
    if (!Number.isFinite(pagePmStart) || !Number.isFinite(pagePmEnd) || pagePmEnd <= pagePmStart) {
      continue;
    }

    const sliceFrom = Math.max(start, pagePmStart);
    const sliceTo = Math.min(end, pagePmEnd);
    if (sliceFrom >= sliceTo) continue;

    // Identify representative DOM elements for the slice boundaries on this mounted page.
    let sliceEntries = options.domPositionIndex.findEntriesInRange(sliceFrom, sliceTo);
    if (sliceEntries.length === 0) {
      // Nothing mounted for this PM interval on this page (virtualized or empty).
      continue;
    }

    if (isVerbose) {
      debugLog(
        'verbose',
        `DOM selection rects: slice entries ${JSON.stringify({
          pageIndex,
          sliceFrom,
          sliceTo,
          entriesCount: sliceEntries.length,
          entriesPreview: sliceEntries.slice(0, 20).map(entryDebugInfo),
        })}`,
      );
    }

    let startEntry = options.domPositionIndex.findEntryAtPosition(sliceFrom) ?? sliceEntries[0]!;
    let endEntry = options.domPositionIndex.findEntryAtPosition(sliceTo) ?? sliceEntries[sliceEntries.length - 1]!;

    if (isVerbose) {
      debugLog(
        'verbose',
        `DOM selection rects: boundaries ${JSON.stringify({
          pageIndex,
          sliceFrom,
          sliceTo,
          start: entryDebugInfo(startEntry),
          end: entryDebugInfo(endEntry),
        })}`,
      );
    }

    // If the index is stale (virtualization mount/unmount), rebuild once and retry.
    let startContained = pageEl.contains(startEntry.el);
    let endContained = pageEl.contains(endEntry.el);
    if (!startContained || !endContained) {
      if (isVerbose) {
        debugLog(
          'verbose',
          `DOM selection rects: boundary containment ${JSON.stringify({
            pageIndex,
            sliceFrom,
            sliceTo,
            startContained,
            endContained,
          })}`,
        );
      }
      if (!rebuiltOnce) {
        options.rebuildDomPositionIndex();
        rebuiltOnce = true;
        sliceEntries = options.domPositionIndex.findEntriesInRange(sliceFrom, sliceTo);
        if (sliceEntries.length === 0) continue;
        startEntry = options.domPositionIndex.findEntryAtPosition(sliceFrom) ?? sliceEntries[0]!;
        endEntry = options.domPositionIndex.findEntryAtPosition(sliceTo) ?? sliceEntries[sliceEntries.length - 1]!;
        startContained = pageEl.contains(startEntry.el);
        endContained = pageEl.contains(endEntry.el);
        if (isVerbose) {
          debugLog(
            'verbose',
            `DOM selection rects: boundary containment after rebuild ${JSON.stringify({
              pageIndex,
              sliceFrom,
              sliceTo,
              startContained,
              endContained,
              start: entryDebugInfo(startEntry),
              end: entryDebugInfo(endEntry),
            })}`,
          );
        }
      }
      if (!startContained || !endContained) {
        debugLog(
          'warn',
          `DOM selection rects: stale index after rebuild ${JSON.stringify({
            pageIndex,
            sliceFrom,
            sliceTo,
            start: entryDebugInfo(startEntry),
            end: entryDebugInfo(endEntry),
          })}`,
        );
        return null;
      }
    }

    const doc = pageEl.ownerDocument ?? document;
    const range = doc.createRange();
    try {
      if (!setDomRangeStart(range, startEntry, sliceFrom)) return null;
      if (!setDomRangeEnd(range, endEntry, sliceTo)) return null;
    } catch (error) {
      debugLog('warn', 'DOM selection rects: Range boundary set failed', { error: String(error) });
      return null;
    }

    let clientRects: DOMRect[] = [];
    try {
      let rawRects = Array.from(range.getClientRects()) as unknown as DOMRect[];
      if (dumpRects) {
        debugLog(
          'verbose',
          `DOM selection rects: raw rects ${JSON.stringify({
            pageIndex,
            sliceFrom,
            sliceTo,
            rects: rawRects.map(rectDebugInfo),
          })}`,
        );
      }
      let missingEntries: DomPositionIndexEntry[] | null = null;
      if (typeof range.intersectsNode === 'function') {
        for (const entry of sliceEntries) {
          try {
            if (!range.intersectsNode(entry.el)) {
              missingEntries ??= [];
              missingEntries.push(entry);
            }
          } catch {
            // Ignore per-node errors; we only need a signal for fallback.
          }
        }
      }
      if (missingEntries && missingEntries.length > 0) {
        if (isVerbose) {
          debugLog(
            'verbose',
            `DOM selection rects: range missing entries ${JSON.stringify({
              pageIndex,
              sliceFrom,
              sliceTo,
              missingCount: missingEntries.length,
              missingPreview: missingEntries.slice(0, 20).map(entryDebugInfo),
            })}`,
          );
        }
        rawRects = collectClientRectsByLine(doc, sliceEntries, sliceFrom, sliceTo);
        if (dumpRects) {
          debugLog(
            'verbose',
            `DOM selection rects: fallback raw rects ${JSON.stringify({
              pageIndex,
              sliceFrom,
              sliceTo,
              rects: rawRects.map(rectDebugInfo),
            })}`,
          );
        }
      }
      // Deduplicate overlapping rects - browser can return both line-box and text-content rects
      // for the same visual line, causing "double selection" appearance
      clientRects = disableRectDedupe ? rawRects : deduplicateOverlappingRects(rawRects);
      if (dumpRects) {
        debugLog(
          'verbose',
          `DOM selection rects: final rects ${JSON.stringify({
            pageIndex,
            sliceFrom,
            sliceTo,
            dedupeDisabled: disableRectDedupe,
            rects: clientRects.map(rectDebugInfo),
          })}`,
        );
        const nonPositive = clientRects.filter(
          (rect) =>
            !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0,
        );
        if (nonPositive.length > 0) {
          debugLog(
            'verbose',
            `DOM selection rects: non-positive rects ${JSON.stringify({
              pageIndex,
              sliceFrom,
              sliceTo,
              rects: nonPositive.map(rectDebugInfo),
            })}`,
          );
        }
      }
    } catch (error) {
      debugLog('warn', 'DOM selection rects: getClientRects failed', { error: String(error) });
      return null;
    }

    const pageRect = pageEl.getBoundingClientRect();
    for (const r of clientRects) {
      const width = r.width / zoom;
      const height = r.height / zoom;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;

      const localX = (r.left - pageRect.left) / zoom;
      const localY = (r.top - pageRect.top) / zoom;
      if (!Number.isFinite(localX) || !Number.isFinite(localY)) continue;

      out.push({
        pageIndex,
        x: localX,
        y: pageIndex * (pageHeight + pageGap) + localY,
        width: Math.max(1, width),
        height: Math.max(1, height),
      });
    }
  }

  return out;
}

/**
 * Collects client rectangles by grouping entries by line element when Range.getClientRects()
 * misses some entries due to range boundary issues.
 *
 * This is a fallback mechanism triggered when range.intersectsNode() detects that the DOM Range
 * doesn't properly intersect all expected entries. It groups entries by their containing line
 * element and creates separate ranges for each line to ensure all text runs are included.
 *
 * @param doc - The document to create ranges from
 * @param entries - DOM position index entries to collect rectangles for
 * @param sliceFrom - Starting PM position for the selection
 * @param sliceTo - Ending PM position for the selection
 * @returns Array of DOMRect objects representing the visual selection
 *
 * @remarks
 * - Groups entries by `.superdoc-line` parent element
 * - Creates individual ranges per line to avoid range boundary issues
 * - Handles "loose" entries without line parents separately
 * - Silently catches and skips ranges that fail to set boundaries
 *
 * @internal
 */
function collectClientRectsByLine(
  doc: Document,
  entries: DomPositionIndexEntry[],
  sliceFrom: number,
  sliceTo: number,
): DOMRect[] {
  const rects: DOMRect[] = [];
  const lineMap = new Map<HTMLElement, DomPositionIndexEntry[]>();
  const looseEntries: DomPositionIndexEntry[] = [];

  for (const entry of entries) {
    const lineEl = entry.el.closest('.superdoc-line') as HTMLElement | null;
    if (!lineEl) {
      looseEntries.push(entry);
      continue;
    }
    const list = lineMap.get(lineEl);
    if (list) {
      list.push(entry);
    } else {
      lineMap.set(lineEl, [entry]);
    }
  }

  for (const [, lineEntries] of lineMap) {
    lineEntries.sort((a, b) => (a.pmStart - b.pmStart !== 0 ? a.pmStart - b.pmStart : a.pmEnd - b.pmEnd));
    const linePmStart = lineEntries[0]?.pmStart ?? Infinity;
    const linePmEnd = lineEntries[lineEntries.length - 1]?.pmEnd ?? -Infinity;
    if (!Number.isFinite(linePmStart) || !Number.isFinite(linePmEnd) || linePmEnd <= linePmStart) continue;

    const lineFrom = Math.max(sliceFrom, linePmStart);
    const lineTo = Math.min(sliceTo, linePmEnd);
    if (lineFrom >= lineTo) continue;

    const startEntry =
      lineEntries.find((entry) => lineFrom >= entry.pmStart && lineFrom <= entry.pmEnd) ?? lineEntries[0]!;
    const endEntry =
      lineEntries.find((entry) => lineTo >= entry.pmStart && lineTo <= entry.pmEnd) ??
      lineEntries[lineEntries.length - 1]!;

    const range = doc.createRange();
    try {
      if (!setDomRangeStart(range, startEntry, lineFrom)) continue;
      if (!setDomRangeEnd(range, endEntry, lineTo)) continue;
    } catch {
      continue;
    }

    rects.push(...(Array.from(range.getClientRects()) as unknown as DOMRect[]));
  }

  for (const entry of looseEntries) {
    const entryFrom = Math.max(sliceFrom, entry.pmStart);
    const entryTo = Math.min(sliceTo, entry.pmEnd);
    if (entryFrom >= entryTo) continue;
    const range = doc.createRange();
    try {
      if (!setDomRangeStart(range, entry, entryFrom)) continue;
      if (!setDomRangeEnd(range, entry, entryTo)) continue;
    } catch {
      continue;
    }
    rects.push(...(Array.from(range.getClientRects()) as unknown as DOMRect[]));
  }

  return rects;
}

/**
 * Sets the start boundary of a DOM Range based on a ProseMirror position.
 *
 * @param range - The DOM Range to modify
 * @param entry - The DOM position index entry containing the target element and PM range
 * @param pos - The ProseMirror position to set as the range start
 * @returns True if the range start was successfully set, false if the element is disconnected
 *
 * @remarks
 * If the entry's element contains a text node, sets the range start at the character offset
 * within that text node. Otherwise, positions the range before or after the element based
 * on whether pos is at or after the element's PM start position.
 */
function setDomRangeStart(range: Range, entry: DomPositionIndexEntry, pos: number): boolean {
  const el = entry.el;
  const pmStart = entry.pmStart;

  const firstChild = el.firstChild;
  if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
    const textNode = firstChild as Text;
    const charIndex = mapPmPosToCharIndex(pos, pmStart, entry.pmEnd, textNode.length);
    range.setStart(textNode, charIndex);
    return true;
  }

  if (!el.isConnected || !el.parentNode) return false;
  if (pos <= pmStart) {
    range.setStartBefore(el);
    return true;
  }
  range.setStartAfter(el);
  return true;
}

/**
 * Sets the end boundary of a DOM Range based on a ProseMirror position.
 *
 * @param range - The DOM Range to modify
 * @param entry - The DOM position index entry containing the target element and PM range
 * @param pos - The ProseMirror position to set as the range end
 * @returns True if the range end was successfully set, false if the element is disconnected
 *
 * @remarks
 * If the entry's element contains a text node, sets the range end at the character offset
 * within that text node. Otherwise, positions the range before or after the element based
 * on whether pos is at or after the element's PM start position.
 */
function setDomRangeEnd(range: Range, entry: DomPositionIndexEntry, pos: number): boolean {
  const el = entry.el;
  const pmStart = entry.pmStart;

  const firstChild = el.firstChild;
  if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
    const textNode = firstChild as Text;
    const charIndex = mapPmPosToCharIndex(pos, pmStart, entry.pmEnd, textNode.length);
    range.setEnd(textNode, charIndex);
    return true;
  }

  if (!el.isConnected || !el.parentNode) return false;
  if (pos <= pmStart) {
    range.setEndBefore(el);
    return true;
  }
  range.setEndAfter(el);
  return true;
}

/**
 * Options for computing caret position in page-local coordinates.
 */
export type ComputeDomCaretPageLocalOptions = {
  /** The DOM container hosting the rendered pages */
  painterHost: HTMLElement | null;
  /** Index mapping PM positions to DOM elements */
  domPositionIndex: DomPositionIndex;
  /** Function to rebuild the DOM position index when stale */
  rebuildDomPositionIndex: () => void;
  /** Current zoom level (1.0 = 100%) */
  zoom: number;
};

/**
 * Computes the visual caret position for a given ProseMirror position.
 *
 * Uses the DOM position index to locate the element corresponding to the given PM position,
 * then queries the browser's Range API to get the exact pixel coordinates of the caret.
 * Returns coordinates in page-local space (relative to the page element, accounting for zoom).
 *
 * @param options - Configuration including painter host, position index, and zoom
 * @param pos - The ProseMirror position to compute caret coordinates for
 * @returns Page-local caret position (pageIndex, x, y), or null if computation fails
 *
 * @remarks
 * - Automatically rebuilds the DOM position index if the entry's element is disconnected
 * - For text nodes, creates a collapsed range at the character offset to get precise coordinates
 * - For non-text elements, uses the element's bounding rect
 * - Uses line element bounds for vertical positioning to align caret with line height
 */
export function computeDomCaretPageLocal(
  options: ComputeDomCaretPageLocalOptions,
  pos: number,
): PageLocalCaretPosition | null {
  if (!options.painterHost) return null;

  if (options.domPositionIndex.size === 0) {
    options.rebuildDomPositionIndex();
  }

  let entry = options.domPositionIndex.findEntryAtPosition(pos);
  if (entry && !entry.el.isConnected) {
    options.rebuildDomPositionIndex();
    entry = options.domPositionIndex.findEntryAtPosition(pos);
  }
  if (!entry) return null;

  const targetEl = entry.el;
  const page = targetEl.closest(`.${DOM_CLASS_NAMES.PAGE}`) as HTMLElement | null;
  if (!page) return null;

  const pageRect = page.getBoundingClientRect();
  const zoom = options.zoom;

  const textNode = targetEl.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    const elRect = targetEl.getBoundingClientRect();
    return {
      pageIndex: Number(page.dataset.pageIndex ?? '0'),
      x: (elRect.left - pageRect.left) / zoom,
      y: (elRect.top - pageRect.top) / zoom,
    };
  }

  const charIndex = mapPmPosToCharIndex(pos, entry.pmStart, entry.pmEnd, (textNode as Text).length);
  const range = document.createRange();
  range.setStart(textNode, charIndex);
  range.setEnd(textNode, charIndex);
  const rangeRect = range.getBoundingClientRect();
  const lineEl = targetEl.closest('.superdoc-line') as HTMLElement | null;
  const lineRect = lineEl?.getBoundingClientRect() ?? rangeRect;
  return {
    pageIndex: Number(page.dataset.pageIndex ?? '0'),
    x: (rangeRect.left - pageRect.left) / zoom,
    y: (lineRect.top - pageRect.top) / zoom,
  };
}

/**
 * Maps a ProseMirror position to a character index within a text node.
 *
 * Handles the common case where PM positions map 1:1 with character offsets, as well as
 * edge cases where the PM range doesn't match text length (e.g., atomic nodes, images).
 * For mismatched ranges, uses a midpoint heuristic to determine whether to position at
 * the start or end of the text.
 *
 * @param pos - The ProseMirror position to map
 * @param pmStart - The PM start position of the element containing the text
 * @param pmEnd - The PM end position of the element containing the text
 * @param textLength - The length of the text node in characters
 * @returns Character offset within the text node (clamped to [0, textLength])
 *
 * @remarks
 * - Returns 0 for invalid inputs (non-finite values, empty text, invalid PM range)
 * - If pmRange === textLength, performs direct arithmetic mapping
 * - If pmRange !== textLength, uses midpoint heuristic (before midpoint → 0, after → textLength)
 * - Always clamps result to valid text node bounds
 */
function mapPmPosToCharIndex(pos: number, pmStart: number, pmEnd: number, textLength: number): number {
  if (!Number.isFinite(pos) || !Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) {
    return 0;
  }
  if (textLength <= 0) {
    return 0;
  }
  const pmRange = pmEnd - pmStart;
  if (!Number.isFinite(pmRange) || pmRange <= 0) {
    return 0;
  }
  if (pmRange === textLength) {
    const mapped = pos - pmStart;
    return Math.min(textLength, Math.max(0, mapped));
  }
  if (pos <= pmStart) {
    return 0;
  }
  if (pos >= pmEnd) {
    return textLength;
  }
  const midpoint = pmStart + pmRange / 2;
  return pos <= midpoint ? 0 : textLength;
}

/**
 * Threshold for sorting rectangles by y-coordinate.
 * Rectangles more than 2px apart vertically are considered to be on different lines
 * for initial sorting purposes.
 */
const Y_SORT_THRESHOLD_PX = 2;

/**
 * Threshold for determining if rectangles are on the same visual line.
 * Rectangles within 3px vertically are considered part of the same line for
 * deduplication purposes. This accounts for sub-pixel rendering differences
 * between line-box and text-content rects.
 */
const Y_SAME_LINE_THRESHOLD_PX = 3;

/**
 * Minimum horizontal overlap ratio to consider rectangles as duplicates.
 * If two rects on the same line have 80% or more horizontal overlap (relative
 * to the smaller rect's width), they are considered duplicates.
 */
const HORIZONTAL_OVERLAP_THRESHOLD = 0.8;

/**
 * Deduplicates overlapping rectangles returned by Range.getClientRects().
 *
 * The browser can return multiple rects for the same visual line when the Range
 * spans across element boundaries (e.g., from one <span> to another). This happens
 * because getClientRects() returns rects for both:
 * 1. The line-box (containing element's box)
 * 2. The text content within that box
 *
 * These rects have nearly identical y coordinates but slightly different heights
 * and widths, causing a "double selection" visual artifact when rendered.
 *
 * This function detects rects that overlap significantly on the same visual line
 * and keeps only one, preferring the smaller (text-content) rect.
 *
 * @param rects - Array of DOMRect objects returned by Range.getClientRects(). Input is not mutated.
 * @returns A new array containing deduplicated rectangles, sorted by position
 *
 * @remarks
 * Algorithm phases:
 *
 * **Phase 1: Group rects by Y coordinate (same line)**
 * - Sorts all rects by y coordinate (then by x within same y)
 * - Groups rects that are within Y_SAME_LINE_THRESHOLD_PX (3px) of each other
 * - Rects on the same visual line will be in the same group
 *
 * **Phase 2: Within each group, deduplicate**
 * - First pass: Remove exact duplicates (same x, y, width, height within epsilon thresholds)
 *   - X_DUPLICATE_EPS_PX (1px) for x-coordinate matching
 *   - Y_SAME_LINE_THRESHOLD_PX (3px) for y-coordinate matching
 *   - SIZE_EPS_PX (0.5px) for width/height matching
 * - Second pass: Filter out larger container rects
 *   - For rects with >80% horizontal overlap (HORIZONTAL_OVERLAP_THRESHOLD)
 *   - Marks and removes rects that are larger in width or height (by SIZE_EPS_PX)
 *
 * **Edge cases handled:**
 * - Zero-height/zero-width rects: Processed normally, larger ones removed in favor of smaller
 * - Multiple words on same line: Preserved if horizontal overlap <80%
 * - Unsorted input: Automatically sorted before processing
 * - Sub-pixel rendering differences: Handled via epsilon thresholds
 */
export function deduplicateOverlappingRects(rects: DOMRect[]): DOMRect[] {
  if (rects.length <= 1) return rects;

  // Sort by y coordinate, then by x
  const sorted = [...rects].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > Y_SORT_THRESHOLD_PX) return yDiff;
    return a.x - b.x;
  });

  const result: DOMRect[] = [];
  const groups: DOMRect[][] = [];
  let currentGroup: DOMRect[] = [];

  for (const rect of sorted) {
    if (currentGroup.length === 0) {
      currentGroup.push(rect);
      continue;
    }
    const groupY = currentGroup[0]!.y;
    if (Math.abs(rect.y - groupY) <= Y_SAME_LINE_THRESHOLD_PX) {
      currentGroup.push(rect);
    } else {
      groups.push(currentGroup);
      currentGroup = [rect];
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  const SIZE_EPS_PX = 0.5;
  const X_DUPLICATE_EPS_PX = 1;

  const hasSignificantOverlap = (a: DOMRect, b: DOMRect): boolean => {
    const xOverlapStart = Math.max(a.x, b.x);
    const xOverlapEnd = Math.min(a.x + a.width, b.x + b.width);
    const hasHorizontalOverlap = xOverlapEnd > xOverlapStart;
    if (!hasHorizontalOverlap) return false;
    const overlapWidth = Math.max(0, xOverlapEnd - xOverlapStart);
    const minWidth = Math.min(a.width, b.width);
    return minWidth > 0 && overlapWidth / minWidth > HORIZONTAL_OVERLAP_THRESHOLD;
  };

  const isLargerRect = (a: DOMRect, b: DOMRect): boolean => {
    return a.width > b.width + SIZE_EPS_PX || a.height > b.height + SIZE_EPS_PX;
  };

  for (const group of groups) {
    const unique: DOMRect[] = [];
    for (const rect of group) {
      const isDuplicate = unique.some((existing) => {
        const xClose = Math.abs(existing.x - rect.x) <= X_DUPLICATE_EPS_PX;
        const yClose = Math.abs(existing.y - rect.y) <= Y_SAME_LINE_THRESHOLD_PX;
        const widthClose = Math.abs(existing.width - rect.width) <= SIZE_EPS_PX;
        const heightClose = Math.abs(existing.height - rect.height) <= SIZE_EPS_PX;
        return xClose && yClose && widthClose && heightClose;
      });
      if (!isDuplicate) {
        unique.push(rect);
      }
    }

    if (unique.length <= 1) {
      result.push(...unique);
      continue;
    }

    const containers = new Set<DOMRect>();
    for (const rect of unique) {
      for (const other of unique) {
        if (rect === other) continue;
        if (!hasSignificantOverlap(rect, other)) continue;
        if (isLargerRect(rect, other)) {
          containers.add(rect);
          break;
        }
      }
    }

    const filtered = unique.filter((rect) => !containers.has(rect));
    result.push(...(filtered.length > 0 ? filtered : unique));
  }

  return result;
}
