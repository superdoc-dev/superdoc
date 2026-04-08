import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:eqArr (equation array) to MathML <mtable>.
 *
 * OMML structure:
 *   m:eqArr → m:eqArrPr (optional), m:e* (one element per row)
 *
 * MathML output:
 *   <mtable columnalign="left">
 *     <mtr> <mtd> <mrow>row-content</mrow> </mtd> </mtr>
 *     ...
 *   </mtable>
 *
 * Unlike m:m (matrix), equation arrays have one cell per row and are
 * typically left-aligned. Used for systems of equations.
 *
 * @spec ECMA-376 §22.1.2.34
 */
export const convertEquationArray: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const rows = elements.filter((e) => e.name === 'm:e');

  const mtable = doc.createElementNS(MATHML_NS, 'mtable');
  mtable.setAttribute('columnalign', 'left');

  for (const row of rows) {
    const mtr = doc.createElementNS(MATHML_NS, 'mtr');
    const mtd = doc.createElementNS(MATHML_NS, 'mtd');
    mtd.appendChild(convertChildren(row.elements ?? []));
    mtr.appendChild(mtd);
    mtable.appendChild(mtr);
  }

  return mtable.childNodes.length > 0 ? mtable : null;
};
