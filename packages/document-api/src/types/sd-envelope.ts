/**
 * SDM/1 envelope types — addressing, read options, query/find, and results.
 *
 * These types wrap the core node model for API operations:
 *   SDAddress     — universal node locator
 *   SDNodeResult  — single-node read/find result
 *   SDFindResult  — paginated find result set
 *   SDReadOptions — projection options for reads
 */

import type { SDContentNode, SDInlineNode } from './sd-nodes.js';

// ---------------------------------------------------------------------------
// Address model
// ---------------------------------------------------------------------------

export interface SDPoint {
  blockId: string;
  /** UTF-16 code units. */
  offset: number;
}

export interface SDAddress {
  kind: 'content' | 'inline' | 'annotation' | 'section';
  stability: 'stable' | 'ephemeral';
  nodeId?: string;
  anchor?: { start: SDPoint; end: SDPoint };
  evaluatedRevision?: string;
  path?: Array<string | number>;
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

export interface SDGetNodeInput {
  target: SDAddress;
  options?: SDReadOptions;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export interface SDTextSelector {
  type: 'text';
  pattern: string;
  mode?: 'contains' | 'regex';
  caseSensitive?: boolean;
}

export interface SDNodeSelector {
  type: 'node';
  kind?: 'content' | 'inline';
  nodeKind?: string;
}

export type SDSelector = SDTextSelector | SDNodeSelector;

export interface SDFindInput {
  select: SDSelector;
  within?: SDAddress;
  limit?: number;
  offset?: number;
  options?: SDReadOptions;
}

// ---------------------------------------------------------------------------
// Result envelopes
// ---------------------------------------------------------------------------

export interface SDNodeResult {
  node: SDContentNode | SDInlineNode;
  address: SDAddress;
  context?: SDNodeContext;
}

export interface SDFindResult {
  total: number;
  limit: number;
  offset: number;
  items: SDNodeResult[];
}
