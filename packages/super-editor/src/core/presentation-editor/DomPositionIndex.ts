import { DOM_CLASS_NAMES } from '@superdoc/painter-dom';

import { debugLog, getSelectionDebugConfig } from './SelectionDebug.js';

/**
 * Represents a single entry in the DOM position index.
 *
 * @remarks
 * Each entry maps a ProseMirror position range to a DOM element that was painted
 * with data-pm-start and data-pm-end attributes.
 */
export type DomPositionIndexEntry = {
  /** The starting ProseMirror position (inclusive) */
  pmStart: number;
  /** The ending ProseMirror position (inclusive) */
  pmEnd: number;
  /** The DOM element representing this position range */
  el: HTMLElement;
};

/**
 * Options for controlling how the DOM position index is rebuilt.
 */
type RebuildOptions = {
  /**
   * When true (default), only index "leaf" elements, meaning elements with
   * `data-pm-start`/`data-pm-end` that do not themselves contain any descendant
   * elements with PM range attributes.
   *
   * This prevents indexing container elements like pages/lines/fragments which
   * would otherwise overlap with run-level spans and complicate lookups.
   */
  leafOnly?: boolean;
};

/**
 * A lightweight index for mapping ProseMirror positions to painted DOM elements.
 *
 * This is rebuilt after each paint and can be used to efficiently locate the
 * DOM element corresponding to a given PM position, without repeated full-DOM scans.
 */
export class DomPositionIndex {
  #entries: DomPositionIndexEntry[] = [];

  get size(): number {
    return this.#entries.length;
  }

  /**
   * Rebuilds the index by scanning the container for elements with PM position attributes.
   *
   * @param container - The root DOM element to scan (typically the painter host)
   * @param options - Options controlling index behavior
   *
   * @remarks
   * This method performs the following steps:
   * 1. Queries all elements with both data-pm-start and data-pm-end attributes
   * 2. Filters out inline SDT wrapper elements (which are metadata containers)
   * 3. If leafOnly is true (default), filters out container elements that have descendant
   *    PM-position elements, keeping only leaf elements
   * 4. Validates that pmStart and pmEnd are finite numbers with pmEnd >= pmStart
   * 5. Sorts entries by pmStart (ascending), then by pmEnd (ascending)
   *
   * The leafOnly filtering prevents indexing container elements like pages, lines, and
   * fragments which would otherwise overlap with run-level spans and complicate lookups.
   *
   * The sorting ensures that binary search operations work correctly and that entries
   * with the same start position are ordered by their end position.
   *
   * Safe to call multiple times - each call completely replaces the index. The previous
   * index is discarded.
   */
  rebuild(container: HTMLElement, options: RebuildOptions = {}): void {
    const leafOnly = options.leafOnly !== false;
    const nodes = Array.from(container.querySelectorAll('[data-pm-start][data-pm-end]'));
    const entries: DomPositionIndexEntry[] = [];

    const pmNodes: HTMLElement[] = [];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      pmNodes.push(node);
    }

    const nonLeaf = new WeakSet<HTMLElement>();
    if (leafOnly) {
      const pmNodeSet = new WeakSet<HTMLElement>();
      pmNodes.forEach((n) => pmNodeSet.add(n));
      for (const node of pmNodes) {
        let parent = node.parentElement;
        while (parent && parent !== container) {
          if (pmNodeSet.has(parent)) {
            nonLeaf.add(parent);
          }
          parent = parent.parentElement;
        }
      }
    }

    for (const node of pmNodes) {
      if (node.classList.contains(DOM_CLASS_NAMES.INLINE_SDT_WRAPPER)) continue;
      if (node.closest('.superdoc-page-header, .superdoc-page-footer')) continue;
      if (leafOnly && nonLeaf.has(node)) continue;

      const pmStart = Number(node.dataset.pmStart ?? 'NaN');
      const pmEnd = Number(node.dataset.pmEnd ?? 'NaN');
      if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) continue;
      if (pmEnd < pmStart) continue;

