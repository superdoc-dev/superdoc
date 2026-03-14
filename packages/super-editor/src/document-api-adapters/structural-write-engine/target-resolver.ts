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

import type { TextAddress } from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { resolveDefaultInsertTarget } from '../helpers/adapter-utils.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { findBlockByNodeIdOnly } from '../helpers/node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

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
 * Resolves an optional TextAddress target to an absolute ProseMirror insertion position.
 *
 * Uses block-level lookup so ALL block types (paragraphs, tables, images, etc.)
 * are addressable — not just text blocks.
 *
 * When target is omitted, falls back to end-of-document insertion.
 */
export function resolveInsertTarget(editor: Editor, target?: TextAddress): ResolvedInsertTarget {
  if (!target) {
    return resolveDocumentEndTarget(editor);
  }

  // Block-level resolution: find the block by ID, supporting all block types.
  const index = getBlockIndex(editor);
  let candidate;
  try {
    candidate = findBlockByNodeIdOnly(index, target.blockId);
  } catch {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Cannot resolve insert target for block "${target.blockId}".`,
    );
  }

  return {
    insertPos: candidate.end,
    structuralEnd: false,
    effectiveTarget: target,
    targetNode: candidate.node,
    targetNodePos: candidate.pos,
  };
}

/**
 * Resolves a required TextAddress target for structural replace operations.
 *
 * Resolves to the FULL block node range. This ensures tr.replaceWith
 * replaces the entire block — not just its text content.
 */
export function resolveReplaceTarget(editor: Editor, target: TextAddress): ResolvedReplaceTarget {
  const index = getBlockIndex(editor);
  let candidate;
  try {
    candidate = findBlockByNodeIdOnly(index, target.blockId);
  } catch {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Cannot resolve replace target for block "${target.blockId}".`,
    );
  }

  return {
    from: candidate.pos,
    to: candidate.end,
    effectiveTarget: target,
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
