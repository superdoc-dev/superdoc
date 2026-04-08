import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Default accent character when none is specified (combining circumflex). */
const DEFAULT_ACCENT_CHAR = '\u0302';

/**
 * Convert m:acc (accent / diacritical mark) to MathML <mover accent="true">.
 *
 * OMML structure:
 *   m:acc → m:accPr (optional: m:chr@m:val), m:e (base expression)
 *
 * MathML output:
 *   <mover accent="true">
 *     <mrow>base</mrow>
 *     <mo>accent-char</mo>
 *   </mover>
 *
 * The accent character defaults to U+0302 (combining circumflex accent, ̂)
 * when m:accPr/m:chr is absent, matching Word's default behavior.
 *
 * @spec ECMA-376 §22.1.2.1
 */
export const convertAccent: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const accPr = elements.find((e) => e.name === 'm:accPr');
  const base = elements.find((e) => e.name === 'm:e');

  const chr = accPr?.elements?.find((e) => e.name === 'm:chr');
  const accentChar = chr?.attributes?.['m:val'] ?? DEFAULT_ACCENT_CHAR;

  const mover = doc.createElementNS(MATHML_NS, 'mover');
  mover.setAttribute('accent', 'true');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  mover.appendChild(baseRow);

  const mo = doc.createElementNS(MATHML_NS, 'mo');
  mo.setAttribute('stretchy', 'true');
  mo.textContent = accentChar;
  mover.appendChild(mo);

  return mover;
};
