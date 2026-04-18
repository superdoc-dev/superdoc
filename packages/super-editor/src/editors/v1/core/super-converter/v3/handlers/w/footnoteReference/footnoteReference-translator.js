// @ts-check
import { NodeTranslator } from '@translator';
import { idAttrConfig, customMarkFollowsAttrConfig } from './attributes/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:footnoteReference';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'footnoteReference';

/**
 * Encode <w:footnoteReference w:id="..."/> as an inline atom node.
 * @param {import('@translator').SCEncoderConfig} _
 * @param {import('@translator').EncodedAttributes} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (_, encodedAttrs) => {
  const translated = { type: SD_NODE_NAME };
  if (encodedAttrs && Object.keys(encodedAttrs).length > 0) {
    translated.attrs = { ...encodedAttrs };
  }
  return translated;
};

/**
 * Decode SuperDoc footnoteReference back to OOXML <w:footnoteReference>.
 * Note: This element must be emitted inside a <w:r> by the parent run translator.
 *
 * @param {import('@translator').SCDecoderConfig} _params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs]
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (_params, decodedAttrs) => {
  const ref = { name: XML_NODE_NAME, elements: [] };
  if (decodedAttrs && Object.keys(decodedAttrs).length > 0) {
    ref.attributes = { ...decodedAttrs };
  }
  return ref;
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: [idAttrConfig, customMarkFollowsAttrConfig],
};

/** @type {import('@translator').NodeTranslator} */
export const translator = NodeTranslator.from(config);
