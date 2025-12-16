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

/**
 * Flattens a paragraph node into text and provides a resolver to map string indices back to document positions.
 * @param {Node} paragraph - Paragraph node to flatten.
 * @param {number} [paragraphPos=0] - Position of the paragraph in the document.
 * @returns {{text: string, resolvePosition: (index: number) => number|null}} Concatenated text and position resolver.
 */
export function getTextContent(paragraph, paragraphPos = 0) {
  let text = '';
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
      }

      if (!nodeText) {
        return;
      }

      const start = text.length;
      const end = start + nodeText.length;

      segments.push({ start, end, pos });
      text += nodeText;
    },
    0,
  );

  const resolvePosition = (index) => {
    if (index < 0 || index > text.length) {
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

  return { text, resolvePosition };
}
