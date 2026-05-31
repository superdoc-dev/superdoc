// @ts-check
import { carbonCopy } from '@core/utilities/carbonCopy.js';

/**
 * Wrap already-exported content paragraphs in a block-level complex field.
 *
 * Block fields (BIBLIOGRAPHY, INDEX, TOA) emit their generated result as one or
 * more `<w:p>` paragraphs bracketed by fldChar runs: the begin / instruction /
 * separate runs are spliced into the first paragraph (after its `w:pPr`, if
 * present) and the end run is appended to the last paragraph. This mirrors the
 * inline-field helper `buildComplexFieldRuns` for block content, eliminating the
 * duplicate hand-rolled wrappers that previously lived in the bibliography,
 * index, and tableOfAuthorities decoders.
 *
 * Mutates and returns `contentNodes`.
 *
 * @param {any[]} contentNodes - Exported OOXML paragraph nodes (may be empty).
 * @param {any[]} instructionElements - `w:instrText` / `w:tab` elements for the instruction run.
 * @param {any | null} wrapperParagraphProperties - Optional original wrapper `w:pPr` to restore on the first result paragraph.
 * @returns {any[]} The same array, with the field's fldChar runs inserted.
 */
export function wrapParagraphsAsComplexField(contentNodes, instructionElements, wrapperParagraphProperties = null) {
  const beginElements = [
    { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' }, elements: [] }] },
    { name: 'w:r', elements: instructionElements },
    { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' }, elements: [] }] },
  ];

  if (contentNodes.length > 0) {
    const firstParagraph = contentNodes[0];
    if (wrapperParagraphProperties) {
      const restoredPPr = carbonCopy(wrapperParagraphProperties);
      if (firstParagraph.elements) {
        const pPrIndex = firstParagraph.elements.findIndex((/** @type {any} */ el) => el.name === 'w:pPr');
        if (pPrIndex >= 0) {
          firstParagraph.elements.splice(pPrIndex, 1, restoredPPr);
        } else {
          firstParagraph.elements.unshift(restoredPPr);
        }
      } else {
        firstParagraph.elements = [restoredPPr];
      }
    }
    let insertIndex = 0;
    if (firstParagraph.elements) {
      const pPrIndex = firstParagraph.elements.findIndex((/** @type {any} */ el) => el.name === 'w:pPr');
      insertIndex = pPrIndex >= 0 ? pPrIndex + 1 : 0;
    } else {
      firstParagraph.elements = [];
    }
    firstParagraph.elements.splice(insertIndex, 0, ...beginElements);
  } else {
    contentNodes.push({ name: 'w:p', elements: beginElements });
  }

  const endElements = [
    { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' }, elements: [] }] },
  ];
  const lastParagraph = contentNodes[contentNodes.length - 1];
  if (lastParagraph.elements) {
    lastParagraph.elements.push(...endElements);
  } else {
    lastParagraph.elements = [...endElements];
  }

  return contentNodes;
}
