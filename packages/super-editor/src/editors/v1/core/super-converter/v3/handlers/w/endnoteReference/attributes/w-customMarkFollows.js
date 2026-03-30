// @ts-check

/**
 * Encoder for the 'w:customMarkFollows' attribute on the <w:endnoteReference> element.
 * Maps to the 'customMarkFollows' attribute in SuperDoc.
 *
 * @param {Record<string, any>} attributes
 * @returns {boolean|undefined}
 */
export const encode = (attributes) => {
  const val = attributes?.['w:customMarkFollows'];
  return val === '1' || val === 'true' || val === true ? true : undefined;
};

/**
 * Decoder for the 'customMarkFollows' attribute in SuperDoc.
 * Maps to the 'w:customMarkFollows' attribute in OOXML.
 *
 * @param {Record<string, any>} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return attrs?.customMarkFollows ? '1' : undefined;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:customMarkFollows',
  sdName: 'customMarkFollows',
  encode,
  decode,
});
