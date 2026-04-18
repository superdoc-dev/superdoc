// @ts-check

/**
 * Encoder for the 'w:rsidRDefault' attribute on the <w:p> element.
 * Maps to the 'rsidRDefault' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The corresponding rsidRDefault value in SuperDoc, or undefined if not applicable.
 */
export const encode = (attributes) => {
  return attributes['w:rsidRDefault'];
};

/**
 * Decoder for the 'w:rsidRDefault' attribute on the <w:p> element.
 * Maps to the 'rsidRDefault' attribute in SuperDoc.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The corresponding rsidRDefault value in OOXML, or undefined if not applicable.
 */
export const decode = (attrs) => {
  return attrs.rsidRDefault;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:rsidRDefault',
  sdName: 'rsidRDefault',
  encode,
  decode,
});
