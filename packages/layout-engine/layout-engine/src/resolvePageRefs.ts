/**
 * Page Reference Resolution Module
 *
 * Handles two-pass layout for dynamic cross-reference resolution:
 * - Pass 1: Build anchor map (bookmark → page number)
 * - Pass 2: Resolve pageReference tokens and re-measure affected paragraphs
 *
 * Superseded by resolve-stage PAGEREF handling in @superdoc/layout-resolved.
 * SD-3007 follow-up: remove this legacy scan once step 12 consolidates the
 * interim anchor-map implementations.
 */

import type { Layout, FlowBlock, ParagraphBlock } from '@superdoc/contracts';

/**
 * Build an anchor map from bookmarks and layout fragments.
 *
 * For each bookmark, determines which page it appears on by checking
 * if the bookmark's PM position falls within any fragment's PM range.
 *
 * @param bookmarks - Map of bookmark names to PM positions
 * @param layout - Completed layout with positioned fragments
 * @returns Map of bookmark names to page numbers (1-indexed)
 */
export function buildAnchorMap(bookmarks: Map<string, number>, layout: Layout): Map<string, number> {
  const anchorMap = new Map<string, number>();

  // For each bookmark, find which page it's on
  bookmarks.forEach((pmPosition, bookmarkName) => {
    // Search through all pages and fragments
    for (const page of layout.pages) {
      for (const fragment of page.fragments) {
        // Only paragraph fragments have PM positions
        if (fragment.kind === 'para' && fragment.pmStart != null && fragment.pmEnd != null) {
          // Check if bookmark position falls within this fragment
          if (pmPosition >= fragment.pmStart && pmPosition < fragment.pmEnd) {
            anchorMap.set(bookmarkName, page.number);
            return; // Found it, move to next bookmark
          }
        }
      }
    }

    // Bookmark not found in any fragment - log warning but continue
    console.warn(`[resolvePageRefs] Bookmark "${bookmarkName}" at PM position ${pmPosition} not found in layout`);
  });

  return anchorMap;
}

/**
 * Resolve pageReference tokens in blocks using the anchor map.
 *
 * Finds all runs with token='pageReference', looks up the target bookmark
 * in the anchor map, and replaces the run's text with the resolved page number.
 *
 * @param blocks - FlowBlocks containing runs with pageReference tokens
 * @param anchorMap - Map of bookmark names to page numbers
 * @returns Array of block IDs that had tokens resolved (for re-measurement)
 */
export function resolvePageRefTokens(blocks: FlowBlock[], anchorMap: Map<string, number>): Set<string> {
  const affectedBlockIds = new Set<string>();

  for (const block of blocks) {
    if (block.kind !== 'paragraph') continue;

    let blockModified = false;

    for (const run of block.runs) {
      // Type guard: only TextRun can have token
      if ('token' in run && run.token === 'pageReference' && run.pageRefMetadata) {
        const bookmarkId = run.pageRefMetadata.bookmarkId;
        const resolvedPage = anchorMap.get(bookmarkId);

        if (resolvedPage != null) {
          // Replace placeholder text with actual page number
          run.text = String(resolvedPage);
          // Clear token metadata to treat as normal text after resolution
          delete run.token;
          delete run.pageRefMetadata;
          blockModified = true;
        } else {
          // Bookmark not found in anchor map - keep placeholder
          console.warn(`[resolvePageRefs] Cannot resolve PAGEREF to "${bookmarkId}" - bookmark not found`);
          // Keep the fallback text (already set during PM adapter processing)
        }
      }
    }

    if (blockModified) {
      affectedBlockIds.add(block.id);
    }
  }

  return affectedBlockIds;
}

/**
 * Filter blocks to only include TOC entries that need re-measurement.
 *
 * @param blocks - All FlowBlocks
 * @param affectedBlockIds - Set of block IDs that had tokens resolved
 * @returns Array of ParagraphBlocks that are TOC entries and were affected
 */
export function getTocBlocksForRemeasurement(blocks: FlowBlock[], affectedBlockIds: Set<string>): ParagraphBlock[] {
  const tocBlocks: ParagraphBlock[] = [];

  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.attrs?.isTocEntry === true && affectedBlockIds.has(block.id)) {
      tocBlocks.push(block);
    }
  }

  return tocBlocks;
}
