// @ts-check

/**
 * Encoder for the 'w:rsidP' attribute on the <w:p> element.
 * Maps to the 'rsidP' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The corresponding rsidP value in SuperDoc, or undefined if not applicable.
 */
export const encode = (attributes) => {
  return attributes['w:rsidP'];
};

/**
 * Decoder for the 'w:rsidP' attribute on the <w:p> element.
 * Maps to the 'rsidP' attribute in SuperDoc.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The corresponding rsidP value in OOXML, or undefined if not applicable.
 */
export const decode = (attrs) => {
  return attrs.rsidP;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:rsidP',
  sdName: 'rsidP',
  encode,
  decode,
});
