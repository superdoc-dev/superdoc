import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { translator as wPPrNodeTranslator } from '../../pPr/pPr-translator.js';

/**
 * Generate the w:pPr props for a paragraph node
 *
 * @param {SchemaNode} node
 * @returns {import('@converter/v2/types').OpenXmlNode} The paragraph properties node
 */
export function generateParagraphProperties(params) {
  const { node } = params;
  const { attrs = {} } = node;

  const paragraphProperties = carbonCopy(attrs.paragraphProperties || {});
  let pPr = wPPrNodeTranslator.decode({ node: { ...node, attrs: { paragraphProperties } } });
  const sectPr = node.attrs?.paragraphProperties?.sectPr;
  if (sectPr) {
    if (!pPr) {
      pPr = {
        type: 'element',
        name: 'w:pPr',
        elements: [],
      };
    }
    pPr.elements.push(sectPr);
  }
  return pPr;
}
