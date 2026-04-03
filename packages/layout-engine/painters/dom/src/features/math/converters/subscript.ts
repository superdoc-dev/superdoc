import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:sSub (subscript) to MathML <msub>.
 *
 * OMML structure:
 *   m:sSub → m:sSubPr (optional), m:e (base), m:sub (subscript)
 *
 * MathML output:
 *   <msub> <mrow>base</mrow> <mrow>sub</mrow> </msub>
 *
 * @spec ECMA-376 §22.1.2.101
 */
export const convertSubscript: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');
  const sub = elements.find((e) => e.name === 'm:sub');

  const msub = doc.createElementNS(MATHML_NS, 'msub');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  msub.appendChild(baseRow);

  const subRow = doc.createElementNS(MATHML_NS, 'mrow');
  subRow.appendChild(convertChildren(sub?.elements ?? []));
  msub.appendChild(subRow);

  return msub;
};
