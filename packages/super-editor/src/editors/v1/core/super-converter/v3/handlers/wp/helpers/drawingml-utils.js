/**
 * Utilities for working with DrawingML nodes whose namespace prefixes may vary (e.g. `a:` vs `ns6:`).
 */

/**
 * Extract the local name from a qualified XML node name.
 * @param {string|undefined|null} name
 * @returns {string}
 */
export const getLocalName = (name) => {
  if (typeof name !== 'string') return '';
  const parts = name.split(':');
  return parts.length ? parts[parts.length - 1] : name;
};

/**
 * Check if a node has the requested local name, ignoring namespace prefix.
 * @param {Object|undefined|null} node
 * @param {string} localName
 * @returns {boolean}
 */
export const hasLocalName = (node, localName) => {
  if (!node || typeof node !== 'object') return false;
  return getLocalName(node.name) === localName;
};

/**
 * Find the first child element with the requested local name.
 * @param {Array<Object>|undefined|null} elements
 * @param {string} localName
 * @returns {Object|undefined}
 */
export const findChildByLocalName = (elements, localName) => {
  if (!Array.isArray(elements)) return undefined;
  return elements.find((el) => hasLocalName(el, localName));
};

/**
 * Filter child elements by local name.
 * @param {Array<Object>|undefined|null} elements
 * @param {string} localName
 * @returns {Array<Object>}
 */
export const filterChildrenByLocalName = (elements, localName) => {
  if (!Array.isArray(elements)) return [];
  return elements.filter((el) => hasLocalName(el, localName));
};

/**
 * Returns true when any child element has the requested local name.
 * @param {Array<Object>|undefined|null} elements
 * @param {string} localName
 * @returns {boolean}
 */
export const someChildHasLocalName = (elements, localName) => {
  if (!Array.isArray(elements)) return false;
  return elements.some((el) => hasLocalName(el, localName));
};
