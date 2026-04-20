import type { MathObjectConverter, OmmlJsonNode } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Deep-clone row children with `&` stripped from m:t text nodes.
 *
 * ECMA-376 §22.1.2.34: `&` characters inside m:t are alignment markers
 * (odd = align, even = spacer), not literal text. This implementation
 * doesn't yet map them to MathML <maligngroup>/<malignmark>, so strip them
 * to avoid rendering literal ampersands in the output.
 */
const stripAlignmentMarkers = (nodes: OmmlJsonNode[]): OmmlJsonNode[] =>
  nodes.map((node) => {
    if (node?.type === 'text' && typeof node.text === 'string' && node.text.includes('&')) {
      return { ...node, text: node.text.replace(/&/g, '') };
    }
    if (node?.elements) {
      return { ...node, elements: stripAlignmentMarkers(node.elements) };
    }
    return node;
  });

/**
 * Convert m:eqArr (equation array) to MathML <mtable>.
 *
 * OMML structure:
 *   m:eqArr → m:eqArrPr (optional), m:e* (one element per row)
 *
 * MathML output:
 *   <mtable columnalign="left">
 *     <mtr> <mtd> <mrow>row-content</mrow> </mtd> </mtr>
 *     ...
 *   </mtable>
 *
 * Unlike m:m (matrix), equation arrays have one cell per row and are
 * typically left-aligned. Used for systems of equations.
 *
 * @spec ECMA-376 §22.1.2.34
 */
export const convertEquationArray: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const rows = elements.filter((e) => e.name === 'm:e');

  const mtable = doc.createElementNS(MATHML_NS, 'mtable');
  mtable.setAttribute('columnalign', 'left');

  for (const row of rows) {
    const mtr = doc.createElementNS(MATHML_NS, 'mtr');
    const mtd = doc.createElementNS(MATHML_NS, 'mtd');
    const mrow = doc.createElementNS(MATHML_NS, 'mrow');
    const cleanedChildren = stripAlignmentMarkers(row.elements ?? []);
    mrow.appendChild(convertChildren(cleanedChildren));
    mtd.appendChild(mrow);
    mtr.appendChild(mtd);
    mtable.appendChild(mtr);
  }

  return mtable.childNodes.length > 0 ? mtable : null;
};
