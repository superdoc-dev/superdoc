import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
/**
 * Helper function to check if a node is a list.
 * @param {import("prosemirror-model").Node} n - The ProseMirror node to check.
 * @returns {boolean} True if the node is an ordered or bullet list, false otherwise
 */
export const isList = (node) =>
  !!node &&
  node.type?.name === 'paragraph' &&
  getResolvedParagraphProperties(node)?.numberingProperties &&
  node.attrs?.listRendering;
