import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:sPre (pre-sub-superscript) to MathML <mmultiscripts>.
 *
 * OMML structure:
 *   m:sPre → m:sPrePr (optional), m:sub (subscript), m:sup (superscript), m:e (base)
 *
 * Note: element order differs from m:sSubSup — in m:sPre the base (m:e) is the
 * LAST child, not the first. The converter uses tag-based lookup (not position)
 * so any order is accepted.
 *
 * MathML output:
 *   <mmultiscripts>
 *     <mrow>base</mrow>
 *     <mprescripts/>
 *     <mrow>sub</mrow>
 *     <mrow>sup</mrow>
 *   </mmultiscripts>
 *
 * The <mprescripts/> separator tells MathML that the scripts that follow
 * are placed to the left of the base rather than to the right.
 *
 * @spec ECMA-376 §22.1.2.99
 */
export const convertPreSubSuperscript: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');
  const sub = elements.find((e) => e.name === 'm:sub');
  const sup = elements.find((e) => e.name === 'm:sup');

  const mmultiscripts = doc.createElementNS(MATHML_NS, 'mmultiscripts');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  mmultiscripts.appendChild(baseRow);

  mmultiscripts.appendChild(doc.createElementNS(MATHML_NS, 'mprescripts'));

  const subRow = doc.createElementNS(MATHML_NS, 'mrow');
  subRow.appendChild(convertChildren(sub?.elements ?? []));
  mmultiscripts.appendChild(subRow);

  const supRow = doc.createElementNS(MATHML_NS, 'mrow');
  supRow.appendChild(convertChildren(sup?.elements ?? []));
  mmultiscripts.appendChild(supRow);

  return mmultiscripts;
};
