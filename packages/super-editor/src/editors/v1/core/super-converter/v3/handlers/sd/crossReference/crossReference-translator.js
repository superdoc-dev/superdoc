// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';
import { buildInstructionElements } from '../shared/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:crossReference';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'crossReference';

/**
 * Encode a <sd:crossReference> node as a SuperDoc crossReference node.
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

  return {
    type: SD_NODE_NAME,
    attrs: {
      instruction: node.attributes?.instruction || '',
      fieldType: node.attributes?.fieldType || 'REF',
      target: parseTarget(node.attributes?.instruction),
      display: parseDisplay(node.attributes?.instruction),
      resolvedText: extractResolvedText(processedText),
      marksAsAttrs: node.marks || [],
    },
    content: processedText,
  };
};

/**
 * Decode the crossReference node back into OOXML field structure.
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
 * Extracts the target name from a REF/NOTEREF/STYLEREF instruction.
 * @param {string} [instruction]
 * @returns {string}
 */
function parseTarget(instruction) {
  if (!instruction) return '';
  const parts = instruction.trim().split(/\s+/);
  // Second token is the target (e.g., "REF bookmarkName \h")
  if (parts.length < 2) return '';
  const target = parts[1];
  // Remove surrounding quotes if present (STYLEREF uses quoted style names)
  return target.replace(/^"(.*)"$/, '$1');
}

/**
 * Derives the display mode from instruction switches.
 * @param {string} [instruction]
 * @returns {string}
 */
function parseDisplay(instruction) {
  if (!instruction) return 'content';
  if (instruction.includes('\\n')) return 'numberOnly';
  if (instruction.includes('\\w')) return 'numberFullContext';
  if (instruction.includes('\\p')) return 'aboveBelow';
  if (instruction.includes('\\r')) return 'paragraphNumber';
  return 'content';
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
