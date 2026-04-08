import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** OOXML ST_OnOff true values: "1", "on", "true", or boolean-flag presence. */
const ST_ON_OFF_TRUE = new Set(['1', 'on', 'true']);

/**
 * Convert m:rad (radical) to MathML <msqrt> or <mroot>.
 *
 * OMML structure:
 *   m:rad → m:radPr (optional: m:degHide), m:deg (degree), m:e (radicand)
 *
 * MathML output:
 *   <msqrt> radicand </msqrt>              (when degree is hidden)
 *   <mroot> <mrow>radicand</mrow> <mrow>degree</mrow> </mroot>
 *
 * <mroot> requires exactly two children (radicand, then index); each operand
 * is wrapped in <mrow> so that compound expressions stay grouped.
 *
 * @spec ECMA-376 §22.1.2.86
 */
export const convertRadical: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const radPr = elements.find((e) => e.name === 'm:radPr');
  const deg = elements.find((e) => e.name === 'm:deg');
  const base = elements.find((e) => e.name === 'm:e');

  const degHide = radPr?.elements?.find((e) => e.name === 'm:degHide');
  const isHidden = ST_ON_OFF_TRUE.has(degHide?.attributes?.['m:val'] ?? '') || (degHide && !degHide.attributes);

  if (isHidden || !deg) {
    const msqrt = doc.createElementNS(MATHML_NS, 'msqrt');
    msqrt.appendChild(convertChildren(base?.elements ?? []));
    return msqrt;
  }

  const mroot = doc.createElementNS(MATHML_NS, 'mroot');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  mroot.appendChild(baseRow);

  const degRow = doc.createElementNS(MATHML_NS, 'mrow');
  degRow.appendChild(convertChildren(deg.elements ?? []));
  mroot.appendChild(degRow);

  return mroot;
};
