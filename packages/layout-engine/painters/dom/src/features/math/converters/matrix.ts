import type { MathObjectConverter, OmmlJsonNode } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Visual placeholder for empty matrix cells when m:plcHide is off (§22.1.2.83). */
const EMPTY_CELL_PLACEHOLDER = '\u25A1'; // WHITE SQUARE

/** True when the given m:plcHide element expresses "hide placeholders". */
function isPlaceholderHidden(plcHide: OmmlJsonNode | undefined): boolean {
  if (!plcHide) return false;
  const val = plcHide.attributes?.['m:val'];
  // Per §22.1.2.83: presence without @m:val means placeholders are hidden.
  if (val === undefined) return true;
  return val === '1' || val === 'true';
}

/**
 * Convert m:m (matrix) to MathML <mtable>.
 *
 * OMML structure:
 *   m:m → m:mPr (optional: mcs/mcJc/baseJc/plcHide — only plcHide applied), m:mr* (rows)
 *     m:mr → m:e* (cells; empty m:e creates a positional gap per §22.1.2.32)
 *
 * MathML output:
 *   <mtable>
 *     <mtr>
 *       <mtd> <mrow>cell-content</mrow> </mtd>
 *       ...
 *     </mtr>
 *     ...
 *   </mtable>
 *
 * Empty cells render a U+25A1 placeholder by default (§22.1.2.83 plcHide="0").
 * When m:plcHide is present with val "1"/"true" or no val, the placeholder is suppressed.
 *
 * @spec ECMA-376 §22.1.2.60
 */
export const convertMatrix: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const rows = elements.filter((e) => e.name === 'm:mr');

  const matrixProps = elements.find((e) => e.name === 'm:mPr');
  const plcHide = matrixProps?.elements?.find((e) => e.name === 'm:plcHide');
  const hidePlaceholders = isPlaceholderHidden(plcHide);

  const mtable = doc.createElementNS(MATHML_NS, 'mtable');

  for (const row of rows) {
    const mtr = doc.createElementNS(MATHML_NS, 'mtr');
    const cells = row.elements?.filter((e) => e.name === 'm:e') ?? [];

    for (const cell of cells) {
      const mtd = doc.createElementNS(MATHML_NS, 'mtd');
      const mrow = doc.createElementNS(MATHML_NS, 'mrow');
      const fragment = convertChildren(cell.elements ?? []);

      if (fragment.childNodes.length === 0 && !hidePlaceholders) {
        const placeholder = doc.createElementNS(MATHML_NS, 'mi');
        placeholder.textContent = EMPTY_CELL_PLACEHOLDER;
        mrow.appendChild(placeholder);
      } else {
        mrow.appendChild(fragment);
      }

      mtd.appendChild(mrow);
      mtr.appendChild(mtd);
    }

    mtable.appendChild(mtr);
  }

  return mtable.childNodes.length > 0 ? mtable : null;
};
