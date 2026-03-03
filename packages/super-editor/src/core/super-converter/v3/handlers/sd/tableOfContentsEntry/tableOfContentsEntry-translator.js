// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';
import { buildInstructionElements } from '../shared/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:tableOfContentsEntry';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'tableOfContentsEntry';

/**
 * Encode a <sd:tableOfContentsEntry> node as a SuperDoc tableOfContentsEntry node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [], nodeListHandler } = params || {};
  const node = nodes[0];

  const processedText = nodeListHandler.handler({
    ...params,
    nodes: node.elements,
  });

  return {
    type: 'tableOfContentsEntry',
    attrs: {
      instruction: node.attributes?.instruction || '',
      instructionTokens: node.attributes?.instructionTokens || null,
      marksAsAttrs: node.marks || [],
    },
    content: processedText,
  };
};

/**
 * Decode the tableOfContentsEntry node back into OOXML field structure.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;
  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const contentNodes = (node.content ?? []).flatMap((n) => exportSchemaToJson({ ...params, node: n }));
  const instructionElements = buildInstructionElements(node.attrs?.instruction, node.attrs?.instructionTokens);

  return [
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        {
          name: 'w:fldChar',
          attributes: {
            'w:fldCharType': 'begin',
          },
        },
      ],
    },
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        ...instructionElements,
      ],
    },
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        {
          name: 'w:fldChar',
          attributes: {
            'w:fldCharType': 'separate',
          },
        },
      ],
    },
    ...contentNodes,
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        {
          name: 'w:fldChar',
          attributes: {
            'w:fldCharType': 'end',
          },
        },
      ],
    },
  ];
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
 * The NodeTranslator instance for the sd:tableOfContentsEntry element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
