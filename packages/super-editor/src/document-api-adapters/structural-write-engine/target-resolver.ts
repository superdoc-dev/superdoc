/**
 * Centralized target resolution for the structural write engine.
 *
 * Single source of truth for converting TargetSelector → editor position.
 * All structural operations route target resolution through this module.
 *
 * Key differences from text target resolution:
 * - Uses block-level lookup (findBlockByNodeIdOnly) as primary resolver,
 *   so non-text blocks (tables, images) are addressable.
 * - Insert: resolves to a point position (after target block by default).
 * - Replace: resolves to the FULL block node range (pos → pos + nodeSize),
 *   so tr.replaceWith replaces the entire block, not just its text content.
 */

import type { BlockNodeAddress, TextAddress } from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { resolveDefaultInsertTarget } from '../helpers/adapter-utils.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { findBlockById, findBlockByNodeIdOnly } from '../helpers/node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

/** Target selector for structural operations — either a typed block address or a text address. */
export type StructuralTarget = BlockNodeAddress | TextAddress;

/** Resolved insertion target with absolute ProseMirror position. */
export interface ResolvedInsertTarget {
  /** Absolute ProseMirror position for insertion. */
  insertPos: number;
  /** Whether the target is at the structural end of the document (no text blocks). */
  structuralEnd: boolean;
  /** The effective TextAddress used for resolution (may differ from input). */
  effectiveTarget?: TextAddress;
  /** The ProseMirror node at the target position (for placement resolution). */
  targetNode?: ProseMirrorNode;
  /** The starting position of the target node (for placement resolution). */
  targetNodePos?: number;
}

/** Resolved replacement target covering a full block node range. */
export interface ResolvedReplaceTarget {
  /** Absolute start position of the block node. */
  from: number;
  /** Absolute end position of the block node (pos + nodeSize). */
  to: number;
  /** The effective TextAddress used for resolution. */
  effectiveTarget: TextAddress;
}

/**
 * Resolves a block candidate from a structural target.
 *
 * For BlockNodeAddress targets, tries the composite `nodeType:nodeId` key first
 * to disambiguate duplicate IDs, then falls back to nodeId-only lookup. The
 * fallback is necessary because paragraph-backed blocks can change subtype
 * (paragraph/heading/listItem) via mutable attrs — a saved address from
 * find() or getNodeById() should still resolve after a restyle.
 *
 * TextAddress targets always use nodeId-only (alias-aware) resolution.
 */
function findBlockByTarget(index: ReturnType<typeof getBlockIndex>, target: StructuralTarget, operationName: string) {
  const nodeId = target.kind === 'block' ? target.nodeId : target.blockId;
  try {
    if (target.kind === 'block') {
      // Typed lookup first — handles duplicate IDs across different block types.
      const typed = findBlockById(index, target);
      if (typed) return typed;
      // Fallback to nodeId-only — handles stale subtypes after restyle.
      return findBlockByNodeIdOnly(index, nodeId);
    }
    return findBlockByNodeIdOnly(index, nodeId);
  } catch {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Cannot resolve ${operationName} target for block "${nodeId}".`,
    );
  }
}

/**
 * Resolves an optional target to an absolute ProseMirror insertion position.
 *
 * Uses block-level lookup so ALL block types (paragraphs, tables, images, etc.)
 * are addressable — not just text blocks.
 *
 * When target is omitted, falls back to end-of-document insertion.
 */
export function resolveInsertTarget(editor: Editor, target?: StructuralTarget): ResolvedInsertTarget {
  if (!target) {
    return resolveDocumentEndTarget(editor);
  }

  const index = getBlockIndex(editor);
  const candidate = findBlockByTarget(index, target, 'insert');

  return {
    insertPos: candidate.end,
    structuralEnd: false,
    effectiveTarget:
      target.kind === 'block' ? { kind: 'text', blockId: target.nodeId, range: { start: 0, end: 0 } } : target,
    targetNode: candidate.node,
    targetNodePos: candidate.pos,
  };
}

/**
 * Resolves a required target for structural replace operations.
 *
 * Resolves to the FULL block node range. This ensures tr.replaceWith
 * replaces the entire block — not just its text content.
 */
export function resolveReplaceTarget(editor: Editor, target: StructuralTarget): ResolvedReplaceTarget {
  const index = getBlockIndex(editor);
  const candidate = findBlockByTarget(index, target, 'replace');

  return {
    from: candidate.pos,
    to: candidate.end,
    effectiveTarget:
      target.kind === 'block' ? { kind: 'text', blockId: target.nodeId, range: { start: 0, end: 0 } } : target,
  };
}

/** Falls back to end-of-document when no explicit target is given. */
function resolveDocumentEndTarget(editor: Editor): ResolvedInsertTarget {
  const fallback = resolveDefaultInsertTarget(editor);
  if (!fallback) {
    return {
      insertPos: editor.state.doc.content.size,
      structuralEnd: true,
    };
  }

  if (fallback.kind === 'structural-end') {
    return {
      insertPos: fallback.insertPos,
      structuralEnd: true,
    };
  }

  // Look up the fallback target block node.
  const index = getBlockIndex(editor);
  let targetNode: ProseMirrorNode | undefined;
  let targetNodePos: number | undefined;
  try {
    const candidate = findBlockByNodeIdOnly(index, fallback.target.blockId);
    targetNode = candidate.node;
    targetNodePos = candidate.pos;
  } catch {
    // Fallback gracefully if block lookup fails.
  }

  return {
    insertPos: fallback.range.to,
    structuralEnd: false,
    effectiveTarget: fallback.target,
    targetNode,
    targetNodePos,
  };
}
