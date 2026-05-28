import { describe, expect, it } from 'vitest';
import type { AutoFitContentMetricsInput, ExplicitAutoFitInput } from './autofit-columns.js';
import { computeAutoFitColumnWidths } from './autofit-columns.js';
import type { WorkingTableGridInput } from './autofit-normalize.js';
import type { FixedLayoutResult } from './fixed-table-columns.js';

describe('computeAutoFitColumnWidths', () => {
  it('defaults omitted layout mode to autofit on the legacy compatibility path', () => {
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
  });

  it('preserves fixed-layout results unchanged', () => {
    const result = computeAutoFitColumnWidths({
      workingInput: buildWorkingInput({
        layoutMode: 'fixed',
      }),
      fixedLayout: {
        columnWidths: [120, 180],
        totalWidth: 300,
        gridColumnCount: 2,
        preferredTableWidth: 300,
      },
      contentMetrics: buildContentMetrics([
        [
          { min: 40, max: 40 },
          { min: 40, max: 40 },
        ],
      ]),
    });

    expect(result.layoutMode).toBe('fixed');
    expect(result.columnWidths).toEqual([120, 180]);
    expect(result.totalWidth).toBe(300);
  });

  it('does not keep authored grid widths as an autofit floor', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 200,
          maxTableWidth: 200,
        }),
        fixedLayout: {
          columnWidths: [100, 100],
          totalWidth: 200,
          gridColumnCount: 2,
          preferredTableWidth: 200,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 40, max: 60 },
            { min: 120, max: 200 },
          ],
        ]),
      }),
    );

    expect(result.columnWidths[0]).toBeLessThan(100);
    expect(result.columnWidths[1]).toBeGreaterThan(result.columnWidths[0]);
    expect(result.totalWidth).toBe(200);
  });

  it('preserves tblW auto authored grid when content already fits', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: undefined,
          preserveAutoGrid: true,
          maxTableWidth: 624,
          preferredColumnWidths: [290, 152],
          gridColumnCount: 2,
        }),
        fixedLayout: {
          columnWidths: [290, 152],
          totalWidth: 442,
          gridColumnCount: 2,
          preferredTableWidth: undefined,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 200, max: 318 },
            { min: 112, max: 123 },
          ],
        ]),
      }),
    );

    expect(result.columnWidths).toEqual([290, 152]);
    expect(result.totalWidth).toBe(442);
  });

  it('still grows tblW auto authored grid when content minimums require it', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: undefined,
          preserveAutoGrid: true,
          maxTableWidth: 500,
          preferredColumnWidths: [50, 50],
          gridColumnCount: 2,
        }),
        fixedLayout: {
          columnWidths: [50, 50],
          totalWidth: 100,
          gridColumnCount: 2,
          preferredTableWidth: undefined,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 40, max: 60 },
            { min: 180, max: 220 },
          ],
        ]),
      }),
    );

    expect(result.columnWidths[0]).toBeGreaterThanOrEqual(40);
    expect(result.columnWidths[0]).toBeLessThanOrEqual(50);
    expect(result.columnWidths[1]).toBeGreaterThanOrEqual(180);
    expect(result.totalWidth).toBeGreaterThan(100);
  });

  it('redistributes uniform tblW auto grids by content', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: undefined,
          maxTableWidth: 624,
          preferredColumnWidths: [156, 156, 156, 156],
          gridColumnCount: 4,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 4,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: undefined },
                { startColumn: 1, span: 1, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
                { startColumn: 3, span: 1, preferredWidth: undefined },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [156, 156, 156, 156],
          totalWidth: 624,
          gridColumnCount: 4,
          preferredTableWidth: undefined,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 80, max: 193.5 },
            { min: 60, max: 70 },
            { min: 60, max: 75 },
            { min: 60, max: 75 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBeCloseTo(624, 3);
    expect(result.columnWidths[0]).toBeGreaterThan(193.5);
    expect(result.columnWidths[1]).toBeLessThan(156);
    expect(result.columnWidths[2]).toBeLessThan(156);
    expect(result.columnWidths[3]).toBeLessThan(156);
  });

  it('keeps a fitting uniform tblW auto grid within its width budget when tcW preferences overflow it', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: withAutoGridWidthBudget(
          buildWorkingInput({
            preferredTableWidth: undefined,
            maxTableWidth: 576,
            preferredColumnWidths: [144, 144, 144, 144],
            gridColumnCount: 4,
            rows: [
              buildAutoGridRow([240, 76.8, 144, 288]),
              buildAutoGridRow([240, 76.8, 144, 288]),
              buildAutoGridRow([144, 144, 144, 144]),
            ],
          }),
          576,
        ),
        fixedLayout: {
          columnWidths: [240, 144, 144, 288],
          totalWidth: 816,
          gridColumnCount: 4,
          preferredTableWidth: undefined,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 40, max: 160, preferredWidth: 240 },
            { min: 40, max: 80, preferredWidth: 76.8 },
            { min: 40, max: 120, preferredWidth: 144 },
            { min: 40, max: 220, preferredWidth: 288 },
          ],
          [
            { min: 40, max: 160, preferredWidth: 240 },
            { min: 40, max: 80, preferredWidth: 76.8 },
            { min: 40, max: 120, preferredWidth: 144 },
            { min: 40, max: 220, preferredWidth: 288 },
          ],
          [
            { min: 40, max: 120, preferredWidth: 144 },
            { min: 40, max: 120, preferredWidth: 144 },
            { min: 40, max: 120, preferredWidth: 144 },
            { min: 40, max: 120, preferredWidth: 144 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBeLessThanOrEqual(576);
    expect(result.columnWidths[0]).toBeGreaterThan(result.columnWidths[1]);
    expect(result.columnWidths[3]).toBeGreaterThan(result.columnWidths[2]);
  });

  it('keeps a fitting non-uniform tblW auto grid within its width budget when tcW preferences overflow it', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: withAutoGridWidthBudget(
          buildWorkingInput({
            preferredTableWidth: undefined,
            preserveAutoGrid: true,
            maxTableWidth: 576,
            preferredColumnWidths: [180, 120, 276],
            gridColumnCount: 3,
            rows: [buildAutoGridRow([240, 144, 360])],
          }),
          576,
        ),
        fixedLayout: {
          columnWidths: [240, 144, 360],
          totalWidth: 744,
          gridColumnCount: 3,
          preferredTableWidth: undefined,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 60, max: 180, preferredWidth: 240 },
            { min: 60, max: 120, preferredWidth: 144 },
            { min: 60, max: 240, preferredWidth: 360 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBeLessThanOrEqual(576);
  });

  it('does not expand a narrower AutoFit table up to the grid budget', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: withAutoGridWidthBudget(
          buildWorkingInput({
            preferredTableWidth: undefined,
            maxTableWidth: 624,
            preferredColumnWidths: [312, 312],
            gridColumnCount: 2,
            rows: [buildAutoGridRow([259, 260])],
          }),
          624,
        ),
        fixedLayout: {
          columnWidths: [259, 260],
          totalWidth: 519,
          gridColumnCount: 2,
          preferredTableWidth: undefined,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 40, max: 120, preferredWidth: 259 },
            { min: 40, max: 160, preferredWidth: 260 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBeCloseTo(519, 3);
    expect(result.columnWidths[0]).toBeLessThan(312);
    expect(result.columnWidths[1]).toBeLessThan(312);
  });

  it('allows a tblW auto grid budget to grow only when content minimums require it', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: withAutoGridWidthBudget(
          buildWorkingInput({
            preferredTableWidth: undefined,
            maxTableWidth: 500,
            preferredColumnWidths: [100, 100, 100],
            gridColumnCount: 3,
            rows: [buildAutoGridRow([240, 100, 100])],
          }),
          300,
        ),
        fixedLayout: {
          columnWidths: [240, 100, 100],
          totalWidth: 440,
          gridColumnCount: 3,
          preferredTableWidth: undefined,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 260, max: 320, preferredWidth: 240 },
            { min: 80, max: 100, preferredWidth: 100 },
            { min: 80, max: 100, preferredWidth: 100 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBeGreaterThan(300);
    expect(result.totalWidth).toBeLessThanOrEqual(500);
    expect(result.columnWidths[0]).toBeGreaterThanOrEqual(260);
  });

  it('preserves explicit tblW AutoFit authored grid when content already fits', () => {
    const authoredWidths = [95.867, 472.533, 84.467];
    const tableWidth = authoredWidths.reduce((sum, width) => sum + width, 0);
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: tableWidth,
          preserveExplicitAutoGrid: true,
          maxTableWidth: 800,
          preferredColumnWidths: authoredWidths,
          gridColumnCount: 3,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: authoredWidths[0] },
                { startColumn: 1, span: 1, preferredWidth: authoredWidths[1] },
                { startColumn: 2, span: 1, preferredWidth: authoredWidths[2] },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: authoredWidths,
          totalWidth: tableWidth,
          gridColumnCount: 3,
          preferredTableWidth: tableWidth,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 70, max: 120, preferredWidth: authoredWidths[0] },
            { min: 200, max: 558, preferredWidth: authoredWidths[1] },
            { min: 25, max: 25, preferredWidth: authoredWidths[2] },
          ],
        ]),
      }),
    );

    expect(result.columnWidths).toEqual(authoredWidths);
    expect(result.totalWidth).toBeCloseTo(tableWidth, 3);
  });

  it('still redistributes explicit tblW AutoFit authored grids when content minimums require it', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 300,
          preserveExplicitAutoGrid: true,
          maxTableWidth: 500,
          preferredColumnWidths: [100, 100, 100],
          gridColumnCount: 3,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: 100 },
                { startColumn: 1, span: 1, preferredWidth: 100 },
                { startColumn: 2, span: 1, preferredWidth: 100 },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [100, 100, 100],
          totalWidth: 300,
          gridColumnCount: 3,
          preferredTableWidth: 300,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 40, max: 60, preferredWidth: 100 },
            { min: 180, max: 220, preferredWidth: 100 },
            { min: 40, max: 60, preferredWidth: 100 },
          ],
        ]),
      }),
    );

    expect(result.columnWidths[1]).toBeGreaterThanOrEqual(180);
    expect(result.columnWidths[0]).toBeLessThan(100);
    expect(result.columnWidths[2]).toBeLessThan(100);
    expect(result.totalWidth).toBe(300);
  });

  it('keeps content-fitting tables at tblW instead of shrinking to content maxima', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 400,
          maxTableWidth: 500,
        }),
        fixedLayout: {
          columnWidths: [200, 200],
          totalWidth: 400,
          gridColumnCount: 2,
          preferredTableWidth: 400,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 50, max: 80 },
            { min: 50, max: 80 },
          ],
        ]),
      }),
    );

    expect(result.columnWidths).toEqual([200, 200]);
    expect(result.totalWidth).toBe(400);
  });

  it('redistributes width toward the dominant content column even when no min-content trigger fires', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 640,
          maxTableWidth: 640,
          preferredColumnWidths: [160, 160, 160, 160],
          gridColumnCount: 4,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 4,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: undefined },
                { startColumn: 1, span: 1, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
                { startColumn: 3, span: 1, preferredWidth: undefined },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [160, 160, 160, 160],
          totalWidth: 640,
          gridColumnCount: 4,
          preferredTableWidth: 640,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 80, max: 192 },
            { min: 60, max: 80 },
            { min: 70, max: 95 },
            { min: 70, max: 95 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBe(640);
    expect(result.columnWidths[0]).toBeGreaterThan(192);
    expect(result.columnWidths[1]).toBeLessThan(160);
    expect(result.columnWidths[2]).toBeLessThan(160);
    expect(result.columnWidths[3]).toBeLessThan(160);
  });

  it('continues reshaping a fixed-width autofit table after all content already fits', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 624,
          maxTableWidth: 624,
          preferredColumnWidths: [156, 156, 156, 156],
          gridColumnCount: 4,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 4,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: undefined },
                { startColumn: 1, span: 1, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
                { startColumn: 3, span: 1, preferredWidth: undefined },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [156, 156, 156, 156],
          totalWidth: 624,
          gridColumnCount: 4,
          preferredTableWidth: 624,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 80, max: 193.5 },
            { min: 60, max: 70 },
            { min: 60, max: 75 },
            { min: 60, max: 75 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBeCloseTo(624, 3);
    expect(result.columnWidths[0]).toBeGreaterThan(193.5);
    expect(result.columnWidths[1]).toBeLessThan(140);
    expect(result.columnWidths[2]).toBeLessThan(140);
    expect(result.columnWidths[3]).toBeLessThan(140);
  });

  it('lets single-span preferred widths override content maxima downward', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 300,
          maxTableWidth: 500,
          preferredColumnWidths: [300],
          gridColumnCount: 1,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 1,
              cells: [{ startColumn: 0, span: 1, preferredWidth: 150 }],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [300],
          totalWidth: 300,
          gridColumnCount: 1,
          preferredTableWidth: 300,
        },
        contentMetrics: buildContentMetrics([[{ min: 50, max: 300, preferredWidth: 150 }]]),
      }),
    );

    expect(result.columnWidths).toEqual([300]);
    expect(result.totalWidth).toBe(300);
  });

  it('enforces multi-span preferred widths in both shrink and grow directions', () => {
    const shrinkResult = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 280,
          maxTableWidth: 500,
          preferredColumnWidths: [140, 140],
          gridColumnCount: 2,
        }),
        fixedLayout: {
          columnWidths: [140, 140],
          totalWidth: 280,
          gridColumnCount: 2,
          preferredTableWidth: 280,
        },
        contentMetrics: buildContentMetrics([[{ span: 2, min: 100, max: 280, preferredWidth: 200 }]]),
      }),
    );

    const growResult = computeAutoFitColumnWidths(
      buildExplicitInput({
        fixedLayout: {
          columnWidths: [80, 80],
          totalWidth: 160,
          gridColumnCount: 2,
          preferredTableWidth: 240,
        },
        workingInput: buildWorkingInput({
          preferredTableWidth: 240,
          maxTableWidth: 500,
        }),
        contentMetrics: buildContentMetrics([[{ span: 2, min: 100, max: 120, preferredWidth: 240 }]]),
      }),
    );

    expect(shrinkResult.totalWidth).toBe(280);
    expect(shrinkResult.columnWidths[0] + shrinkResult.columnWidths[1]).toBe(280);
    expect(growResult.columnWidths[0] + growResult.columnWidths[1]).toBe(240);
  });

  it('uses shrink-capacity-based proportional shrink when triggers fire', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 260,
          maxTableWidth: 260,
          preferredColumnWidths: [140, 60, 60],
          gridColumnCount: 3,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: undefined },
                { startColumn: 1, span: 1, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [140, 60, 60],
          totalWidth: 260,
          gridColumnCount: 3,
          preferredTableWidth: 260,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 80, max: 100 },
            { min: 50, max: 80 },
            { min: 120, max: 220 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBe(260);
    expect(result.columnWidths[2]).toBeGreaterThan(60);
    expect(result.columnWidths[0]).toBeLessThan(140);
    expect(result.columnWidths[1]).toBeGreaterThanOrEqual(50);
  });

  it('resolves multiple constrained columns jointly without order dependence', () => {
    const first = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 360,
          maxTableWidth: 360,
          preferredColumnWidths: [120, 120, 120],
          gridColumnCount: 3,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: undefined },
                { startColumn: 1, span: 1, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [120, 120, 120],
          totalWidth: 360,
          gridColumnCount: 3,
          preferredTableWidth: 360,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 140, max: 200 },
            { min: 60, max: 80 },
            { min: 130, max: 180 },
          ],
        ]),
      }),
    );

    const reversed = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 360,
          maxTableWidth: 360,
          preferredColumnWidths: [120, 120, 120],
          gridColumnCount: 3,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [
                { startColumn: 0, span: 1, preferredWidth: undefined },
                { startColumn: 1, span: 1, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [120, 120, 120],
          totalWidth: 360,
          gridColumnCount: 3,
          preferredTableWidth: 360,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 130, max: 180 },
            { min: 60, max: 80 },
            { min: 140, max: 200 },
          ],
        ]),
      }),
    );

    expect(first.totalWidth).toBe(360);
    expect(reversed.totalWidth).toBe(360);
    expect(first.columnWidths.slice().sort((a, b) => a - b)).toEqual(
      reversed.columnWidths.slice().sort((a, b) => a - b),
    );
  });

  it('recomputes overlapping trigger headroom so shared columns do not overshoot span maxima', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 300,
          maxTableWidth: 360,
          preferredColumnWidths: [100, 100, 100],
          gridColumnCount: 3,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [{ startColumn: 0, span: 2, preferredWidth: undefined }],
            },
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [{ startColumn: 1, span: 1, preferredWidth: undefined }],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [100, 100, 100],
          totalWidth: 300,
          gridColumnCount: 3,
          preferredTableWidth: 300,
        },
        contentMetrics: buildContentMetrics([[{ span: 2, min: 201, max: 240 }], [{ min: 101, max: 140 }]]),
      }),
    );

    expect(result.columnWidths[0] + result.columnWidths[1]).toBeLessThanOrEqual(240.001);
  });

  it('keeps the strongest exact-span trigger across repeated row patterns', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 300,
          maxTableWidth: 300,
          preferredColumnWidths: [100, 100, 100],
          gridColumnCount: 3,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [
                { startColumn: 0, span: 2, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
              ],
            },
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 3,
              cells: [
                { startColumn: 0, span: 2, preferredWidth: undefined },
                { startColumn: 2, span: 1, preferredWidth: undefined },
              ],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [100, 100, 100],
          totalWidth: 300,
          gridColumnCount: 3,
          preferredTableWidth: 300,
        },
        contentMetrics: buildContentMetrics([
          [
            { span: 2, min: 201, max: 230 },
            { min: 20, max: 20 },
          ],
          [
            { span: 2, min: 201, max: 280 },
            { min: 20, max: 20 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBe(300);
    expect(result.columnWidths[0] + result.columnWidths[1]).toBeCloseTo(280, 3);
    expect(result.columnWidths[2]).toBeCloseTo(20, 3);
  });

  it('does not redistribute remaining slack into protected columns when no growable columns remain', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 300,
          maxTableWidth: 300,
          preferredColumnWidths: [100, 100],
          gridColumnCount: 2,
          rows: [
            {
              skippedBefore: [],
              skippedAfter: [],
              skippedColumns: [],
              logicalColumnCount: 2,
              cells: [{ startColumn: 0, span: 2, preferredWidth: undefined }],
            },
          ],
        }),
        fixedLayout: {
          columnWidths: [100, 100],
          totalWidth: 200,
          gridColumnCount: 2,
          preferredTableWidth: 300,
        },
        contentMetrics: buildContentMetrics([[{ span: 2, min: 201, max: 240 }]]),
      }),
    );

    expect(result.columnWidths[0] + result.columnWidths[1]).toBeCloseTo(240, 3);
    expect(result.totalWidth).toBeCloseTo(240, 3);
  });

  it('redistributes remaining slack back to tblW after trigger handling', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 320,
          maxTableWidth: 500,
        }),
        fixedLayout: {
          columnWidths: [120, 120, 80],
          totalWidth: 320,
          gridColumnCount: 3,
          preferredTableWidth: 320,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 150, max: 200 },
            { min: 40, max: 80 },
            { min: 40, max: 80 },
          ],
        ]),
      }),
    );

    expect(result.totalWidth).toBe(320);
  });

  it('targets content max for trigger columns where possible', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 200,
          maxTableWidth: 200,
        }),
        fixedLayout: {
          columnWidths: [100, 100],
          totalWidth: 200,
          gridColumnCount: 2,
          preferredTableWidth: 200,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 140, max: 220 },
            { min: 20, max: 40 },
          ],
        ]),
      }),
    );

    expect(result.columnWidths[0]).toBeCloseTo(180, 3);
    expect(result.columnWidths[1]).toBeCloseTo(20, 3);
    expect(result.totalWidth).toBe(200);
  });

  it('grows the table beyond tblW up to page width when triggers still have headroom', () => {
    const result = computeAutoFitColumnWidths(
      buildExplicitInput({
        workingInput: buildWorkingInput({
          preferredTableWidth: 200,
          maxTableWidth: 500,
        }),
        fixedLayout: {
          columnWidths: [100, 100],
          totalWidth: 200,
          gridColumnCount: 2,
          preferredTableWidth: 200,
        },
        contentMetrics: buildContentMetrics([
          [
            { min: 140, max: 220 },
            { min: 20, max: 40 },
          ],
        ]),
      }),
    );

    expect(result.columnWidths[0]).toBeCloseTo(220, 3);
    expect(result.columnWidths[1]).toBeCloseTo(20, 3);
    expect(result.totalWidth).toBeCloseTo(240, 3);
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

function buildExplicitInput(overrides: Partial<ExplicitAutoFitInput>): ExplicitAutoFitInput {
  const workingInput = overrides.workingInput ?? buildWorkingInput();
  const fixedLayout =
    overrides.fixedLayout ??
    ({
      columnWidths: [100, 100],
      totalWidth: 200,
      gridColumnCount: 2,
      preferredTableWidth: workingInput.preferredTableWidth,
    } satisfies FixedLayoutResult);

  return {
    workingInput,
    fixedLayout,
    contentMetrics:
      overrides.contentMetrics ??
      buildContentMetrics([
        [
          { min: 40, max: 40 },
          { min: 40, max: 40 },
        ],
      ]),
    minColumnWidth: overrides.minColumnWidth,
  };
}

function buildWorkingInput(overrides: Partial<WorkingTableGridInput> = {}): WorkingTableGridInput {
  return {
    layoutMode: 'autofit',
    maxTableWidth: 500,
    preferredTableWidth: 200,
    preferredColumnWidths: [100, 100],
    gridColumnCount: 2,
    rows: [
      {
        skippedBefore: [],
        skippedAfter: [],
        skippedColumns: [],
        logicalColumnCount: 2,
        cells: [
          { startColumn: 0, span: 1, preferredWidth: undefined },
          { startColumn: 1, span: 1, preferredWidth: undefined },
        ],
      },
    ],
    ...overrides,
  };
}

function withAutoGridWidthBudget(workingInput: WorkingTableGridInput, budget: number): WorkingTableGridInput {
  return {
    ...workingInput,
    autoGridWidthBudget: budget,
  } as WorkingTableGridInput;
}

function buildAutoGridRow(preferredWidths: number[]): WorkingTableGridInput['rows'][number] {
  return {
    skippedBefore: [],
    skippedAfter: [],
    skippedColumns: [],
    logicalColumnCount: preferredWidths.length,
    cells: preferredWidths.map((preferredWidth, startColumn) => ({
      startColumn,
      span: 1,
      preferredWidth,
    })),
  };
}

function buildContentMetrics(
  rows: Array<Array<{ span?: number; min: number; max: number; preferredWidth?: number }>>,
): AutoFitContentMetricsInput {
  return {
    rowMetrics: rows.map((row, rowIndex) => ({
      rowIndex,
      cells: row.map((cell, cellIndex) => ({
        cellIndex,
        span: cell.span ?? 1,
        preferredWidth: cell.preferredWidth,
        minContentWidth: cell.min,
        maxContentWidth: cell.max,
      })),
    })),
  };
}
