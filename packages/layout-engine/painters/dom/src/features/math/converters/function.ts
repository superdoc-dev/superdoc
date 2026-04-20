import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const FUNCTION_APPLY_OPERATOR = '\u2061';

// MathML elements whose contents have their own semantic slot (base, subscript,
// limit expression, matrix cell, etc.) and must keep authored styling when
// m:fName wraps a nested construct like m:limLow.
const STRUCTURAL_MATHML = new Set([
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
  const walk = (node: ParentNode): void => {
    for (const child of Array.from(node.children)) {
      if (STRUCTURAL_MATHML.has(child.localName)) continue;
      if (child.localName === 'mi' && !child.hasAttribute('mathvariant')) {
        child.setAttribute('mathvariant', 'normal');
      }
      walk(child);
    }
  };
  walk(root);
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
