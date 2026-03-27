// @ts-check

/**
 * Encoder for the 'w:ed' attribute on the <w:permStart> element.
 * Maps to the 'ed' attribute in SuperDoc.
 * @param {Object} attributes
 * @returns {string|undefined}
 */
export const encode = (attributes) => {
  return attributes['w:ed'];
};

/**
 * Decoder for the 'ed' attribute in SuperDoc.
 * Maps to the 'w:ed' attribute in OOXML.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return attrs.ed;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:ed',
  sdName: 'ed',
  encode,
  decode,
});
