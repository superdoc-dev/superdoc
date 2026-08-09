import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:sSup (superscript) to MathML <msup>.
 *
 * OMML structure:
 *   m:sSup → m:sSupPr (optional), m:e (base), m:sup (superscript)
 *
 * MathML output:
 *   <msup> <mrow>base</mrow> <mrow>sup</mrow> </msup>
 *
 * @spec ECMA-376 §22.1.2.105
 */
export const convertSuperscript: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');
  const sup = elements.find((e) => e.name === 'm:sup');

  const msup = doc.createElementNS(MATHML_NS, 'msup');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  msup.appendChild(baseRow);

  const supRow = doc.createElementNS(MATHML_NS, 'mrow');
  supRow.appendChild(convertChildren(sup?.elements ?? []));
  msup.appendChild(supRow);

  return msup;
};
