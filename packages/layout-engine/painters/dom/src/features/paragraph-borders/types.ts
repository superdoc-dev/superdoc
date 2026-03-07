/**
 * Shared types for paragraph border rendering features.
 */
import type { FlowBlock, Measure } from '@superdoc/contracts';

/**
 * Entry in the block lookup map. Re-exported here to avoid
 * a direct import from the monolithic renderer.
 */
export type BlockLookupEntry = {
  block: FlowBlock;
  measure: Measure;
  version: string;
};

export type BlockLookup = Map<string, BlockLookupEntry>;
