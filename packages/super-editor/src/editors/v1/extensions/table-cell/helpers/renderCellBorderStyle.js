// @ts-check

/**
 * Build an inline CSS style string for cell borders.
 *
 * Shared by both `tableCell` and `tableHeader` node `renderDOM` methods
 * so the border-rendering logic stays in one place.
 *
 * @param {import('./createCellBorders.js').CellBorders | null | undefined} borders
 * @returns {{ style: string } | {}}
 */
export const renderCellBorderStyle = (borders) => {
  if (!borders) return {};

  const sides = ['top', 'right', 'bottom', 'left'];
  const style = sides
    .map((side) => {
      const border = borders?.[side];
      if (border && border.val === 'none') return `border-${side}: ${border.val};`;
      let color = border?.color || 'black';
      if (color === 'auto') color = 'black';
      if (border) return `border-${side}: ${Math.ceil(border.size)}px solid ${color};`;
      return '';
    })
    .join(' ');

  return { style };
};
