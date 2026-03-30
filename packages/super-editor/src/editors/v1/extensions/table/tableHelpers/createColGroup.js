// @ts-check
import { getColStyleDeclaration } from './getColStyleDeclaration.js';
import { twipsToPixels } from '@core/super-converter/helpers.js';

// Treat extremely small column widths as zero so placeholder columns collapse.
const MIN_MEANINGFUL_WIDTH_PX = 1;

export const createColGroup = (node, cellMinWidth, overrideCol, overrideValue) => {
  let totalWidth = 0;
  let fixedWidth = true;

  const cols = [];
  const colsValues = [];
  const row = node.firstChild;
  const gridColumns =
    Array.isArray(node.attrs?.grid) && node.attrs.grid.length
      ? node.attrs.grid.map((col) => twipsToPixels(col.col))
      : null;

  if (!row) return {};

  const totalColumns = gridColumns?.length;
  const resolveColumnWidth = (colIndex, colwidthValue) => {
    if (overrideCol === colIndex) return overrideValue;
    if (colwidthValue != null) return colwidthValue;
    if (gridColumns && gridColumns[colIndex] != null) return gridColumns[colIndex];
    return null;
  };

  let colIndex = 0;
  for (let i = 0; i < row.childCount; i++) {
    const child = row.child(i);
    const { colspan, colwidth } = child.attrs;

    for (let j = 0; j < colspan; j++, colIndex++) {
      const candidateWidth = resolveColumnWidth(colIndex, colwidth && colwidth[j]);
      const numericWidth = Number(candidateWidth);
      let effectiveWidth = Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : null;
      if (effectiveWidth != null && effectiveWidth < MIN_MEANINGFUL_WIDTH_PX) {
        effectiveWidth = 0;
      }

      if (effectiveWidth == null) {
        totalWidth += cellMinWidth;
        fixedWidth = false;
      } else {
        totalWidth += effectiveWidth;
      }

      const [prop, value] = getColStyleDeclaration(cellMinWidth, effectiveWidth);
      cols.push(['col', { style: `${prop}: ${value}` }]);
      colsValues.push(parseFloat(value));
    }
  }

  if (totalColumns != null) {
    for (let col = colIndex; col < totalColumns; col++) {
      const candidateWidth = resolveColumnWidth(col);
      const numericWidth = Number(candidateWidth);
      let effectiveWidth = Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : null;
      if (effectiveWidth != null && effectiveWidth < MIN_MEANINGFUL_WIDTH_PX) {
        effectiveWidth = 0;
      }

      if (effectiveWidth == null) {
        totalWidth += cellMinWidth;
        fixedWidth = false;
      } else {
        totalWidth += effectiveWidth;
      }

      const [prop, value] = getColStyleDeclaration(cellMinWidth, effectiveWidth);
      cols.push(['col', { style: `${prop}: ${value}` }]);
      colsValues.push(parseFloat(value));
    }
  }

  const tableWidth = fixedWidth ? `${totalWidth}px` : '';
  const tableMinWidth = fixedWidth ? '' : `${totalWidth}px`;
  const colgroup = ['colgroup', {}, ...cols];
  const colgroupValues = [...colsValues];
  return {
    colgroup,
    tableWidth,
    tableMinWidth,
    colgroupValues,
  };
};
