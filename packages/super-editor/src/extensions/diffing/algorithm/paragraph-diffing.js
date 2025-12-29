import { getInlineDiff } from './inline-diffing.js';
import { getAttributesDiff } from './attributes-diffing.js';
import { levenshteinDistance } from './similarity.js';

// Heuristics that prevent unrelated paragraphs from being paired as modifications.
const SIMILARITY_THRESHOLD = 0.65;
const MIN_LENGTH_FOR_SIMILARITY = 4;

/**
 * A paragraph addition diff emitted when new content is inserted.
 * @typedef {Object} AddedParagraphDiff
 * @property {'added'} action
 * @property {string} nodeType ProseMirror node.name for downstream handling
 * @property {Node} node reference to the ProseMirror node for consumers needing schema details
 * @property {string} text textual contents of the inserted paragraph
 * @property {number} pos document position where the paragraph was inserted
 */

/**
 * A paragraph deletion diff emitted when content is removed.
 * @typedef {Object} DeletedParagraphDiff
 * @property {'deleted'} action
 * @property {string} nodeType ProseMirror node.name for downstream handling
 * @property {Node} node reference to the original ProseMirror node
 * @property {string} oldText text that was removed
 * @property {number} pos starting document position of the original paragraph
 */

/**
 * A paragraph modification diff that carries inline text-level changes.
 * @typedef {Object} ModifiedParagraphDiff
 * @property {'modified'} action
 * @property {string} nodeType ProseMirror node.name for downstream handling
 * @property {string} oldText text before the edit
 * @property {string} newText text after the edit
 * @property {number} pos original document position for anchoring UI
 * @property {ReturnType<typeof getInlineDiff>} contentDiff granular inline diff data
 * @property {import('./attributes-diffing.js').AttributesDiff|null} attrsDiff attribute-level changes between the old and new paragraph nodes
 */

/**
 * Combined type representing every diff payload produced by `diffParagraphs`.
 * @typedef {AddedParagraphDiff|DeletedParagraphDiff|ModifiedParagraphDiff} ParagraphDiff
 */

/**
 * A flattened representation of a text token derived from a paragraph.
 * @typedef {Object} ParagraphTextToken
 * @property {'text'} kind
 * @property {string} char
 * @property {string} runAttrs JSON stringified run attributes originating from the parent node
 */

/**
 * A flattened representation of an inline node that is treated as a single token by the diff.
 * @typedef {Object} ParagraphInlineNodeToken
 * @property {'inlineNode'} kind
 * @property {Node} node
 */

/**
 * @typedef {ParagraphTextToken|ParagraphInlineNodeToken} ParagraphContentToken
 */

/**
 * Flattens a paragraph node into text and provides a resolver to map string indices back to document positions.
 * @param {Node} paragraph - Paragraph node to flatten.
 * @param {number} [paragraphPos=0] - Position of the paragraph in the document.
 * @returns {{text: ParagraphContentToken[], resolvePosition: (index: number) => number|null}} Concatenated text tokens and a resolver that maps indexes to document positions.
 */
export function getParagraphContent(paragraph, paragraphPos = 0) {
  let content = [];
  const segments = [];

  paragraph.nodesBetween(
    0,
    paragraph.content.size,
    (node, pos) => {
      let nodeText = '';

      if (node.isText) {
        nodeText = node.text;
      } else if (node.isLeaf && node.type.spec.leafText) {
        nodeText = node.type.spec.leafText(node);
      } else if (node.type.name !== 'run' && node.isInline) {
        const start = content.length;
        const end = start + 1;
        content.push({
          kind: 'inlineNode',
          node: node,
        });
        segments.push({ start, end, pos });
        return;
      } else {
        return;
      }

      const start = content.length;
      const end = start + nodeText.length;

      const runNode = paragraph.nodeAt(pos - 1);
      const runAttrs = runNode.attrs || {};

      segments.push({ start, end, pos });
      const chars = nodeText.split('').map((char) => ({
        kind: 'text',
        char,
        runAttrs: JSON.stringify(runAttrs),
      }));

      content = content.concat(chars);
    },
    0,
  );

  const resolvePosition = (index) => {
    if (index < 0 || index > content.length) {
      return null;
    }

    for (const segment of segments) {
      if (index >= segment.start && index < segment.end) {
        return paragraphPos + 1 + segment.pos + (index - segment.start);
      }
    }

    // If index points to the end of the string, return the paragraph end
    return paragraphPos + 1 + paragraph.content.size;
  };

  return { text: content, resolvePosition };
}

/**
 * Determines whether equal paragraph nodes should still be marked as modified because their serialized structure differs.
 * @param {{node: Node}} oldParagraph
 * @param {{node: Node}} newParagraph
 * @returns {boolean}
 */
