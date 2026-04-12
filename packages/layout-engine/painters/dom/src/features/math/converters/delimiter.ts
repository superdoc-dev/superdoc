import type { MathObjectConverter, OmmlJsonNode } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

const DEFAULT_BEGIN_DELIMITER = '(';
const DEFAULT_END_DELIMITER = ')';
const DEFAULT_SEPARATOR_DELIMITER = '\u2502'; // ECMA-376 22.1.2.95: BOX DRAWINGS LIGHT VERTICAL

function getDelimiterValue(properties: OmmlJsonNode | undefined, name: string, fallback: string): string {
  const property = properties?.elements?.find((element) => element.name === name);
  if (!property) return fallback;
  return property.attributes?.['m:val'] ?? '';
}

/**
 * Convert m:d (delimiter) to MathML.
 *
 * OMML structure:
 *   m:d → m:dPr (optional: begChr, endChr, sepChr) + one or more m:e expressions
 *
 * MathML output:
 *   <mrow><mo>(</mo> ...content... <mo>)</mo></mrow>
 *
 * @spec ECMA-376 §22.1.2.24
 */
export const convertDelimiter: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const delimiterProps = elements.find((element) => element.name === 'm:dPr');
  const expressions = elements.filter((element) => element.name === 'm:e');

  const beginDelimiter = getDelimiterValue(delimiterProps, 'm:begChr', DEFAULT_BEGIN_DELIMITER);
  const endDelimiter = getDelimiterValue(delimiterProps, 'm:endChr', DEFAULT_END_DELIMITER);
  const separatorDelimiter = getDelimiterValue(delimiterProps, 'm:sepChr', DEFAULT_SEPARATOR_DELIMITER);

  const wrapper = doc.createElementNS(MATHML_NS, 'mrow');

  const begin = doc.createElementNS(MATHML_NS, 'mo');
  begin.textContent = beginDelimiter;
  wrapper.appendChild(begin);

  let renderedCount = 0;
  for (const expression of expressions) {
    const fragment = convertChildren(expression?.elements ?? []);
    if (fragment.childNodes.length === 0) continue;

    if (renderedCount > 0) {
      const separator = doc.createElementNS(MATHML_NS, 'mo');
      separator.textContent = separatorDelimiter;
      wrapper.appendChild(separator);
    }

    const group = doc.createElementNS(MATHML_NS, 'mrow');
    group.appendChild(fragment);
    wrapper.appendChild(group);
    renderedCount++;
  }

  const end = doc.createElementNS(MATHML_NS, 'mo');
  end.textContent = endDelimiter;
  wrapper.appendChild(end);

  return wrapper;
};
