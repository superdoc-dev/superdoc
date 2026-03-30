/**
 * Helper function to find the position of a target node in the document.
 * @param {import("prosemirror-model").Node} doc - The ProseMirror document to search in.
 * @param {import("prosemirror-model").Node} targetNode - The ProseMirror node to find the position of.
 * @returns {number|null} The position of the target node in the document, or null
 */
export const findNodePosition = (doc, targetNode) => {
  let nodePos = null;
  doc.descendants((node, pos) => {
    if (node === targetNode) {
      nodePos = pos;
      return false;
    }
    return true;
  });
  return nodePos;
};
