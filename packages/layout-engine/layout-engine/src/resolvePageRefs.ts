/**
 * Page Reference Resolution Module
 *
 * Handles PAGEREF token resolution for `<w:instrText>PAGEREF _Bookmark \h</w:instrText>`
 * fields. Follows the same pattern as `resolvePageTokens.ts` (PAGE/NUMPAGES):
 * - Pass 1: Build anchor map (bookmark → page number) from the laid-out `Layout`.
 * - Pass 2: Clone paragraph blocks that contain pageReference tokens, replacing
 *   the placeholder text with the resolved page number and returning them as a
 *   `Map<blockId, FlowBlock>` alongside an `affectedBlockIds` set so the caller
 *   can re-measure + re-paginate the affected paragraphs.
 *
 * Callers are expected to run this inside the incrementalLayout convergence
 * loop so text-width changes that alter wrap and shift bookmark pages cascade
 * through additional iterations.
 */

import type { Layout, FlowBlock, ParagraphBlock } from '@superdoc/contracts';

/**
 * Result contract matches `ResolvePageTokensResult` from `resolvePageTokens.ts`
 * so the incremental layout convergence loop can merge the two resolution steps
 * uniformly.
 */
export interface ResolvePageRefsResult {
  /** Block ids that had at least one pageReference token resolved. */
  affectedBlockIds: Set<string>;
  /** Cloned blocks (token text replaced) keyed by id. Original blocks are not mutated. */
  updatedBlocks: Map<string, FlowBlock>;
}

/**
 * Build an anchor map (bookmark name → page number) by scanning which page each
 * bookmark's PM position falls into.
 *
 * Page numbers are 1-indexed (matches `layout.pages[i].number`).
 */
export function buildAnchorMap(bookmarks: Map<string, number>, layout: Layout): Map<string, number> {
  const anchorMap = new Map<string, number>();

  bookmarks.forEach((pmPosition, bookmarkName) => {
    for (const page of layout.pages) {
      for (const fragment of page.fragments) {
        if (fragment.kind !== 'para' || fragment.pmStart == null || fragment.pmEnd == null) continue;
        if (pmPosition >= fragment.pmStart && pmPosition < fragment.pmEnd) {
          anchorMap.set(bookmarkName, page.number);
          return;
        }
      }
    }
    // Bookmark not found in any fragment — leave out of the map so the caller
    // keeps the existing fallback text (Word's baked-in value at import time).
    console.warn(`[resolvePageRefs] Bookmark "${bookmarkName}" at PM position ${pmPosition} not found in layout`);
  });

  return anchorMap;
}

/**
 * Resolve every `token: 'pageReference'` run in `blocks` against `anchorMap`.
 * Returns cloned paragraph blocks for those that had at least one token
 * resolved; originals are never mutated.
 */
export function resolvePageRefTokens(blocks: FlowBlock[], anchorMap: Map<string, number>): ResolvePageRefsResult {
  const affectedBlockIds = new Set<string>();
  const updatedBlocks = new Map<string, FlowBlock>();

  for (const block of blocks) {
    if (block.kind !== 'paragraph') continue;
    if (!hasPageRefTokens(block)) continue;

    const clone = cloneBlockWithResolvedPageRefs(block, anchorMap);
    if (clone) {
      updatedBlocks.set(block.id, clone);
      affectedBlockIds.add(block.id);
    }
  }

  return { affectedBlockIds, updatedBlocks };
}

/**
 * Filter blocks to those that are TOC entries and were affected by PAGEREF
 * resolution. Useful for targeted re-measurement UI (e.g. a highlight pulse on
 * updated TOC entries) but not required for correctness — the incrementalLayout
 * loop re-measures all affected blocks via `affectedBlockIds` already.
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

function hasPageRefTokens(block: ParagraphBlock): boolean {
  for (const run of block.runs) {
    if ('token' in run && run.token === 'pageReference') return true;
  }
  return false;
}

/**
 * Clone a paragraph block, replacing the text of every pageReference run whose
 * bookmark is present in the anchor map. Runs whose bookmark didn't resolve
 * (missing from the map) are left alone so the Word-baked fallback stays.
 *
 * Returns null if no run was actually changed.
 */
function cloneBlockWithResolvedPageRefs(block: ParagraphBlock, anchorMap: Map<string, number>): ParagraphBlock | null {
  let anyChanged = false;

  const clonedRuns = block.runs.map((run) => {
    if (!('token' in run) || run.token !== 'pageReference' || !run.pageRefMetadata) return run;
    const bookmarkId = run.pageRefMetadata.bookmarkId;
    const resolvedPage = anchorMap.get(bookmarkId);
    if (resolvedPage == null) {
      // Keep the fallback text. Leave token metadata in place so a later
      // iteration with a stabilized layout may resolve it.
      console.warn(`[resolvePageRefs] Cannot resolve PAGEREF to "${bookmarkId}" - bookmark not found`);
      return run;
    }
    const newText = String(resolvedPage);
    if (run.text === newText) return run;
    anyChanged = true;
    // Strip the token metadata after a successful resolution so subsequent
    // convergence iterations don't re-resolve the same run. Matches the
    // resolvePageNumberTokens pattern.
    const { token: _token, pageRefMetadata: _meta, ...runWithoutToken } = run as Record<string, unknown>;
    return { ...(runWithoutToken as object), text: newText } as typeof run;
  });

  if (!anyChanged) return null;
  return { ...block, runs: clonedRuns };
}
