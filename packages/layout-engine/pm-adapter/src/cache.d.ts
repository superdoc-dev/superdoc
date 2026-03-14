/**
 * FlowBlock Cache for Incremental toFlowBlocks Conversion
 */

import type { FlowBlock } from '@superdoc/contracts';
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

export declare class FlowBlockCache {
  /**
   * Begin a new render cycle. Clears the "next" map and resets stats.
   */
  begin(): void;

  /**
   * Signal that external changes (e.g. Y.js collaboration) may have modified
   * document content without updating sdBlockRev.
   */
  setHasExternalChanges(value: boolean): void;

  /**
   * Look up cached blocks for a paragraph by its stable ID.
   * Returns the cached entry only if the node content matches.
   *
   * @param id - Stable paragraph ID (sdBlockId or paraId)
   * @param node - Current PM node (JSON object) to compare against cached version
   * @returns Lookup result with entry (if hit) and pre-computed nodeJson
   */
  get(id: string, node: PMNode): CacheLookupResult;

  /**
   * Store converted blocks for a paragraph in the cache.
   *
   * @param id - Stable paragraph ID
   * @param nodeJson - Pre-computed JSON string of the node (from get() result)
   * @param nodeRev - Node revision number (if available)
   * @param blocks - All FlowBlocks produced from this paragraph
   * @param pmStart - PM document position where this paragraph starts
   */
  set(
    id: string,
    nodeJson: string | undefined,
    nodeRev: number | null | undefined,
    blocks: FlowBlock[],
    pmStart: number,
  ): void;

  /**
   * Commit the current render cycle.
   * Swaps "next" to "previous", so only blocks seen in this render are retained.
   */
  commit(): void;

  /**
   * Clear the entire cache.
   * Call this on document load or when conversion settings change.
   */
  clear(): void;

  /**
   * Get cache statistics for the current render cycle.
   */
  get stats(): FlowBlockCacheStats;
}

/**
 * Shift PM positions in a single block by a delta.
 *
 * @param block - The block to shift
 * @param delta - The position delta (newPmStart - oldPmStart)
 * @returns A new block (shallow copy) with shifted positions
 */
export declare function shiftBlockPositions(block: FlowBlock, delta: number): FlowBlock;

/**
 * Shift PM positions in all blocks from a cached entry by a delta.
 *
 * @param blocks - Array of blocks to shift
 * @param delta - The position delta (newPmStart - oldPmStart)
 * @returns New array of blocks with shifted positions
 */
export declare function shiftCachedBlocks(blocks: FlowBlock[], delta: number): FlowBlock[];

/**
 * Extract stable paragraph ID from PM node attributes.
 *
 * @param node - PM node (JSON object) to extract ID from
 * @returns Stable ID string, or null if no stable ID is available
 */
export declare function getStableParagraphId(node: PMNode): string | null;
