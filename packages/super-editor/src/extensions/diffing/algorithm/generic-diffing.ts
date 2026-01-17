import type { Node as PMNode } from 'prosemirror-model';
import {
  createParagraphSnapshot,
  paragraphComparator,
  canTreatAsModification as canTreatParagraphDeletionInsertionAsModification,
  shouldProcessEqualAsModification as shouldProcessEqualParagraphsAsModification,
  buildAddedParagraphDiff,
  buildDeletedParagraphDiff,
  buildModifiedParagraphDiff,
  type ParagraphDiff,
  type ParagraphNodeInfo,
} from './paragraph-diffing.ts';
import { diffSequences, reorderDiffOperations } from './sequence-diffing.ts';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing.ts';
import { getInsertionPos } from './diff-utils.ts';

type NodeJSON = ReturnType<PMNode['toJSON']>;

/**
 * Minimal node metadata extracted during document traversal.
 */
export type BaseNodeInfo = {
  /** ProseMirror node reference. */
  node: PMNode;
  /** Absolute position of the node in the document. */
  pos: number;
  /** Depth of the node within the document tree. */
  depth: number;
};

/**
 * Union describing every node processed by the generic diff.
 */
export type NodeInfo = BaseNodeInfo | ParagraphNodeInfo;

interface NodeDiffBase<Action extends 'added' | 'deleted' | 'modified'> {
  /** Change type for this node. */
  action: Action;
  /** ProseMirror node type name. */
  nodeType: string;
  /** Anchor position in the old document for replaying diffs. */
  pos: number;
}

/**
 * Diff payload describing an inserted non-paragraph node.
 */
interface NodeAddedDiff extends NodeDiffBase<'added'> {
  /** Serialized node payload inserted into the document. */
  nodeJSON: NodeJSON;
}

/**
 * Diff payload describing a deleted non-paragraph node.
 */
interface NodeDeletedDiff extends NodeDiffBase<'deleted'> {
  /** Serialized node payload removed from the document. */
  nodeJSON: NodeJSON;
}

/**
 * Diff payload describing an attribute-only change on non-paragraph nodes.
 */
interface NodeModifiedDiff extends NodeDiffBase<'modified'> {
  /** Serialized node payload before the change. */
  oldNodeJSON: NodeJSON;
  /** Serialized node payload after the change. */
  newNodeJSON: NodeJSON;
  /** Attribute-level diff for the node. */
  attrsDiff: AttributesDiff;
}

/**
 * Union of every diff type emitted by the generic diffing layer.
 */
export type NodeDiff = ParagraphDiff | NodeAddedDiff | NodeDeletedDiff | NodeModifiedDiff;

/**
 * Produces a sequence diff between two normalized node lists.
 *
 * @param oldNodes Normalized nodes from the old document.
 * @param newNodes Normalized nodes from the new document.
 * @returns List of node diffs describing the changes.
 */
export function diffNodes(oldNodes: NodeInfo[], newNodes: NodeInfo[]): NodeDiff[] {
  const addedNodesSet = new Set<PMNode>();
  const deletedNodesSet = new Set<PMNode>();
  return diffSequences<NodeInfo, NodeDiff, NodeDiff, NodeDiff>(oldNodes, newNodes, {
    comparator: nodeComparator,
    reorderOperations: reorderDiffOperations,
    shouldProcessEqualAsModification,
    canTreatAsModification,
    buildAdded: (nodeInfo, _oldIdx, previousOldNodeInfo) =>
      buildAddedDiff(nodeInfo, previousOldNodeInfo, addedNodesSet),
    buildDeleted: (nodeInfo) => buildDeletedDiff(nodeInfo, deletedNodesSet),
    buildModified: buildModifiedDiff,
  });
}

/**
 * Traverses a ProseMirror document and converts paragraphs to richer node info objects.
 */
export function normalizeNodes(pmDoc: PMNode): NodeInfo[] {
  const nodes: NodeInfo[] = [];
  const depthMap = new WeakMap<PMNode, number>();
  depthMap.set(pmDoc, -1);

  pmDoc.descendants((node, pos, parent) => {
    const parentDepth = parent ? (depthMap.get(parent) ?? -1) : -1;
    const depth = parentDepth + 1;
    depthMap.set(node, depth);
    if (node.type.name === 'paragraph') {
      nodes.push(createParagraphSnapshot(node, pos, depth));
      return false;
    }
    nodes.push({ node, pos, depth });
    return undefined;
  });
  return nodes;
}

/**
 * Compares two node infos to determine if they correspond to the same logical node.
 * Paragraphs are compared with `paragraphComparator`, while other nodes are matched by type name.
 */
