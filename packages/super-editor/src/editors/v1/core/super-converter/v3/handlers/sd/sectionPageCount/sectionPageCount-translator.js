// @ts-check
import { NodeTranslator } from '@translator';
import { processOutputMarks } from '../../../../exporter.js';
import { parseMarks } from './../../../../v2/importer/markImporter.js';
import { buildComplexFieldRuns } from '../build-complex-field-runs.js';
import { pageNumberFormatToInstructionSwitch } from '../../../../field-references/fld-preprocessors/page-instruction.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:sectionPageCount';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'section-page-count';

/**
 * Encode a <sd:sectionPageCount> node as a SuperDoc section-page-count node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [] } = params || {};
  const node = nodes[0];

  const rPr = node.elements?.find((el) => el.name === 'w:rPr');
  const marks = parseMarks(rPr || { elements: [] });
  const processedNode = {
    type: 'section-page-count',
    attrs: {
      marksAsAttrs: marks,
    },
  };

  if (typeof node.attributes?.instruction === 'string') {
    processedNode.attrs.instruction = node.attributes.instruction;
  }
  if (typeof node.attributes?.pageNumberFormat === 'string') {
    processedNode.attrs.pageNumberFormat = node.attributes.pageNumberFormat;
  }
  if (node.attributes?.pageNumberZeroPadding != null) {
    processedNode.attrs.pageNumberZeroPadding = Number(node.attributes.pageNumberZeroPadding);
  }
  if (node.attributes?.importedCachedText) {
    processedNode.attrs.importedCachedText = node.attributes.importedCachedText;
  }

  return processedNode;
};

/**
 * Decode the section-page-count node back into OOXML <w:fldChar> structure.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;

  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const instruction = getSectionPagesInstructionText(node.attrs);
  const cachedText = resolveCachedSectionPageCount(node);

  return buildComplexFieldRuns({ instruction, cachedText, outputMarks, dirty: true });
};

/**
 * @param {Record<string, unknown> | undefined} attrs
 * @returns {string}
 */
function getSectionPagesInstructionText(attrs = {}) {
  if (typeof attrs.instruction === 'string' && attrs.instruction.trim()) {
    return attrs.instruction.trim();
  }

  if (typeof attrs.pageNumberFormat === 'string') {
    const instructionSwitch = pageNumberFormatToInstructionSwitch(attrs.pageNumberFormat);
    if (instructionSwitch) {
      const numericPicture =
        typeof attrs.pageNumberZeroPadding === 'number' && attrs.pageNumberZeroPadding > 0
          ? ` \\# ${'0'.repeat(attrs.pageNumberZeroPadding)}`
          : '';
      return `SECTIONPAGES \\* ${instructionSwitch}${numericPicture}`;
    }
  }

  if (typeof attrs.pageNumberZeroPadding === 'number' && attrs.pageNumberZeroPadding > 0) {
    return `SECTIONPAGES \\# ${'0'.repeat(attrs.pageNumberZeroPadding)}`;
  }

  return 'SECTIONPAGES';
}

/**
 * Priority: resolvedText, importedCachedText, then node text content.
 * @param {{ attrs?: Record<string, unknown>, content?: Array<{ type?: string, text?: string }> }} node
 */
function resolveCachedSectionPageCount(node) {
  if (node.attrs?.resolvedText) {
    return String(node.attrs.resolvedText);
  }

  if (node.attrs?.importedCachedText) {
    return String(node.attrs.importedCachedText);
  }

  const textContent = node.content
    ?.filter((n) => n.type === 'text')
    .map((n) => n.text || '')
    .join('');
  return textContent || '';
}

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
};

/**
 * The NodeTranslator instance.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
