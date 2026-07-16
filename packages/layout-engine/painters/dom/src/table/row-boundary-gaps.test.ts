import { describe, it, expect } from 'vitest';
import { buildColumnOccupancy, computeBoundaryGapSegments } from './row-boundary-gaps.js';

describe('buildColumnOccupancy', () => {
  it('maps plain cells to their grid columns', () => {
    const occupancy = buildColumnOccupancy(
      [
        {
          cells: [
            { gridColumnStart: 0, colSpan: 1 },
            { gridColumnStart: 1, colSpan: 1 },
          ],
        },
        { cells: [{ gridColumnStart: 0, colSpan: 2 }] },
      ],
      2,
    );
    expect(occupancy[0][0]).toEqual({ rowIndex: 0, cellIndex: 0 });
    expect(occupancy[0][1]).toEqual({ rowIndex: 0, cellIndex: 1 });
    expect(occupancy[1][0]).toEqual({ rowIndex: 1, cellIndex: 0 });
    expect(occupancy[1][1]).toBe(occupancy[1][0]);
  });

  it('leaves gridBefore/gridAfter columns unoccupied', () => {
    // Row 1 skips col 0 (gridBefore) and col 3 (gridAfter): one merged cell over cols 1-2.
    const occupancy = buildColumnOccupancy(
      [{ cells: [{ gridColumnStart: 0, colSpan: 4 }] }, { cells: [{ gridColumnStart: 1, colSpan: 2 }] }],
      4,
    );
    expect(occupancy[1][0]).toBeNull();
    expect(occupancy[1][1]).toEqual({ rowIndex: 1, cellIndex: 0 });
    expect(occupancy[1][2]).toBe(occupancy[1][1]);
    expect(occupancy[1][3]).toBeNull();
  });

  it('marks rowspan coverage on continuation rows with the same ref', () => {
    const occupancy = buildColumnOccupancy(
      [
        {
          cells: [
            { gridColumnStart: 0, colSpan: 1, rowSpan: 2 },
            { gridColumnStart: 1, colSpan: 1 },
          ],
        },
        { cells: [{ gridColumnStart: 1, colSpan: 1 }] },
      ],
      2,
    );
    expect(occupancy[1][0]).toBe(occupancy[0][0]);
    expect(occupancy[1][1]).toEqual({ rowIndex: 1, cellIndex: 0 });
  });
});

describe('computeBoundaryGapSegments', () => {
  it('returns no segments when the row below fully covers the row above', () => {
    const occupancy = buildColumnOccupancy(
      [{ cells: [{ gridColumnStart: 0, colSpan: 2 }] }, { cells: [{ gridColumnStart: 0, colSpan: 2 }] }],
      2,
    );
    expect(computeBoundaryGapSegments(occupancy, 1)).toEqual([]);
  });

  it('finds the gridBefore and gridAfter slivers under a wider row (SD-1513 shape)', () => {
    // Above: five cells over the full 7-col grid. Below: gridBefore=1, merged span 5, gridAfter=1.
    const occupancy = buildColumnOccupancy(
      [
        {
          cells: [
            { gridColumnStart: 0, colSpan: 2 },
            { gridColumnStart: 2, colSpan: 1 },
            { gridColumnStart: 3, colSpan: 1 },
            { gridColumnStart: 4, colSpan: 1 },
            { gridColumnStart: 5, colSpan: 2 },
          ],
        },
        { cells: [{ gridColumnStart: 1, colSpan: 5 }] },
      ],
      7,
    );
    expect(computeBoundaryGapSegments(occupancy, 1)).toEqual([
      { startCol: 0, endColExclusive: 1, aboveCell: { rowIndex: 0, cellIndex: 0 } },
      { startCol: 6, endColExclusive: 7, aboveCell: { rowIndex: 0, cellIndex: 4 } },
    ]);
  });

  it('returns no segment where neither row has a cell (gridBefore in both rows)', () => {
    const occupancy = buildColumnOccupancy(
      [{ cells: [{ gridColumnStart: 1, colSpan: 2 }] }, { cells: [{ gridColumnStart: 1, colSpan: 2 }] }],
      3,
    );
    expect(computeBoundaryGapSegments(occupancy, 1)).toEqual([]);
  });

  it('does not produce a segment inside a rowspan crossing the boundary', () => {
    // Col 0 is a vMerge crossing the boundary: same cell above and below -> no edge, no strip.
    // Col 2 of the above row has nothing below (gridAfter) -> strip.
    const occupancy = buildColumnOccupancy(
      [
        {
          cells: [
            { gridColumnStart: 0, colSpan: 1, rowSpan: 2 },
            { gridColumnStart: 1, colSpan: 2 },
          ],
        },
        { cells: [{ gridColumnStart: 1, colSpan: 1 }] },
      ],
      3,
    );
    expect(computeBoundaryGapSegments(occupancy, 1)).toEqual([
      { startCol: 2, endColExclusive: 3, aboveCell: { rowIndex: 0, cellIndex: 1 } },
    ]);
  });

  it('splits adjacent gap columns owned by different above cells into separate segments', () => {
    const occupancy = buildColumnOccupancy(
      [
        {
          cells: [
            { gridColumnStart: 0, colSpan: 1 },
            { gridColumnStart: 1, colSpan: 1 },
          ],
        },
        { cells: [] },
      ],
      2,
    );
    expect(computeBoundaryGapSegments(occupancy, 1)).toEqual([
      { startCol: 0, endColExclusive: 1, aboveCell: { rowIndex: 0, cellIndex: 0 } },
      { startCol: 1, endColExclusive: 2, aboveCell: { rowIndex: 0, cellIndex: 1 } },
    ]);
  });
});
