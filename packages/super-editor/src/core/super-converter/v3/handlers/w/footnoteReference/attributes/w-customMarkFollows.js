// @ts-check

/**
 * Encoder for the 'w:customMarkFollows' attribute on the <w:footnoteReference> element.
 * Maps to the 'customMarkFollows' attribute in SuperDoc.
 * This attribute indicates that a custom mark (symbol) follows the footnote reference.
 *
 * @param {Record<string, any>} attributes
 * @returns {boolean|undefined}
 */
export const encode = (attributes) => {
  const val = attributes?.['w:customMarkFollows'];
  // Treat '1', 'true', or true as truthy
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
  // Only emit the attribute if it's truthy
  return attrs?.customMarkFollows ? '1' : undefined;
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:customMarkFollows',
  sdName: 'customMarkFollows',
  encode,
  decode,
});
