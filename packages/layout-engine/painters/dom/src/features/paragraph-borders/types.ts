/**
 * Shared types for the DomPainter rendering pipeline.
 *
 * BlockLookup is the canonical definition — renderer.ts and feature modules
 * both import from here to avoid circular dependencies.
 */
import type { FlowBlock, Measure } from '@superdoc/contracts';

export type BlockLookupEntry = {
  block: FlowBlock;
  measure: Measure;
  version: string;
};

export type BlockLookup = Map<string, BlockLookupEntry>;
