// @ts-check

/**
 * Encoder for the 'w:edGrp' attribute on the <w:permStart> element.
 * Maps to the 'edGrp' attribute in SuperDoc.
 * @param {Object} attributes
 * @returns {string|undefined}
 */
export const encode = (attributes) => {
  return attributes['w:edGrp'];
};

/**
 * Decoder for the 'edGrp' attribute in SuperDoc.
 * Maps to the 'w:edGrp' attribute in OOXML.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return attrs.edGrp;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:edGrp',
  sdName: 'edGrp',
  encode,
  decode,
});
