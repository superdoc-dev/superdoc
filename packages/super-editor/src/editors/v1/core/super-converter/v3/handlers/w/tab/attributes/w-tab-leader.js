// @ts-check

/**
 * Maps `w:leader` on <w:tab> to `leader` in SuperDoc.
 * @param {Object} attributes
 * @returns {string|undefined}
 */
export const encode = (attributes) => {
  return attributes['w:leader'];
};

/**
 * Maps `leader` in SuperDoc back to `w:leader`.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  const { leader } = attrs || {};
  return leader;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:leader',
  sdName: 'leader',
  encode,
  decode,
});
