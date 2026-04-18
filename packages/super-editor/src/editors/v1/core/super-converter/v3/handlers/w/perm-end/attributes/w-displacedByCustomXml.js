// @ts-check

/**
 * Encoder for the 'w:displacedByCustomXml' attribute on the <w:permEnd> element.
 * Maps to the 'displacedByCustomXml' attribute in SuperDoc.
 * @param {Object} attributes
 * @returns {string|undefined}
 */
export const encode = (attributes) => {
  return attributes['w:displacedByCustomXml'];
};

/**
 * Decoder for the 'displacedByCustomXml' attribute in SuperDoc.
 * Maps to the 'w:displacedByCustomXml' attribute in OOXML.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return attrs.displacedByCustomXml;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:displacedByCustomXml',
  sdName: 'displacedByCustomXml',
  encode,
  decode,
});
