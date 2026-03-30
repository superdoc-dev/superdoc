// @ts-check

/**
 * Encoder for the 'w:id' attribute on the <w:permStart> element.
 * Maps to the 'id' attribute in SuperDoc.
 * @param {Object} attributes
 * @returns {string|undefined}
 */
export const encode = (attributes) => {
  return attributes['w:id'];
};

/**
 * Decoder for the 'id' attribute in SuperDoc.
 * Maps to the 'w:id' attribute in OOXML.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return attrs.id;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:id',
  sdName: 'id',
  encode,
  decode,
});
