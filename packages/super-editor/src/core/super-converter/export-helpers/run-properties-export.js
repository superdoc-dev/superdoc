// @ts-check
/**
 * Helpers for exporting w:rPr so we only output overrides relative to paragraph/style
 * (inherited props are already in styles.xml).
 */
import { translator as wRPrTranslator } from '@converter/v3/handlers/w/rpr';

const STYLES_KEY = 'word/styles.xml';

/**
 * Get the merged run properties for a paragraph style from styles.xml (including basedOn chain).
 * @param {Object} docx - Converted XML (e.g. converter.convertedXml)
 * @param {string} styleId - Paragraph style id (e.g. from w:pStyle)
 * @param {import('@translator').SCEncoderConfig} [params] - Params for encoding (docx for theme etc.)
 * @returns {Object} Run properties object from the style, or {} if not found
 */
export function getParagraphStyleRunPropertiesFromStylesXml(docx, styleId, params) {
  const stylesPart = docx?.[STYLES_KEY];
  if (!stylesPart?.elements?.[0]?.elements) return {};

  const styleElements = stylesPart.elements[0].elements.filter((el) => el.name === 'w:style');
  const styleById = new Map(styleElements.map((el) => [el.attributes?.['w:styleId'], el]));

  const chain = [];
  let currentId = styleId;
  const seen = new Set();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const styleTag = styleById.get(currentId);
    if (!styleTag) break;
    const rPr = styleTag.elements?.find((el) => el.name === 'w:rPr');
    if (rPr?.elements?.length) chain.push(rPr);
    const basedOn = styleTag.elements?.find((el) => el.name === 'w:basedOn');
    currentId = basedOn?.attributes?.['w:val'];
  }

  if (chain.length === 0) return {};

  // Merge rPr elements: base first, then derived (later overrides by element name)
  const byName = {};
  chain.forEach((rPr) => {
    (rPr.elements || []).forEach((el) => {
      if (el?.name) byName[el.name] = el;
    });
  });
  const mergedRPr = {
    name: 'w:rPr',
    elements: Object.values(byName),
  };

  const encodeParams = { ...params, docx: params.docx ?? docx, nodes: [mergedRPr] };
  const encoded = wRPrTranslator.encode(encodeParams);
  return encoded ?? {};
}

/**
 * Return only run properties that differ from the style (overrides). Used so we don't
 * write inherited props in w:rPr when they're already in styles.xml.
 * @param {Object} runProperties - Full resolved run properties
 * @param {Object} styleRunProperties - Run properties from the paragraph/style in styles.xml
 * @returns {Object} Run properties to output (overrides only)
 */
export function runPropertiesOverrides(runProperties, styleRunProperties) {
  if (!runProperties || typeof runProperties !== 'object') return {};
  if (!styleRunProperties || Object.keys(styleRunProperties).length === 0) return { ...runProperties };

  const out = {};
  for (const key of Object.keys(runProperties)) {
    const runVal = runProperties[key];
    const styleVal = styleRunProperties[key];
    if (styleVal === undefined || !valueEquals(runVal, styleVal)) {
      out[key] = runVal;
    }
  }
  return out;
}

function valueEquals(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
