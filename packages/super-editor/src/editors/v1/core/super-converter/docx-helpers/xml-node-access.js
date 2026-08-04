// @ts-check

/**
 * Safe reads over xml-js element trees.
 *
 * AIDEV-NOTE: xml-js omits `elements` and `attributes` entirely rather than
 * emitting empty ones, so `<w:rPr/>`, `<w:rPr />` and `<w:rPr></w:rPr>` all
 * parse to `{ type: 'element', name: 'w:rPr' }` with no `elements` key. Every
 * child of `CT_Style` is optional in ECMA-376, so empty property containers are
 * schema-valid, but readers that assume `node.elements` exists throw on them
 * (issue #3861). Reach into parsed OOXML through these helpers rather than
 * dereferencing `.elements` or `.attributes` directly.
 */

/**
 * A node in a parsed xml-js tree.
 * @typedef {object} XmlNode
 * @property {string} [type] Node kind, e.g. `element` or `text`.
 * @property {string} [name] Qualified element name, e.g. `w:rPr`.
 * @property {Record<string, string>} [attributes] Absent when the element has no attributes.
 * @property {XmlNode[]} [elements] Absent when the element has no children.
 * @property {string} [text] Character data, for text nodes.
 */

/**
 * Child elements of a parsed OOXML node, or an empty array when it has none.
 * @param {XmlNode | null | undefined} node
 * @returns {XmlNode[]}
 */
export const childElements = (node) => (Array.isArray(node?.elements) ? node.elements : []);

/**
 * First child element with the given qualified name.
 * @param {XmlNode | null | undefined} node
 * @param {string} name Qualified element name, e.g. `w:rPr`.
 * @returns {XmlNode | undefined}
 */
export const findChild = (node, name) => childElements(node).find((el) => el?.name === name);

/**
 * Every child element with the given qualified name.
 * @param {XmlNode | null | undefined} node
 * @param {string} name Qualified element name, e.g. `w:tblStylePr`.
 * @returns {XmlNode[]}
 */
export const findChildren = (node, name) => childElements(node).filter((el) => el?.name === name);

/**
 * Attribute value, or undefined when the element carries no attributes.
 * @param {XmlNode | null | undefined} node
 * @param {string} name Qualified attribute name, e.g. `w:val`.
 * @returns {string | undefined}
 */
export const attrValue = (node, name) => node?.attributes?.[name];
