// @ts-check

/**
 * Encoder for the 'w:name' attribute on the <w:bookmarkStart> element.
 * Maps to the 'name' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The name value.
 */
export const encode = (attributes) => {
  return attributes['w:name'];
};

/**
 * Decoder for the 'name' attribute in SuperDoc.
 * Maps to the 'w:name' attribute in OOXML.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The name value.
 */
export const decode = (attrs) => {
  return attrs.name;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:name',
  sdName: 'name',
  encode,
  decode,
});
