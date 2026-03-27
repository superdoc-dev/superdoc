import { normalizeLvlTextChar } from '@superdoc/common/list-numbering';
import { ensureNumberingCache, LEVELS_MAP_KEY } from './numberingCache.js';

const getNumIdFromTag = (tag) => {
  return tag?.elements?.find((el) => el.name === 'w:numId')?.attributes['w:val'];
};

/**
 * Get the style tag from the style ID
 *
 * @param {string} styleId The style ID to search for
 * @param {Object} docx The docx data
 * @returns {Object} The style tag
 */
export function getStyleTagFromStyleId(styleId, docx) {
  const styles = docx['word/styles.xml'];
  if (!styles) return {};

  const styleEls = styles.elements;
  const wStyles = styleEls.find((el) => el.name === 'w:styles');
  const styleTags = wStyles.elements.filter((style) => style.name === 'w:style');
  const styleDef = styleTags.find((tag) => tag.attributes['w:styleId'] === styleId);
  return styleDef;
}

const getListNumIdFromStyleRef = (styleId, docx) => {
  const styles = docx['word/styles.xml'];
  if (!styles) return null;

  const { elements } = styles;
  const styleTags = elements[0].elements.filter((style) => style.name === 'w:style');
  const style = styleTags.find((tag) => tag.attributes['w:styleId'] === styleId) || {};
  const pPr = style?.elements?.find((style) => style.name === 'w:pPr');
  if (!pPr) return null;

  let numPr = pPr?.elements?.find((style) => style.name === 'w:numPr');
  if (!numPr) return null;

  let numIdTag = numPr?.elements?.find((style) => style.name === 'w:numId') || {};
  let numId = getNumIdFromTag(numPr);
  let ilvlTag = numPr?.elements?.find((style) => style.name === 'w:ilvl');
  let ilvl = ilvlTag?.attributes?.['w:val'];

  const basedOnTag = style?.elements?.find((style) => style.name === 'w:basedOn');
  const basedOnId = basedOnTag?.attributes?.['w:val'];

  // If we don't have a numId, then we need to check the basedOn style
  // Which can in turn be based on some other style and so on.
  let loopCount = 0;
  while (numPr && !numId && loopCount < 10) {
    const basedOnStyle = styleTags.find((tag) => tag.attributes['w:styleId'] === basedOnId) || {};
    const basedOnPPr = basedOnStyle?.elements?.find((style) => style.name === 'w:pPr');
    numPr = basedOnPPr?.elements?.find((style) => style.name === 'w:numPr');
    numIdTag = numPr?.elements?.find((style) => style.name === 'w:numId') || {};
    numId = numIdTag?.attributes?.['w:val'];

    if (!ilvlTag) {
      ilvlTag = numPr?.elements?.find((style) => style.name === 'w:ilvl');
      ilvl = ilvlTag?.attributes?.['w:val'];
    }

    loopCount++;
  }

  return { numId, ilvl };
};

export const getAbstractDefinition = (numId, docx, converter) => {
  const numberingXml = docx['word/numbering.xml'];
  if (!numberingXml) return {};
  if (numId == null) return undefined;

  const cache = ensureNumberingCache(docx, converter);

  const numKey = String(numId);
  let listDefinitionForThisNumId = cache.numToDefinition.get(numKey);

  if (!listDefinitionForThisNumId) {
    const abstractNumId = cache.numToAbstractId.get(numKey);
    if (abstractNumId) {
      listDefinitionForThisNumId = cache.abstractById.get(abstractNumId);
      if (listDefinitionForThisNumId) {
        cache.numToDefinition.set(numKey, listDefinitionForThisNumId);
      }
    }
  }

  /**
   * Only fall back to a template-based abstractNum if the direct definition
   * is missing or has no level definitions (w:lvl). This avoids incorrectly
   * picking the first matching template (e.g., abstractNumId=0) and
   * preserves the concrete mapping from w:num -> w:abstractNumId.
   */
  const levelMap = listDefinitionForThisNumId ? listDefinitionForThisNumId[LEVELS_MAP_KEY] : null;
  const hasLevels = levelMap && levelMap.size > 0;
  if (!listDefinitionForThisNumId || !hasLevels) {
    const templateIdTag = listDefinitionForThisNumId?.elements?.find((el) => el.name === 'w:tmpl');
    const templateId = templateIdTag?.attributes?.['w:val'];
    if (templateId) {
      const byTemplate = cache.templateById.get(String(templateId));
      if (byTemplate) listDefinitionForThisNumId = byTemplate;
    }
  }

  return listDefinitionForThisNumId;
};

