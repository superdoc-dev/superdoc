// @ts-check
import { NodeTranslator } from '@translator';
import { processOutputMarks } from '../../../../exporter.js';
import { parseMarks } from './../../../../v2/importer/markImporter.js';
import { buildComplexFieldRuns } from '../build-complex-field-runs.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:documentStatField';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'documentStatField';

/**
 * Encode a <sd:documentStatField> node as a SuperDoc documentStatField node.
 *
 * Extracts the instruction attribute and the cached display text from child
 * content runs. Marks are collected from the first w:rPr found in child elements.
 *
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [] } = params || {};
  const node = nodes[0];

  const instruction = node.attributes?.instruction || '';
  const resolvedText = extractCachedText(node.elements || []);

  const rPr = node.elements?.find((el) => el.name === 'w:rPr');
  const marks = parseMarks(rPr || { elements: [] });

  return {
    type: SD_NODE_NAME,
    attrs: {
      instruction,
      resolvedText,
      marksAsAttrs: marks,
    },
  };
};

/**
 * Decode the documentStatField node back into OOXML complex field structure.
 *
 * Emits the standard 5-run complex field pattern:
 *   begin → instrText → separate → cached result run → end
 *
 * The cached result text comes from the export-preparation cache map context
 * (if available), falling back to the node's `resolvedText` attr.
 *
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;

  const instruction = node.attrs?.instruction || '';
  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const cachedText = resolveCachedText(params.statFieldCacheMap, node);

  // Fields with uninterpreted switches are marked dirty so Word re-evaluates.
  const dirty = hasUninterpretedSwitches(instruction);

  return buildComplexFieldRuns({ instruction, cachedText, outputMarks, dirty });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts cached display text from the content runs between separate and end
 * that were preserved during import.
 *
 * @param {import('../../../../v2/types/index.js').OpenXmlNode[]} elements
 * @returns {string}
 */
function extractCachedText(elements) {
  const texts = [];
  for (const el of elements) {
    if (el.name === 'w:rPr') continue;
    const textNode = el.elements?.find((child) => child.name === 'w:t');
    if (textNode) {
      const text = textNode.elements?.[0]?.text ?? '';
      texts.push(text);
    }
  }
  return texts.join('');
}

/**
 * Resolves the cached text to write in the export.
 * Prefers the export-preparation cache map (keyed by field type),
 * falls back to the node's resolvedText attr.
 */
function resolveCachedText(cacheMap, node) {
  if (cacheMap) {
    const instruction = node.attrs?.instruction || '';
    const fieldType = instruction.trim().split(/\s+/)[0]?.toUpperCase();
    if (fieldType && cacheMap.has?.(fieldType)) {
      return cacheMap.get(fieldType);
    }
  }
  return node.attrs?.resolvedText ?? '';
}

/**
 * Returns true if the instruction contains formatting switches that SuperDoc
 * does not interpret. When true, the field must be marked w:dirty so Word
 * re-evaluates on open.
 */
function hasUninterpretedSwitches(instruction) {
  return /\\[*#@]/.test(instruction);
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
