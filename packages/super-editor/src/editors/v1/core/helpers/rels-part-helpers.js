export const RELS_XMLNS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/**
 * Resolve the Relationships root from a .rels part JSON tree.
 * Supports imported `{ elements: [Relationships] }`, a Relationships root, or a legacy `document` wrapper.
 */
export function getRelationshipsRoot(part) {
  if (!part || typeof part !== 'object') return undefined;
  if (part.name === 'Relationships') return part;

  const children = part.elements;
  if (!Array.isArray(children)) return undefined;

  return children.find((el) => el?.name === 'Relationships');
}

/** Create a new .rels part with Relationships as the root element (matches OPC / xml-js import). */
export function createRelationshipsPart(elements = []) {
  return {
    type: 'element',
    name: 'Relationships',
    attributes: { xmlns: RELS_XMLNS },
    elements,
  };
}
