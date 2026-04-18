// @ts-check

/**
 * Encoder for the 'w:rsidDel' attribute on the <w:r> element.
 * Maps to the 'rsidDel' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The corresponding rsidDel value in SuperDoc, or undefined if not applicable.
 */
export const encode = (attributes) => {
  return attributes['w:rsidDel'];
};

/**
 * Decoder for the 'w:rsidDel' attribute on the <w:r> element.
 * Maps to the 'rsidDel' attribute in SuperDoc.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The corresponding rsidDel value in OOXML, or undefined if not applicable.
 */
export const decode = (attrs) => {
  return attrs.rsidDel;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:rsidDel',
  sdName: 'rsidDel',
  encode,
  decode,
});
