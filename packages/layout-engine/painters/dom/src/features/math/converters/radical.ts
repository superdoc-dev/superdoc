import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:rad (radical) to MathML <msqrt> or <mroot>.
 *
 * OMML structure:
 *   m:rad → m:radPr (optional: m:degHide), m:deg (degree), m:e (radicand)
 *
 * MathML output:
 *   <msqrt> radicand </msqrt>              (when degree is hidden)
 *   <mroot> radicand  degree </mroot>      (when degree is shown)
 *
 * @spec ECMA-376 §22.1.2.86
 */
export const convertRadical: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const radPr = elements.find((e) => e.name === 'm:radPr');
  const deg = elements.find((e) => e.name === 'm:deg');
  const base = elements.find((e) => e.name === 'm:e');

  const degHide = radPr?.elements?.find((e) => e.name === 'm:degHide');
  const isHidden =
    degHide?.attributes?.['m:val'] === '1' ||
    degHide?.attributes?.['m:val'] === 'on' ||
    (degHide && !degHide.attributes);

  if (isHidden || !deg) {
    const msqrt = doc.createElementNS(MATHML_NS, 'msqrt');
    msqrt.appendChild(convertChildren(base?.elements ?? []));
    return msqrt;
  }

  const mroot = doc.createElementNS(MATHML_NS, 'mroot');
  mroot.appendChild(convertChildren(base?.elements ?? []));
  mroot.appendChild(convertChildren(deg.elements ?? []));
  return mroot;
};
