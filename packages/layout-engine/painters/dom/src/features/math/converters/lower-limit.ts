import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:limLow (lower limit) to MathML <munder>.
 *
 * OMML structure:
 *   m:limLow → m:limLowPr (optional), m:e (base, e.g. "lim"), m:lim (limit expression)
 *
 * MathML output:
 *   <munder> <mrow>base</mrow> <mrow>lim</mrow> </munder>
 *
 * @spec ECMA-376 §22.1.2.54
 */
export const convertLowerLimit: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');
  const lim = elements.find((e) => e.name === 'm:lim');

  const munder = doc.createElementNS(MATHML_NS, 'munder');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  munder.appendChild(baseRow);

  const limRow = doc.createElementNS(MATHML_NS, 'mrow');
  limRow.appendChild(convertChildren(lim?.elements ?? []));
  munder.appendChild(limRow);

  return munder;
};
