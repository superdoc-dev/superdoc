// @ts-check

/**
 * Maps `w:pos` on <w:tab> to `pos` in SuperDoc.
 * @param {Object} attributes
 * @returns {number|undefined}
 */
export const encode = (attributes) => {
  if (attributes['w:pos'] != null) return parseInt(attributes['w:pos']);
  return null;
};

/**
 * Maps `pos` in SuperDoc back to `w:pos`.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  const { pos } = attrs || {};
  return pos?.toString();
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:pos',
  sdName: 'pos',
  encode,
  decode,
});
