import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:rad (radical) to MathML <msqrt> or <mroot>.
 *
 * OMML structure:
 *   m:rad → m:radPr (optional: m:degHide), m:deg (degree), m:e (radicand)
 *
 * MathML output:
 *   - degree hidden → <msqrt><mrow>radicand</mrow></msqrt>
 *   - degree shown  → <mroot><mrow>radicand</mrow><mrow>degree</mrow></mroot>
 *
 * @spec ECMA-376 §22.1.2.88
 */
export const convertRadical: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];

  const radPr = elements.find((e) => e.name === 'm:radPr');
  const deg = elements.find((e) => e.name === 'm:deg');
  const radicand = elements.find((e) => e.name === 'm:e');

  // m:degHide val defaults to false; presence with val="1" or "true" means hidden
  const degHideEl = radPr?.elements?.find((e) => e.name === 'm:degHide');
  const degHideVal = degHideEl?.attributes?.['m:val'];
  const degreeHidden = degHideEl !== undefined && degHideVal !== '0' && degHideVal !== 'false';

  if (degreeHidden || !deg) {
    const msqrt = doc.createElementNS(MATHML_NS, 'msqrt');
    const radicandRow = doc.createElementNS(MATHML_NS, 'mrow');
    radicandRow.appendChild(convertChildren(radicand?.elements ?? []));
    msqrt.appendChild(radicandRow);
    return msqrt;
  }

  const mroot = doc.createElementNS(MATHML_NS, 'mroot');

  const radicandRow = doc.createElementNS(MATHML_NS, 'mrow');
  radicandRow.appendChild(convertChildren(radicand?.elements ?? []));
  mroot.appendChild(radicandRow);

  const degRow = doc.createElementNS(MATHML_NS, 'mrow');
  degRow.appendChild(convertChildren(deg?.elements ?? []));
  mroot.appendChild(degRow);

  return mroot;
};
