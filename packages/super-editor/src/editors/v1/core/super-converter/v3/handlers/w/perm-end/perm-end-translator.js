// @ts-check
import { NodeTranslator } from '@translator';
import { isInlineContext } from '@core/super-converter/utils/inlineContext.js';
import validXmlAttributes from './attributes/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:permEnd';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = ['permEnd', 'permEndBlock'];

/**
 * Encode a <w:permEnd> node as a SuperDoc permEnd/permEndBlock node.
 * @param {import('@translator').SCEncoderConfig} params
 * @param {import('@translator').EncodedAttributes} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs = {}) => {
  const node = params?.nodes?.[0];
  const isInline = isInlineContext(params?.path || [], node?.name);
  return {
    type: isInline ? 'permEnd' : 'permEndBlock',
    attrs: encodedAttrs,
  };
};

/**
 * Decode a SuperDoc permEnd node back into OOXML <w:permEnd>.
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
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the <w:permEnd> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
