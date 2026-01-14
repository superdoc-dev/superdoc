// @ts-check

/**
 * Encoder for the 'w:id' attribute on the <w:footnoteReference> element.
 * Maps to the 'id' attribute in SuperDoc.
 * @param {Record<string, any>} attributes
 * @returns {string|undefined}
 */
export const encode = (attributes) => {
  return attributes?.['w:id'];
};

/**
 * Decoder for the 'id' attribute in SuperDoc.
 * Maps to the 'w:id' attribute in OOXML.
 * @param {Record<string, any>} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return attrs?.id;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:id',
  sdName: 'id',
  encode,
  decode,
});

