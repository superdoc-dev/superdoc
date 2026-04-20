import type { MathObjectConverter } from '../types.js';
import { convertMathRunAsFunctionName } from './math-run.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const FUNCTION_APPLY_OPERATOR = '\u2061';

// Boundary elements for the function-name mathvariant walk: every MathML
// element whose children occupy their own semantic slot (base, subscript,
// limit, matrix cell, etc.). When m:fName wraps one of these, the slot
// content carries authored styling per ECMA-376 §22.1.2.111 and must not be
// overwritten. Anything inside these is skipped.
const MATH_VARIANT_BOUNDARY_ELEMENTS = new Set([
  'munder',
  'mover',
  'munderover',
  'msub',
  'msup',
  'msubsup',
  'mmultiscripts',
  'mfrac',
  'msqrt',
  'mroot',
  'mtable',
  'mtr',
  'mtd',
]);

function forceNormalMathVariant(root: ParentNode): void {
  // Array.from is required here: HTMLCollection is not iterable under the
  // default DOM lib (needs `dom.iterable`), so `for…of root.children` fails
  // type-check.
  for (const child of Array.from(root.children)) {
    if (MATH_VARIANT_BOUNDARY_ELEMENTS.has(child.localName)) continue;
    if (child.localName === 'mi' && !child.hasAttribute('mathvariant')) {
      child.setAttribute('mathvariant', 'normal');
    }
    forceNormalMathVariant(child);
  }
}

/**
 * Structural MathML elements whose FIRST child is the "function-name base"
 * when nested inside m:fName (e.g. m:limLow → <munder>, m:limUpp → <mover>,
 * m:sSub → <msub>, etc.). Word's OMML2MML.XSL keeps the base text whole
 * (e.g. "lim" as one <mi>) even though it splits regular runs per-character.
 */
const BASE_BEARING_ELEMENTS = new Set([
  'munder',
  'mover',
  'munderover',
  'msub',
  'msup',
  'msubsup',
  'mmultiscripts', // m:sPre inside m:fName
]);

/**
 * After per-character splitting in convertMathRun, the base of a nested
 * limit/script inside m:fName comes out as multiple single-char <mi> siblings
 * wrapped in an <mrow>. Word's XSL keeps that base whole — merge the siblings
 * back into a single <mi> if they all share the same (or no) mathvariant.
 */
function collapseFunctionNameBases(root: ParentNode): void {
  for (const child of Array.from(root.children)) {
    if (BASE_BEARING_ELEMENTS.has(child.localName)) {
      const base = child.children[0];
      if (base) {
        collapseMrowToSingleMi(base);
        collapseFunctionNameBases(base);
      }
    } else {
      collapseFunctionNameBases(child);
    }
  }
}

function collapseMrowToSingleMi(container: Element): void {
  const children = Array.from(container.children);
  if (children.length < 2) return;
  if (!children.every((c) => c.localName === 'mi')) return;
  const variant = children[0]!.getAttribute('mathvariant');
  if (!children.every((c) => c.getAttribute('mathvariant') === variant)) return;

  const merged = container.ownerDocument!.createElementNS(MATHML_NS, 'mi');
  merged.textContent = children.map((c) => c.textContent ?? '').join('');
  if (variant) merged.setAttribute('mathvariant', variant);
  container.insertBefore(merged, children[0]!);
  for (const c of children) c.remove();
}

/**
 * Convert m:func (function apply) to MathML.
 *
 * OMML structure:
 *   m:func → m:funcPr (optional), m:fName (function name), m:e (argument)
 *
 * MathML output:
 *   <mrow> <mrow>name</mrow> <mo>&#x2061;</mo> <mrow>argument</mrow> </mrow>
 *
 * Function names are rendered upright (mathvariant="normal") instead of the
 * default italic identifier style used by MathML.
 *
 * @spec ECMA-376 §22.1.2.39
 */
export const convertFunction: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const functionName = elements.find((element) => element.name === 'm:fName');
  const argument = elements.find((element) => element.name === 'm:e');

  const wrapper = doc.createElementNS(MATHML_NS, 'mrow');

  const functionNameRow = doc.createElementNS(MATHML_NS, 'mrow');
  // m:r children of m:fName stay whole (Word's OMML2MML.XSL keeps multi-letter
  // function names like "sin" or "lim" as a single <mi>). Non-m:r children —
  // like a nested m:limLow — go through the normal recursive path.
  for (const child of functionName?.elements ?? []) {
    if (child.name === 'm:r') {
      const atom = convertMathRunAsFunctionName(child, doc);
      if (atom) functionNameRow.appendChild(atom);
    } else {
      const converted = convertChildren([child]);
      if (converted.childNodes.length > 0) functionNameRow.appendChild(converted);
    }
  }
  collapseFunctionNameBases(functionNameRow);
  forceNormalMathVariant(functionNameRow);

  if (functionNameRow.childNodes.length > 0) {
    wrapper.appendChild(functionNameRow);
  }

  const argumentRow = doc.createElementNS(MATHML_NS, 'mrow');
  argumentRow.appendChild(convertChildren(argument?.elements ?? []));

  if (functionNameRow.childNodes.length > 0 && argumentRow.childNodes.length > 0) {
    const applyOperator = doc.createElementNS(MATHML_NS, 'mo');
    applyOperator.textContent = FUNCTION_APPLY_OPERATOR;
    wrapper.appendChild(applyOperator);
  }

  if (argumentRow.childNodes.length > 0) {
    wrapper.appendChild(argumentRow);
  }

  return wrapper.childNodes.length > 0 ? wrapper : null;
};
