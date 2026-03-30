// @ts-check
import { NodeTranslator } from '@translator';
import { getDocxHighlightKeywordFromHex, normalizeHexColor } from '@converter/helpers.js';
import validXmlAttributes from './attributes/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:highlight';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_ATTR_KEY = 'highlight';

const DISABLED_TOKENS = new Set(['transparent', 'none', 'inherit']);

/**
 * Encode the w:highlight element.
 * Preserve attributes (e.g., w:val color keyword) for downstream mapping.
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs = {}) => {
  const { nodes } = params;
  const node = nodes?.[0];
  const value = encodedAttrs.highlight ?? node?.attributes?.['w:val'];

  return {
    type: 'attr',
    xmlName: XML_NODE_NAME,
    sdNodeOrKeyName: SD_ATTR_KEY,
    attributes: { 'w:val': value ?? null },
  };
};

const decode = (params) => {
  const attrs = params?.node?.attrs || {};
  const highlightValue = attrs.highlight?.['w:val'] ?? attrs.highlight ?? attrs.color ?? null;
  if (!highlightValue) return undefined;

  const normalizedValue = String(highlightValue).trim().toLowerCase();
  if (!normalizedValue) return undefined;

  if (DISABLED_TOKENS.has(normalizedValue)) {
    return {
      name: XML_NODE_NAME,
      attributes: { 'w:val': 'none' },
    };
  }

  const keyword = getDocxHighlightKeywordFromHex(highlightValue);
  if (keyword) {
    return {
      name: XML_NODE_NAME,
      attributes: { 'w:val': keyword },
    };
  }

  const fill = normalizeHexColor(highlightValue);
  if (!fill) return undefined;

  return {
    name: 'w:shd',
    attributes: {
      'w:color': 'auto',
      'w:val': 'clear',
      'w:fill': fill,
    },
  };
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_ATTR_KEY,
  type: NodeTranslator.translatorTypes.ATTRIBUTE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/** @type {import('@translator').NodeTranslator} */
export const translator = NodeTranslator.from(config);
