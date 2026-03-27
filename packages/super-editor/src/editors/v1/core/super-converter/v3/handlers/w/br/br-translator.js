// @ts-check
import { NodeTranslator } from '@translator';
import validXmlAttributes from './attributes/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:br';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'lineBreak';

/**
 * Encode an unhandled node as a passthrough node.
 * @param {import('@translator').SCEncoderConfig} _
 * @param {import('@translator').EncodedAttributes} [encodedAttrs] - The already encoded attributes
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (_, encodedAttrs) => {
  const isPageBreak = encodedAttrs?.lineBreakType === 'page';
  const translated = {
    type: isPageBreak ? 'hardBreak' : 'lineBreak',
  };
  if (encodedAttrs) {
    translated.attrs = { ...encodedAttrs };
  }

  return translated;
};

/**
 * Decode the lineBreak / hardBreak node back into OOXML <w:br>.
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs] - The already decoded attributes
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (params, decodedAttrs) => {
  const { node } = params;

  if (!node) return;

  const wBreak = { name: 'w:br' };

  if (decodedAttrs) {
    wBreak.attributes = { ...decodedAttrs };
  }

  /** Special case: Ensure page breaks have w:type="page" */
  const isPageBreak = node.type === 'hardBreak';
  if (isPageBreak && (!wBreak.attributes || !wBreak.attributes['w:type'])) {
    wBreak.attributes = { ...wBreak.attributes, 'w:type': 'page' };
  }

  /** breaks are wrapped in runs for Google Docs compatibility */
  const translated = {
    name: 'w:r',
    elements: [wBreak],
  };

  return translated;
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the passthrough element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
