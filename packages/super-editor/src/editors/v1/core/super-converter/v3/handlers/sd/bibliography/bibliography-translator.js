// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '../../../../exporter.js';
import { buildInstructionElements, wrapParagraphsAsComplexField } from '../shared/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:bibliography';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'bibliography';

/**
 * Encode a <sd:bibliography> node as a SuperDoc bibliography block node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [], nodeListHandler } = params || {};
  const node = nodes[0];

  const processedContent = nodeListHandler.handler({
    ...params,
    nodes: node.elements || [],
  });

  return {
    type: SD_NODE_NAME,
    attrs: {
      instruction: node.attributes?.instruction || '',
      instructionTokens: node.attributes?.instructionTokens || null,
      wrapperParagraphProperties: node.attributes?.wrapperParagraphProperties || null,
    },
    content: processedContent,
  };
};

/**
 * Decode the bibliography node back into OOXML field structure.
 * Follows the same pattern as index-translator (block-level fldChar wrapping).
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {any[]}
 */
const decode = (params) => {
  const { node } = params;

  /** @type {any[]} */
  const contentNodes = (node.content ?? []).map((n) => exportSchemaToJson({ ...params, node: n }));
  const instructionElements = buildInstructionElements(node.attrs?.instruction, node.attrs?.instructionTokens ?? null);

  return wrapParagraphsAsComplexField(
    contentNodes,
    instructionElements,
    node.attrs?.wrapperParagraphProperties ?? null,
  );
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
};

/** @type {import('@translator').NodeTranslator} */
export const translator = NodeTranslator.from(config);
