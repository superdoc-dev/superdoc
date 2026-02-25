/**
 * FlowBlock Cache for Incremental toFlowBlocks Conversion
 *
 * This cache stores converted blocks from paragraph nodes, keyed by their stable ID (sdBlockId/paraId).
 * A single paragraph PM node can produce multiple FlowBlocks (page breaks, drawings, paragraph block),
 * so we cache the entire array of blocks produced from each paragraph.
 *
 * This enables reusing previously converted blocks when the paragraph content hasn't changed,
 * reducing toFlowBlocks time from ~35ms to ~5ms for typical single-character edits.
 *
 * Cache Lifecycle:
 * 1. begin() - Called at start of toFlowBlocks, clears the "next" map
 * 2. get() - Check if a paragraph with given ID exists and content matches
 * 3. set() - Store converted blocks in the "next" map
 * 4. commit() - Swap "next" to "previous", only retaining blocks seen this render
 * 5. clear() - Reset cache on document load or major mode changes
 */

import type { FlowBlock, ParagraphBlock } from '@superdoc/contracts';
import type { PMNode } from './types.js';

export type CachedParagraphEntry = {
  /** JSON string of the PM node for equality comparison */
  nodeJson?: string;
  /** Optional revision number for fast equality comparison */
  nodeRev?: number | null;
  /** All FlowBlocks produced from this paragraph (may include page breaks, drawings, etc.) */
  blocks: FlowBlock[];
  /** The PM document position where this paragraph node started */
  pmStart: number;
};

export type FlowBlockCacheStats = {
  hits: number;
  misses: number;
};

/**
 * Result of a cache lookup. Always includes the serialized node JSON
 * to avoid double serialization when storing on cache miss.
 */
export type CacheLookupResult = {
  /** The cached entry if found and content matches, null otherwise */
  entry: CachedParagraphEntry | null;
  /** Pre-computed JSON string of the node (reuse this in set() to avoid double serialization) */
  nodeJson?: string;
  /** Parsed node revision (if present) */
  nodeRev?: number | null;
};