function nodeComparator(oldNodeInfo: NodeInfo, newNodeInfo: NodeInfo): boolean {
  if (oldNodeInfo.node.type.name !== newNodeInfo.node.type.name) {
    return false;
  }
  if (isParagraphNodeInfo(oldNodeInfo) && isParagraphNodeInfo(newNodeInfo)) {
    return paragraphComparator(oldNodeInfo, newNodeInfo);
  } else if (
    oldNodeInfo.node.type.name === 'tableRow' &&
    newNodeInfo.node.type.name === 'tableRow' &&
    oldNodeInfo.node.attrs.paraId &&
    newNodeInfo.node.attrs.paraId
  ) {
    return oldNodeInfo.node.attrs.paraId === newNodeInfo.node.attrs.paraId;
  }
  return true;
}

/**
 * Decides whether nodes deemed equal by the diff should still be emitted as modifications.
 * Paragraph nodes leverage their specialized handler, while other nodes compare attribute JSON.
 */
function shouldProcessEqualAsModification(oldNodeInfo: NodeInfo, newNodeInfo: NodeInfo): boolean {
  if (isParagraphNodeInfo(oldNodeInfo) && isParagraphNodeInfo(newNodeInfo)) {
    return shouldProcessEqualParagraphsAsModification(oldNodeInfo, newNodeInfo);
  }
  return JSON.stringify(oldNodeInfo.node.attrs) !== JSON.stringify(newNodeInfo.node.attrs);
}

/**
 * Determines whether a delete/insert pair should instead be surfaced as a modification.
 * Only paragraphs qualify because we can measure textual similarity; other nodes remain as-is.
 */
function canTreatAsModification(deletedNodeInfo: NodeInfo, insertedNodeInfo: NodeInfo): boolean {
  if (isParagraphNodeInfo(deletedNodeInfo) && isParagraphNodeInfo(insertedNodeInfo)) {
    return canTreatParagraphDeletionInsertionAsModification(deletedNodeInfo, insertedNodeInfo);
  }
  return false;
}

/**
 * Builds the diff payload for an inserted node and tracks descendants to avoid duplicates.
 */
function buildAddedDiff(
  nodeInfo: NodeInfo,
  previousOldNodeInfo: NodeInfo | undefined,
  addedNodesSet: Set<PMNode>,
): NodeDiff | null {
  if (addedNodesSet.has(nodeInfo.node)) {
    return null;
  }
  addedNodesSet.add(nodeInfo.node);
  if (isParagraphNodeInfo(nodeInfo)) {
    return buildAddedParagraphDiff(nodeInfo, previousOldNodeInfo);
  }
  nodeInfo.node.descendants((childNode) => {
    addedNodesSet.add(childNode);
  });

  return {
    action: 'added',
    nodeType: nodeInfo.node.type.name,
    nodeJSON: nodeInfo.node.toJSON(),
    pos: getInsertionPos(nodeInfo.depth, previousOldNodeInfo),
  };
}

/**
 * Builds the diff payload for a deleted node.
 */
function buildDeletedDiff(nodeInfo: NodeInfo, deletedNodesSet: Set<PMNode>): NodeDiff | null {
  if (deletedNodesSet.has(nodeInfo.node)) {
    return null;
  }
  deletedNodesSet.add(nodeInfo.node);
  if (isParagraphNodeInfo(nodeInfo)) {
    return buildDeletedParagraphDiff(nodeInfo);
  }
  nodeInfo.node.descendants((childNode) => {
    deletedNodesSet.add(childNode);
  });
  return {
    action: 'deleted',
    nodeType: nodeInfo.node.type.name,
    nodeJSON: nodeInfo.node.toJSON(),
    pos: nodeInfo.pos,
  };
}

/**
 * Builds the diff payload for a modified node.
 * Paragraphs delegate to their inline-aware builder, while other nodes report attribute diffs.
 */
function buildModifiedDiff(oldNodeInfo: NodeInfo, newNodeInfo: NodeInfo): NodeDiff | null {
  if (isParagraphNodeInfo(oldNodeInfo) && isParagraphNodeInfo(newNodeInfo)) {
    return buildModifiedParagraphDiff(oldNodeInfo, newNodeInfo);
  }

  const attrsDiff = getAttributesDiff(oldNodeInfo.node.attrs, newNodeInfo.node.attrs);
  if (!attrsDiff) {
    return null;
  }
  return {
    action: 'modified',
    nodeType: oldNodeInfo.node.type.name,
    oldNodeJSON: oldNodeInfo.node.toJSON(),
    newNodeJSON: newNodeInfo.node.toJSON(),
    pos: oldNodeInfo.pos,
    attrsDiff,
  };
}

function isParagraphNodeInfo(nodeInfo: NodeInfo): nodeInfo is ParagraphNodeInfo {
  return nodeInfo.node.type.name === 'paragraph';
}
