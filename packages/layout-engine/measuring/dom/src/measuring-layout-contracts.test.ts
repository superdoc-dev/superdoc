import { describe, expect, it } from 'vitest';
import { measureBlock } from './index.js';
import type { DrawingBlock, FlowBlock, ListBlock, Measure, TableBlock } from '@superdoc/contracts';

const textRun = (text: string, fontSize = 16) => ({
  kind: 'text' as const,
  text,
  fontFamily: 'Arial',
  fontSize,
});

const expectMeasureKind = <TKind extends Measure['kind']>(
  measure: Measure,
  kind: TKind,
): Extract<Measure, { kind: TKind }> => {
  expect(measure.kind).toBe(kind);
  return measure as Extract<Measure, { kind: TKind }>;
};

describe('Measuring to Layout contract', () => {
  it('produces paragraph line geometry and total height for layout', async () => {
    const block: FlowBlock = {
      kind: 'paragraph',
      id: 'paragraph-contract',
      runs: [textRun('SuperDoc wraps this paragraph into measured lines.')],
    };

    const measure = expectMeasureKind(await measureBlock(block, 120), 'paragraph');

    expect(measure.lines.length).toBeGreaterThan(0);
    expect(measure.totalHeight).toBe(measure.lines.reduce((sum, line) => sum + line.lineHeight, 0));
    for (const line of measure.lines) {
      expect(line.width).toBeGreaterThanOrEqual(0);
      expect(line.lineHeight).toBeGreaterThan(0);
      expect(line.maxWidth).toBeGreaterThan(0);
    }
  });

  it('produces list item marker metrics and nested paragraph measures', async () => {
    const block: ListBlock = {
      kind: 'list',
      id: 'list-contract',
      listType: 'number',
      items: [
        {
          id: 'item-1',
          marker: { kind: 'number', text: '1.', level: 0, order: 1 },
          paragraph: {
            kind: 'paragraph',
            id: 'item-1-paragraph',
            runs: [textRun('A list item paragraph measured under the item content width.')],
            attrs: { indent: { left: 24, hanging: 18 } },
          },
        },
      ],
    };

    const measure = expectMeasureKind(await measureBlock(block, 220), 'list');

    expect(measure.items).toHaveLength(1);
    expect(measure.items[0]).toMatchObject({
      itemId: 'item-1',
      indentLeft: 24,
      paragraph: { kind: 'paragraph' },
    });
    expect(measure.items[0].markerTextWidth).toBeGreaterThan(0);
    expect(measure.items[0].markerWidth).toBeGreaterThanOrEqual(measure.items[0].markerTextWidth);
    expect(measure.totalHeight).toBe(measure.items[0].paragraph.totalHeight);
  });

  it('produces table row, cell, column, and nested content measures', async () => {
    const block: TableBlock = {
      kind: 'table',
      id: 'table-contract',
      columnWidths: [120],
      rows: [
        {
          id: 'row-1',
          cells: [
            {
              id: 'cell-1',
              blocks: [
                {
                  kind: 'paragraph',
                  id: 'cell-paragraph',
                  runs: [textRun('Nested cell paragraph')],
                },
                {
                  kind: 'image',
                  id: 'cell-image',
                  src: 'image.png',
                  width: 40,
                  height: 20,
                },
              ],
            },
          ],
        },
      ],
    };

    const measure = expectMeasureKind(await measureBlock(block, 240), 'table');

    expect(measure.columnWidths).toHaveLength(1);
    expect(measure.totalWidth).toBeGreaterThan(0);
    expect(measure.totalHeight).toBeGreaterThan(0);
    expect(measure.rows).toHaveLength(1);
    expect(measure.rows[0].cells).toHaveLength(1);
    expect(measure.rows[0].cells[0].blocks?.map((nested) => nested.kind)).toEqual(['paragraph', 'image']);
  });

  it('produces final image dimensions after measurement constraints', async () => {
    const block: FlowBlock = {
      kind: 'image',
      id: 'image-contract',
      src: 'image.png',
      width: 400,
      height: 200,
    };

    const measure = expectMeasureKind(await measureBlock(block, { maxWidth: 100, maxHeight: 80 }), 'image');

    expect(measure.width).toBe(100);
    expect(measure.height).toBe(50);
  });

  it('produces drawing geometry, scale, and natural size for layout', async () => {
    const block: DrawingBlock = {
      kind: 'drawing',
      id: 'drawing-contract',
      drawingKind: 'vectorShape',
      geometry: { width: 200, height: 100 },
    };

    const measure = expectMeasureKind(await measureBlock(block, { maxWidth: 100, maxHeight: 100 }), 'drawing');

    expect(measure).toMatchObject({
      drawingKind: 'vectorShape',
      width: 100,
      height: 50,
      scale: 0.5,
      naturalWidth: 200,
      naturalHeight: 100,
      geometry: { width: 200, height: 100 },
    });
  });

  it('produces zero-dimensional control measures for break blocks', async () => {
    await expect(measureBlock({ kind: 'sectionBreak', id: 'section-break', margins: {} }, 500)).resolves.toEqual({
      kind: 'sectionBreak',
    });
    await expect(measureBlock({ kind: 'pageBreak', id: 'page-break' }, 500)).resolves.toEqual({ kind: 'pageBreak' });
    await expect(measureBlock({ kind: 'columnBreak', id: 'column-break' }, 500)).resolves.toEqual({
      kind: 'columnBreak',
    });
  });
});
