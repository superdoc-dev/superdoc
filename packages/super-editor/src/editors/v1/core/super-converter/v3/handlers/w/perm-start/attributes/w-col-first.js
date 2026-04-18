// @ts-check
import { parseInteger, integerToString } from '../../../utils.js';
/**
 * Encoder for the 'w:colFirst' attribute on the <w:permStart> element.
 * Maps to the 'colFirst' attribute in SuperDoc.
 * @param {Object} attributes
 * @returns {number|undefined}
 */
export const encode = (attributes) => {
  return parseInteger(attributes['w:colFirst']);
};

/**
 * Decoder for the 'colFirst' attribute in SuperDoc.
 * Maps to the 'w:colFirst' attribute in OOXML.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return integerToString(attrs.colFirst);
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:colFirst',
  sdName: 'colFirst',
  encode,
  decode,
});
