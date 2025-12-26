/**
 * Flattens a paragraph node into text and provides a resolver to map string indices back to document positions.
 * @param {Node} paragraph - Paragraph node to flatten.
 * @param {number} [paragraphPos=0] - Position of the paragraph in the document.
 * @returns {{text: {char: string, runAttrs: Record<string, any>}[], resolvePosition: (index: number) => number|null}} Concatenated text and position resolver.
 */
export function getTextContent(paragraph, paragraphPos = 0) {
  let text = [];
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

      // Get parent run node and its attributes
      const runNode = paragraph.nodeAt(pos - 1);
      const runAttrs = runNode.attrs || {};

      segments.push({ start, end, pos, runAttrs });
      text = text.concat(nodeText.split('').map((char) => ({ char, runAttrs: JSON.stringify(runAttrs) })));
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

/**
 * Collects paragraphs from a ProseMirror document and returns them by paragraph ID.
 * @param {Node} pmDoc - ProseMirror document to scan.
 * @returns {Array<{node: Node, pos: number, text: string, resolvePosition: Function}>} Ordered list of paragraph descriptors.
 */
export function extractParagraphs(pmDoc) {
  const paragraphs = [];
  pmDoc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const { text, resolvePosition } = getTextContent(node, pos);
      paragraphs.push({
        node,
        pos,
        text,
        resolvePosition,
        get fullText() {
          return text.map((c) => c.char).join('');
        },
      });
      return false; // Do not descend further
    }
  });
  return paragraphs;
}
