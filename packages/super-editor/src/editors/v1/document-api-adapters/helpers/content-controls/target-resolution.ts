/**
 * SDT target resolution — finding and resolving content control nodes
 * in the ProseMirror document tree.
 *
 * Shared by content-controls-wrappers.ts and node-info-mapper.ts.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ContentControlTarget } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SDT_NODE_NAMES = ['structuredContent', 'structuredContentBlock'] as const;
export const SDT_BLOCK_NAME = 'structuredContentBlock';
export const SDT_INLINE_NAME = 'structuredContent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedSdt {
  node: ProseMirrorNode;
  pos: number;
  kind: 'block' | 'inline';
}

// ---------------------------------------------------------------------------
// Core resolution functions
// ---------------------------------------------------------------------------

/** Check whether a ProseMirror node is an SDT (structuredContent or structuredContentBlock). */
export function isSdtNode(node: ProseMirrorNode): boolean {
  return SDT_NODE_NAMES.includes(node.type.name as (typeof SDT_NODE_NAMES)[number]);
}

/** Find all SDT nodes in the document in document order. */
export function findAllSdtNodes(doc: ProseMirrorNode): ResolvedSdt[] {
  const results: ResolvedSdt[] = [];
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (isSdtNode(node)) {
      results.push({
        node,
        pos,
        kind: node.type.name === SDT_BLOCK_NAME ? 'block' : 'inline',
      });
    }
    return true;
  });
  return results;
}

/**
 * Resolve exactly one SDT node by its target. Throws TARGET_NOT_FOUND if
 * missing or AMBIGUOUS_TARGET if multiple nodes share the same id.
 */
export function resolveSdtByTarget(doc: ProseMirrorNode, target: ContentControlTarget): ResolvedSdt {
  const nodeId = target.nodeId;
  const all = findAllSdtNodes(doc);
  const matches = all.filter((sdt) => String(sdt.node.attrs.id) === nodeId);

  if (matches.length === 0) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Content control with id "${nodeId}" not found.`, { target });
  }
  if (matches.length > 1) {
    throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', `Multiple content controls found with id "${nodeId}".`, {
      target,
      count: matches.length,
    });
  }
  return matches[0];
}
