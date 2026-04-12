import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:limUpp (upper limit) to MathML <mover>.
 *
 * OMML structure:
 *   m:limUpp → m:e (base), m:lim (limit)
 *
 * MathML output:
 *   <mover>
 *     <mrow>base</mrow>
 *     <mrow>limit</mrow>
 *   </mover>
 *
 * @spec ECMA-376 §22.1.2.56
 */
export const convertUpperLimit: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];

  const base = elements.find((e) => e.name === 'm:e');
  const limit = elements.find((e) => e.name === 'm:lim');

  const mover = doc.createElementNS(MATHML_NS, 'mover');

  // MathML <mover>: first child is base, second is overscript
  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  mover.appendChild(baseRow);

  const limitRow = doc.createElementNS(MATHML_NS, 'mrow');
  limitRow.appendChild(convertChildren(limit?.elements ?? []));
  mover.appendChild(limitRow);

  return mover;
};
