import { NodeTranslator } from '../../../node-translator/node-translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { handleInlineNode } from '@converter/v3/handlers/wp/inline/helpers/handle-inline-node.js';
import { translateInlineNode } from '@converter/v3/handlers/wp/inline/helpers/translate-inline-node.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'wp:inline';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = ['image', 'shapeGroup', 'vectorShape', 'contentBlock'];

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = ['distT', 'distB', 'distL', 'distR', 'wp14:anchorId', 'wp14:editId'].map((xmlName) =>
  createAttributeHandler(xmlName),
);
/**
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {import('@translator').SCEncoderResult}
 */
function encode(params) {
  const { node } = params.extraParams;

  if (!node || !node.name) {
    return null;
  }

  return handleInlineNode(params);
}

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params) {
  const { node } = params;

  if (!node || !node.type) {
    return null;
  }

  return translateInlineNode(params);
}

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
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
