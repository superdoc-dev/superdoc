import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Default accent character when m:chr is absent (combining circumflex). */
const DEFAULT_ACCENT_CHAR = '\u0302';

/**
 * Maps combining diacritical marks (which Word emits in m:chr) to their
 * non-combining accent equivalents, preferring characters that MathML Core's
 * operator dictionary registers as stretchy accents.
 *
 * Why: combining marks (U+0300–U+036F) placed bare inside <mo> render against
 * a dotted-circle placeholder in some engines. For the common accents we map
 * to ASCII-range characters (`^`, `~`, `¯`, `"`, `` ` ``, `´`) because those
 * are marked stretchy in the MathML Core operator dictionary, so MathML
 * renderers stretch them across wide bases (e.g. a tilde over "x+1"). For
 * accents without an ASCII-range equivalent we fall back to the Unicode
 * spacing modifier letter.
 *
 * Covers the accents Word's equation editor emits; anything outside this table
 * passes through unchanged.
 */
const COMBINING_TO_SPACING: Record<string, string> = {
  '\u0300': '\u0060', // grave → `  (U+0060)
  '\u0301': '\u00B4', // acute → ´ (U+00B4)
  '\u0302': '\u005E', // circumflex / hat → ^ (U+005E, stretchy)
  '\u0303': '\u007E', // tilde → ~ (U+007E, stretchy)
  '\u0304': '\u00AF', // macron → ¯ (U+00AF, stretchy)
  '\u0306': '\u02D8', // breve → ˘
  '\u0307': '\u02D9', // dot above → ˙
  '\u0308': '\u00A8', // diaeresis → ¨
  '\u030A': '\u02DA', // ring above → ˚
  '\u030B': '\u02DD', // double acute → ˝
  '\u030C': '\u02C7', // caron / háček → ˇ
  '\u20D6': '\u2190', // combining left arrow above → ← (U+2190, stretchy)
  '\u20D7': '\u2192', // combining right arrow above → → (U+2192, stretchy)
};

/**
 * Convert m:acc (accent / diacritical mark) to MathML <mover accent="true">.
 *
 * OMML structure:
 *   m:acc → m:accPr? (optional: m:chr@m:val), m:e (base expression, required)
 *
 * MathML output:
 *   <mover accent="true">
 *     <mrow>base</mrow>
 *     <mo>accent-char</mo>
 *   </mover>
 *
 * ECMA-376 §22.1.2.20 (chr) defines three m:chr states:
 *   1. m:chr element absent           → default accent char (U+0302)
 *   2. m:chr present, m:val absent    → character is absent (render bare base)
 *   3. m:chr present, m:val = "x"     → use x as the accent character
 *
 * When the accent character is absent, the base is returned wrapped in <mrow>
 * with no <mover> wrapper. When m:e itself is absent (invalid per the schema),
 * the converter returns null so the caller can drop the malformed element.
 *
 * @spec ECMA-376 §22.1.2.1 (acc), §22.1.2.2 (accPr), §22.1.2.20 (chr)
 */
export const convertAccent: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');

  // m:e is required by CT_Acc. Missing it means the input is malformed; decline
  // to render rather than emit a floating accent with no base.
  if (!base) return null;

  const accPr = elements.find((e) => e.name === 'm:accPr');
  const chr = accPr?.elements?.find((e) => e.name === 'm:chr');
  const rawVal = chr?.attributes?.['m:val'];

  // Resolve the accent character per §22.1.2.20.
  // - chr element absent             → default U+0302
  // - chr present, m:val absent/""   → character absent (no accent)
  // - chr present, m:val = "x"       → "x"
  const accentChar = chr === undefined ? DEFAULT_ACCENT_CHAR : rawVal && rawVal.length > 0 ? rawVal : '';

  const baseRow = doc.createElementNS(MATHML_NS, 'mrow');
  baseRow.appendChild(convertChildren(base.elements ?? []));

  if (!accentChar) {
    // No accent character: render the base alone.
    return baseRow;
  }

  // Map combining marks to their spacing forms so MathML renderers can use the
  // stretchy accent operators. Non-combining or unmapped characters pass through.
  const renderChar = COMBINING_TO_SPACING[accentChar] ?? accentChar;

  const mover = doc.createElementNS(MATHML_NS, 'mover');
  mover.setAttribute('accent', 'true');
  mover.appendChild(baseRow);

  const mo = doc.createElementNS(MATHML_NS, 'mo');
  // stretchy is a hint: renderers that honor it (e.g. MathJax, Firefox's
  // accent-stretch path) will stretch the accent across wide bases. Chrome's
  // current MathML Core implementation ignores this for accent operators, so
  // the accent renders at glyph width there — acceptable baseline behavior.
  mo.setAttribute('stretchy', 'true');
  mo.textContent = renderChar;
  mover.appendChild(mo);

  return mover;
};
