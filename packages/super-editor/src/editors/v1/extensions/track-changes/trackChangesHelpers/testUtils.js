/**
 * Shared test utilities for trackChangesHelpers tests.
 */

/**
 * Find the document position of a text node whose text equals exactText.
 * @param {import('prosemirror-model').Node} docNode - Document or node to search
 * @param {string} exactText - Exact text to find
 * @returns {number | null} Start position of the text node, or null if not found
 */
export function findTextPos(docNode, exactText) {
  let found = null;
  docNode.descendants((node, pos) => {
    if (found) return false;
    if (!node.isText || node.text !== exactText) return;
    found = pos;
  });
  return found;
}

/**
 * Find the start and end positions of the first paragraph node in a document.
 * @param {import('prosemirror-model').Node} doc - Document node to search
 * @returns {{ paraStart: number, paraEnd: number }}
 */
export function findFirstParagraphRange(doc) {
  let paraStart = null;
  let paraEnd = null;
  doc.forEach((node, offset) => {
    if (paraStart === null && node.type.name === 'paragraph') {
      paraStart = offset;
      paraEnd = offset + node.nodeSize;
    }
  });
  if (paraStart === null) throw new Error('No paragraph found');
  return { paraStart, paraEnd };
}
