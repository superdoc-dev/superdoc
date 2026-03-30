// @ts-check

/**
 * Encoder for the 'w:id' attribute on the <w:bookmarkStart> element.
 * Maps to the 'id' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The id value.
 */
export const encode = (attributes) => {
  return attributes['w:id'];
};

/**
 * Decoder for the 'id' attribute in SuperDoc.
 * Maps to the 'w:id' attribute in OOXML.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The id value.
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
