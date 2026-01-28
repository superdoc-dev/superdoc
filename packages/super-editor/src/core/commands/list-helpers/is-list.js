import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
/**
 * Helper function to check if a node is a list.
 * @param {import("prosemirror-model").Node} n - The ProseMirror node to check.
 * @returns {boolean} True if the node is an ordered or bullet list, false otherwise
 */
export const isList = (node) => {
  if (!node || node.type?.name !== 'paragraph') return false;

  const resolvedProps = getResolvedParagraphProperties(node);
  const props = resolvedProps || node.attrs?.paragraphProperties; // fall back to raw props if uncached
  const numberingProps = props?.numberingProperties;

  return !!numberingProps && !!node.attrs?.listRendering;
};
