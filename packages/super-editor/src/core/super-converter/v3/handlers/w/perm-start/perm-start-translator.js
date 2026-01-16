// @ts-check
import { NodeTranslator } from '@translator';
import validXmlAttributes from './attributes/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:permStart';

const INLINE_NODE_NAME = 'permStart';
const BLOCK_NODE_NAME = 'permStartBlock';

const shouldBeBlock = (parent) => {
  const acceptsBlockOnly = ['w:body'];
  return parent?.name && acceptsBlockOnly.includes(parent?.name);
};

/**
 * Encode a <w:permStart> node as a SuperDoc permStart node.
 * @param {import('@translator').SCEncoderConfig} params
 * @param {import('@translator').EncodedAttributes} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs = {}) => {
  const parent = params?.path?.[params?.path?.length - 1];

  const nodeName = shouldBeBlock(parent) ? BLOCK_NODE_NAME : INLINE_NODE_NAME;
  return {
    type: nodeName,
    attrs: encodedAttrs,
  };
};

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
export const configInline = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: INLINE_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const configBlock = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: BLOCK_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the <w:permStart> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translatorInline = NodeTranslator.from(configInline);
/**
 * The NodeTranslator instance for the <w:permStartBlock> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translatorBlock = NodeTranslator.from(configBlock);
