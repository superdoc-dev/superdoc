import { describe, expect, it } from 'vitest';
import type { FlowBlock, Measure, TableBlock, TableMeasure } from '@superdoc/contracts';
import { isAnchoredTableFullWidth, resolveFloatingTableAnchorResolution } from './floating-table-anchor.js';

describe('floating-table-anchor', () => {
  const makeParaMeasure = (height: number) => ({
    kind: 'paragraph' as const,
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 100,
        ascent: height * 0.8,
        descent: height * 0.2,
        lineHeight: height,
      },
    ],
    totalHeight: height,
  });

  const makeFloatingTable = (id: string, offsetV: number, wrap?: TableBlock['wrap']): TableBlock => ({
    kind: 'table',
    id,
    rows: [
      {
        id: `${id}-row`,
        cells: [{ id: `${id}-cell`, paragraph: { kind: 'paragraph', id: `${id}-p`, runs: [] } }],
      },
    ],
    anchor: { isAnchored: true, vRelativeFrom: 'paragraph', offsetV },
    wrap: wrap ?? { type: 'None' },
  });

  describe('isAnchoredTableFullWidth', () => {
    it('uses wrap distances from the document instead of a fixed slack constant', () => {
      const block = makeFloatingTable('exhibit', 0, {
        type: 'Square',
        distLeft: 12,
        distRight: 12,
      });
      const measure = {
        kind: 'table',
        rows: [],
        columnWidths: [30, 618],
        totalWidth: 647.8,
        totalHeight: 612,
      } as TableMeasure;

      expect(isAnchoredTableFullWidth(block, measure, 672)).toBe(true);
    });

    it('does not treat narrow form fields as full width', () => {
      const block = makeFloatingTable('field', 3.8);
      const measure = {
        kind: 'table',
        rows: [],
        columnWidths: [100],
        totalWidth: 100,
        totalHeight: 14,
      } as TableMeasure;

      expect(isAnchoredTableFullWidth(block, measure, 468)).toBe(false);
    });

    it('treats 100% pct tableWidth as full width when measured width is under the ratio threshold', () => {
      const block = makeFloatingTable('exhibit-pct', 0, { type: 'Square' });
      block.attrs = { tableWidth: { width: 5000, type: 'pct' } };
      const measure = {
        kind: 'table',
        rows: [],
        columnWidths: [640],
        totalWidth: 640,
        totalHeight: 100,
      } as TableMeasure;

      // Measured width + slack stays below columnWidth * 0.99 without the pct shortcut.
      expect(640 + 0.5 < 672 * 0.99).toBe(true);
      expect(isAnchoredTableFullWidth(block, measure, 672)).toBe(true);
    });
  });

  describe('resolveFloatingTableAnchorResolution', () => {
    const paragraphIndexById = new Map<string, number>();

    it('prefers explicit anchorParagraphId from import', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'spacer', runs: [] },
        makeFloatingTable('wrap-table', 0.07),
        { kind: 'paragraph', id: 'wrap-text', runs: [{ text: 'Text to right of the table' }] },
      ];
      blocks[1].attrs = { anchorParagraphId: 'wrap-text' };
      paragraphIndexById.set('wrap-text', 2);

      const measures: Measure[] = [
        makeParaMeasure(18),
        { kind: 'table', rows: [], columnWidths: [100], totalWidth: 100, totalHeight: 14 } as TableMeasure,
        makeParaMeasure(22),
      ];

      const resolution = resolveFloatingTableAnchorResolution(
        blocks,
        measures,
        blocks.length,
        1,
        blocks[1] as TableBlock,
        paragraphIndexById,
      );
      expect(resolution).toEqual({ paragraphIndex: 2, offsetV: 0.07 });
    });

    it('walks forward by measured paragraph heights for large tblpY', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'info', runs: [{ text: 'Long body copy.' }] },
        makeFloatingTable('field-1', 3.8),
        { kind: 'paragraph', id: 'yes-1', runs: [{ text: 'Yes' }] },
        { kind: 'paragraph', id: 'no-1', runs: [{ text: 'No' }] },
        makeFloatingTable('field-2', 56),
        { kind: 'paragraph', id: 'heading', runs: [{ text: 'Next question heading text.' }] },
        { kind: 'paragraph', id: 'yes-2', runs: [{ text: 'Yes – Please specify the assistance required' }] },
      ];
      const measures: Measure[] = [
        makeParaMeasure(67),
        { kind: 'table', rows: [], columnWidths: [100], totalWidth: 100, totalHeight: 14 } as TableMeasure,
        makeParaMeasure(17),
        makeParaMeasure(17),
        { kind: 'table', rows: [], columnWidths: [100], totalWidth: 100, totalHeight: 14 } as TableMeasure,
        makeParaMeasure(36),
        makeParaMeasure(17),
      ];

      const resolution = resolveFloatingTableAnchorResolution(
        blocks,
        measures,
        blocks.length,
        4,
        blocks[4] as TableBlock,
        new Map(),
      );

      expect(resolution?.paragraphIndex).toBe(6);
      expect(resolution?.offsetV).toBe(3.8);
    });

    it('targets the first option row after a multi-line heading (Form F3 hearing loop field)', () => {
      const makeMultiLineParaMeasure = (lineHeights: number[]) => ({
        kind: 'paragraph' as const,
        lines: lineHeights.map((lineHeight) => ({
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 0,
          width: 100,
          ascent: lineHeight * 0.8,
          descent: lineHeight * 0.2,
          lineHeight,
        })),
        totalHeight: lineHeights.reduce((sum, h) => sum + h, 0),
      });

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'info', runs: [{ text: 'Long body copy.' }] },
        makeFloatingTable('field-1', 3.8),
        { kind: 'paragraph', id: 'yes-prev', runs: [{ text: '☐ Yes – Specify language' }] },
        { kind: 'paragraph', id: 'no-prev', runs: [{ text: '☐ No' }] },
        makeFloatingTable('field-2', 56.27),
        {
          kind: 'paragraph',
          id: 'heading',
          runs: [
            {
              text: 'Does the employer require any special assistance at the hearing or conference (eg a hearing loop)?',
            },
          ],
        },
        { kind: 'paragraph', id: 'yes-2', runs: [{ text: '☐ Yes – Please specify the assistance required' }] },
        { kind: 'paragraph', id: 'no-2', runs: [{ text: '☐ No' }] },
      ];
      const measures: Measure[] = [
        makeParaMeasure(67),
        { kind: 'table', rows: [], columnWidths: [100], totalWidth: 100, totalHeight: 14 } as TableMeasure,
        makeParaMeasure(17),
        makeParaMeasure(17),
        { kind: 'table', rows: [], columnWidths: [100], totalWidth: 100, totalHeight: 14 } as TableMeasure,
        makeMultiLineParaMeasure([18, 19]),
        makeParaMeasure(17),
        makeParaMeasure(17),
      ];

      const resolution = resolveFloatingTableAnchorResolution(
        blocks,
        measures,
        blocks.length,
        4,
        blocks[4] as TableBlock,
        new Map(),
      );

      expect(resolution?.paragraphIndex).toBe(6);
      expect(resolution?.offsetV).toBe(3.8);
    });
  });
});
