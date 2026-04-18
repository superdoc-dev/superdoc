// @ts-check

/**
 * Encoder for the 'w:colFirst' attribute on the <w:bookmarkStart> element.
 * Maps to the 'colFirst' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The colFirst value.
 */
export const encode = (attributes) => {
  return attributes['w:colFirst'];
};

/**
 * Decoder for the 'colFirst' attribute in SuperDoc.
 * Maps to the 'w:colFirst' attribute in OOXML.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The colFirst value.
 */
export const decode = (attrs) => {
  return attrs.colFirst;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:colFirst',
  sdName: 'colFirst',
  encode,
  decode,
});
