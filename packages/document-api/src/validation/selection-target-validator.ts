/**
 * Validation for SelectionTarget and its constituent types.
 *
 * These are shape-level guards — they check structural correctness,
 * not semantic validity (e.g., whether a blockId exists in the document).
 */

import type { SelectionTarget, SelectionPoint, SelectionEdgeNodeAddress } from '../types/address.js';
import { SELECTION_EDGE_NODE_TYPES } from '../types/address.js';
import { isRecord, isInteger } from '../validation-primitives.js';

const VALID_EDGE_VALUES: ReadonlySet<string> = new Set(['before', 'after']);
const VALID_EDGE_NODE_TYPES: ReadonlySet<string> = new Set(SELECTION_EDGE_NODE_TYPES);

/** Type guard for SelectionEdgeNodeAddress. */
export function isSelectionEdgeNodeAddress(value: unknown): value is SelectionEdgeNodeAddress {
  if (!isRecord(value)) return false;
  if (value.kind !== 'block') return false;
  if (typeof value.nodeType !== 'string' || !VALID_EDGE_NODE_TYPES.has(value.nodeType)) return false;
  if (typeof value.nodeId !== 'string' || value.nodeId === '') return false;
  return true;
}

/** Type guard for SelectionPoint. */
export function isSelectionPoint(value: unknown): value is SelectionPoint {
  if (!isRecord(value)) return false;

  if (value.kind === 'text') {
    return typeof value.blockId === 'string' && value.blockId !== '' && isInteger(value.offset) && value.offset >= 0;
  }

  if (value.kind === 'nodeEdge') {
    return (
      isSelectionEdgeNodeAddress(value.node) && typeof value.edge === 'string' && VALID_EDGE_VALUES.has(value.edge)
    );
  }

  return false;
}

/** Type guard for SelectionTarget. */
export function isSelectionTarget(value: unknown): value is SelectionTarget {
  if (!isRecord(value)) return false;
  if (value.kind !== 'selection') return false;
  return isSelectionPoint(value.start) && isSelectionPoint(value.end);
}
