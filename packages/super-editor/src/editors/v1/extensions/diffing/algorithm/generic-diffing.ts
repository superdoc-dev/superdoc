import type { Node as PMNode } from 'prosemirror-model';
import {
  createParagraphSnapshot,
  paragraphComparator,
  canTreatAsModification as canTreatParagraphAsModification,
  shouldProcessEqualAsModification as shouldProcessEqualParagraphsAsModification,
  buildAddedParagraphDiff,
  buildDeletedParagraphDiff,
  buildModifiedParagraphDiff,
  type ParagraphDiff,
  type ParagraphNodeInfo,
} from './paragraph-diffing';
import { diffSequences, reorderDiffOperations } from './sequence-diffing';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing';
import { getInsertionPos, type NodePositionInfo } from './diff-utils';
import { NON_SEMANTIC_BLOCK_ATTRS } from './identity-attrs';

// Non-paragraph block-node attr diffing must ignore session-local identity
// attrs. Otherwise a cross-editor diff carries the originator's sdBlockId in
// the `modified` paths and replay overwrites the recipient's ID. Paragraphs
// already strip these upstream via normalizeParagraphAttrs. See SD-3279.
const NON_PARAGRAPH_BLOCK_IGNORED_ATTRS: string[] = Array.from(NON_SEMANTIC_BLOCK_ATTRS);

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
 * For sequences where all old nodes are paragraphs with the same content signature and both
 * sequences have equal length, positional alignment is used instead of Myers. Myers freely
 * chooses which identical paragraph to delete, often producing non-adjacent insert+delete
 * operations that cannot be paired as a modification. Positional alignment directly pairs
 * old[i] with new[i] and treats diverging positions as modifications.
 *
 * When either sequence contains repeated paragraph signatures, a stricter similarity threshold
 * is applied to avoid false pairings between structurally unrelated paragraphs that share
 * incidental character overlap (common in legal boilerplate documents).
 *
 * @param oldNodes Normalized nodes from the old document.
 * @param newNodes Normalized nodes from the new document.
 * @returns List of node diffs describing the changes.
 */
