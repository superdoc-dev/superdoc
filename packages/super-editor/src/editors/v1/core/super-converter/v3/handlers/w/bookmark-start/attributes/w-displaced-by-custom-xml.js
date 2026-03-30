// @ts-check

/**
 * Encoder for the 'w:displacedByCustomXml' attribute on the <w:bookmarkStart> element.
 * Maps to the 'displacedByCustomXml' attribute in SuperDoc.
 * @param {Object} attributes - The attributes from the OOXML element.
 * @returns {string|undefined} The displacedByCustomXml value.
 */
export const encode = (attributes) => {
  return attributes['w:displacedByCustomXml'];
};

/**
 * Decoder for the 'displacedByCustomXml' attribute in SuperDoc.
 * Maps to the 'w:displacedByCustomXml' attribute in OOXML.
 * @param {Object} attrs - The attributes from the SuperDoc element.
 * @returns {string|undefined} The displacedByCustomXml value.
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
