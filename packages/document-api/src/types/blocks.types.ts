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
  /** Named paragraph style ID (e.g. 'Normal', 'Heading1'). */
  styleId?: string | null;
  /** Font family from the block's first text run. */
  fontFamily?: string;
  /** Font size from the block's first text run. */
  fontSize?: number;
  /** True if the block's text is bold. */
  bold?: boolean;
  /** True if the block's text is underlined. */
  underline?: boolean;
  /** Text color when explicitly set in the document. */
  color?: string;
  /** Paragraph alignment. */
  alignment?: string;
  /** Heading level (1-6). Only for headings. */
  headingLevel?: number;
  /** Ref handle targeting the block's full text. Pass to superdoc_format or superdoc_edit. */
  ref?: string;
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
