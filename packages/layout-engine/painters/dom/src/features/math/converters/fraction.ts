import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:f (fraction) to MathML <mfrac>.
 *
 * OMML structure:
 *   m:f → m:fPr (optional: type), m:num (numerator), m:den (denominator)
 *
 * MathML output:
 *   <mfrac> <mrow>num</mrow> <mrow>den</mrow> </mfrac>
 *
 * @spec ECMA-376 §22.1.2.36
 */
export const convertFraction: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const num = elements.find((e) => e.name === 'm:num');
  const den = elements.find((e) => e.name === 'm:den');

  const frac = doc.createElementNS(MATHML_NS, 'mfrac');

  const numRow = doc.createElementNS(MATHML_NS, 'mrow');
  numRow.appendChild(convertChildren(num?.elements ?? []));
  frac.appendChild(numRow);

  const denRow = doc.createElementNS(MATHML_NS, 'mrow');
  denRow.appendChild(convertChildren(den?.elements ?? []));
  frac.appendChild(denRow);

  return frac;
};
