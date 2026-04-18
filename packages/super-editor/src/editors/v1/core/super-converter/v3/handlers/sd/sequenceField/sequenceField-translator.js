// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';
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
  const { identifier, format, restartLevel } = parseSeqInstruction(instruction);

  return {
    type: SD_NODE_NAME,
    attrs: {
      instruction,
      instructionTokens: node.attributes?.instructionTokens || null,
      identifier,
      format,
      restartLevel,
      resolvedNumber: extractResolvedText(processedText),
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
  const contentNodes = (node.content ?? []).flatMap((n) => exportSchemaToJson({ ...params, node: n }));
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
 * Parses a SEQ instruction into its components.
 * @param {string} instruction
 * @returns {{ identifier: string; format: string; restartLevel: number | null }}
 */
function parseSeqInstruction(instruction) {
  const parts = instruction.trim().split(/\s+/);
  const identifier = parts[1] || '';
  let format = 'ARABIC';
  let restartLevel = null;

  for (let i = 2; i < parts.length; i++) {
    if (parts[i] === '\\*' && parts[i + 1]) {
      format = parts[i + 1];
      i++;
    } else if (parts[i] === '\\s' && parts[i + 1]) {
      restartLevel = parseInt(parts[i + 1], 10) || null;
      i++;
    }
  }

  return { identifier, format, restartLevel };
}

/**
 * Extracts resolved text from processed content.
 * @param {Array<any>} content
 * @returns {string}
 */
function extractResolvedText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((n) => n.type === 'text')
    .map((n) => n.text || '')
    .join('');
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
