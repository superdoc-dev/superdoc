// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';
import {
  parseSeqInstruction,
  sequenceFieldAttrsFromParsed,
} from '../../../../field-references/shared/seq-instruction.js';
import { buildInstructionElements } from '../shared/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:sequenceField';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'sequenceField';

/**
 * Encode a <sd:sequenceField> node as a SuperDoc sequenceField node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [], nodeListHandler } = params || {};
  const node = nodes[0];

  const processedText = nodeListHandler.handler({
    ...params,
    nodes: node.elements || [],
  });

  const instruction = node.attributes?.instruction || '';
  const parsed = parseSeqInstruction(instruction);
  const parsedAttrs = sequenceFieldAttrsFromParsed(parsed);

  return {
    type: SD_NODE_NAME,
    attrs: {
      instruction,
      instructionTokens: node.attributes?.instructionTokens || null,
      // Raw instruction remains the export source of truth; these parsed attrs support import-time routing and later evaluation.
      ...parsedAttrs,
      resolvedNumber: extractResolvedText(processedText),
      resolvedNumberIsCurrent: false,
      marksAsAttrs: node.marks || [],
    },
    content: processedText,
  };
};

/**
 * Decode the sequenceField node back into OOXML field structure.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;
  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const contentNodes = buildResultContentNodes(params, outputMarks);
  const instructionElements = buildInstructionElements(node.attrs?.instruction, node.attrs?.instructionTokens);

  return [
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } },
      ],
    },
    {
      name: 'w:r',
      elements: [{ name: 'w:rPr', elements: outputMarks }, ...instructionElements],
    },
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
      ],
    },
    ...contentNodes,
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
      ],
    },
  ];
};

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @param {Array<any>} outputMarks
 * @returns {Array<any>}
 */
function buildResultContentNodes(params, outputMarks) {
  const { node } = params;
  const resolvedNumber = node.attrs?.resolvedNumber;
  const hasCurrentResult = node.attrs?.resolvedNumberIsCurrent === true;

  if (hasCurrentResult) {
    return typeof resolvedNumber === 'string' && resolvedNumber.length > 0
      ? [buildResolvedNumberRun(resolvedNumber, outputMarks)]
      : [];
  }

  if (Array.isArray(node.content) && node.content.length > 0) {
    return node.content.flatMap((n) => exportSchemaToJson({ ...params, node: n }));
  }

  return typeof resolvedNumber === 'string' && resolvedNumber.length > 0
    ? [buildResolvedNumberRun(resolvedNumber, outputMarks)]
    : [];
}

/**
 * @param {string} text
 * @param {Array<any>} outputMarks
 * @returns {any}
 */
function buildResolvedNumberRun(text, outputMarks) {
  return {
    name: 'w:r',
    elements: [
      { name: 'w:rPr', elements: outputMarks },
      { name: 'w:t', elements: [{ type: 'text', text }] },
    ],
  };
}

/**
 * Extracts resolved text from processed content.
 * @param {Array<any>} content
 * @returns {string}
 */
function extractResolvedText(content) {
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const node of content) {
    if (!node) continue;
    if (node.type === 'text') {
      text += node.text || '';
    }
    if (Array.isArray(node.content)) {
      text += extractResolvedText(node.content);
    }
  }
  return text;
}

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
