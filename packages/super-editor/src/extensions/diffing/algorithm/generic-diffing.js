import {
  getParagraphContent,
  paragraphComparator,
  canTreatAsModification as canTreatParagraphDeletionInsertionAsModification,
  shouldProcessEqualAsModification as shouldProcessEqualParagraphsAsModification,
  buildAddedParagraphDiff,
  buildDeletedParagraphDiff,
  buildModifiedParagraphDiff,
} from './paragraph-diffing.js';
import { diffSequences, reorderDiffOperations } from './sequence-diffing.js';
import { getAttributesDiff } from './attributes-diffing.js';

/**
 * @typedef {import('prosemirror-model').Node} PMNode
 */

/**
 * @typedef {Object} BaseNodeInfo
 * @property {PMNode} node
 * @property {number} pos
 */

/**
 * @typedef {BaseNodeInfo & {
 *  text: import('./paragraph-diffing.js').ParagraphContentToken[],
 *  resolvePosition: (idx: number) => number|null,
 *  fullText: string
 * }} ParagraphNodeInfo
 */

/**
 * @typedef {BaseNodeInfo | ParagraphNodeInfo} NodeInfo
 */

/**
 * Produces a sequence diff between two ProseMirror documents, flattening paragraphs for inline-aware comparisons.
 * @param {PMNode} oldRoot
 * @param {PMNode} newRoot
 * @returns {Array<import('./paragraph-diffing.js').ParagraphDiff|{action: 'added'|'deleted'|'modified', nodeType: string, node?: PMNode, pos: number, attrsDiff?: import('./attributes-diffing.js').AttributesDiff, oldNode?: PMNode, newNode?: PMNode}>}
 */
export function diffNodes(oldRoot, newRoot) {
  const oldNodes = normalizeNodes(oldRoot);
  const newNodes = normalizeNodes(newRoot);

  const addedNodesSet = new Set();
  return diffSequences(oldNodes, newNodes, {
    comparator: nodeComparator,
    reorderOperations: reorderDiffOperations,
    shouldProcessEqualAsModification,
    canTreatAsModification,
    buildAdded: (nodeInfo, oldIdx, previousOldNodeInfo) => buildAddedDiff(nodeInfo, previousOldNodeInfo, addedNodesSet),
    buildDeleted: buildDeletedDiff,
    buildModified: buildModifiedDiff,
  });
}

/**
 * Traverses a ProseMirror document and converts paragraphs to richer node info objects.
 * @param {PMNode} pmDoc
 * @returns {NodeInfo[]}
 */
function normalizeNodes(pmDoc) {
  const nodes = [];
  pmDoc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const { text, resolvePosition } = getParagraphContent(node, pos);
      nodes.push({
        node,
        pos,
        text,
        resolvePosition,
        get fullText() {
          return text.map((c) => c.char).join('');
        },
      });
      return false; // Do not descend further
    } else {
      nodes.push({ node, pos });
    }
  });
  return nodes;
}

/**
 * Compares two node infos to determine if they correspond to the same logical node.
 * Paragraphs are compared with `paragraphComparator`, while other nodes are matched by type name.
 * @param {NodeInfo} oldNodeInfo
 * @param {NodeInfo} newNodeInfo
 * @returns {boolean}
 */
function nodeComparator(oldNodeInfo, newNodeInfo) {
  if (oldNodeInfo.node.type.name !== newNodeInfo.node.type.name) {
    return false;
  }
  if (oldNodeInfo.node.type.name === 'paragraph') {
    return paragraphComparator(oldNodeInfo, newNodeInfo);
  } else {
    return oldNodeInfo.node.type.name === newNodeInfo.node.type.name;
  }
}

/**
 * Decides whether nodes deemed equal by the diff should still be emitted as modifications.
 * Paragraph nodes leverage their specialized handler, while other nodes compare attribute JSON.
 * @param {NodeInfo} oldNodeInfo
 * @param {NodeInfo} newNodeInfo
 * @returns {boolean}
 */
