import { describe, expect, it } from 'vitest';
import { computeAutoFitColumnWidths } from './autofit-columns.js';

describe('computeAutoFitColumnWidths', () => {
  it('defaults omitted layout mode to autofit', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredColumnWidths: [100, 100],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 40, maxContentWidth: 80 },
            { span: 1, minContentWidth: 120, maxContentWidth: 220 },
          ],
        },
      ],
    });

    expect(result.layoutMode).toBe('autofit');
    expect(result.columnWidths).toEqual([100, 220]);
    expect(result.totalWidth).toBe(320);
  });

  it('treats the literal auto layout mode as autofit', () => {
    const result = computeAutoFitColumnWidths({
      tableLayout: 'auto',
      maxTableWidth: 500,
      preferredColumnWidths: [100, 100],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 40, maxContentWidth: 80 },
            { span: 1, minContentWidth: 120, maxContentWidth: 220 },
          ],
        },
      ],
    });

    expect(result.layoutMode).toBe('autofit');
    expect(result.columnWidths).toEqual([100, 220]);
    expect(result.totalWidth).toBe(320);
  });

  it('preserves fixed-layout preferred widths', () => {
    const result = computeAutoFitColumnWidths({
      tableLayout: 'fixed',
      maxTableWidth: 500,
      preferredColumnWidths: [100, 100],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 80, maxContentWidth: 180 },
            { span: 1, minContentWidth: 90, maxContentWidth: 240 },
          ],
        },
      ],
    });

    expect(result.layoutMode).toBe('fixed');
    expect(result.columnWidths).toEqual([100, 100]);
  });

  it('widens uneven equal-grid columns from content', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredColumnWidths: [100, 100],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 60, maxContentWidth: 60 },
            { span: 1, minContentWidth: 200, maxContentWidth: 200 },
          ],
        },
      ],
    });

    expect(result.columnWidths).toEqual([100, 200]);
  });

  it('distributes up to the preferred table width target', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredTableWidth: 400,
      preferredColumnWidths: [100, 100],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 50, maxContentWidth: 50 },
            { span: 1, minContentWidth: 50, maxContentWidth: 50 },
          ],
        },
      ],
    });

    expect(result.columnWidths).toEqual([200, 200]);
    expect(result.totalWidth).toBe(400);
  });

  it('shrinks back to the preferred table width when it falls between total min and total max', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredTableWidth: 300,
      preferredColumnWidths: [100, 100],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 50, maxContentWidth: 100 },
            { span: 1, minContentWidth: 50, maxContentWidth: 400 },
          ],
        },
      ],
    });

    expect(result.columnWidths).toEqual([75, 225]);
    expect(result.totalWidth).toBe(300);
  });

  it('keeps autofit stable when preferred cell widths conflict with the authored grid and table width', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredTableWidth: 320,
      preferredColumnWidths: [80, 240],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 60, maxContentWidth: 90, preferredWidth: 140 },
            { span: 1, minContentWidth: 70, maxContentWidth: 180, preferredWidth: 220 },
          ],
        },
      ],
    });

    expect(result.layoutMode).toBe('autofit');
    expect(result.totalWidth).toBe(320);
    expect(result.columnWidths).toEqual([121, 199]);
  });

  it('lets preferred cell widths override a column max width', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredColumnWidths: [100],
      rows: [
        {
          cells: [{ span: 1, minContentWidth: 50, maxContentWidth: 70, preferredWidth: 150 }],
        },
      ],
    });

    expect(result.columnWidths).toEqual([150]);
  });

  it('expands multi-span cells to satisfy minimum content width', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredColumnWidths: [50, 50],
      rows: [
        {
          cells: [{ span: 2, minContentWidth: 130, maxContentWidth: 130 }],
        },
      ],
    });

    expect(result.columnWidths).toEqual([65, 65]);
    expect(result.totalWidth).toBe(130);
  });

  it('expands multi-span cells to satisfy maximum content width', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredColumnWidths: [40, 40, 40],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 40, maxContentWidth: 40 },
            { span: 2, minContentWidth: 80, maxContentWidth: 150 },
          ],
        },
      ],
    });

    expect(result.columnWidths).toEqual([40, 75, 75]);
  });

  it('clamps the final width vector to the section width', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 300,
      preferredColumnWidths: [100, 100],
      rows: [
        {
          cells: [
            { span: 1, minContentWidth: 60, maxContentWidth: 200 },
            { span: 1, minContentWidth: 60, maxContentWidth: 200 },
          ],
        },
      ],
    });

    expect(result.columnWidths).toEqual([150, 150]);
    expect(result.totalWidth).toBe(300);
  });

  it('extends the working grid when spans exceed the initial grid length', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 500,
      preferredColumnWidths: [100],
      rows: [
        {
          cells: [{ span: 3, minContentWidth: 180, maxContentWidth: 180 }],
        },
      ],
    });

    expect(result.gridColumnCount).toBe(3);
    expect(result.columnWidths).toHaveLength(3);
    expect(result.columnWidths[0]).toBeGreaterThanOrEqual(100);
    expect(result.columnWidths.reduce((sum, width) => sum + width, 0)).toBeGreaterThanOrEqual(180);
  });

  it('accounts for skipped leading and trailing columns in the working grid', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 400,
      rows: [
        {
          skippedBefore: [{ preferredWidth: 80 }],
          cells: [{ span: 1, minContentWidth: 10, maxContentWidth: 10 }],
          skippedAfter: [{ preferredWidth: 120 }],
        },
      ],
    });

    expect(result.gridColumnCount).toBe(3);
    expect(result.columnWidths).toEqual([80, 10, 120]);
  });

  it('keeps pathological empty input at a non-zero width floor', () => {
    const result = computeAutoFitColumnWidths({
      maxTableWidth: 300,
      preferredColumnWidths: [],
      rows: [],
    });

    expect(result.columnWidths).toEqual([8]);
    expect(result.totalWidth).toBe(8);
  });
});
