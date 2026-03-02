/**
 * Effective paragraph spacing in table cells.
 *
 * Word absorbs the first paragraph's spacing.before into the cell's top padding,
 * and the last paragraph's spacing.after into the cell's bottom padding.
 * This helper returns the amount to add to height/position: at a boundary,
 * only the excess of spacing over padding; otherwise the full spacing.
 *
 * Use for both spacing.before (isBoundary = first block, padding = paddingTop)
 * and spacing.after (isBoundary = last block, padding = paddingBottom).
 */
export function effectiveTableCellSpacing(spacing: number | undefined, isBoundary: boolean, padding: number): number {
  if (typeof spacing !== 'number' || spacing <= 0) {
    return 0;
  }
  return isBoundary ? Math.max(0, spacing - padding) : spacing;
}
