// @ts-check

/**
 * Encoder for the 'w:rsidRPr' attribute on the <w:r> element.
 * Maps to the 'rsidRPr' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The corresponding rsidRPr value in SuperDoc, or undefined if not applicable.
 */
export const encode = (attributes) => {
  return attributes['w:rsidRPr'];
};

/**
 * Decoder for the 'w:rsidRPr' attribute on the <w:r> element.
 * Maps to the 'rsidRPr' attribute in SuperDoc.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The corresponding rsidRPr value in OOXML, or undefined if not applicable.
 */
export const decode = (attrs) => {
  return attrs.rsidRPr;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:rsidRPr',
  sdName: 'rsidRPr',
  encode,
  decode,
});
