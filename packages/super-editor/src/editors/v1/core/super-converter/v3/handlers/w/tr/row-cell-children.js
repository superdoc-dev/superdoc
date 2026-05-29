// @ts-check
import { normalizeSdtContentChildren } from '../sdt/helpers/sdt-envelope.js';

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
  return /** @type {Array<{ node: any, cellSdt: any }>} */ (
    normalizeSdtContentChildren(row, { childName: 'w:tc', metadataKey: 'cellSdt', scope: 'cell' })
  );
};
