import type { MathObjectConverter } from '../types.js';

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
  functionNameRow.appendChild(convertChildren(functionName?.elements ?? []));
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
