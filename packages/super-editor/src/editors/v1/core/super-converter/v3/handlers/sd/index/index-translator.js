// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '../../../../exporter.js';
import { buildInstructionElements } from '../shared/index.js';

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

  const indexBeginElements = [
    {
      name: 'w:r',
      elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' }, elements: [] }],
    },
    {
      name: 'w:r',
      elements: instructionElements,
    },
    { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' }, elements: [] }] },
  ];

  if (contentNodes.length > 0) {
    const firstParagraph = contentNodes[0];
    let insertIndex = 0;
    if (firstParagraph.elements) {
      const pPrIndex = firstParagraph.elements.findIndex((el) => el.name === 'w:pPr');
      insertIndex = pPrIndex >= 0 ? pPrIndex + 1 : 0;
    } else {
      firstParagraph.elements = [];
    }

    firstParagraph.elements.splice(insertIndex, 0, ...indexBeginElements);
  } else {
    contentNodes.push({
      name: 'w:p',
      elements: indexBeginElements,
    });
  }

  const indexEndElements = [
    { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' }, elements: [] }] },
  ];
  const lastParagraph = contentNodes[contentNodes.length - 1];
  if (lastParagraph.elements) {
    lastParagraph.elements.push(...indexEndElements);
  } else {
    lastParagraph.elements = [...indexEndElements];
  }

  return contentNodes;
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
