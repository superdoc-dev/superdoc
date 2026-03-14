import type { BlockNodeType, BlockNodeAddress, DeletableBlockNodeAddress } from './base.js';

// ---------------------------------------------------------------------------
// blocks.list
// ---------------------------------------------------------------------------

export interface BlockListEntry {
  ordinal: number;
  nodeId: string;
  nodeType: BlockNodeType;
  textPreview: string | null;
  isEmpty: boolean;
}

export interface BlocksListInput {
  offset?: number;
  limit?: number;
  nodeTypes?: BlockNodeType[];
}

export interface BlocksListResult {
  total: number;
  blocks: BlockListEntry[];
  revision: string;
}

// ---------------------------------------------------------------------------
// blocks.delete
// ---------------------------------------------------------------------------

export interface BlocksDeleteInput {
  target: DeletableBlockNodeAddress;
}

export interface BlocksDeleteResult {
  success: true;
  deleted: DeletableBlockNodeAddress;
  deletedBlock?: DeletedBlockSummary;
}

// ---------------------------------------------------------------------------
// blocks.deleteRange
// ---------------------------------------------------------------------------

export interface BlocksDeleteRangeInput {
  start: BlockNodeAddress;
  end: BlockNodeAddress;
}

export interface DeletedBlockSummary {
  ordinal: number;
  nodeId: string;
  nodeType: string;
  textPreview: string | null;
}

export interface BlocksDeleteRangeResult {
  success: true;
  deletedCount: number;
  deletedBlocks: DeletedBlockSummary[];
  revision: {
    before: string;
    after: string;
  };
  dryRun: boolean;
}
