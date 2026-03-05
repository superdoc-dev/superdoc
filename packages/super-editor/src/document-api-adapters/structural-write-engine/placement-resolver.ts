/**
 * Placement resolver — applies placement policy to determine insertion point.
 *
 * Translates abstract placement values ('before', 'after', 'insideStart', 'insideEnd')
 * into concrete ProseMirror positions.
 */

import type { Placement } from '@superdoc/document-api';
import { DEFAULT_PLACEMENT } from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { DocumentApiAdapterError } from '../errors.js';

/**
 * Resolves a placement directive into an absolute ProseMirror insertion position.
 *
 * @param doc - Current ProseMirror document
 * @param targetPos - Absolute position of the target node (start of node)
 * @param targetNode - The ProseMirror node at targetPos
 * @param placement - Where to place content relative to the target
 * @returns Absolute ProseMirror position for insertion
 */
export function resolvePlacement(
  doc: ProseMirrorNode,
  targetPos: number,
  targetNode: ProseMirrorNode,
  placement?: Placement,
): number {
  const effectivePlacement = placement ?? DEFAULT_PLACEMENT;
  const nodeEnd = targetPos + targetNode.nodeSize;

  switch (effectivePlacement) {
    case 'before':
      return targetPos;

    case 'after':
      return nodeEnd;

    case 'insideStart':
      if (!targetNode.isBlock || targetNode.isLeaf) {
        throw new DocumentApiAdapterError(
          'INVALID_PLACEMENT',
          `Placement "insideStart" is not valid for "${targetNode.type.name}" — target must be a container block.`,
        );
      }
      return targetPos + 1;

    case 'insideEnd':
      if (!targetNode.isBlock || targetNode.isLeaf) {
        throw new DocumentApiAdapterError(
          'INVALID_PLACEMENT',
          `Placement "insideEnd" is not valid for "${targetNode.type.name}" — target must be a container block.`,
        );
      }
      return nodeEnd - 1;
  }
}
