// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';
import { buildInstructionElements } from '../shared/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:citation';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'citation';

/**
 * Encode a <sd:citation> node as a SuperDoc citation node.
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
  const sourceIds = parseCitationSourceIds(instruction);

  return {
    type: SD_NODE_NAME,
    attrs: {
      instruction,
      instructionTokens: node.attributes?.instructionTokens || null,
      sourceIds,
      resolvedText: extractResolvedText(processedText),
      marksAsAttrs: node.marks || [],
    },
    content: processedText,
  };
};

/**
 * Decode the citation node back into OOXML field structure.
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
 * Parses CITATION instruction to extract source IDs.
 * CITATION tag [\l locale] [\m tag2] [\m tag3] ...
 * @param {string} instruction
 * @returns {string[]}
 */
function parseCitationSourceIds(instruction) {
  const parts = instruction.trim().split(/\s+/);
  const ids = [];

  // First token after CITATION is the primary tag
  if (parts.length >= 2) {
    ids.push(parts[1]);
  }

  // \m tokens are additional source tags
  for (let i = 2; i < parts.length; i++) {
    if (parts[i] === '\\m' && parts[i + 1]) {
      ids.push(parts[i + 1]);
      i++;
    }
  }

  return ids;
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
