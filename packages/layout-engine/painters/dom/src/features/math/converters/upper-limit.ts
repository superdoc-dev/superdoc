import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:limUpp (upper limit) to MathML <mover>.
 *
 * OMML structure:
 *   m:limUpp → m:limUppPr (optional), m:e (base), m:lim (limit expression placed above)
 *
 * MathML output:
 *   <mover> <mrow>base</mrow> <mrow>lim</mrow> </mover>
 *
 * @spec ECMA-376 §22.1.2.56
 */
export const convertUpperLimit: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');
  const lim = elements.find((e) => e.name === 'm:lim');

  const mover = doc.createElementNS(MATHML_NS, 'mover');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  mover.appendChild(baseRow);

  const limRow = doc.createElementNS(MATHML_NS, 'mrow');
  limRow.appendChild(convertChildren(lim?.elements ?? []));
  mover.appendChild(limRow);

  return mover;
};
