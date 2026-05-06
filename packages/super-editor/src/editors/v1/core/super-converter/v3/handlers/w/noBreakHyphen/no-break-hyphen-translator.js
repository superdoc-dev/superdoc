// @ts-check
import { NodeTranslator } from '@translator';
import { translator as wRPrNodeTranslator } from '../rpr/rpr-translator.js';
import { translator as wHyperlinkTranslator } from '../hyperlink/hyperlink-translator.js';
import { translator as wInsTranslator } from '../ins/index.js';
import { translator as wDelTranslator } from '../del/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:noBreakHyphen';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'noBreakHyphen';

/**
 * Encode a <w:noBreakHyphen/> element as a SuperDoc noBreakHyphen atom inline node.
 * Identity is preserved by the node type itself; literal U+2011 in <w:t> stays on the
 * regular text path. The two never converge in PM state, so they never converge on export.
 * @param {import('@translator').SCEncoderConfig} _
 * @param {import('@translator').EncodedAttributes} [encodedAttrs] - The already encoded attributes
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (_, encodedAttrs = {}) => {
  const translated = { type: SD_NODE_NAME };
  if (encodedAttrs && Object.keys(encodedAttrs).length > 0) {
    translated.attrs = { ...encodedAttrs };
  }
  return translated;
};

/**
 * Decode a SuperDoc noBreakHyphen node back into <w:r><w:rPr/><w:noBreakHyphen/></w:r>.
 * Mirrors the run-wrapping pattern in tab-translator.js so inherited run-properties
 * (bold, color, etc.) are preserved on export.
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs] - The already decoded attributes
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params, decodedAttrs = {}) {
  const { node } = params || {};
  if (!node) return;

  // Tracked changes: defer to ins/del so the atom exports inside <w:ins> or
  // <w:del>. Without this, a tracked-insert noBreakHyphen would round-trip as
  // plain <w:r><w:noBreakHyphen/></w:r> and the tracking would be silently
  // dropped on save. Mirrors t-translator's hand-off (no `trackingProcessed`
  // guard needed — wInsTranslator/wDelTranslator strip the tracking marks
  // before re-dispatching, so re-entry won't re-fire this branch).
  // Tracked-changes check runs before the link check so a linked + tracked
  // atom composes as <w:ins><w:hyperlink>...</w:hyperlink></w:ins>.
  const trackedMark = node.marks?.find((m) => {
    const t = m?.type?.name ?? m?.type;
    return t === 'trackInsert' || t === 'trackDelete';
  });
  if (trackedMark) {
    const t = trackedMark.type?.name ?? trackedMark.type;
    return (t === 'trackInsert' ? wInsTranslator : wDelTranslator).decode(params);
  }

  // Hyperlinks: defer to wHyperlinkTranslator so the export emits a
  // <w:hyperlink> wrapper and preserves the relationship. Without this, a
  // linked noBreakHyphen (e.g. translateChildNodes groups the atom as the
  // first link-marked child) would round-trip as plain <w:r><w:noBreakHyphen/>
  // </w:r>, dropping the link entirely.
  // The linkProcessed guard avoids re-entering once the hyperlink decoder
  // strips the link mark and re-dispatches us.
  const isLinkNode = node.marks?.some((m) => (m?.type?.name ?? m?.type) === 'link');
  if (isLinkNode && !params.extraParams?.linkProcessed) {
    return wHyperlinkTranslator.decode(params);
  }

  // `elements: []` is required by SCDecoderResult even though <w:noBreakHyphen/>
  // is self-closing — the typedef has no separate "void element" variant.
  const wNoBreakHyphen = { name: 'w:noBreakHyphen', elements: [] };
  if (decodedAttrs && Object.keys(decodedAttrs).length > 0) {
    wNoBreakHyphen.attributes = { ...decodedAttrs };
  }

  if (params.extraParams?.skipRun) {
    return wNoBreakHyphen;
  }

  const translated = {
    name: 'w:r',
    elements: [wNoBreakHyphen],
  };

  // Preserve inherited run properties and mark-derived formatting on exported atom (mirrors w:tab).
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
 * Lightweight mark -> runProperties mapper for noBreakHyphen-node export.
 * Mirrors the subset used by tab-translator.js — duplicated to avoid the same
 * module cycle the tab translator notes (importing exporter.js during converter bootstrap).
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
  attributes: [],
};

/**
 * The NodeTranslator instance for the <w:noBreakHyphen/> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
