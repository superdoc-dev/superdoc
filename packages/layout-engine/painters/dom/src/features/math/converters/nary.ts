import type { MathObjectConverter, OmmlJsonNode } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Default n-ary operator character when m:chr is absent: integral sign (∫, U+222B). */
const DEFAULT_NARY_CHAR = '\u222B';

/**
 * Integral-like operators (∫∬∭∮∯∰∱∲∳), which default to side-limits (subSup).
 * Non-integrals (∑, ∏, ⋃, ...) default to under/over limits (undOvr) in display mode.
 */
const INTEGRAL_CHARS = /^[\u222B-\u2233]$/;

/**
 * Convert m:nary (n-ary operator) to MathML.
 *
 * OMML structure:
 *   m:nary → m:naryPr (optional: m:chr@m:val, m:limLoc@m:val, m:subHide, m:supHide),
 *            m:sub (lower limit, optional), m:sup (upper limit, optional), m:e (body)
 *
 * MathML shape depends on which limits are shown and the limit location:
 *
 *   Both limits, subSup (default for integrals):
 *     <mrow><msubsup><mo>∫</mo><mrow>sub</mrow><mrow>sup</mrow></msubsup><mrow>body</mrow></mrow>
 *   Both limits, undOvr (default for ∑, ∏, ⋃, ...):
 *     <mrow><munderover><mo>∑</mo><mrow>sub</mrow><mrow>sup</mrow></munderover><mrow>body</mrow></mrow>
 *
 *   Only sub:      <msub>   / <munder>  + <mo> + <mrow>sub</mrow>
 *   Only sup:      <msup>   / <mover>   + <mo> + <mrow>sup</mrow>
 *   Neither:       bare <mo> inside the outer <mrow>
 *
 * @spec ECMA-376 §22.1.2.70 (m:nary), §22.1.2.72 (m:naryPr),
 *       §22.1.2.53 (m:limLoc), §22.1.2.20 (m:chr), §22.9.2.7 (ST_OnOff)
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
  const grow = naryPr?.elements?.find((e) => e.name === 'm:grow');

  // §22.1.2.20 m:chr defaults:
  //   element absent       → U+222B (integral)
  //   element present      → m:val (empty string if val attribute absent)
  const opChar = chr === undefined ? DEFAULT_NARY_CHAR : (chr.attributes?.['m:val'] ?? '');

  // §22.1.2.53 m:limLoc defaults:
  //   element absent                  → operator-character heuristic (integrals → subSup, others → undOvr)
  //   element present, m:val absent   → undOvr
  //   element present with m:val      → use m:val
  const limLocVal = limLoc?.attributes?.['m:val'];
  const isUndOvr =
    limLocVal === 'undOvr' ||
    (limLoc !== undefined && limLocVal === undefined) ||
    (limLoc === undefined && opChar !== '' && !INTEGRAL_CHARS.test(opChar));

  /** ST_OnOff true values per §22.9.2.7: '1', 'true', or bare-element (no attributes). */
  const isStOnOffTrue = (el?: OmmlJsonNode) =>
    el !== undefined &&
    (el.attributes?.['m:val'] === '1' ||
      el.attributes?.['m:val'] === 'on' ||
      el.attributes?.['m:val'] === 'true' ||
      !el.attributes);

  const subHidden = isStOnOffTrue(subHide);
  const supHidden = isStOnOffTrue(supHide);

  // Strip m:ctrlPr (formatting hint only) to get each limit's meaningful children.
  const stripCtrl = (el?: OmmlJsonNode) => (el?.elements ?? []).filter((e) => e.name !== 'm:ctrlPr');
  const subChildren = stripCtrl(sub);
  const supChildren = stripCtrl(sup);

  // Word's behavior for subHide/supHide (§22.1.2.72):
  //   - Empty limit + hide flag ON → suppress the placeholder slot.
  //   - Non-empty limit + hide flag ON → promote the content into the opposite
  //     slot (sub → prepended to sup, sup → appended to sub). Word does this so
  //     author-entered content is never silently dropped.
  const promotedToSup = subHidden && !supHidden ? subChildren : [];
  const promotedToSub = supHidden && !subHidden ? supChildren : [];
  const renderSubChildren = subHidden ? [] : [...subChildren, ...promotedToSub];
  const renderSupChildren = supHidden ? [] : [...promotedToSup, ...supChildren];

  // A slot is rendered if it has content OR if the element is present for an
  // empty placeholder (§22.1.2.70 says sub/sup are optional — absent means no slot).
  const hasSub = renderSubChildren.length > 0 || (sub !== undefined && !subHidden);
  const hasSup = renderSupChildren.length > 0 || (sup !== undefined && !supHidden);

  // §22.1.2.72 m:grow: default is ON (operator grows with operand). When explicitly OFF,
  // suppress enlargement by setting largeop="false" — MathML's operator dictionary otherwise
  // applies largeop/stretchy automatically for standard n-ary glyphs.
  const growOff = grow !== undefined && !isStOnOffTrue(grow);

  const mo = doc.createElementNS(MATHML_NS, 'mo');
  mo.textContent = opChar;
  if (growOff) {
    mo.setAttribute('largeop', 'false');
    mo.setAttribute('stretchy', 'false');
  }

  let operatorEl: Element;

  if (hasSub && hasSup) {
    const tag = isUndOvr ? 'munderover' : 'msubsup';
    operatorEl = doc.createElementNS(MATHML_NS, tag);
    operatorEl.appendChild(mo);

    const subRow = doc.createElementNS(MATHML_NS, 'mrow');
    subRow.appendChild(convertChildren(renderSubChildren));
    operatorEl.appendChild(subRow);

    const supRow = doc.createElementNS(MATHML_NS, 'mrow');
    supRow.appendChild(convertChildren(renderSupChildren));
    operatorEl.appendChild(supRow);
  } else if (hasSub) {
    const tag = isUndOvr ? 'munder' : 'msub';
    operatorEl = doc.createElementNS(MATHML_NS, tag);
    operatorEl.appendChild(mo);

    const subRow = doc.createElementNS(MATHML_NS, 'mrow');
    subRow.appendChild(convertChildren(renderSubChildren));
    operatorEl.appendChild(subRow);
  } else if (hasSup) {
    const tag = isUndOvr ? 'mover' : 'msup';
    operatorEl = doc.createElementNS(MATHML_NS, tag);
    operatorEl.appendChild(mo);

    const supRow = doc.createElementNS(MATHML_NS, 'mrow');
    supRow.appendChild(convertChildren(renderSupChildren));
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
