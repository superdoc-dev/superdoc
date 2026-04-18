import { NodeTranslator } from '../../../node-translator/node-translator';
import { sdtNodeTypeStrategy } from './helpers/sdt-node-type-strategy';
import { translateFieldAnnotation } from './helpers/translate-field-annotation';
import { translateDocumentSection } from './helpers/translate-document-section';
import { translateDocumentPartObj } from './helpers/translate-document-part-obj';
import { translateStructuredContent } from './helpers/translate-structured-content';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:sdt';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = ['fieldAnnotation', 'structuredContent', 'structuredContentBlock', 'documentSection'];

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = []; // No attrs for "w:sdt".

/**
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {import('@translator').SCEncoderResult}
 */
function encode(params) {
  const nodes = params.nodes;
  const node = nodes[0];

  const { type: sdtType, handler } = sdtNodeTypeStrategy(node);

  if (!handler || sdtType === 'unknown') {
    return undefined;
  }

  const result = handler(params);
  return result;
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

  const types = {
    fieldAnnotation: () => translateFieldAnnotation(params),
    structuredContent: () => translateStructuredContent(params),
    structuredContentBlock: () => translateStructuredContent(params),
    documentSection: () => translateDocumentSection(params),
    documentPartObject: () => translateDocumentPartObj(params), // Handled in doc-part-obj translator
    default: () => null,
  };
  const decoder = types[node.type] ?? types.default;
  const result = decoder();

  return result;
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
