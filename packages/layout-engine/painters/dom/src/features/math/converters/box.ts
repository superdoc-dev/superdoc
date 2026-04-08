import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:box (box / invisible grouping container) to MathML <mrow>.
 *
 * OMML structure:
 *   m:box → m:boxPr (optional), m:e (content)
 *
 * MathML output:
 *   <mrow> content </mrow>
 *
 * The box is purely a grouping mechanism with no visual rendering;
 * it maps directly to MathML's <mrow>.
 *
 * @spec ECMA-376 §22.1.2.13
 */
export const convertBox: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');

  const mrow = doc.createElementNS(MATHML_NS, 'mrow');
  mrow.appendChild(convertChildren(base?.elements ?? []));

  return mrow.childNodes.length > 0 ? mrow : null;
};

/**
 * Convert m:borderBox (bordered box) to MathML <menclose>.
 *
 * OMML structure:
 *   m:borderBox → m:borderBoxPr (optional: m:hideTop, m:hideBot, m:hideLeft, m:hideRight,
 *                                  m:strikeBLTR, m:strikeH, m:strikeTLBR, m:strikeV),
 *                 m:e (content)
 *
 * MathML output:
 *   <menclose notation="..."> content </menclose>
 *
 * By default all four borders are shown (notation="box"). Individual borders
 * can be hidden via m:hide* flags, and diagonal/horizontal/vertical strikes
 * can be added via m:strike* flags.
 *
 * @spec ECMA-376 §22.1.2.11
 */
export const convertBorderBox: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const props = elements.find((e) => e.name === 'm:borderBoxPr');
  const base = elements.find((e) => e.name === 'm:e');

  const isOn = (el?: { attributes?: Record<string, string> }) =>
    el && (el.attributes?.['m:val'] === '1' || el.attributes?.['m:val'] === 'on' || !el.attributes);

  const hideTop = props?.elements?.find((e) => e.name === 'm:hideTop');
  const hideBot = props?.elements?.find((e) => e.name === 'm:hideBot');
  const hideLeft = props?.elements?.find((e) => e.name === 'm:hideLeft');
  const hideRight = props?.elements?.find((e) => e.name === 'm:hideRight');
  const strikeBLTR = props?.elements?.find((e) => e.name === 'm:strikeBLTR');
  const strikeH = props?.elements?.find((e) => e.name === 'm:strikeH');
  const strikeTLBR = props?.elements?.find((e) => e.name === 'm:strikeTLBR');
  const strikeV = props?.elements?.find((e) => e.name === 'm:strikeV');

  const notations: string[] = [];

  const allHidden = isOn(hideTop) && isOn(hideBot) && isOn(hideLeft) && isOn(hideRight);

  if (!allHidden) {
    if (!isOn(hideTop) && !isOn(hideBot) && !isOn(hideLeft) && !isOn(hideRight)) {
      notations.push('box');
    } else {
      if (!isOn(hideTop)) notations.push('top');
      if (!isOn(hideBot)) notations.push('bottom');
      if (!isOn(hideLeft)) notations.push('left');
      if (!isOn(hideRight)) notations.push('right');
    }
  }

  if (isOn(strikeBLTR)) notations.push('updiagonalstrike');
  if (isOn(strikeH)) notations.push('horizontalstrike');
  if (isOn(strikeTLBR)) notations.push('downdiagonalstrike');
  if (isOn(strikeV)) notations.push('verticalstrike');

  const menclose = doc.createElementNS(MATHML_NS, 'menclose');
  if (notations.length > 0) {
    menclose.setAttribute('notation', notations.join(' '));
  }

  menclose.appendChild(convertChildren(base?.elements ?? []));

  return menclose;
};
