// @ts-check

/**
 * Encoder for the 'w:clear' attribute on the <w:br> element.
 * Maps to the 'clear' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The corresponding clear value in SuperDoc, or undefined if not applicable.
 */
export const encode = (attributes) => {
  const xmlAttrValue = attributes['w:clear'];
  return xmlAttrValue;
};

/**
 * Decoder for the 'w:clear' attribute on the <w:br> element.
 * Maps to the 'clear' attribute in SuperDoc.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The corresponding clear value in OOXML, or undefined if not applicable.
 */
export const decode = (attrs) => {
  const { clear } = attrs;
  return clear;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:clear',
  sdName: 'clear',
  encode,
  decode,
});
