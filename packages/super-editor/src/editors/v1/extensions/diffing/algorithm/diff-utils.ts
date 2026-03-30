import type { Node as PMNode } from 'prosemirror-model';

export interface NodePositionInfo {
  /** ProseMirror node reference. */
  node: PMNode;
  /** Absolute position of the node in the document. */
  pos: number;
  /** Depth of the node within the document tree. */
  depth: number;
}

/**
 * Computes the insertion point for a node relative to the previous node in the old document tree.
 *
 * Behavior by depth:
 * - Same depth: insert after the previous node subtree.
 * - Deeper depth: insert inside the previous node (at its content start).
 * - Shallower depth: scan backward to the closest old node whose depth is
 *   less than or equal to `currentDepth`, then anchor from that node.
 *
 * @param currentDepth Depth of the node being inserted.
 * @param oldNodes Old-sequence context used to resolve insertion anchors.
 * @param oldIdx Old-sequence insertion index (the insert happens before this index).
 * @returns Absolute document position where the new node should be inserted.
 */
export function getInsertionPos(currentDepth: number, oldNodes: readonly NodePositionInfo[] = [], oldIdx = 0): number {
  const previousNode = oldIdx > 0 ? oldNodes[oldIdx - 1] : undefined;
  if (!previousNode) {
    return 0;
  }

  if (currentDepth > previousNode.depth) {
    return previousNode.pos + 1;
  }

  if (currentDepth === previousNode.depth) {
    return previousNode.pos + (previousNode.node.nodeSize ?? 0);
  }

  for (let cursor = oldIdx - 1; cursor >= 0; cursor -= 1) {
    const candidateNode = oldNodes[cursor];
    if (!candidateNode) {
      continue;
    }
    if (candidateNode.depth > currentDepth) {
      continue;
    }
    if (candidateNode.depth === currentDepth) {
      return candidateNode.pos + (candidateNode.node.nodeSize ?? 0);
    }
    return candidateNode.pos + 1;
  }

  return 0;
}