function shouldProcessEqualAsModification(oldNodeInfo, newNodeInfo) {
  if (oldNodeInfo.node.type.name === 'paragraph' && newNodeInfo.node.type.name === 'paragraph') {
    return shouldProcessEqualParagraphsAsModification(oldNodeInfo, newNodeInfo);
  }
  return JSON.stringify(oldNodeInfo.node.attrs) !== JSON.stringify(newNodeInfo.node.attrs);
}

/**
 * Determines whether a delete/insert pair should instead be surfaced as a modification.
 * Only paragraphs qualify because we can measure textual similarity; other nodes remain as-is.
 * @param {NodeInfo} deletedNodeInfo
 * @param {NodeInfo} insertedNodeInfo
 * @returns {boolean}
 */
function canTreatAsModification(deletedNodeInfo, insertedNodeInfo) {
  if (deletedNodeInfo.node.type.name === 'paragraph' && insertedNodeInfo.node.type.name === 'paragraph') {
    return canTreatParagraphDeletionInsertionAsModification(deletedNodeInfo, insertedNodeInfo);
  }
  return false;
}

/**
 * Builds the diff payload for an inserted node and tracks descendants to avoid duplicates.
 * @param {NodeInfo} nodeInfo
 * @param {NodeInfo} previousOldNodeInfo
 * @param {Set<PMNode>} addedNodesSet
 * @returns {ReturnType<typeof buildAddedParagraphDiff>|{action:'added', nodeType:string, node:PMNode, pos:number}|null}
 */
function buildAddedDiff(nodeInfo, previousOldNodeInfo, addedNodesSet) {
  if (addedNodesSet.has(nodeInfo.node)) {
    return null;
  }
  addedNodesSet.add(nodeInfo.node);
  if (nodeInfo.node.type.name === 'paragraph') {
    return buildAddedParagraphDiff(nodeInfo, previousOldNodeInfo);
  }
  nodeInfo.node.descendants((childNode) => {
    addedNodesSet.add(childNode);
  });

  const pos = previousOldNodeInfo.pos + previousOldNodeInfo.node.nodeSize;
  return {
    action: 'added',
    nodeType: nodeInfo.node.type.name,
    node: nodeInfo.node,
    pos,
  };
}

/**
 * Builds the diff payload for a deleted node.
 * @param {NodeInfo} nodeInfo
 * @returns {ReturnType<typeof buildDeletedParagraphDiff>|{action:'deleted', nodeType:string, node:PMNode, pos:number}}
 */
function buildDeletedDiff(nodeInfo) {
  if (nodeInfo.node.type.name === 'paragraph') {
    return buildDeletedParagraphDiff(nodeInfo);
  }
  return {
    action: 'deleted',
    nodeType: nodeInfo.node.type.name,
    node: nodeInfo.node,
    pos: nodeInfo.pos,
  };
}

/**
 * Builds the diff payload for a modified node.
 * Paragraphs delegate to their inline-aware builder, while other nodes report attribute diffs.
 * @param {NodeInfo} oldNodeInfo
 * @param {NodeInfo} newNodeInfo
 * @returns {ReturnType<typeof buildModifiedParagraphDiff>|{action:'modified', nodeType:string, oldNode:PMNode, newNode:PMNode, pos:number, attrsDiff: import('./attributes-diffing.js').AttributesDiff}|null}
 */
function buildModifiedDiff(oldNodeInfo, newNodeInfo) {
  if (oldNodeInfo.node.type.name === 'paragraph' && newNodeInfo.node.type.name === 'paragraph') {
    return buildModifiedParagraphDiff(oldNodeInfo, newNodeInfo);
  }

  const attrsDiff = getAttributesDiff(oldNodeInfo.node.attrs, newNodeInfo.node.attrs);
  if (!attrsDiff) {
    return null;
  }
  return {
    action: 'modified',
    nodeType: oldNodeInfo.node.type.name,
    oldNode: oldNodeInfo.node,
    newNode: newNodeInfo.node,
    pos: newNodeInfo.pos,
    attrsDiff,
  };
}
