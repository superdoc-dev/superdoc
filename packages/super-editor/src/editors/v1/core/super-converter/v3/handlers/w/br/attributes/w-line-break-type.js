// @ts-check

/**
 * Handler for the 'w:type' attribute on the <w:br> element.
 * Maps to the 'lineBreakType' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The corresponding line break type in SuperDoc, or undefined if not applicable.
 */
export const encode = (attributes) => {
  return attributes['w:type'];
};

/**
 * Decoder for the 'lineBreakType' attribute in SuperDoc.
 * Maps to the 'w:type' attribute in OOXML.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The corresponding line break type in OOXML, or undefined if not applicable.
 */
export const decode = (attrs) => {
  const { lineBreakType } = attrs;
  return lineBreakType;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:type',
  sdName: 'lineBreakType',
  encode,
  decode,
});