export const generateListPath = (level, numId, styleId, levels, docx) => {
  const iLvl = Number(level);
  const path = [];
  if (iLvl > 0) {
    for (let i = iLvl; i >= 0; i--) {
      const { start: lvlStart } = getListLevelDefinitionTag(numId, i, styleId, docx);
      if (!levels[i]) levels[i] = Number(lvlStart) || 1;
      path.unshift(levels[i]);
    }
  }
  return path;
};

/**
 * Helper to get the list level definition tag for a specific list level
 * @param {string} numId The numId of the list
 * @param {string} level The level of the list
 * @param {Object} docx The docx data
 * @returns {Object} The list level definition tag start, numFmt, lvlText and lvlJc
 */
export const getListLevelDefinitionTag = (numId, level, pStyleId, docx) => {
  if (pStyleId) {
    const { numId: numIdFromStyles, ilvl: iLvlFromStyles } = getListNumIdFromStyleRef(pStyleId, docx) || {};
    if (!numId && numIdFromStyles) numId = numIdFromStyles;
    if (!level && iLvlFromStyles) level = iLvlFromStyles ? parseInt(iLvlFromStyles) : null;
  }

  const listDefinitionForThisNumId = getAbstractDefinition(numId, docx);
  const currentLevel = getDefinitionForLevel(listDefinitionForThisNumId, level);

  const numStyleLink = listDefinitionForThisNumId?.elements?.find((style) => style.name === 'w:numStyleLink');
  const numStyleLinkId = numStyleLink?.attributes['w:val'];
  if (numStyleLinkId) {
    const current = getListNumIdFromStyleRef(numStyleLinkId, docx);
    return getListLevelDefinitionTag(current.numId, level, null, docx);
  }

  const start = currentLevel?.elements?.find((style) => style.name === 'w:start')?.attributes['w:val'];
  let numFmtTag = currentLevel?.elements?.find((style) => style.name === 'w:numFmt');
  let numFmt = numFmtTag?.attributes['w:val'];

  if (!numFmt) {
    const altChoice = currentLevel?.elements.find((style) => style.name === 'mc:AlternateContent');
    const choice = altChoice?.elements.find((style) => style.name === 'mc:Choice');
    const choiceNumFmtTag = choice?.elements.find((style) => style.name === 'w:numFmt');
    const choiceNumFmt = choiceNumFmtTag?.attributes['w:val'];
    if (choiceNumFmt) {
      numFmtTag = choiceNumFmtTag;
      numFmt = choiceNumFmt;
    }
  }

  let lvlText = currentLevel?.elements?.find((style) => style.name === 'w:lvlText').attributes['w:val'];
  lvlText = normalizeLvlTextChar(lvlText);

  let customFormat;
  if (numFmt === 'custom') customFormat = numFmtTag?.attributes?.['w:format'];

  const lvlJc = currentLevel?.elements?.find((style) => style.name === 'w:lvlJc').attributes['w:val'];
  const pPr = currentLevel?.elements?.find((style) => style.name === 'w:pPr');
  const rPr = currentLevel?.elements?.find((style) => style.name === 'w:rPr');
  return { start, numFmt, lvlText, lvlJc, pPr, rPr, customFormat };
};

export function getDefinitionForLevel(data, level) {
  if (!data) return undefined;
  const parsedLevel = Number(level);
  if (Number.isNaN(parsedLevel)) return undefined;

  const cachedLevels = data[LEVELS_MAP_KEY];
  if (cachedLevels?.has(parsedLevel)) {
    return cachedLevels.get(parsedLevel);
  }

  return data?.elements?.find((item) => Number(item.attributes?.['w:ilvl']) === parsedLevel);
}

export const docxNumberingHelpers = {
  generateListPath,
  normalizeLvlTextChar,
};

export { normalizeLvlTextChar };
