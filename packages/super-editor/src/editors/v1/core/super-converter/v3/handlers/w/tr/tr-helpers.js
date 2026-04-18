// @ts-check

/**
 * Create a placeholder table cell used to preserve column layout for gridBefore/gridAfter gaps.
 * @param {number} gridWidth - Width of the column in pixels.
 * @param {string} reason - Placeholder reason flag stored in `__placeholder`.
 * @returns {{ type: 'tableCell', attrs: Object, content: Array }}
 */
export const createPlaceholderCell = (gridWidth, reason) => {
  const safeWidth = Number.isFinite(gridWidth) ? gridWidth : 0;
  const noBorder = { val: 'none', size: 0 };
  return {
    type: 'tableCell',
    attrs: {
      colspan: 1,
      rowspan: 1,
      colwidth: [safeWidth],
      __placeholder: reason,
      borders: {
        top: { ...noBorder },
        right: { ...noBorder },
        bottom: { ...noBorder },
        left: { ...noBorder },
      },
    },
    content: [{ type: 'paragraph', content: [] }],
  };
};

/**
 * Consume row span counters while advancing across occupied columns.
 * @param {number[]} pendingRowSpans - Remaining span counts per column.
 * @param {number} startIndex - Column index to begin from.
 * @param {number} totalColumns - Maximum number of columns in the grid.
 * @returns {number} Column index after skipping all occupied slots.
 */
export const advancePastRowSpans = (pendingRowSpans, startIndex, totalColumns) => {
  let index = startIndex;
  while (index < totalColumns && pendingRowSpans[index] > 0) {
    pendingRowSpans[index] -= 1;
    index += 1;
  }
  return index;
};

/**
 * Fill gaps up to the requested column with placeholder cells, respecting active row spans.
 * @param {Object} params
 * @param {Array} params.content - Accumulator for encoded row content.
 * @param {number[]} params.pendingRowSpans - Remaining span counts per column.
 * @param {number} params.currentIndex - Column index to start filling from.
 * @param {number} params.targetIndex - Column index to stop before.
 * @param {number} params.totalColumns - Total columns available in the table grid.
 * @param {number[]} [params.gridColumnWidths] - Widths associated with each grid column.
 * @param {string} params.reason - Placeholder reason flag.
 * @returns {number} Updated column index after filling placeholders.
 */
export const fillPlaceholderColumns = ({
  content,
  pendingRowSpans,
  currentIndex,
  targetIndex,
  totalColumns,
  gridColumnWidths,
  reason,
}) => {
  let index = currentIndex;
  while (index < targetIndex && index < totalColumns) {
    if (pendingRowSpans[index] > 0) {
      pendingRowSpans[index] -= 1;
      index += 1;
      continue;
    }
    const width = Array.isArray(gridColumnWidths) ? (gridColumnWidths[index] ?? 0) : 0;
    content.push(createPlaceholderCell(width, reason));
    index += 1;
  }
  return index;
};

/**
 * Determine whether the given cell is one of the placeholder cells inserted during encoding.
 * @param {import('@translator').SCEncoderResult | undefined} cell
 * @returns {boolean}
 */
export const isPlaceholderCell = (cell) => {
  if (!cell) return false;
  if (cell.attrs?.__placeholder) {
    return true;
  }

  const widths = cell.attrs?.colwidth;
  if (Array.isArray(widths) && widths.length > 0) {
    const hasMeaningfulWidth = widths.some(
      (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) > 1,
    );
    if (!hasMeaningfulWidth) {
      return true;
    }
  }

  return false;
};
