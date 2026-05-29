// @ts-check
import { getSdtEnvelopeParts } from '../sdt/helpers/sdt-envelope.js';

/**
 * Normalize a `<w:tbl>` element's children into the row stream the table encoder
 * iterates. Direct `<w:tr>` children pass through unchanged. A row-level
 * `<w:sdt>` (ECMA-376 §17.5.2.30, CT_SdtRow) is unwrapped: its inner `<w:tr>`
 * is emitted in document order, and when the wrapper contains exactly one row
 * the wrapper's `w:sdtPr` / `w:sdtEndPr` are attached as metadata so export can
 * rebuild the `<w:sdt>` envelope.
 *
 * Multi-row SDT wrappers are imported defensively: every inner row is emitted in
 * order, but wrapper metadata is dropped because exact multi-row grouping needs
 * a representation SuperDoc does not currently model.
 *
 * @param {any} table
 * @returns {Array<{ node: any, rowSdt: any }>}
 */
export const normalizeTableRowChildren = (table) => {
  /** @type {Array<{ node: any, rowSdt: any }>} */
  const out = [];
  const children = Array.isArray(table?.elements) ? table.elements : [];
  for (const child of children) {
    if (!child || typeof child.name !== 'string') continue;
    if (child.name === 'w:tr') {
      out.push({ node: child, rowSdt: null });
      continue;
    }
    if (child.name === 'w:sdt') {
      const { sdtPr, sdtEndPr, sdtContent } = getSdtEnvelopeParts(child);
      const innerRows = sdtContent?.elements?.filter((el) => el?.name === 'w:tr') ?? [];
      if (innerRows.length === 1 && sdtPr) {
        out.push({
          node: innerRows[0],
          rowSdt: { scope: 'row', sdtPr, sdtEndPr },
        });
      } else {
        for (const innerTr of innerRows) {
          out.push({ node: innerTr, rowSdt: null });
        }
      }
    }
  }
  return out;
};
