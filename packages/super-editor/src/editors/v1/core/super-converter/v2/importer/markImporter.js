import { SuperConverter } from '../../SuperConverter.js';
import { TrackFormatMarkName } from '@extensions/track-changes/constants.js';
import { getHexColorFromDocxSystem, isValidHexColor, twipsToInches, twipsToLines, twipsToPt } from '../../helpers.js';
import { translator as wRPrTranslator } from '../../v3/handlers/w/rpr/index.js';
import { encodeMarksFromRPr } from '@converter/styles.js';

/**
 *
 * @param property
 * @returns {PmMarkJson[]}
 */
export function parseMarks(property, unknownMarks = [], docx = null) {
  const marks = [];
  const seen = new Set();

  property?.elements?.forEach((element) => {
    const marksForType = SuperConverter.markTypes.filter((mark) => mark.name === element.name);
    if (!marksForType.length) {
      const missingMarks = [
        'w:shd',
        'w:rStyle',
        'w:pStyle',
        'w:numPr',
        'w:outlineLvl',
        'w:bdr',
        'w:noProof',
        'w:contextualSpacing',
        'w:keepNext',
        'w:tabs',
        'w:keepLines',
      ];
      if (missingMarks.includes(element.name)) {
        unknownMarks.push(element.name);
      }
    }

    let filteredMarksForType = marksForType;

    /**
     * Now that we have 2 marks named 'spacing' we need to determine if its
     * for line height or letter spacing.
     *
     * If the spacing has a w:val attribute, it's for letter spacing.
     * If the spacing has a w:line, w:lineRule, w:before, w:after attribute, it's for line height.
     */
    if (element.name === 'w:spacing') {
      const attrs = element.attributes || {};
      const hasLetterSpacing = attrs['w:val'];
      filteredMarksForType = marksForType.filter((m) => {
        if (hasLetterSpacing) {
          return m.type === 'letterSpacing';
        }
        return m.type === 'lineHeight';
      });
    }

    filteredMarksForType.forEach((m) => {
      if (!m || seen.has(m.type)) return;
      seen.add(m.type);

      const { attributes = {} } = element;
      const newMark = { type: m.type };

      const exceptionMarks = ['w:b', 'w:caps', 'w:strike', 'w:dstrike'];
      if ((attributes['w:val'] === '0' || attributes['w:val'] === 'none') && !exceptionMarks.includes(m.name)) {
        return;
      }

      // Filter out any underline without valid w:val
      // This is invalid per XML spec (Word will strip this out)
      // Can expand to other nodes if needed
      const requiresValue = ['w:u'];
      if (requiresValue.includes(m.name) && !attributes['w:val']) {
        return;
      }

      // Use the parent mark (ie: textStyle) if present
      if (m.mark) newMark.type = m.mark;

      // Special handling of "w:caps".
      if (m.name === 'w:caps') {
        newMark.attrs = {};
        if (attributes['w:val'] === '0') {
          newMark.attrs[m.property] = 'none';
        } else {
          newMark.attrs[m.property] = 'uppercase';
        }
        marks.push(newMark);
        return;
      }

      // Marks with attrs: we need to get their values
      if (Object.keys(attributes).length) {
        const value = getMarkValue(m.type, attributes, docx);

        // If there is no value for mark it can't be applied
        if (value === null || value === undefined) return;

        newMark.attrs = {};
        newMark.attrs[m.property] = value;
      }

      marks.push(newMark);
    });
  });
  return createImportMarks(marks);
}

export function handleStyleChangeMarksV2(rPrChange, currentMarks, params) {
  if (!rPrChange) {
    return [];
  }

  const attributes = rPrChange.attributes || {};
  const mappedAttributes = {
    id: attributes['w:id'],
    date: attributes['w:date'],
    author: attributes['w:author'],
    authorEmail: attributes['w:authorEmail'],
  };
  let submarks = [];
  const rPr = rPrChange.elements?.find((el) => el.name === 'w:rPr');
  if (rPr) {
    const runProperties = wRPrTranslator.encode({ ...params, nodes: [rPr] }) || {};
    submarks = encodeMarksFromRPr(runProperties, params?.docx);
  }

  return [{ type: TrackFormatMarkName, attrs: { ...mappedAttributes, before: submarks, after: [...currentMarks] } }];
}

/**
 *
 * @param {XmlNode} rPr
 * @param {PmMarkJson[]} currentMarks
 * @returns {PmMarkJson[]} a trackMarksMark, or an empty array
 */
