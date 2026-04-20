import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:box (grouping container) to MathML <mrow>.
 *
 * OMML structure:
 *   m:box → m:boxPr (optional), m:e (content)
 *
 * MathML output:
 *   <mrow> content </mrow>
 *
 * Per §22.1.2.13 / §22.1.2.14, m:box can carry boxPr children that affect
 * layout and spacing — opEmu (operator emulator), noBreak (disallow line
 * breaks), aln (alignment point), diff (differential spacing), argSz. These
 * have no clean MathML equivalent and are currently dropped; the box
 * degrades to a plain <mrow> that preserves grouping but not the other
 * semantics. Extend here when any of these need first-class support.
 *
 * @spec ECMA-376 §22.1.2.13, §22.1.2.14
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

  /**
   * OOXML ST_OnOff (§22.9.2.7): on when the element is present and either
   * `m:val` is absent (spec default = 1) or equals "1" / "true". "on" is
   * accepted for leniency — Annex L.6.1.3 uses that form even though the
   * normative enum is {0, 1, true, false}.
   * TODO: extract to a shared util when m:acc / m:phant / matrix m:tblLook land.
   */
  const isOn = (el?: { attributes?: Record<string, string> }) => {
    if (!el) return false;
    const val = el.attributes?.['m:val'];
    if (val === undefined) return true;
    return val === '1' || val === 'true' || val === 'on';
  };

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

  const content = convertChildren(base?.elements ?? []);

  // Drop empty wrappers — matches convertBox / convertFunction.
  if (content.childNodes.length === 0) return null;

  if (notations.length === 0) {
    const mrow = doc.createElementNS(MATHML_NS, 'mrow');
    mrow.appendChild(content);
    return mrow;
  }

  // Wrap the content in an inner <mrow> before placing it inside <menclose>.
  // MathML Core dropped <menclose>, so Chrome treats it as unknown and does
  // not apply row layout — each child would render as its own `block math`
  // line, stacking vertically. An inner <mrow> is a MathML Core element, so
  // the row layout runs on its children and everything stays inline.
  const innerMrow = doc.createElementNS(MATHML_NS, 'mrow');
  innerMrow.appendChild(content);

  const menclose = doc.createElementNS(MATHML_NS, 'menclose');
  menclose.setAttribute('notation', notations.join(' '));
  menclose.appendChild(innerMrow);

  return menclose;
};
