/**
 * Selection target resolver — resolves a SelectionTarget to absolute
 * ProseMirror positions against the current document state.
 *
 * Handles both text-point and nodeEdge-point resolution. This is the
 * single source of truth for SelectionTarget → absolute position mapping.
 */

import type { SelectionTarget, SelectionPoint, SelectionEdgeNodeAddress } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { getBlockIndex } from './index-cache.js';
import {
  isTextBlockCandidate,
  findBlockByNodeIdOnly,
  type BlockCandidate,
  type BlockIndex,
} from './node-address-resolver.js';
import { resolveTextRangeInBlock } from './text-offset-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

export interface ResolvedSelectionTarget {
  /** Absolute PM position of the selection start. */
  absFrom: number;
  /** Absolute PM position of the selection end. */
  absTo: number;
  /** The canonical text snapshot across the resolved range. */
  text: string;
}

// ---------------------------------------------------------------------------
// Text-point resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a `kind: 'text'` selection point to an absolute PM position.
 *
 * Looks up the block by `blockId`, validates it is a text block, and
 * maps the character offset to an absolute document position.
 */
function resolveTextPoint(
  editor: Editor,
  index: BlockIndex,
  point: { kind: 'text'; blockId: string; offset: number },
): number {
  const candidate = findTextBlockByNodeId(index, point.blockId);
  if (!candidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Block "${point.blockId}" not found.`, {
      field: 'blockId',
      value: point.blockId,
    });
  }

  const resolved = resolveTextRangeInBlock(candidate.node, candidate.pos, {
    start: point.offset,
    end: point.offset,
  });
  if (!resolved) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Offset ${point.offset} is out of range in block "${point.blockId}".`,
      { field: 'offset', value: point.offset, blockId: point.blockId },
    );
  }

  return resolved.from;
}

// ---------------------------------------------------------------------------
// Node-edge resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a `kind: 'nodeEdge'` selection point to an absolute PM position.
 *
 * Finds the block node by `nodeId` and `nodeType`, then returns the
 * position immediately before (node start) or after (node end) the node.
 */
function resolveNodeEdgePoint(
  index: BlockIndex,
  point: { kind: 'nodeEdge'; node: SelectionEdgeNodeAddress; edge: 'before' | 'after' },
): number {
  const { node, edge } = point;
  const candidate = findBlockByTypeAndId(index, node.nodeType, node.nodeId);
  if (!candidate) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Node "${node.nodeType}" with id "${node.nodeId}" not found.`,
      { field: 'nodeId', value: node.nodeId, nodeType: node.nodeType },
    );
  }

  // Validate the resolved node type matches what the caller specified.
  if (candidate.nodeType !== node.nodeType) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Node "${node.nodeId}" has type "${candidate.nodeType}", expected "${node.nodeType}".`,
      { field: 'nodeType', expected: node.nodeType, actual: candidate.nodeType },
    );
  }

  return edge === 'before' ? candidate.pos : candidate.end;
}

// ---------------------------------------------------------------------------
// Point dispatch
// ---------------------------------------------------------------------------

function resolvePoint(editor: Editor, index: BlockIndex, point: SelectionPoint): number {
  if (point.kind === 'text') {
    return resolveTextPoint(editor, index, point);
  }
  return resolveNodeEdgePoint(index, point);
}

/**
 * Resolves a single SelectionPoint to an absolute PM position.
 *
 * This is a convenience wrapper for callers that need to resolve an
 * individual point without building a full ResolvedSelectionTarget.
 */
export function resolveSelectionPointPosition(editor: Editor, point: SelectionPoint): number {
  const index = getBlockIndex(editor);
  return resolvePoint(editor, index, point);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a SelectionTarget to absolute PM positions.
 *
 * Validates that the resolved `absFrom <= absTo` (normalizing the selection
 * direction). Returns the resolved positions and a text snapshot.
 */
export function resolveSelectionTarget(editor: Editor, target: SelectionTarget): ResolvedSelectionTarget {
  const index = getBlockIndex(editor);

  const rawFrom = resolvePoint(editor, index, target.start);
  const rawTo = resolvePoint(editor, index, target.end);

  // Normalize direction: absFrom must be <= absTo.
  const absFrom = Math.min(rawFrom, rawTo);
  const absTo = Math.max(rawFrom, rawTo);

  const text = editor.state.doc.textBetween(absFrom, absTo, '\n', '\ufffc');

  return { absFrom, absTo, text };
}

// ---------------------------------------------------------------------------
// Block lookup helpers
// ---------------------------------------------------------------------------

/**
 * Finds a text-block candidate by its nodeId. Rejects ambiguous matches.
 */
function findTextBlockByNodeId(index: BlockIndex, nodeId: string): BlockCandidate | undefined {
  const matches = index.candidates.filter((c) => c.nodeId === nodeId && isTextBlockCandidate(c));

  if (matches.length > 1) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Block ID "${nodeId}" is ambiguous: matched ${matches.length} text blocks.`,
      { blockId: nodeId, matchCount: matches.length },
    );
  }

  if (matches.length === 1) return matches[0];

  // Alias-aware fallback (same as findTextBlockCandidates in adapter-utils.ts).
  // This ensures IDs returned by create operations remain resolvable in
  // SelectionTarget lookups even if the canonical nodeId differs from the alias.
  try {
    const resolved = findBlockByNodeIdOnly(index, nodeId);
    if (isTextBlockCandidate(resolved)) return resolved;
  } catch (e) {
    if (e instanceof DocumentApiAdapterError && e.code === 'AMBIGUOUS_TARGET') throw e;
  }

  return undefined;
}

/**
 * Finds a block candidate by nodeType and nodeId.
 * Uses the block index's byId map for O(1) lookup, with alias-aware
 * fallback via nodeId-only search for stale types or aliased IDs.
 */
function findBlockByTypeAndId(index: BlockIndex, nodeType: string, nodeId: string): BlockCandidate | undefined {
  const key = `${nodeType}:${nodeId}`;

  if (index.ambiguous.has(key)) {
    throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', `Multiple blocks share key "${key}".`, { nodeType, nodeId });
  }

  const exact = index.byId.get(key);
  if (exact) return exact;

  // Alias-aware fallback: handles stale nodeType (e.g. paragraph re-typed to
  // heading) and aliased IDs (e.g. volatile sdBlockId replaced by deterministic
  // fallback). Same pattern as findTextBlockByNodeId.
  try {
    return findBlockByNodeIdOnly(index, nodeId);
  } catch (e) {
    if (e instanceof DocumentApiAdapterError && e.code === 'AMBIGUOUS_TARGET') throw e;
  }

  return undefined;
}
