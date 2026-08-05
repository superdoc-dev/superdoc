import { parseMarks } from '@converter/v2/importer/index.js';
import { twipsToLines, twipsToPixels } from '@converter/helpers.js';
import { kebabCase } from '@superdoc/common';
import { attrValue, childElements, findChild, findChildren } from './xml-node-access.js';

/**
 * First child with the given name across every record sharing a styleId.
 *
 * Applies only to the identity children read below (w:name, w:basedOn,
 * w:qFormat). Paragraph and run properties still come from the first matching
 * record alone; this does not merge duplicate style records.
 *
 * @param {import('./xml-node-access.js').XmlNode[]} records Style elements sharing one w:styleId.
 * @param {string} name Qualified child name, e.g. `w:basedOn`.
 * @returns {import('./xml-node-access.js').XmlNode | undefined}
 */
const findInAnyRecord = (records, name) => records.map((record) => findChild(record, name)).find(Boolean);

/**
 * Gets the default style definition.
 * @param {string} defaultStyleId - The default style ID.
 * @param {Object} docx - The DOCX document.
 * @returns {Object} The default style definition.
 */
export const getDefaultStyleDefinition = (defaultStyleId, docx) => {
  const result = { lineSpaceBefore: null, lineSpaceAfter: null };
  if (!defaultStyleId) return result;

  const styles = docx['word/styles.xml'];
  if (!styles) return result;

  const elementsWithId = childElements(childElements(styles)[0]).filter(
    (el) => attrValue(el, 'w:styleId') === defaultStyleId,
  );

  const firstMatch = elementsWithId[0];
  if (!firstMatch) return result;

  if (!firstMatch.elements) return result;

  const qFormat = findInAnyRecord(elementsWithId, 'w:qFormat');
  const name = attrValue(findInAnyRecord(elementsWithId, 'w:name'), 'w:val');

  // pPr
  const pPr = findChild(firstMatch, 'w:pPr');
  const spacing = findChild(pPr, 'w:spacing');
  const justify = findChild(pPr, 'w:jc');
  const indent = findChild(pPr, 'w:ind');
  const tabs = findChild(pPr, 'w:tabs');

  let lineSpaceBefore, lineSpaceAfter, line;
  if (spacing?.attributes) {
    lineSpaceBefore = twipsToPixels(spacing.attributes['w:before']);
    lineSpaceAfter = twipsToPixels(spacing.attributes['w:after']);
    line = twipsToLines(spacing.attributes['w:line']);
  }

  let textAlign, leftIndent, rightIndent, firstLine;
  if (indent?.attributes) {
    textAlign = justify?.attributes?.['w:val'];
    leftIndent = twipsToPixels(indent.attributes['w:left']);
    rightIndent = twipsToPixels(indent.attributes['w:right']);
    firstLine = twipsToPixels(indent.attributes['w:firstLine']);
  }

  // ECMA-376 marks w:val and w:pos required on w:tab (CT_TabStop). w:pos is
  // ST_SignedTwipsMeasure, a union of xsd:integer and ST_UniversalMeasure (§17.18.81),
  // so it is judged by whether it converts to a finite position rather than by matching
  // the raw string, which would reject legal values like "1.5in". A record that cannot
  // place a stop is dropped rather than emitted half-formed: an empty w:pos otherwise
  // converts to a plausible-looking 0.
  const tabStops = findChildren(tabs, 'w:tab')
    .map((tab) => {
      let val = attrValue(tab, 'w:val');
      if (val == 'left') {
        val = 'start';
      } else if (val == 'right') {
        val = 'end';
      }
      const rawPos = attrValue(tab, 'w:pos')?.trim();
      return {
        val,
        pos: rawPos ? twipsToPixels(rawPos) : undefined,
        leader: attrValue(tab, 'w:leader'),
      };
    })
    .filter((stop) => stop.val != null && Number.isFinite(stop.pos));

  const keepNext = findChild(pPr, 'w:keepNext');
  const keepLines = findChild(pPr, 'w:keepLines');

  // w:val is required on w:outlineLvl and is ST_DecimalNumber (xsd:int). parseInt reads
  // a numeric prefix, so "2abc" and "3.9" would import as levels 2 and 3 and silently
  // reshape headings and the TOC. The whole value must be an integer or there is no
  // level to report.
  const outlineLevel = findChild(pPr, 'w:outlineLvl');
  const outlineLvlRaw = attrValue(outlineLevel, 'w:val')?.trim();
  const outlineLvlValue = /^[+-]?\d+$/.test(outlineLvlRaw ?? '') ? Number(outlineLvlRaw) : NaN;

  const pageBreakBefore = findChild(pPr, 'w:pageBreakBefore');
  let pageBreakBeforeVal = 0;
  if (pageBreakBefore) {
    if (!pageBreakBefore.attributes?.['w:val']) pageBreakBeforeVal = 1;
    else pageBreakBeforeVal = Number(pageBreakBefore?.attributes?.['w:val']);
  }
  const pageBreakAfter = findChild(pPr, 'w:pageBreakAfter');
  let pageBreakAfterVal;
  if (pageBreakAfter) {
    if (!pageBreakAfter.attributes?.['w:val']) pageBreakAfterVal = 1;
    else pageBreakAfterVal = Number(pageBreakAfter?.attributes?.['w:val']);
  }

  const basedOn = attrValue(findInAnyRecord(elementsWithId, 'w:basedOn'), 'w:val');

  const linkToCharacterStyle = attrValue(findChild(firstMatch, 'w:link'), 'w:val') ?? null;

  const parsedAttrs = {
    name,
    qFormat: qFormat ? true : false,
    keepNext: keepNext ? true : false,
    keepLines: keepLines ? true : false,
    outlineLevel: Number.isInteger(outlineLvlValue) ? outlineLvlValue : null,
    pageBreakBefore: pageBreakBeforeVal ? true : false,
    pageBreakAfter: pageBreakAfterVal ? true : false,
    basedOn: basedOn ?? null,
    /** Linked character style id (w:link); used when applying paragraph style to a partial selection */
    link: linkToCharacterStyle,
  };

  // rPr
  const rPr = findChild(firstMatch, 'w:rPr');
  const parsedMarks = parseMarks(rPr, [], docx) || [];
  const parsedStyles = {
    spacing: { lineSpaceAfter, lineSpaceBefore, line },
    textAlign,
    indent: { leftIndent, rightIndent, firstLine },
    tabStops: tabStops.length > 0 ? tabStops : null,
  };

  parsedMarks.forEach((mark) => {
    const { type, attrs } = mark;
    if (type === 'textStyle') {
      Object.entries(attrs).forEach(([key, value]) => {
        parsedStyles[kebabCase(key)] = value;
      });
      return;
    }

    parsedStyles[type] = attrs;
  });

  // pPr marks
  return {
    attrs: parsedAttrs,
    styles: parsedStyles,
  };
};
