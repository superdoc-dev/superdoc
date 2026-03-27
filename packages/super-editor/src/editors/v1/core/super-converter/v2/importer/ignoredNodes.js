// Nodes listed here will be completely ignored during import.
// Add any XML node names that should be skipped.
export const IGNORED_NODE_NAMES = ['w:proofErr', 'w:lastRenderedPageBreak'];

/**
 * Recursively removes all nodes whose names appear in `IGNORED_NODE_NAMES`.
 *
 * @param {Array} nodes Array of XML nodes
 * @returns {Array} new array without ignored nodes
 */
export const pruneIgnoredNodes = (nodes = []) =>
  nodes
    .filter((node) => !IGNORED_NODE_NAMES.includes(node.name))
    .map((node) => (node.elements ? { ...node, elements: pruneIgnoredNodes(node.elements) } : node));