export function shouldProcessEqualAsModification(oldParagraph, newParagraph) {
  return JSON.stringify(oldParagraph.node.toJSON()) !== JSON.stringify(newParagraph.node.toJSON());
}

/**
 * Compares two paragraphs for identity based on paraId or text content so the diff can prioritize logical matches.
 * This prevents the algorithm from treating the same paragraph as a deletion+insertion when the paraId or text proves
 * they refer to the same logical node, which in turn keeps visual diffs stable.
 * @param {{node: Node, fullText: string}} oldParagraph
 * @param {{node: Node, fullText: string}} newParagraph
 * @returns {boolean}
 */
export function paragraphComparator(oldParagraph, newParagraph) {
  const oldId = oldParagraph?.node?.attrs?.paraId;
  const newId = newParagraph?.node?.attrs?.paraId;
  if (oldId && newId && oldId === newId) {
    return true;
  }
  return oldParagraph?.fullText === newParagraph?.fullText;
}

/**
 * Builds a normalized payload describing a paragraph addition, ensuring all consumers receive the same metadata shape.
 * @param {{node: Node, pos: number, fullText: string}} paragraph
 * @param {{node: Node, pos: number}} previousOldNodeInfo node/position reference used to determine insertion point
 * @returns {AddedParagraphDiff}
 */
export function buildAddedParagraphDiff(paragraph, previousOldNodeInfo) {
  const pos = previousOldNodeInfo.pos + previousOldNodeInfo.node.nodeSize;
  return {
    action: 'added',
    nodeType: paragraph.node.type.name,
    node: paragraph.node,
    text: paragraph.fullText,
    pos: pos,
  };
}

/**
 * Builds a normalized payload describing a paragraph deletion so diff consumers can show removals with all context.
 * @param {{node: Node, pos: number, fullText: string}} paragraph
 * @returns {DeletedParagraphDiff}
 */
export function buildDeletedParagraphDiff(paragraph) {
  return {
    action: 'deleted',
    nodeType: paragraph.node.type.name,
    node: paragraph.node,
    oldText: paragraph.fullText,
    pos: paragraph.pos,
  };
}

/**
 * Builds the payload for a paragraph modification, including text-level diffs, so renderers can highlight edits inline.
 * @param {{node: Node, pos: number, text: ParagraphContentToken[], resolvePosition: Function, fullText: string}} oldParagraph
 * @param {{node: Node, pos: number, text: ParagraphContentToken[], resolvePosition: Function, fullText: string}} newParagraph
 * @returns {ModifiedParagraphDiff|null}
 */
export function buildModifiedParagraphDiff(oldParagraph, newParagraph) {
  const contentDiff = getInlineDiff(
    oldParagraph.text,
    newParagraph.text,
    oldParagraph.resolvePosition,
    newParagraph.resolvePosition,
  );

  const attrsDiff = getAttributesDiff(oldParagraph.node.attrs, newParagraph.node.attrs);
  if (contentDiff.length === 0 && !attrsDiff) {
    return null;
  }

  return {
    action: 'modified',
    nodeType: oldParagraph.node.type.name,
    oldText: oldParagraph.fullText,
    newText: newParagraph.fullText,
    pos: oldParagraph.pos,
    contentDiff,
    attrsDiff,
  };
}

/**
 * Decides whether a delete/insert pair should be reinterpreted as a modification to minimize noisy diff output.
 * This heuristic limits the number of false-positive additions/deletions, which keeps reviewers focused on real edits.
 * @param {{node: Node, fullText: string}} oldParagraph
 * @param {{node: Node, fullText: string}} newParagraph
 * @returns {boolean}
 */
export function canTreatAsModification(oldParagraph, newParagraph) {
  if (paragraphComparator(oldParagraph, newParagraph)) {
    return true;
  }

  const oldText = oldParagraph.fullText;
  const newText = newParagraph.fullText;
  const maxLength = Math.max(oldText.length, newText.length);
  if (maxLength < MIN_LENGTH_FOR_SIMILARITY) {
    return false;
  }

  const similarity = getTextSimilarityScore(oldText, newText);

  return similarity >= SIMILARITY_THRESHOLD;
}

/**
 * Scores the similarity between two text strings so the diff can decide if they represent the same conceptual paragraph.
 * @param {string} oldText
 * @param {string} newText
 * @returns {number}
 */
function getTextSimilarityScore(oldText, newText) {
  if (!oldText && !newText) {
    return 1;
  }

  const distance = levenshteinDistance(oldText, newText);
  const maxLength = Math.max(oldText.length, newText.length) || 1;
  return 1 - distance / maxLength;
}
