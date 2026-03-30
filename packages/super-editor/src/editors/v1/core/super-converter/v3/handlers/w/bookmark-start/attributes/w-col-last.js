// @ts-check

/**
 * Encoder for the 'w:colLast' attribute on the <w:bookmarkStart> element.
 * Maps to the 'colLast' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The colLast value.
 */
export const encode = (attributes) => {
  return attributes['w:colLast'];
};

/**
 * Decoder for the 'colLast' attribute in SuperDoc.
 * Maps to the 'w:colLast' attribute in OOXML.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The colLast value.
 */
export const decode = (attrs) => {
  return attrs.colLast;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:colLast',
  sdName: 'colLast',
  encode,
  decode,
});
