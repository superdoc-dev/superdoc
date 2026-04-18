import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:sSubSup (sub-superscript) to MathML <msubsup>.
 *
 * OMML structure:
 *   m:sSubSup → m:sSubSupPr (optional), m:e (base), m:sub (subscript), m:sup (superscript)
 *
 * MathML output:
 *   <msubsup> <mrow>base</mrow> <mrow>sub</mrow> <mrow>sup</mrow> </msubsup>
 *
 * @spec ECMA-376 §22.1.2.103
 */
export const convertSubSuperscript: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');
  const sub = elements.find((e) => e.name === 'm:sub');
  const sup = elements.find((e) => e.name === 'm:sup');

  const msubsup = doc.createElementNS(MATHML_NS, 'msubsup');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  msubsup.appendChild(baseRow);

  const subRow = doc.createElementNS(MATHML_NS, 'mrow');
  subRow.appendChild(convertChildren(sub?.elements ?? []));
  msubsup.appendChild(subRow);

  const supRow = doc.createElementNS(MATHML_NS, 'mrow');
  supRow.appendChild(convertChildren(sup?.elements ?? []));
  msubsup.appendChild(supRow);

  return msubsup;
};
