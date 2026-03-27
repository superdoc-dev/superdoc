// @ts-check
import { parseInteger, integerToString } from '../../../utils.js';
/**
 * Encoder for the 'w:colLast' attribute on the <w:permStart> element.
 * Maps to the 'colLast' attribute in SuperDoc.
 * @param {Object} attributes
 * @returns {number|undefined}
 */
export const encode = (attributes) => {
  return parseInteger(attributes['w:colLast']);
};

/**
 * Decoder for the 'colLast' attribute in SuperDoc.
 * Maps to the 'w:colLast' attribute in OOXML.
 * @param {Object} attrs
 * @returns {string|undefined}
 */
export const decode = (attrs) => {
  return integerToString(attrs.colLast);
};

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:colLast',
  sdName: 'colLast',
  encode,
  decode,
});