export function diffNodes(oldNodes: NodeInfo[], newNodes: NodeInfo[]): NodeDiff[] {
  const addedNodesSet = new Set<PMNode>();
  const deletedNodesSet = new Set<PMNode>();

  // Positional alignment: when every old node is a paragraph sharing one content signature and
  // both sequences are the same length, Myers cannot reliably place the edit at the right
  // position (it may delete the last P and insert M in the middle, producing non-adjacent ops).
  // Zip by index instead and treat any mismatch as a direct modification.
  if (isAllIdenticalParagraphSequence(oldNodes) && oldNodes.length === newNodes.length) {
    return positionalAlignDiffs(oldNodes as ParagraphNodeInfo[], newNodes, addedNodesSet, deletedNodesSet);
  }

  return diffSequences<NodeInfo, NodeDiff, NodeDiff, NodeDiff>(oldNodes, newNodes, {
    comparator: nodeComparator,
    reorderOperations: reorderDiffOperations,
    shouldProcessEqualAsModification,
    canTreatAsModification: (deleted, inserted, oldIdx, newIdx) =>
      canTreatAsModification(deleted, inserted, detectLocalRepeatedContent(oldNodes, newNodes, oldIdx, newIdx)),
    buildAdded: (nodeInfo, _oldIdx) => buildAddedDiff(nodeInfo, oldNodes, _oldIdx, addedNodesSet),
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
 *
 * `hasRepeatedContent` tightens the similarity threshold when the surrounding sequences contain
 * repeated paragraph signatures, preventing false pairings in boilerplate-heavy documents.
 */
function canTreatAsModification(
  deletedNodeInfo: NodeInfo,
  insertedNodeInfo: NodeInfo,
  hasRepeatedContent = false,
): boolean {
  if (isParagraphNodeInfo(deletedNodeInfo) && isParagraphNodeInfo(insertedNodeInfo)) {
    return canTreatParagraphAsModification(deletedNodeInfo, insertedNodeInfo, hasRepeatedContent);
  }
  return false;
}

/**
 * Builds the diff payload for an inserted node and tracks descendants to avoid duplicates.
 */
function buildAddedDiff(
  nodeInfo: NodeInfo,
  oldNodes: readonly NodePositionInfo[],
  oldIdx: number,
  addedNodesSet: Set<PMNode>,
): NodeDiff | null {
  if (addedNodesSet.has(nodeInfo.node)) {
    return null;
  }
  addedNodesSet.add(nodeInfo.node);
  if (isParagraphNodeInfo(nodeInfo)) {
    return buildAddedParagraphDiff(nodeInfo, oldNodes, oldIdx);
  }
  nodeInfo.node.descendants((childNode) => {
    addedNodesSet.add(childNode);
  });

  return {
    action: 'added',
    nodeType: nodeInfo.node.type.name,
    nodeJSON: nodeInfo.node.toJSON(),
    pos: getInsertionPos(nodeInfo.depth, oldNodes, oldIdx),
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

  const attrsDiff = getAttributesDiff(
    oldNodeInfo.node.attrs,
    newNodeInfo.node.attrs,
    NON_PARAGRAPH_BLOCK_IGNORED_ATTRS,
  );
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

/**
 * Returns true when every node in the sequence is a paragraph sharing the same non-empty
 * content signature. Requires at least two nodes — a single-paragraph sequence does not
 * exhibit the repeated-content alignment problem that motivates positional alignment.
 * Empty paragraphs are excluded because they appear in virtually every document for structural
 * spacing reasons and should not trigger positional alignment logic.
 */
function isAllIdenticalParagraphSequence(nodes: NodeInfo[]): nodes is ParagraphNodeInfo[] {
  if (nodes.length < 2) return false;
  if (!nodes.every(isParagraphNodeInfo)) return false;
  const firstSig = (nodes[0] as ParagraphNodeInfo).contentSignature;
  if (!firstSig) return false;
  return nodes.every((n) => (n as ParagraphNodeInfo).contentSignature === firstSig);
}

/**
 * Returns true when the local window around the candidate pair contains a non-empty paragraph
 * content signature that appears more than once. "Local" means within `windowRadius` positions
 * of the delete index in old-sequence coordinates and the insert index in new-sequence coordinates.
 *
 * Window-scoped detection keeps the stricter similarity threshold in `canTreatAsModification`
 * applied only to the region where repeated boilerplate actually appears, rather than raising the
 * bar for the entire document whenever any two paragraphs elsewhere happen to share a signature.
 *
 * Empty paragraphs are deliberately excluded — they are present in virtually every document for
 * structural spacing and would otherwise fire the repeated-content heuristic globally.
 */
function detectLocalRepeatedContent(
  oldNodes: NodeInfo[],
  newNodes: NodeInfo[],
  oldIdx: number,
  newIdx: number,
  windowRadius = 10,
): boolean {
  // Count old-window and new-window separately so that a paragraph appearing once in old
  // and once in new (stable unchanged neighbors) does not inflate the count to 2 and
  // falsely trigger the stricter threshold for unrelated pairs nearby.
  const hasRepeatIn = (nodes: NodeInfo[], center: number): boolean => {
    const counts = new Map<string, number>();
    const start = Math.max(0, center - windowRadius);
    const end = Math.min(nodes.length, center + windowRadius);
    for (let i = start; i < end; i++) {
      const n = nodes[i];
      if (isParagraphNodeInfo(n) && n.contentSignature.length > 0) {
        const next = (counts.get(n.contentSignature) ?? 0) + 1;
        if (next > 1) return true;
        counts.set(n.contentSignature, next);
      }
    }
    return false;
  };
  return hasRepeatIn(oldNodes, oldIdx) || hasRepeatIn(newNodes, newIdx);
}

/**
 * Positional alignment for sequences where Myers produces unreliable edit placement.
 *
 * Pairs old[i] with new[i] directly. Equal pairs (by `paragraphComparator`) are skipped or
 * emitted as modifications when `shouldProcessEqualAsModification` fires. Unequal pairs at
 * the same index are tested against `canTreatParagraphAsModification` (base threshold) before
 * being emitted as modifications — positionally paired items that are completely unrelated
 * (similarity below threshold) are kept as a separate deleted + added pair instead.
 * Remaining items in the longer sequence are emitted as additions or deletions.
 */
function positionalAlignDiffs(
  oldParas: ParagraphNodeInfo[],
  newNodes: NodeInfo[],
  addedNodesSet: Set<PMNode>,
  deletedNodesSet: Set<PMNode>,
): NodeDiff[] {
  const diffs: NodeDiff[] = [];
  const minLen = Math.min(oldParas.length, newNodes.length);

  for (let i = 0; i < minLen; i++) {
    const oldNode = oldParas[i];
    const newNode = newNodes[i];

    if (!isParagraphNodeInfo(newNode)) {
      // Non-paragraph appeared in new at a position occupied by a paragraph in old.
      // Fall back to treating old as deleted and new as added.
      // Use i + 1 so the add pos resolves to after old[i] — reverse replay inserts there first,
      // then deletes old[i] at its original pos, landing the new node at old[i].pos.
      const del = buildDeletedDiff(oldNode, deletedNodesSet);
      if (del) diffs.push(del);
      const add = buildAddedDiff(newNode, oldParas, i + 1, addedNodesSet);
      if (add) diffs.push(add);
      continue;
    }

    if (paragraphComparator(oldNode, newNode)) {
      if (shouldProcessEqualAsModification(oldNode, newNode)) {
        const diff = buildModifiedDiff(oldNode, newNode);
        if (diff) diffs.push(diff);
      }
    } else if (canTreatParagraphAsModification(oldNode, newNode)) {
      const diff = buildModifiedDiff(oldNode, newNode);
      if (diff) diffs.push(diff);
    } else {
      // Positionally aligned but content is too different — emit as separate delete + add.
      // Replay processes diffs in reverse: insert at old[i+1] first, then delete at old[i].pos,
      // so the inserted node ends up at old[i].pos.
      const del = buildDeletedDiff(oldNode, deletedNodesSet);
      if (del) diffs.push(del);
      const add = buildAddedDiff(newNode, oldParas, i + 1, addedNodesSet);
      if (add) diffs.push(add);
    }
  }

  for (let i = minLen; i < oldParas.length; i++) {
    const diff = buildDeletedDiff(oldParas[i], deletedNodesSet);
    if (diff) diffs.push(diff);
  }

  for (let i = minLen; i < newNodes.length; i++) {
    const diff = buildAddedDiff(newNodes[i], oldParas, oldParas.length, addedNodesSet);
    if (diff) diffs.push(diff);
  }

  return diffs;
}
