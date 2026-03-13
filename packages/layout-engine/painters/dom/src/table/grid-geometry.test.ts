import { describe, expect, it } from 'vitest';
import { getTableCellGridBounds } from './grid-geometry.js';

describe('getTableCellGridBounds', () => {
  it('marks a merged header cell as touching both outer horizontal edges', () => {
    const result = getTableCellGridBounds({
      rowIndex: 0,
      rowSpan: 1,
      gridColumnStart: 0,
      colSpan: 2,
      totalRows: 5,
      totalCols: 2,
    });

    expect(result.startCol).toBe(0);
    expect(result.endColExclusive).toBe(2);
    expect(result.touchesLeftEdge).toBe(true);
    expect(result.touchesRightEdge).toBe(true);
  });

  it('marks a spanning cell as touching the bottom edge when its rowspan reaches the final row', () => {
    const result = getTableCellGridBounds({
      rowIndex: 3,
      rowSpan: 2,
      gridColumnStart: 1,
      colSpan: 1,
      totalRows: 5,
      totalCols: 3,
    });

    expect(result.startRow).toBe(3);
    expect(result.endRowExclusive).toBe(5);
    expect(result.touchesBottomEdge).toBe(true);
    expect(result.touchesRightEdge).toBe(false);
  });

  it('clamps oversized spans to the table bounds', () => {
    const result = getTableCellGridBounds({
      rowIndex: 1,
      rowSpan: 10,
      gridColumnStart: 1,
      colSpan: 10,
      totalRows: 3,
      totalCols: 4,
    });

    expect(result.endRowExclusive).toBe(3);
    expect(result.endColExclusive).toBe(4);
    expect(result.touchesBottomEdge).toBe(true);
    expect(result.touchesRightEdge).toBe(true);
  });

  it('defaults missing rowSpan and colSpan to 1', () => {
    const result = getTableCellGridBounds({
      rowIndex: 0,
      gridColumnStart: 0,
      totalRows: 3,
      totalCols: 3,
    });

    expect(result.endRowExclusive).toBe(1);
    expect(result.endColExclusive).toBe(1);
    expect(result.touchesTopEdge).toBe(true);
    expect(result.touchesLeftEdge).toBe(true);
    expect(result.touchesBottomEdge).toBe(false);
    expect(result.touchesRightEdge).toBe(false);
  });

  it('treats zero or negative spans as 1', () => {
    const result = getTableCellGridBounds({
      rowIndex: 0,
      rowSpan: 0,
      gridColumnStart: 0,
      colSpan: -1,
      totalRows: 3,
      totalCols: 3,
    });

    expect(result.endRowExclusive).toBe(1);
    expect(result.endColExclusive).toBe(1);
  });

  it('returns zero-sized bounds when totalRows and totalCols are zero', () => {
    const result = getTableCellGridBounds({
      rowIndex: 0,
      rowSpan: 1,
      gridColumnStart: 0,
      colSpan: 1,
      totalRows: 0,
      totalCols: 0,
    });

    expect(result.startRow).toBe(0);
    expect(result.endRowExclusive).toBe(0);
    expect(result.startCol).toBe(0);
    expect(result.endColExclusive).toBe(0);
    expect(result.touchesTopEdge).toBe(false);
    expect(result.touchesBottomEdge).toBe(false);
    expect(result.touchesLeftEdge).toBe(false);
    expect(result.touchesRightEdge).toBe(false);
  });

  it('clamps a startIndex that exceeds the grid to the last valid position', () => {
    const result = getTableCellGridBounds({
      rowIndex: 10,
      rowSpan: 1,
      gridColumnStart: 5,
      colSpan: 1,
      totalRows: 3,
      totalCols: 4,
    });

    expect(result.startRow).toBe(2);
    expect(result.endRowExclusive).toBe(3);
    expect(result.startCol).toBe(3);
    expect(result.endColExclusive).toBe(4);
    expect(result.touchesBottomEdge).toBe(true);
    expect(result.touchesRightEdge).toBe(true);
  });

  it('identifies interior cell as not touching any edge', () => {
    const result = getTableCellGridBounds({
      rowIndex: 1,
      rowSpan: 1,
      gridColumnStart: 1,
      colSpan: 1,
      totalRows: 3,
      totalCols: 3,
    });

    expect(result.touchesTopEdge).toBe(false);
    expect(result.touchesBottomEdge).toBe(false);
    expect(result.touchesLeftEdge).toBe(false);
    expect(result.touchesRightEdge).toBe(false);
  });

  it('handles fractional spans by flooring them', () => {
    const result = getTableCellGridBounds({
      rowIndex: 0,
      rowSpan: 2.7,
      gridColumnStart: 0,
      colSpan: 1.9,
      totalRows: 5,
      totalCols: 5,
    });

    expect(result.endRowExclusive).toBe(2);
    expect(result.endColExclusive).toBe(1);
  });
});
