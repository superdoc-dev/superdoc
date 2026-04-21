import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Convert m:phant (phantom) to MathML <mphantom> or styled <mpadded>.
 *
 * OMML structure:
 *   m:phant → m:phantPr (optional: m:show, m:zeroWid, m:zeroAsc, m:zeroDesc), m:e (content)
 *
 * MathML output:
 *   Full phantom (default): <mphantom> content </mphantom>
 *   Visible with zeroed dimensions: <mpadded> with width/height/depth="0"
 *
 * A phantom reserves the space its content would occupy but renders invisibly.
 * Property flags can zero-out individual dimensions or force visibility.
 *
 * @spec ECMA-376 §22.1.2.81
 */
export const convertPhantom: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const phantPr = elements.find((e) => e.name === 'm:phantPr');
  const base = elements.find((e) => e.name === 'm:e');

  const show = phantPr?.elements?.find((e) => e.name === 'm:show');
  const zeroWid = phantPr?.elements?.find((e) => e.name === 'm:zeroWid');
  const zeroAsc = phantPr?.elements?.find((e) => e.name === 'm:zeroAsc');
  const zeroDesc = phantPr?.elements?.find((e) => e.name === 'm:zeroDesc');

  /** OOXML ST_OnOff true values. */
  const isOnOffTrue = (val?: string) => val === '1' || val === 'on' || val === 'true';

  // Per ECMA-376 §22.1.2.96: when m:show is omitted, the base is shown.
  const isVisible = show == null || !show.attributes || isOnOffTrue(show.attributes['m:val']);
  const hasZeroDimension = zeroWid || zeroAsc || zeroDesc;

  const content = convertChildren(base?.elements ?? []);

  if (!isVisible && !hasZeroDimension) {
    const mphantom = doc.createElementNS(MATHML_NS, 'mphantom');
    mphantom.appendChild(content);
    return mphantom;
  }

  const mpadded = doc.createElementNS(MATHML_NS, 'mpadded');

  const isZeroVal = (el?: typeof zeroWid) => el && (isOnOffTrue(el.attributes?.['m:val']) || !el.attributes);

  if (isZeroVal(zeroWid)) mpadded.setAttribute('width', '0');
  if (isZeroVal(zeroAsc)) mpadded.setAttribute('height', '0');
  if (isZeroVal(zeroDesc)) mpadded.setAttribute('depth', '0');

  if (!isVisible) {
    const mphantom = doc.createElementNS(MATHML_NS, 'mphantom');
    mphantom.appendChild(content);
    mpadded.appendChild(mphantom);
  } else {
    mpadded.appendChild(content);
  }

  return mpadded;
};
