// @ts-check
import { NodeTranslator } from '@translator';
import validXmlAttributes from './attributes/index.js';
import { translator as wRPrNodeTranslator } from '../rpr/rpr-translator.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:tab';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'tab';

// Attributes are provided via attrConfig list from ./attributes

/**
 * Encode a <w:tab> node as a SuperDoc tab node while preserving unknown attributes.
 * @param {import('@translator').SCEncoderConfig} _
 * @param {import('@translator').EncodedAttributes} [encodedAttrs] - The already encoded attributes
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (_, encodedAttrs = {}) => {
  const translated = { type: 'tab' };

  if (encodedAttrs) translated.attrs = { ...encodedAttrs };
  return translated;
};

/**
 * Decode a SuperDoc tab node back into OOXML <w:tab> wrapped in a run.
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs] - The already decoded attributes
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params, decodedAttrs = {}) {
  const { node } = params || {};
  if (!node) return;

  const wTab = { name: 'w:tab', elements: [] };
  if (node.attrs?.['tab']) {
    decodedAttrs = this.decodeAttributes({ ...params, node: { ...node, attrs: node.attrs['tab'] } }, decodedAttrs);
  }
  wTab.attributes = { ...decodedAttrs };

  if (params.extraParams?.skipRun) {
    return wTab;
  }

  const translated = {
    name: 'w:r',
    elements: [wTab],
  };

  // Preserve inherited run properties and mark-derived formatting on exported tabs.
  const { marks: nodeMarks = [] } = node;
  const markRunProperties = decodeRunPropertiesFromMarks(nodeMarks);
  const inheritedRunProperties = params.extraParams?.runProperties || {};
  const mergedRunProperties = mergeRunProperties(inheritedRunProperties, markRunProperties);
  const rPrNode = wRPrNodeTranslator.decode({
    node: {
      type: 'runProperties',
      attrs: { runProperties: mergedRunProperties },
    },
  });
  if (rPrNode) {
    translated.elements.unshift(rPrNode);
  }

  return translated;
}

/**
 * @param {Record<string, any>} base
 * @param {Record<string, any>} override
 */
function mergeRunProperties(base = {}, override = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      merged[key] = { ...base[key], ...value };
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

/**
 * Lightweight mark -> runProperties mapper for tab-node export.
 * Mirrors the common subset used by text export without importing exporter.js
 * (which creates a module cycle during converter bootstrap).
 * @param {Array<any>} marks
 */
function decodeRunPropertiesFromMarks(marks = []) {
  const runProperties = {};

  for (const mark of marks) {
    const type = mark?.type?.name ?? mark?.type;
    const attrs = mark?.attrs ?? {};

    switch (type) {
      case 'bold':
      case 'italic':
      case 'strike':
        runProperties[type] = attrs.value !== '0' && attrs.value !== false;
        break;
      case 'underline': {
        const underlineAttrs = {};
        if (attrs.underlineType) underlineAttrs['w:val'] = attrs.underlineType;
        if (attrs.underlineColor) underlineAttrs['w:color'] = String(attrs.underlineColor).replace('#', '');
        if (Object.keys(underlineAttrs).length > 0) {
          runProperties.underline = underlineAttrs;
        }
        break;
      }
      case 'highlight':
        if (attrs.color) {
          runProperties.highlight =
            String(attrs.color).toLowerCase() === 'transparent' ? { 'w:val': 'none' } : { 'w:val': attrs.color };
        }
        break;
      case 'link':
        runProperties.styleId = 'Hyperlink';
        break;
      case 'styleId':
        if (attrs.styleId != null) {
          runProperties.styleId = attrs.styleId;
        }
        break;
      case 'textStyle':
        if (attrs.styleId != null) {
          runProperties.styleId = attrs.styleId;
        }
        if (attrs.textTransform != null) {
          runProperties.textTransform = attrs.textTransform;
        }
        if (attrs.color != null) {
          runProperties.color = { val: String(attrs.color).replace('#', '') };
        }
        if (attrs.fontSize != null) {
          const points = Number.parseFloat(String(attrs.fontSize));
          if (!Number.isNaN(points)) {
            runProperties.fontSize = points * 2;
          }
        }
        if (attrs.letterSpacing != null) {
          const ptValue = Number.parseFloat(String(attrs.letterSpacing));
          if (!Number.isNaN(ptValue)) {
            runProperties.letterSpacing = ptValue * 20;
          }
        }
        if (attrs.fontFamily != null) {
          const cleanValue = String(attrs.fontFamily).split(',')[0].trim();
          runProperties.fontFamily = {
            ascii: cleanValue,
            eastAsia: cleanValue,
            hAnsi: cleanValue,
            cs: cleanValue,
          };
        }
        if (attrs.vertAlign != null) {
          runProperties.vertAlign = attrs.vertAlign;
        }
        if (attrs.position != null) {
          const numeric = Number.parseFloat(String(attrs.position));
          if (!Number.isNaN(numeric)) {
            runProperties.position = numeric * 2;
          }
        }
        break;
    }
  }

  return runProperties;
}

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
 * The NodeTranslator instance for the <w:tab> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