export function handleStyleChangeMarks(rPr, currentMarks) {
  const styleChangeMark = rPr.elements?.find((el) => el.name === 'w:rPrChange');
  if (!styleChangeMark) {
    return [];
  }

  const { attributes } = styleChangeMark;
  const mappedAttributes = {
    id: attributes['w:id'],
    date: attributes['w:date'],
    author: attributes['w:author'],
    authorEmail: attributes['w:authorEmail'],
  };
  const submarks = parseMarks(styleChangeMark);
  return [{ type: TrackFormatMarkName, attrs: { ...mappedAttributes, before: submarks, after: [...currentMarks] } }];
}

/**
 *
 * @param {PmMarkJson[]} marks
 * @returns {PmMarkJson[]}
 */
export function createImportMarks(marks) {
  const textStyleMarksToCombine = marks.filter((mark) => mark.type === 'textStyle');
  const remainingMarks = marks.filter((mark) => mark.type !== 'textStyle');

  // Combine text style marks
  const combinedTextAttrs = {};
  if (textStyleMarksToCombine.length) {
    textStyleMarksToCombine.forEach((mark) => {
      const { attrs = {} } = mark;

      Object.keys(attrs).forEach((attr) => {
        combinedTextAttrs[attr] = attrs[attr];
      });
    });
  }

  const result = [...remainingMarks, { type: 'textStyle', attrs: combinedTextAttrs }];
  return result;
}

/**
 *
 * @param {string} markType
 * @param attributes
 * @returns {*}
 */
export function getMarkValue(markType, attributes, docx) {
  if (markType === 'tabs') markType = 'textIndent';

  const markValueMapper = {
    color: () => `#${attributes['w:val']}`,
    fontSize: () => `${attributes['w:val'] / 2}pt`,
    textIndent: () => getIndentValue(attributes),
    fontFamily: () => getFontFamilyValue(attributes, docx),
    lineHeight: () => getLineHeightValue(attributes),
    letterSpacing: () => `${twipsToPt(attributes['w:val'])}pt`,
    textAlign: () => attributes['w:val'],
    link: () => attributes['href'],
    underline: () => attributes['w:val'],
    bold: () => attributes?.['w:val'] || null,
    italic: () => attributes?.['w:val'] || null,
    highlight: () => getHighLightValue(attributes),
    strike: () => getStrikeValue(attributes),
  };

  if (!(markType in markValueMapper)) {
    // console.debug('❗️❗️ No value mapper for:', markType, 'Attributes:', attributes);
  }

  // Returned the mapped mark value
  if (markType in markValueMapper) {
    return markValueMapper[markType]();
  }
}

export function getFontFamilyValue(attributes, docx) {
  const ascii = attributes['w:ascii'] ?? attributes['ascii'];
  const themeAscii = attributes['w:asciiTheme'] ?? attributes['asciiTheme'];

  let resolved = ascii;

  if (docx && themeAscii) {
    const theme = docx['word/theme/theme1.xml'];
    if (theme?.elements?.length) {
      const { elements: topElements } = theme;
      const { elements } = topElements[0] || {};
      const themeElements = elements?.find((el) => el.name === 'a:themeElements');
      const fontScheme = themeElements?.elements?.find((el) => el.name === 'a:fontScheme');
      const prefix = themeAscii.startsWith('minor') ? 'minor' : 'major';
      const font = fontScheme?.elements?.find((el) => el.name === `a:${prefix}Font`);
      const latin = font?.elements?.find((el) => el.name === 'a:latin');
      resolved = latin?.attributes?.typeface || resolved;
    }
  }

  if (!resolved) return null;

  return SuperConverter.toCssFontFamily(resolved, docx);
}

export function getIndentValue(attributes) {
  let value = attributes['w:left'];
  if (!value) return null;
  return `${twipsToInches(value)}in`;
}

export function getLineHeightValue(attributes) {
  const value = attributes['w:line'];
  const lineRule = attributes['w:lineRule'];

  // TODO: Figure out handling of additional line height attributes from docx
  // if (!value) value = attributes['w:lineRule'];
  // if (!value) value = attributes['w:after'];
  // if (!value) value = attributes['w:before'];
  if (!value || value === '0') return null;

  if (lineRule === 'exact') return `${twipsToPt(value)}pt`;
  return `${twipsToLines(value)}`;
}

export function getHighLightValue(attributes) {
  const fill = attributes['w:fill'];
  if (fill && fill !== 'auto') return `#${fill}`;
  if (isValidHexColor(attributes?.['w:val'])) return `#${attributes['w:val']}`;
  return getHexColorFromDocxSystem(attributes?.['w:val']) || null;
}

export function getStrikeValue(attributes) {
  const raw = attributes?.['w:val'];
  if (raw === undefined || raw === null) return '1'; // presence implies on
  const value = String(raw).trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'on') return '1';
  if (value === '0' || value === 'false' || value === 'off') return '0';
  return '1'; // Default to enabled for any other value
}
