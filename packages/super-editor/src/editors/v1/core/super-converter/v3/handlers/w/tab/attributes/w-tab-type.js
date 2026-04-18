// @ts-check

/**
 * Maps `w:val` on <w:tab> to `tabType` in SuperDoc.
 * @param {Object} attributes
 * @returns {string|undefined}
 */
export const encode = (attributes) => {
  return attributes['w:val'];
};

/**
 * Maps `tabType` in SuperDoc back to `w:val`.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  const { tabType } = attrs || {};
  return tabType;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:val',
  sdName: 'tabType',
  encode,
  decode,
});
