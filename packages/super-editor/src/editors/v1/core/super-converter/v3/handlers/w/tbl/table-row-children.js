// @ts-check
import { normalizeSdtContentChildren } from '../sdt/helpers/sdt-envelope.js';

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
  return /** @type {Array<{ node: any, rowSdt: any }>} */ (
    normalizeSdtContentChildren(table, { childName: 'w:tr', metadataKey: 'rowSdt', scope: 'row' })
  );
};
