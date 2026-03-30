/**
 * Returns true when a selection-like object represents a non-collapsed range.
 *
 * @param {{ from?: number, to?: number } | null | undefined} selection
 * @returns {boolean}
 */
export const hasExpandedSelection = (selection) => {
  return Number.isFinite(selection?.from) && Number.isFinite(selection?.to) && selection.from !== selection.to;
};
