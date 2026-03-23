import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { translator as wPPrNodeTranslator } from '../../pPr/pPr-translator.js';

/**
 * Generate the w:pPr props for a paragraph node
 *
 * @param {SchemaNode} node
 * @returns {XmlReadyNode} The paragraph properties node
 */
export function generateParagraphProperties(params) {
  const { node } = params;
  const { attrs = {} } = node;

  const paragraphProperties = carbonCopy(attrs.paragraphProperties || {});

  // Only include w:rPr in pPr when the paragraph had inline rPr on import; filter to inline keys and drop if empty.
  const inlineKeys = paragraphProperties.runPropertiesInlineKeys;
  delete paragraphProperties.runPropertiesInlineKeys;
  // Only strip when we have an explicit empty allow-list. Missing runPropertiesInlineKeys (old collab /
  // legacy nodes) keeps paragraph runProperties so export still matches historical behavior.
  if (Array.isArray(inlineKeys) && inlineKeys.length === 0) {
    delete paragraphProperties.runProperties;
  } else if (Array.isArray(inlineKeys) && paragraphProperties.runProperties) {
    const filtered = Object.fromEntries(
      inlineKeys
        .filter((k) => k in paragraphProperties.runProperties)
        .map((k) => [k, paragraphProperties.runProperties[k]]),
    );
    if (Object.keys(filtered).length > 0) {
      paragraphProperties.runProperties = filtered;
    } else {
      delete paragraphProperties.runProperties;
    }
  }

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
