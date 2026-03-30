// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';
import { buildInstructionElements } from '../shared/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:authorityEntry';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'authorityEntry';

/**
 * Encode a <sd:authorityEntry> node as a SuperDoc authorityEntry node.
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
  const { longCitation, shortCitation, category, bold, italic } = parseTaInstruction(instruction);

  return {
    type: SD_NODE_NAME,
    attrs: {
      instruction,
      instructionTokens: node.attributes?.instructionTokens || null,
      longCitation,
      shortCitation,
      category,
      bold,
      italic,
      marksAsAttrs: node.marks || [],
    },
    content: processedText,
  };
};

/**
 * Decode the authorityEntry node back into OOXML field structure.
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
 * Parses a TA instruction into its components.
 * TA [\l "long citation"] [\s "short citation"] [\c category] [\b] [\i]
 * @param {string} instruction
 * @returns {{ longCitation: string; shortCitation: string; category: number; bold: boolean; italic: boolean }}
 */
function parseTaInstruction(instruction) {
  let longCitation = '';
  let shortCitation = '';
  let category = 0;
  let bold = false;
  let italic = false;

  // Extract quoted values for \l and \s switches
  const longMatch = instruction.match(/\\l\s+"([^"]*)"/);
  if (longMatch) longCitation = longMatch[1];

  const shortMatch = instruction.match(/\\s\s+"([^"]*)"/);
  if (shortMatch) shortCitation = shortMatch[1];

  const categoryMatch = instruction.match(/\\c\s+(\d+)/);
  if (categoryMatch) category = parseInt(categoryMatch[1], 10);

  bold = /\\b(?:\s|$)/.test(instruction);
  italic = /\\i(?:\s|$)/.test(instruction);

  return { longCitation, shortCitation, category, bold, italic };
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
