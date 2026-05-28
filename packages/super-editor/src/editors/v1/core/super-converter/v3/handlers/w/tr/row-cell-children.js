// @ts-check

/**
 * Normalize a `<w:tr>` element's children into the cell stream the row encoder
 * iterates. Direct `<w:tc>` children pass through unchanged. A cell-level
 * `<w:sdt>` (ECMA-376 §17.5.2.32, CT_SdtCell) is unwrapped: its inner `<w:tc>`
 * is emitted in document order, and when the wrapper contains exactly one cell
 * the wrapper's `w:sdtPr` / `w:sdtEndPr` are attached as metadata so export
 * can rebuild the `<w:sdt>` envelope.
 *
 * Multi-cell SDT wrappers (legal under `CT_SdtContentCell`/EG_ContentCellContent
 * but rare in practice; the spec prose at §17.5.2.33 describes a single cell)
 * are imported defensively: every inner cell is emitted in order, but wrapper
 * metadata is dropped because exact multi-cell grouping needs a representation
 * SuperDoc does not currently model.
 *
 * Other legal `w:tr` children (`w:customXml`, run-level markup) are skipped
 * silently, matching the prior behavior of the cell-only filter.
 *
 * Pure helper: no dependencies. Shared between `tr-translator.js` (row encode)
 * and `legacy-handle-table-cell-node.js` (vMerge continuation lookup) so both
 * see the same set of importable cells.
 *
 * @param {any} row
 * @returns {Array<{ node: any, cellSdt: any }>}
 */
export const normalizeRowCellChildren = (row) => {
  /** @type {Array<{ node: any, cellSdt: any }>} */
  const out = [];
  const children = Array.isArray(row?.elements) ? row.elements : [];
  for (const child of children) {
    if (!child || typeof child.name !== 'string') continue;
    if (child.name === 'w:tc') {
      out.push({ node: child, cellSdt: null });
      continue;
    }
    if (child.name === 'w:sdt') {
      const sdtPr = child.elements?.find((/** @type {any} */ el) => el?.name === 'w:sdtPr') ?? null;
      const sdtEndPr = child.elements?.find((/** @type {any} */ el) => el?.name === 'w:sdtEndPr') ?? null;
      const sdtContent = child.elements?.find((/** @type {any} */ el) => el?.name === 'w:sdtContent');
      const innerCells = sdtContent?.elements?.filter((/** @type {any} */ el) => el?.name === 'w:tc') ?? [];
      if (innerCells.length === 1 && sdtPr) {
        out.push({
          node: innerCells[0],
          cellSdt: { scope: 'cell', sdtPr, sdtEndPr },
        });
      } else {
        // Multi-cell wrapper or wrapper without sdtPr: import inner cells without
        // wrapper metadata so the row is not dropped.
        for (const innerTc of innerCells) {
          out.push({ node: innerTc, cellSdt: null });
        }
      }
    }
  }
  return out;
};
