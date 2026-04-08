import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Default group character: bottom curly bracket (U+23DF). */
const DEFAULT_GROUP_CHAR = '\u23DF';

/**
 * Convert m:groupChr (group character) to MathML <munder> or <mover>.
 *
 * OMML structure:
 *   m:groupChr → m:groupChrPr (optional: m:chr@m:val, m:pos@m:val, m:vertJc@m:val), m:e
 *
 * MathML output:
 *   pos="bot" (default): <munder>  <mrow>base</mrow> <mo>char</mo> </munder>
 *   pos="top":           <mover>   <mrow>base</mrow> <mo>char</mo> </mover>
 *
 * The group character defaults to U+23DF (bottom curly bracket) when m:chr is absent.
 * Position defaults to "bot" when m:pos is absent, matching Word's behavior.
 *
 * @spec ECMA-376 §22.1.2.41
 */
export const convertGroupCharacter: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const groupChrPr = elements.find((e) => e.name === 'm:groupChrPr');
  const base = elements.find((e) => e.name === 'm:e');

  const chr = groupChrPr?.elements?.find((e) => e.name === 'm:chr');
  const pos = groupChrPr?.elements?.find((e) => e.name === 'm:pos');

  const groupChar = chr?.attributes?.['m:val'] ?? DEFAULT_GROUP_CHAR;
  const position = pos?.attributes?.['m:val'] ?? 'bot';

  const wrapper = doc.createElementNS(MATHML_NS, position === 'top' ? 'mover' : 'munder');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  wrapper.appendChild(baseRow);

  const mo = doc.createElementNS(MATHML_NS, 'mo');
  mo.setAttribute('stretchy', 'true');
  mo.textContent = groupChar;
  wrapper.appendChild(mo);

  return wrapper;
};
