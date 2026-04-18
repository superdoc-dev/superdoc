// @ts-check

/**
 * Encoder for the 'w14:textId' attribute on the <w:p> element.
 * Maps to the 'textId' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The corresponding textId value in SuperDoc, or undefined if not applicable.
 */
export const encode = (attributes) => {
  return attributes['w14:textId'];
};

/**
 * Decoder for the 'w14:textId' attribute on the <w:p> element.
 * Maps to the 'textId' attribute in SuperDoc.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The corresponding textId value in OOXML, or undefined if not applicable.
 */
export const decode = (attrs) => {
  return attrs.textId;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w14:textId',
  sdName: 'textId',
  encode,
  decode,
});