const getNodeRevision = (node: PMNode): number | null => {
  const attrs = node?.attrs as Record<string, unknown> | null | undefined;
  if (!attrs) return null;
  const raw = attrs.sdBlockRev;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export class FlowBlockCache {
  #previous = new Map<string, CachedParagraphEntry>();
  #next = new Map<string, CachedParagraphEntry>();
  #hits = 0;
  #misses = 0;
  #hasExternalChanges = false;

  /**
   * Begin a new render cycle. Clears the "next" map and resets stats.
   */
  begin(): void {
    this.#next.clear();
    this.#hits = 0;
    this.#misses = 0;
  }

  /**
   * Signal that external changes (e.g. Y.js collaboration) may have modified
   * document content without updating sdBlockRev. When set, the fast revision
   * comparison falls through to a JSON equality check to prevent false cache hits.
   *
   * The flag is automatically cleared after {@link commit}.
   */
  setHasExternalChanges(value: boolean): void {
    this.#hasExternalChanges = value;
  }

  /**
   * Look up cached blocks for a paragraph by its stable ID.
   * Returns the cached entry only if the node content matches.
   *
   * Uses a dual comparison strategy:
   * 1. Fast path: compare sdBlockRev numbers (O(1)). A different rev is a
   *    definitive miss. A matching rev is a hit **only** when we trust that
   *    sdBlockRev is always incremented for content changes (i.e. no external
   *    changes pending).
   * 2. JSON path: full node serialization + string comparison. Used as a
   *    safety net when external changes may have bypassed the revision counter
   *    (e.g. Y.js-origin collaboration transactions) or when revision info is
   *    unavailable.
   *
   * Always returns the serialized nodeJson to avoid double serialization -
   * pass this to set() instead of the node object.
   *
   * @param id - Stable paragraph ID (sdBlockId or paraId)
   * @param node - Current PM node (JSON object) to compare against cached version
   * @returns Lookup result with entry (if hit) and pre-computed nodeJson
   */
  get(id: string, node: PMNode): CacheLookupResult {
    const nodeRev = getNodeRevision(node);

    const cached = this.#previous.get(id);
    if (!cached) {
      this.#misses++;
      const nodeJson = JSON.stringify(node);
      return { entry: null, nodeJson, nodeRev };
    }

    if (nodeRev != null && cached.nodeRev != null) {
      // Fast rejection: different revision is always a miss
      if (cached.nodeRev !== nodeRev) {
        this.#misses++;
        return { entry: null, nodeRev };
      }

      // Fast acceptance: safe only when all changes go through blockNodePlugin
      // (which always increments sdBlockRev for local edits). When external
      // changes are pending (e.g. Y.js collaboration), sdBlockRev may not have
      // been updated despite content changes — fall through to JSON comparison.
      if (!this.#hasExternalChanges) {
        this.#hits++;
        return { entry: cached, nodeRev, nodeJson: cached.nodeJson };
      }
    }

    // JSON comparison: always correct, handles external changes and missing revisions
    const nodeJson = JSON.stringify(node);
    if (cached.nodeJson !== nodeJson) {
      this.#misses++;
      return { entry: null, nodeJson, nodeRev };
    }

    this.#hits++;
    return { entry: cached, nodeJson, nodeRev };
  }

  /**
   * Store converted blocks for a paragraph in the cache.
   *
   * @param id - Stable paragraph ID
   * @param nodeJson - Pre-computed JSON string of the node (from get() result)
   * @param blocks - All FlowBlocks produced from this paragraph
   * @param pmStart - PM document position where this paragraph starts
   */
  set(
    id: string,
    nodeJson: string | undefined,
    nodeRev: number | null | undefined,
    blocks: FlowBlock[],
    pmStart: number,
  ): void {
    this.#next.set(id, { nodeJson, nodeRev, blocks, pmStart });
  }

  /**
   * Commit the current render cycle.
   * Swaps "next" to "previous", so only blocks seen in this render are retained.
   * Clears the external-changes flag since the render cycle consumed it.
   */
  commit(): void {
    this.#previous = this.#next;
    this.#next = new Map();
    this.#hasExternalChanges = false;
  }

  /**
   * Clear the entire cache.
   * Call this on document load or when conversion settings change.
   */
  clear(): void {
    this.#previous.clear();
    this.#next.clear();
  }

  /**
   * Get cache statistics for the current render cycle.
   */
  get stats(): FlowBlockCacheStats {
    return { hits: this.#hits, misses: this.#misses };
  }
}

/**
 * Shift PM positions in a single block by a delta.
 *
 * When reusing cached blocks, the paragraph's position in the document may have
 * shifted (e.g., text was inserted earlier in the doc). This function adjusts
 * the pmStart/pmEnd values to reflect the new position.
 *
 * Always returns a shallow copy to prevent cache pollution from downstream mutations.
 *
 * PM positions may be stored in different locations depending on block type:
 * - Paragraph blocks: positions in each run (run.pmStart, run.pmEnd)
 * - Atomic blocks (image, drawing): positions in attrs (block.attrs.pmStart, block.attrs.pmEnd)
 * - Other blocks: positions at block level (block.pmStart, block.pmEnd)
 *
 * @param block - The block to shift
 * @param delta - The position delta (newPmStart - oldPmStart)
 * @returns A new block (shallow copy) with shifted positions
 */
export function shiftBlockPositions(block: FlowBlock, delta: number): FlowBlock {
  // Handle paragraph blocks with runs - always copy to prevent cache pollution
  if (block.kind === 'paragraph') {
    const paragraphBlock = block as ParagraphBlock;
    return {
      ...paragraphBlock,
      runs: paragraphBlock.runs.map((run) => ({
        ...run,
        pmStart: run.pmStart == null ? run.pmStart : run.pmStart + delta,
        pmEnd: run.pmEnd == null ? run.pmEnd : run.pmEnd + delta,
      })),
    };
  }

  // Handle atomic blocks (image, drawing) that store PM positions in attrs
  // These blocks store pmStart/pmEnd in block.attrs rather than at the block level
  if (block.kind === 'image' || block.kind === 'drawing') {
    const blockWithAttrs = block as FlowBlock & { attrs?: Record<string, unknown> };
    if (blockWithAttrs.attrs) {
      const attrsPmStart = blockWithAttrs.attrs.pmStart;
      const attrsPmEnd = blockWithAttrs.attrs.pmEnd;
      const hasAttrsPositions =
        (typeof attrsPmStart === 'number' && Number.isFinite(attrsPmStart)) ||
        (typeof attrsPmEnd === 'number' && Number.isFinite(attrsPmEnd));

      if (hasAttrsPositions) {
        return {
          ...block,
          attrs: {
            ...blockWithAttrs.attrs,
            pmStart:
              typeof attrsPmStart === 'number' && Number.isFinite(attrsPmStart) ? attrsPmStart + delta : attrsPmStart,
            pmEnd: typeof attrsPmEnd === 'number' && Number.isFinite(attrsPmEnd) ? attrsPmEnd + delta : attrsPmEnd,
          },
        } as unknown as FlowBlock;
      }
    }
    // Fall through to shallow copy if no attrs positions
  }

  // For other block types, always create a shallow copy to prevent cache pollution.
  // If the block has position tracking at the block level, shift the positions.
  const blockWithPos = block as FlowBlock & { pmStart?: number; pmEnd?: number };
  if (blockWithPos.pmStart != null || blockWithPos.pmEnd != null) {
    return {
      ...block,
      pmStart: blockWithPos.pmStart == null ? blockWithPos.pmStart : blockWithPos.pmStart + delta,
      pmEnd: blockWithPos.pmEnd == null ? blockWithPos.pmEnd : blockWithPos.pmEnd + delta,
    } as unknown as FlowBlock;
  }

  // No position tracking, but still return a shallow copy to prevent cache pollution
  return { ...block } as FlowBlock;
}

/**
 * Shift PM positions in all blocks from a cached entry by a delta.
 *
 * @param blocks - Array of blocks to shift
 * @param delta - The position delta (newPmStart - oldPmStart)
 * @returns New array of blocks with shifted positions
 */
export function shiftCachedBlocks(blocks: FlowBlock[], delta: number): FlowBlock[] {
  // Always map to new array with copied blocks to prevent cache pollution,
  // even when delta is 0. shiftBlockPositions handles shallow copying.
  return blocks.map((block) => shiftBlockPositions(block, delta));
}

/**
 * Extract stable paragraph ID from PM node attributes.
 *
 * Uses sdBlockId (preferred) or paraId (fallback) from the node's attrs.
 * These IDs are stable across edits and are used as cache keys.
 *
 * @param node - PM node (JSON object) to extract ID from
 * @returns Stable ID string, or null if no stable ID is available
 */
export function getStableParagraphId(node: PMNode): string | null {
  const attrs = node.attrs;
  if (!attrs) return null;

  // Prefer sdBlockId (superdoc's internal ID), fallback to paraId (from DOCX w14:paraId)
  const id = attrs.sdBlockId ?? attrs.paraId;
  if (id == null) return null;

  return String(id);
}
