/**
 * Interior row boundary coverage for the single-owner border model.
 *
 * Word paints the horizontal boundary between two rows as ONE continuous line across the
 * UNION of both rows' cell extents (verified with 300dpi probes: when one row is narrower,
 * e.g. via `w:gridBefore`/`w:gridAfter`, the uncovered slivers still render, and with the
 * table's insideH border). In this painter each cell in the row BELOW owns and paints its
 * top across its own span, so boundary segments that have a cell ABOVE but none BELOW are
 * painted by nobody. These helpers identify exactly those segments so the fragment renderer
 * can close them with positioned strips, without ever doubling a line that a cell below
 * already paints. (SD-3028 / SD-1513)
 */

/** Identifies a measured cell by the row it STARTS in and its index within that row. */
export interface BoundaryCellRef {
  rowIndex: number;
  cellIndex: number;
}

interface MeasuredCellLike {
  gridColumnStart?: number;
  colSpan?: number;
  rowSpan?: number;
}

interface MeasuredRowLike {
  cells?: readonly MeasuredCellLike[] | null;
}

/**
 * Builds the per-row grid column occupancy map, including columns covered by cells that
 * span into a row via rowspan (`w:vMerge`). `occupancy[r][c]` is the cell covering grid
 * column `c` on row `r`, or null when no cell covers it (a gridBefore/gridAfter region).
 */
export const buildColumnOccupancy = (
  rows: ReadonlyArray<MeasuredRowLike | undefined | null>,
  numCols: number,
): (BoundaryCellRef | null)[][] => {
  const occupancy: (BoundaryCellRef | null)[][] = rows.map(() => new Array<BoundaryCellRef | null>(numCols).fill(null));
  rows.forEach((row, rowIndex) => {
    row?.cells?.forEach((cell, cellIndex) => {
      const startCol = cell.gridColumnStart ?? 0;
      const endCol = Math.min(numCols, startCol + (cell.colSpan ?? 1));
      const endRow = Math.min(rows.length, rowIndex + (cell.rowSpan ?? 1));
      const ref: BoundaryCellRef = { rowIndex, cellIndex };
      for (let r = rowIndex; r < endRow; r += 1) {
        for (let c = startCol; c < endCol; c += 1) {
          occupancy[r][c] = ref;
        }
      }
    });
  });
  return occupancy;
};

/** A run of grid columns on a row boundary covered above but not below. */
export interface BoundaryGapSegment {
  startCol: number;
  endColExclusive: number;
  /** The cell whose bottom edge forms this segment (its borders resolve the strip). */
  aboveCell: BoundaryCellRef;
}

/**
 * Segments of the boundary ABOVE `belowRowIndex` where a cell ends from above but no cell
 * exists below. A rowspan cell crossing the boundary occupies both sides with the same ref,
 * so it never produces a segment (there is no edge inside a vertical merge). Contiguous
 * columns sharing the same above cell merge into one segment.
 */
export const computeBoundaryGapSegments = (
  occupancy: ReadonlyArray<ReadonlyArray<BoundaryCellRef | null>>,
  belowRowIndex: number,
): BoundaryGapSegment[] => {
  const above = occupancy[belowRowIndex - 1];
  const below = occupancy[belowRowIndex];
  if (!above || !below) return [];

  const segments: BoundaryGapSegment[] = [];
  let current: BoundaryGapSegment | null = null;
  for (let c = 0; c < above.length; c += 1) {
    const aboveCell = above[c];
    const isGap = aboveCell !== null && below[c] === null;
    if (isGap && current && current.aboveCell === aboveCell) {
      current.endColExclusive = c + 1;
    } else if (isGap) {
      current = { startCol: c, endColExclusive: c + 1, aboveCell: aboveCell as BoundaryCellRef };
      segments.push(current);
    } else {
      current = null;
    }
  }
  return segments;
};
