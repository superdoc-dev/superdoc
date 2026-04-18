// @ts-check

/**
 * Recursively extract plain text content from an OMML XML tree.
 * Collects all m:t text elements to produce a readable fallback string.
 *
 * @param {object} node - An OMML JSON node (xml2json format)
 * @returns {string} Concatenated text content
 */
export function extractMathText(node) {
  if (!node) return '';

  // Text node (xml2json stores text content in `text` property)
  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }

  // m:t element — collect its text children
  if (node.name === 'm:t' && Array.isArray(node.elements)) {
    return node.elements.map((child) => extractMathText(child)).join('');
  }

  // Recurse into child elements
  if (Array.isArray(node.elements)) {
    return node.elements.map((child) => extractMathText(child)).join('');
  }

  return '';
}
