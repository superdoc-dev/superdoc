import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableCell } from '@superdoc/contracts';
import type { TableBlock } from '@superdoc/contracts';
import { measureBlock } from './index.js';
import { buildAutoFitWorkingGridInput } from './autofit-normalize.js';
import {
  clearTableAutoFitMeasurementCaches,
  measureTableAutoFitContentMetrics,
  measureTableCellContentMetrics,
} from './table-autofit-metrics.js';

describe('table-autofit-metrics', () => {
  beforeEach(() => {
    clearTableAutoFitMeasurementCaches();
  });

  it('uses the widest unbreakable token for cell min width', async () => {
    const cell: TableCell = {
      id: 'cell-token',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-token',
          runs: [{ text: 'Short SuperLongVINToken-12345 tiny', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const longestTokenCell: TableCell = {
      id: 'cell-longest-token',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-longest-token',
          runs: [{ text: 'SuperLongVINToken', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const metrics = await measureTableCellContentMetrics(cell, { maxWidth: 400, measureBlock });
    const expected = await measureTableCellContentMetrics(longestTokenCell, { maxWidth: 400, measureBlock });

    expect(metrics.minWidthPx).toBeCloseTo(expected.maxWidthPx, 3);
    expect(metrics.maxWidthPx).toBeGreaterThan(metrics.minWidthPx);
  });

  it('keeps explicit line breaks when computing no-wrap max width', async () => {
    const wrappedCell: TableCell = {
      id: 'cell-breaks',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-breaks',
          runs: [{ text: 'LongestLine\nTiny', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const singleLineCell: TableCell = {
      id: 'cell-single-line',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-single-line',
          runs: [{ text: 'LongestLine', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const metrics = await measureTableCellContentMetrics(wrappedCell, { maxWidth: 400, measureBlock });
    const expected = await measureTableCellContentMetrics(singleLineCell, { maxWidth: 400, measureBlock });

    expect(metrics.maxWidthPx).toBeCloseTo(expected.maxWidthPx, 3);
  });

  it('takes the widest paragraph across multi-paragraph cells', async () => {
    const multiParagraphCell: TableCell = {
      id: 'cell-multi-paragraph',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-short',
          runs: [{ text: 'Short', fontFamily: 'Arial', fontSize: 12 }],
        },
        {
          kind: 'paragraph',
          id: 'para-long',
          runs: [{ text: 'MuchMuchLongerParagraph', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const widestParagraphCell: TableCell = {
      id: 'cell-widest-paragraph',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-widest',
          runs: [{ text: 'MuchMuchLongerParagraph', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const metrics = await measureTableCellContentMetrics(multiParagraphCell, { maxWidth: 400, measureBlock });
    const expected = await measureTableCellContentMetrics(widestParagraphCell, { maxWidth: 400, measureBlock });

    expect(metrics.minWidthPx).toBeCloseTo(expected.minWidthPx, 3);
    expect(metrics.maxWidthPx).toBeCloseTo(expected.maxWidthPx, 3);
  });

  it('treats image blocks as atomic min/max contributors and adds horizontal chrome', async () => {
    const cell: TableCell = {
      id: 'cell-image',
      attrs: {
        padding: { left: 5, right: 7, top: 0, bottom: 0 },
        borders: {
          left: { style: 'single', width: 2 },
          right: { style: 'single', width: 3 },
        },
      },
      blocks: [
        {
          kind: 'image',
          id: 'image-0',
          src: 'data:image/png;base64,abc',
          width: 120,
          height: 40,
        },
      ],
    };

    const metrics = await measureTableCellContentMetrics(cell, { maxWidth: 400, measureBlock });

    expect(metrics.minWidthPx).toBe(137);
    expect(metrics.maxWidthPx).toBe(137);
  });

  it('measures nested percentage tables against the containing cell width', async () => {
    const cell: TableCell = {
      id: 'cell-nested-table',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'table',
          id: 'nested-table',
          attrs: {
            tableWidth: { value: 2500, type: 'pct' },
          },
          columnWidths: [100],
          rows: [
            {
              id: 'nested-row-0',
              cells: [
                {
                  id: 'nested-cell-0-0',
                  blocks: [
                    {
                      kind: 'paragraph',
                      id: 'nested-para-0',
                      runs: [{ text: 'Nested', fontFamily: 'Arial', fontSize: 12 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const metricsAt200 = await measureTableCellContentMetrics(cell, { maxWidth: 200, measureBlock });
    const metricsAt600 = await measureTableCellContentMetrics(cell, { maxWidth: 600, measureBlock });

    expect(metricsAt200.minWidthPx).toBe(100);
    expect(metricsAt200.maxWidthPx).toBe(100);
    expect(metricsAt600.minWidthPx).toBe(300);
    expect(metricsAt600.maxWidthPx).toBe(300);
  });

  it('treats non-breaking hyphenated text as a single unbreakable token', async () => {
    const cell: TableCell = {
      id: 'cell-nonbreaking-hyphen',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-nonbreaking-hyphen',
          runs: [{ text: 'part\u2011number', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const expectedCell: TableCell = {
      id: 'cell-nonbreaking-hyphen-expected',
      attrs: {
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-nonbreaking-hyphen-expected',
          runs: [{ text: 'part\u2011number', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const metrics = await measureTableCellContentMetrics(cell, { maxWidth: 400, measureBlock });
    const expected = await measureTableCellContentMetrics(expectedCell, { maxWidth: 400, measureBlock });

    expect(metrics.minWidthPx).toBeCloseTo(expected.maxWidthPx, 3);
  });

  it('reuses cached cell metrics and invalidates when cell content changes', async () => {
    const measuringSpy = vi.fn(measureBlock);

    const originalCell: TableCell = {
      id: 'cell-cache',
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-cache',
          runs: [{ text: 'Original', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const changedCell: TableCell = {
      id: 'cell-cache',
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-cache',
          runs: [{ text: 'ChangedContent', fontFamily: 'Arial', fontSize: 12 }],
        },
      ],
    };

    const first = await measureTableCellContentMetrics(originalCell, { maxWidth: 400, measureBlock: measuringSpy });
    const second = await measureTableCellContentMetrics(originalCell, { maxWidth: 400, measureBlock: measuringSpy });
    const changed = await measureTableCellContentMetrics(changedCell, { maxWidth: 400, measureBlock: measuringSpy });

    expect(first).toEqual(second);
    expect(measuringSpy).toHaveBeenCalledTimes(2);
    expect(changed.maxWidthPx).toBeGreaterThan(first.maxWidthPx);
  });

  it('invalidates cached cell metrics when the available width changes', async () => {
    const measuringSpy = vi.fn(measureBlock);
    const cell: TableCell = {
      id: 'cell-cache-width',
      blocks: [
        {
          kind: 'paragraph',
          id: 'para-cache-width',
          runs: [{ text: 'Nested width-sensitive content', fontFamily: 'Arial', fontSize: 12 }],
        },
        {
          kind: 'table',
          id: 'nested-width-sensitive-table',
          attrs: {
            tableWidth: { value: 2500, type: 'pct' },
          },
          columnWidths: [100],
          rows: [
            {
              id: 'nested-width-sensitive-row',
              cells: [
                {
                  id: 'nested-width-sensitive-cell',
                  blocks: [
                    {
                      kind: 'paragraph',
                      id: 'nested-width-sensitive-para',
                      runs: [{ text: 'Nested', fontFamily: 'Arial', fontSize: 12 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    await measureTableCellContentMetrics(cell, { maxWidth: 400, measureBlock: measuringSpy });
    await measureTableCellContentMetrics(cell, { maxWidth: 400, measureBlock: measuringSpy });
    await measureTableCellContentMetrics(cell, { maxWidth: 800, measureBlock: measuringSpy });

    expect(measuringSpy).toHaveBeenCalledTimes(4);
  });

  it('returns a stable row/cell-indexed metrics shape for normalized tables', async () => {
    const table: TableBlock = {
      kind: 'table',
      id: 'table-row-metrics',
      attrs: {
        tableWidth: { value: 400, type: 'px' },
      },
      columnWidths: [120, 120],
      rows: [
        {
          id: 'row-0',
          cells: [
            {
              id: 'cell-0-0',
              blocks: [
                {
                  kind: 'paragraph',
                  id: 'para-0-0',
                  runs: [{ text: 'Short', fontFamily: 'Arial', fontSize: 12 }],
                },
              ],
            },
            {
              id: 'cell-0-1',
              blocks: [
                {
                  kind: 'paragraph',
                  id: 'para-0-1',
                  runs: [{ text: 'Longer cell content', fontFamily: 'Arial', fontSize: 12 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const workingInput = buildAutoFitWorkingGridInput(table, { maxWidth: 400 });
    const metrics = await measureTableAutoFitContentMetrics(table, workingInput, measureBlock);

    expect(metrics.rowMetrics).toHaveLength(1);
    expect(metrics.rowMetrics[0].rowIndex).toBe(0);
    expect(metrics.rowMetrics[0].cells.map((cell) => cell.cellIndex)).toEqual([0, 1]);
    expect(metrics.rowMetrics[0].cells[0].span).toBe(1);
    expect(metrics.rowMetrics[0].cells[1].span).toBe(1);
    expect(metrics.rows).toHaveLength(1);
    expect(metrics.rows[0].cells).toHaveLength(2);
    expect(metrics.cellMetricKeys).toHaveLength(2);
  });

  it('preserves nested percentage width measurement through the table-level metrics helper', async () => {
    const table: TableBlock = {
      kind: 'table',
      id: 'table-nested-pct-helper',
      attrs: {
        tableWidth: { value: 400, type: 'px' },
      },
      columnWidths: [200],
      rows: [
        {
          id: 'row-0',
          cells: [
            {
              id: 'cell-0-0',
              blocks: [
                {
                  kind: 'table',
                  id: 'nested-table-helper',
                  attrs: {
                    tableWidth: { value: 2500, type: 'pct' },
                  },
                  columnWidths: [100],
                  rows: [
                    {
                      id: 'nested-row-0',
                      cells: [
                        {
                          id: 'nested-cell-0-0',
                          blocks: [
                            {
                              kind: 'paragraph',
                              id: 'nested-para-helper',
                              runs: [{ text: 'Nested', fontFamily: 'Arial', fontSize: 12 }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const workingInput = buildAutoFitWorkingGridInput(table, { maxWidth: 400 });
    const metrics = await measureTableAutoFitContentMetrics(table, workingInput, measureBlock);

    expect(metrics.rowMetrics[0].cells[0].minContentWidth).toBe(204);
    expect(metrics.rowMetrics[0].cells[0].maxContentWidth).toBe(204);
    expect(metrics.rows[0].cells[0].minContentWidth).toBe(204);
    expect(metrics.rows[0].cells[0].maxContentWidth).toBe(204);
  });
});
