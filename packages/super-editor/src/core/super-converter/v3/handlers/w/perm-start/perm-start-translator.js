// @ts-check
import { NodeTranslator } from '@translator';
import { isInlineContext } from '../../../../helpers/node-context.js';
import validXmlAttributes from './attributes/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:permStart';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAMES = /** @type {const} */ (['permStart', 'permStartBlock']);

const INLINE_NODE_NAME = SD_NODE_NAMES[0];
const BLOCK_NODE_NAME = SD_NODE_NAMES[1];

const resolveNodeType = (params) => {
  const inlineContext = isInlineContext(params?.path, params?.nodes?.[0]?.name);
  return inlineContext ? INLINE_NODE_NAME : BLOCK_NODE_NAME;
};

/**
 * Encode a <w:permStart> node as a SuperDoc permStart node.
 * @param {import('@translator').SCEncoderConfig} params
 * @param {import('@translator').EncodedAttributes} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs = {}) => ({
  type: resolveNodeType(params),
  attrs: encodedAttrs,
});

/**
 * Decode a SuperDoc permStart node back into OOXML <w:permStart>.
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs]
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (params, decodedAttrs = {}) => {
  const result = {
    name: XML_NODE_NAME,
    elements: [],
  };

  if (decodedAttrs && Object.keys(decodedAttrs).length) {
    result.attributes = decodedAttrs;
  }

  return result;
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAMES,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the <w:permStart> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
