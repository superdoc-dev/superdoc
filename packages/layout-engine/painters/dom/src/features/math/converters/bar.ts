import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:bar (overbar/underbar) to MathML <mover> or <munder>.
 *
 * OMML structure:
 *   m:bar → m:barPr (optional: m:pos@m:val="top"|"bot"), m:e (base expression)
 *
 * MathML output:
 *   top:           <mover> <mrow>base</mrow> <mo>&#x203E;</mo> </mover>
 *   bot (default): <munder> <mrow>base</mrow> <mo>&#x2015;</mo> </munder>
 *
 * Word renders an underbar when no position is specified, so the default is "bot".
 *
 * @spec ECMA-376 §22.1.2.7
 */
export const convertBar: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];

  const barPr = elements.find((e) => e.name === 'm:barPr');
  const pos = barPr?.elements?.find((e) => e.name === 'm:pos');
  const posVal = pos?.attributes?.['m:val'];
  const isUnder = posVal !== 'top';

  const base = elements.find((e) => e.name === 'm:e');

  const wrapper = doc.createElementNS(MATHML_NS, isUnder ? 'munder' : 'mover');

  const baseContent = convertChildren(base?.elements ?? []);
  const mrow = doc.createElementNS(MATHML_NS, 'mrow');
  mrow.appendChild(baseContent);
  wrapper.appendChild(mrow);

  const accent = doc.createElementNS(MATHML_NS, 'mo');
  accent.setAttribute('stretchy', 'true');
  // U+203E = overline, U+2015 = horizontal bar (underbar)
  accent.textContent = isUnder ? '\u2015' : '\u203E';
  wrapper.appendChild(accent);

  return wrapper;
};