      entries.push({ pmStart, pmEnd, el: node });
    }

    entries.sort((a, b) => (a.pmStart - b.pmStart !== 0 ? a.pmStart - b.pmStart : a.pmEnd - b.pmEnd));
    this.#entries = entries;

    const isVerbose = getSelectionDebugConfig().logLevel === 'verbose';
    if (isVerbose) {
      const counts = { total: entries.length, body: 0, header: 0, footer: 0 };
      const bodySamples: Array<{ pmStart: number; pmEnd: number; pageIndex: string | null; text: string }> = [];
      const headerSamples: Array<{ pmStart: number; pmEnd: number; pageIndex: string | null; text: string }> = [];
      const footerSamples: Array<{ pmStart: number; pmEnd: number; pageIndex: string | null; text: string }> = [];

      for (const entry of entries) {
        const pageEl = entry.el.closest(`.${DOM_CLASS_NAMES.PAGE}`) as HTMLElement | null;
        const pageIndex = pageEl?.dataset.pageIndex ?? null;
        const section = entry.el.closest('.superdoc-page-header')
          ? 'header'
          : entry.el.closest('.superdoc-page-footer')
            ? 'footer'
            : 'body';

        if (section === 'header') {
          counts.header += 1;
          if (headerSamples.length < 10) {
            headerSamples.push({
              pmStart: entry.pmStart,
              pmEnd: entry.pmEnd,
              pageIndex,
              text: (entry.el.textContent ?? '').slice(0, 40),
            });
          }
          continue;
        }
        if (section === 'footer') {
          counts.footer += 1;
          if (footerSamples.length < 10) {
            footerSamples.push({
              pmStart: entry.pmStart,
              pmEnd: entry.pmEnd,
              pageIndex,
              text: (entry.el.textContent ?? '').slice(0, 40),
            });
          }
          continue;
        }

        counts.body += 1;
        if (bodySamples.length < 10) {
          bodySamples.push({
            pmStart: entry.pmStart,
            pmEnd: entry.pmEnd,
            pageIndex,
            text: (entry.el.textContent ?? '').slice(0, 40),
          });
        }
      }

      debugLog(
        'verbose',
        `DomPositionIndex: rebuild summary ${JSON.stringify({
          counts,
          bodySamples,
          headerSamples,
          footerSamples,
        })}`,
      );
    }
  }

  /**
   * Finds the index entry whose position range contains the given position.
   *
   * @param pos - The ProseMirror position to look up
   * @returns The entry containing this position, or null if none found
   *
   * @remarks
   * Uses binary search (upper bound) to efficiently find the rightmost entry whose
   * pmStart is less than or equal to pos, then validates that pos is within the
   * entry's [pmStart, pmEnd] range.
   *
   * Time complexity: O(log n) where n is the number of entries.
   *
   * Returns null if:
   * - The position is not a finite number
   * - The index is empty
   * - No entry contains the position (position is in a gap between entries)
   *
   * For positions that fall exactly on entry boundaries:
   * - If pos equals entry.pmStart, the entry is returned
   * - If pos equals entry.pmEnd, the entry is returned
   * - Due to sorting, if multiple entries could match, the first in sort order is returned
   */
  findEntryAtPosition(pos: number): DomPositionIndexEntry | null {
    if (!Number.isFinite(pos)) return null;
    const entries = this.#entries;
    if (entries.length === 0) return null;

    // Upper-bound search for pmStart <= pos
    let lo = 0;
    let hi = entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (entries[mid].pmStart <= pos) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    const idx = lo - 1;
    if (idx < 0) return null;

    const entry = entries[idx];
    if (pos < entry.pmStart || pos > entry.pmEnd) return null;
    return entry;
  }

  findElementAtPosition(pos: number): HTMLElement | null {
    return this.findEntryAtPosition(pos)?.el ?? null;
  }

  /**
   * Finds all index entries whose position ranges overlap with the given range.
   *
   * @param from - The start of the query range (inclusive)
   * @param to - The end of the query range (exclusive)
   * @returns Array of entries that overlap the range, in index order
   *
   * @remarks
   * An entry overlaps the query range [start, end) if:
   * - entry.pmStart < end (entry starts before query range ends)
   * - entry.pmEnd > start (entry ends after query range starts)
   *
   * The algorithm:
   * 1. Normalizes the range (swaps from/to if necessary)
   * 2. Uses binary search to find the first potentially overlapping entry
   * 3. Scans forward, collecting overlapping entries until entries start beyond the range
   *
   * Time complexity: O(log n + k) where n is total entries and k is the number of matching entries.
   *
   * Returns empty array if:
   * - Either from or to is not a finite number
   * - from equals to (zero-length range)
   * - The index is empty
   * - No entries overlap the range
   *
   * Edge cases:
   * - Zero-length ranges (from === to) return empty array
   * - Reversed ranges are automatically normalized (from > to is handled)
   */
  findEntriesInRange(from: number, to: number): DomPositionIndexEntry[] {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    if (start === end) return [];

    const entries = this.#entries;
    if (entries.length === 0) return [];

    // Find first entry whose pmStart <= start, then adjust forward if it ends before start.
    let lo = 0;
    let hi = entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (entries[mid].pmStart < start) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    let idx = Math.max(0, lo - 1);
    while (idx < entries.length && entries[idx].pmEnd < start) {
      idx += 1;
    }

    const out: DomPositionIndexEntry[] = [];
    for (let i = idx; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry.pmStart >= end) break;
      if (entry.pmEnd <= start) continue;
      out.push(entry);
    }
    return out;
  }

  /**
   * Finds all DOM elements whose position ranges overlap with the given range.
   *
   * @param from - The start of the query range (inclusive)
   * @param to - The end of the query range (exclusive)
   * @returns Array of DOM elements that overlap the range, in index order
   *
   * @remarks
   * This is a convenience method that calls findEntriesInRange() and extracts the
   * element references from each entry.
   *
   * See findEntriesInRange() for details on the overlap algorithm and edge cases.
   */
  findElementsInRange(from: number, to: number): HTMLElement[] {
    return this.findEntriesInRange(from, to).map((e) => e.el);
  }
}
