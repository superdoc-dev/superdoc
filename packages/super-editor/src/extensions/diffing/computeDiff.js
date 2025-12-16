import { Node } from 'prosemirror-model';
import { v4 as uuidv4 } from 'uuid';

/**
 * Collects paragraphs from a ProseMirror document and returns them by paragraph ID.
 * @param {Node} pmDoc - ProseMirror document to scan.
 * @returns {Map<string, {node: Node, pos: number}>} Map keyed by paraId containing paragraph nodes and positions.
 */
export function extractParagraphs(pmDoc) {
  const paragraphMap = new Map();
  pmDoc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      paragraphMap.set(node.attrs?.paraId ?? uuidv4(), { node, pos });
      return false; // Do not descend further
    }
  });
  return paragraphMap;
}
