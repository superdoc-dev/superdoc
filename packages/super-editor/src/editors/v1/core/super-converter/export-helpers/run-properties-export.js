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

  // Chain is derived → base (walk from current to basedOn). Reverse so we merge base first, then derived (derived overrides base).
  const byName = {};
  chain.reverse().forEach((rPr) => {
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
