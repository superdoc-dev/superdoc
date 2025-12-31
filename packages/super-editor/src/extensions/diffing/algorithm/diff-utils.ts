import type { Node as PMNode } from 'prosemirror-model';

interface NodePositionInfo {
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
 * When the previous node shares the same depth, the insertion
 * is placed right after the previous node's position. Otherwise, the insertion
 * is placed just after the previous node's opening position.
 *
 * @param currentDepth Depth of the node being inserted.
 * @param previousNode Optional info about the preceding node from the old document.
 * @returns Absolute document position where the new node should be inserted.
 */
export function getInsertionPos(currentDepth: number, previousNode?: NodePositionInfo): number {
  if (currentDepth === previousNode?.depth) {
    const previousPos = previousNode?.pos ?? -1;
    const previousSize = previousNode?.node.nodeSize ?? 0;
    return previousPos >= 0 ? previousPos + previousSize : 0;
  }
  return (previousNode?.pos ?? -1) + 1;
}
