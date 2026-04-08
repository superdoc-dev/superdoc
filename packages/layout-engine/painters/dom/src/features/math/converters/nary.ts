import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Default n-ary operator character: integral sign (∫, U+222B). */
const DEFAULT_NARY_CHAR = '\u222B';

/**
 * Convert m:nary (n-ary operator) to MathML.
 *
 * OMML structure:
 *   m:nary → m:naryPr (optional: m:chr@m:val, m:limLoc@m:val, m:subHide, m:supHide),
 *            m:sub (lower limit), m:sup (upper limit), m:e (integrand/summand)
 *
 * MathML output depends on limit location:
 *
 *   limLoc="subSup" (default for integrals):
 *     <mrow>
 *       <msubsup> <mo>∫</mo> <mrow>sub</mrow> <mrow>sup</mrow> </msubsup>
 *       <mrow>body</mrow>
 *     </mrow>
 *
 *   limLoc="undOvr" (typical for ∑, ∏):
 *     <mrow>
 *       <munderover> <mo>∑</mo> <mrow>sub</mrow> <mrow>sup</mrow> </munderover>
 *       <mrow>body</mrow>
 *     </mrow>
 *
 * When sub/sup are hidden, falls back to <msub>, <msup>, or bare <mo>.
 *
 * @spec ECMA-376 §22.1.2.70
 */
export const convertNary: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const naryPr = elements.find((e) => e.name === 'm:naryPr');
  const sub = elements.find((e) => e.name === 'm:sub');
  const sup = elements.find((e) => e.name === 'm:sup');
  const body = elements.find((e) => e.name === 'm:e');

  const chr = naryPr?.elements?.find((e) => e.name === 'm:chr');
  const limLoc = naryPr?.elements?.find((e) => e.name === 'm:limLoc');
  const subHide = naryPr?.elements?.find((e) => e.name === 'm:subHide');
  const supHide = naryPr?.elements?.find((e) => e.name === 'm:supHide');

  const opChar = chr?.attributes?.['m:val'] ?? DEFAULT_NARY_CHAR;
  const isUndOvr = limLoc?.attributes?.['m:val'] === 'undOvr';

  /** OOXML ST_OnOff true values: "1", "on", "true", or boolean-flag presence. */
  const isHidden = (el?: typeof subHide) =>
    el &&
    (el.attributes?.['m:val'] === '1' ||
      el.attributes?.['m:val'] === 'on' ||
      el.attributes?.['m:val'] === 'true' ||
      !el.attributes);

  const hasSub = !isHidden(subHide);
  const hasSup = !isHidden(supHide);

  const mo = doc.createElementNS(MATHML_NS, 'mo');
  mo.textContent = opChar;

  let operatorEl: Element;

  if (hasSub && hasSup) {
    const tag = isUndOvr ? 'munderover' : 'msubsup';
    operatorEl = doc.createElementNS(MATHML_NS, tag);
    operatorEl.appendChild(mo);

    const subRow = doc.createElementNS(MATHML_NS, 'mrow');
    subRow.appendChild(convertChildren(sub?.elements ?? []));
    operatorEl.appendChild(subRow);

    const supRow = doc.createElementNS(MATHML_NS, 'mrow');
    supRow.appendChild(convertChildren(sup?.elements ?? []));
    operatorEl.appendChild(supRow);
  } else if (hasSub) {
    const tag = isUndOvr ? 'munder' : 'msub';
    operatorEl = doc.createElementNS(MATHML_NS, tag);
    operatorEl.appendChild(mo);

    const subRow = doc.createElementNS(MATHML_NS, 'mrow');
    subRow.appendChild(convertChildren(sub?.elements ?? []));
    operatorEl.appendChild(subRow);
  } else if (hasSup) {
    const tag = isUndOvr ? 'mover' : 'msup';
    operatorEl = doc.createElementNS(MATHML_NS, tag);
    operatorEl.appendChild(mo);

    const supRow = doc.createElementNS(MATHML_NS, 'mrow');
    supRow.appendChild(convertChildren(sup?.elements ?? []));
    operatorEl.appendChild(supRow);
  } else {
    operatorEl = mo;
  }

  const wrapper = doc.createElementNS(MATHML_NS, 'mrow');
  wrapper.appendChild(operatorEl);

  const bodyRow = doc.createElementNS(MATHML_NS, 'mrow');
  bodyRow.appendChild(convertChildren(body?.elements ?? []));
  if (bodyRow.childNodes.length > 0) {
    wrapper.appendChild(bodyRow);
  }

  return wrapper;
};
