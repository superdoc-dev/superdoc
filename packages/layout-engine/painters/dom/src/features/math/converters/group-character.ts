import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Default group character: bottom curly bracket (U+23DF). */
const DEFAULT_GROUP_CHAR = '\u23DF';

// Approximate shift used to distinguish non-natural m:vertJc combinations from their
// natural counterparts. Chrome's MathML engine ignores <mpadded voffset>, and overriding
// `display` on <munder>/<mover> breaks their native vertical stacking, so we use
// `position: relative` + `top` instead. The value approximates the group-character
// object's half-height at 1em font size.
const VERT_JC_SHIFT_EM = 1;

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
 * Defaults (ECMA-376 §22.1.2.20, §22.1.2.42, §22.1.2.119):
 *   m:chr absent → U+23DF (bottom curly bracket)
 *   m:chr present without m:val → hidden character
 *   m:pos absent → "bot"
 *   m:vertJc present without m:val → "bot"
 *
 * vertJc handling: m:vertJc specifies which edge of the group-character object aligns
 * with the surrounding baseline. Natural <munder>/<mover> rendering puts the base on
 * the baseline, which matches (pos=bot, vertJc=top) and (pos=top, vertJc=bot). Word
 * renders an absent m:vertJc as the natural layout for the given position, so a shift
 * is only applied when m:vertJc is explicitly set to the non-natural value for the pos.
 *
 * @spec ECMA-376 §22.1.2.41
 */
export const convertGroupCharacter: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const groupChrPr = elements.find((e) => e.name === 'm:groupChrPr');
  const base = elements.find((e) => e.name === 'm:e');

  const chr = groupChrPr?.elements?.find((e) => e.name === 'm:chr');
  const pos = groupChrPr?.elements?.find((e) => e.name === 'm:pos');
  const vertJc = groupChrPr?.elements?.find((e) => e.name === 'm:vertJc');

  const groupChar = chr ? (chr.attributes?.['m:val'] ?? '') : DEFAULT_GROUP_CHAR;
  const position = pos?.attributes?.['m:val'] ?? 'bot';
  const vertJustify = vertJc ? (vertJc.attributes?.['m:val'] ?? 'bot') : null;

  const wrapper = doc.createElementNS(MATHML_NS, position === 'top' ? 'mover' : 'munder');

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base?.elements ?? []));
  wrapper.appendChild(baseRow);

  const mo = doc.createElementNS(MATHML_NS, 'mo');
  mo.setAttribute('stretchy', 'true');
  mo.textContent = groupChar;
  wrapper.appendChild(mo);

  // Natural baseline: pos=top pairs with vertJc=bot, pos=bot pairs with vertJc=top.
  // Only shift when vertJc is explicitly the non-natural value; an absent vertJc
  // renders naturally (matches Word).
  if (vertJustify) {
    wrapper.setAttribute('data-vert-jc', vertJustify);
    const naturalVertJc = position === 'top' ? 'bot' : 'top';
    if (vertJustify !== naturalVertJc) {
      // pos=top,vertJc=top → shift the whole construct DOWN (char top to baseline).
      // pos=bot,vertJc=bot → shift the whole construct UP (char bottom to baseline).
      const direction = position === 'top' ? 1 : -1;
      wrapper.setAttribute('style', `position: relative; top: ${direction * VERT_JC_SHIFT_EM}em;`);
    }
  }

  return wrapper;
};
