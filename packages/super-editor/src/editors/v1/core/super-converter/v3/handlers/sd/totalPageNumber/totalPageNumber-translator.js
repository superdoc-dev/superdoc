// @ts-check
import { NodeTranslator } from '@translator';
import { processOutputMarks } from '../../../../exporter.js';
import { parseMarks } from './../../../../v2/importer/markImporter.js';
import { buildComplexFieldRuns } from '../build-complex-field-runs.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:totalPageNumber';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'total-page-number';

/**
 * Encode a <sd:totalPageNumber> node as a SuperDoc total-page-number node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [] } = params || {};
  const node = nodes[0];

  const rPr = node.elements?.find((el) => el.name === 'w:rPr');
  const marks = parseMarks(rPr || { elements: [] });

  // Preserve the imported cached text so the export fallback path can write
  // a meaningful value when pagination is unavailable.
  const importedCachedText = node.attributes?.importedCachedText || null;

  const processedNode = {
    type: 'total-page-number',
    attrs: {
      marksAsAttrs: marks,
      importedCachedText,
    },
  };

  return processedNode;
};

/**
 * Decode the total-page-number node back into OOXML <w:fldChar> structure.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;

  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const cachedText = resolveCachedPageCount(params, node);

  // Only mark dirty when the cache map does NOT contain a fresh page count.
  // When pagination is active, the cache map has NUMPAGES and the value is
  // trustworthy — Word should display it as-is without prompting.
  const hasFreshPageCount = params.statFieldCacheMap?.has?.('NUMPAGES');
  const dirty = !hasFreshPageCount;

  return buildComplexFieldRuns({ instruction: 'NUMPAGES', cachedText, outputMarks, dirty });
};

/**
 * Resolves the cached page count text for export.
 *
 * Priority chain:
 *   1. Export-preparation cache map (freshest, computed at export time)
 *   2. resolvedText attr (set by explicit F9 field update)
 *   3. importedCachedText attr (preserved from import for headless scenarios)
 *   4. Node text content (total-page-number stores value as text children)
 */
function resolveCachedPageCount(params, node) {
  const cacheMap = params.statFieldCacheMap;
  if (cacheMap?.has?.('NUMPAGES')) {
    return String(cacheMap.get('NUMPAGES'));
  }

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
