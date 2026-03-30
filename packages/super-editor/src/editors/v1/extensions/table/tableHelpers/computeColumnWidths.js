/**
 * Compute equal column widths (px) that fill the available page content width.
 * Returns null when page dimensions are unavailable.
 *
 * @param {import('@core/Editor').Editor} editor
 * @param {number} columnCount
 * @returns {number[] | null}
 */
export function computeColumnWidths(editor, columnCount) {
  const { pageSize = {}, pageMargins = {} } = editor?.converter?.pageStyles ?? {};
  const { width: pageWidth } = pageSize;
  const { left = 0, right = 0 } = pageMargins;
  if (!pageWidth) return null;

  const availableWidth = (pageWidth - left - right) * 96; // inches → px at 96 PPI
  const columnWidth = Math.floor(availableWidth / columnCount);
  return Array(columnCount).fill(columnWidth);
}
