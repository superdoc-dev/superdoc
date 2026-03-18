/**
 * SDM/1 envelope types — read options, query/find, and results.
 *
 * These types wrap the core node model for API operations:
 *   SDNodeResult  — single-node read/find result
 *   SDFindResult  — paginated find result set
 *   SDReadOptions — projection options for reads
 */

import type { BlockNodeAddress, NodeAddress } from './base.js';
import type { TextSelector, NodeSelector } from './query.js';
import type { SDContentNode, SDInlineNode } from './sd-nodes.js';

// ---------------------------------------------------------------------------
// Address model
// ---------------------------------------------------------------------------

export interface SDPoint {
  blockId: string;
  /** UTF-16 code units. */
  offset: number;
}

export interface SDNodeContext {
  ancestors?: Array<{ id: string; kind: string }>;
  sectionId?: string;
  tablePosition?: { tableId: string; rowIndex: number; cellIndex: number };
  listPosition?: { listId: string; itemPath: number[]; level: number };
}

// ---------------------------------------------------------------------------
// Read options
// ---------------------------------------------------------------------------

export interface SDReadOptions {
  /** Include resolved (cascaded) property values. Default false. */
  includeResolved?: boolean;
  /** Include per-property provenance. Requires includeResolved=true. Default false. */
  includeProvenance?: boolean;
  /** Include SDNodeContext on SDNodeResult. Default false. */
  includeContext?: boolean;
}

// ---------------------------------------------------------------------------
// Operation inputs
// ---------------------------------------------------------------------------

export interface SDGetInput {
  options?: SDReadOptions;
}

// ---------------------------------------------------------------------------
// Find input
// ---------------------------------------------------------------------------

export interface SDFindInput {
  select: TextSelector | NodeSelector;
  within?: BlockNodeAddress;
  limit?: number;
  offset?: number;
  options?: SDReadOptions;
}

// ---------------------------------------------------------------------------
// Result envelopes
// ---------------------------------------------------------------------------

export interface SDNodeResult {
  node: SDContentNode | SDInlineNode;
  address: NodeAddress;
  context?: SDNodeContext;
}

export interface SDFindResult {
  total: number;
  limit: number;
  offset: number;
  items: SDNodeResult[];
}
