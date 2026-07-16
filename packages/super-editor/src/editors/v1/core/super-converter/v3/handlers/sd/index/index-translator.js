// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '../../../../exporter.js';
import { buildInstructionElements, wrapParagraphsAsComplexField } from '../shared/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:index';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'index';

/**
 * Encode a <sd:index> node as a SuperDoc index node.
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
    type: 'index',
    attrs: {
      instruction: node.attributes?.instruction || '',
      instructionTokens: node.attributes?.instructionTokens || null,
      wrapperParagraphProperties: node.attributes?.wrapperParagraphProperties || null,
    },
    content: processedContent,
  };
};

/**
 * Decode the index node back into OOXML field structure.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {any[]}
 */
const decode = (params) => {
  const { node } = params;

  /** @type {any[]} */
  const contentNodes = (node.content ?? []).map((n) => exportSchemaToJson({ ...params, node: n }));
  const instructionElements = buildInstructionElements(node.attrs?.instruction, node.attrs?.instructionTokens);

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

/**
 * The NodeTranslator instance for the sd:index element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
