import { describe, expect, it } from 'vitest';
import type {
  ColumnBreakBlock,
  DrawingBlock,
  DrawingMeasure,
  FlowBlock,
  ImageBlock,
  ImageMeasure,
  Line,
  Measure,
  PageBreakBlock,
  ParagraphMeasure,
  SectionBreakBlock,
  TableBlock,
  TableMeasure,
} from '@superdoc/contracts';
import { layoutDocument, type LayoutOptions } from './index.js';

const DEFAULT_OPTIONS: LayoutOptions = {
  pageSize: { w: 500, h: 500 },
  margins: { top: 50, right: 50, bottom: 50, left: 50 },
};

const line = (lineHeight: number, width = 100): Line => ({
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 0,
  width,
  ascent: lineHeight * 0.8,
  descent: lineHeight * 0.2,
  lineHeight,
  maxWidth: width,
});

const paragraphMeasure = (heights: number[]): ParagraphMeasure => ({
  kind: 'paragraph',
  lines: heights.map((height) => line(height)),
  totalHeight: heights.reduce((sum, height) => sum + height, 0),
});

const paragraphBlock = (id: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [],
});

const tableBlock = (id: string): TableBlock => ({
  kind: 'table',
  id,
  rows: [
    {
      id: `${id}-row-1`,
      cells: [
        {
          id: `${id}-cell-1`,
          paragraph: {
            kind: 'paragraph',
            id: `${id}-cell-paragraph`,
            runs: [],
          },
        },
      ],
    },
  ],
});

const tableMeasure = (width: number, height: number): TableMeasure => ({
  kind: 'table',
  columnWidths: [width],
  rows: [
    {
      height,
      cells: [
        {
          width,
          height,
          paragraph: paragraphMeasure([height]),
        },
      ],
    },
  ],
  totalWidth: width,
  totalHeight: height,
});

describe('Measuring to Layout ownership contracts', () => {
  it('consumes paragraph measure lines for fragment line ranges and pagination', () => {
    const layout = layoutDocument([paragraphBlock('paragraph-contract')], [paragraphMeasure([120, 120, 120, 120])], {
      pageSize: { w: 400, h: 300 },
      margins: { top: 30, right: 30, bottom: 30, left: 30 },
    });

    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0].fragments[0]).toMatchObject({
      kind: 'para',
      blockId: 'paragraph-contract',
      fromLine: 0,
      toLine: 2,
      continuesOnNext: true,
    });
    expect(layout.pages[1].fragments[0]).toMatchObject({
      kind: 'para',
      blockId: 'paragraph-contract',
      fromLine: 2,
      toLine: 4,
      continuesFromPrev: true,
    });
  });

  it('uses image measures, not block dimensions, for image fragment size', () => {
    const block: ImageBlock = {
      kind: 'image',
      id: 'image-contract',
      src: 'image.png',
      width: 999,
      height: 999,
    };
    const measure: ImageMeasure = { kind: 'image', width: 120, height: 80 };

    const layout = layoutDocument([block], [measure], DEFAULT_OPTIONS);

    expect(layout.pages[0].fragments[0]).toMatchObject({
      kind: 'image',
      blockId: 'image-contract',
      width: 120,
      height: 80,
    });
  });

  it('uses drawing measures for drawing fragment geometry and size', () => {
    const block: DrawingBlock = {
      kind: 'drawing',
      id: 'drawing-contract',
      drawingKind: 'vectorShape',
      geometry: { width: 999, height: 999 },
    };
    const measure: DrawingMeasure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 140,
      height: 70,
      scale: 0.5,
      naturalWidth: 280,
      naturalHeight: 140,
      geometry: { width: 280, height: 140 },
    };

    const layout = layoutDocument([block], [measure], DEFAULT_OPTIONS);

    expect(layout.pages[0].fragments[0]).toMatchObject({
      kind: 'drawing',
      blockId: 'drawing-contract',
      drawingKind: 'vectorShape',
      width: 140,
      height: 70,
      scale: 0.5,
      geometry: { width: 280, height: 140 },
    });
  });

  it('uses table measures for table fragment dimensions and row range', () => {
    const block = tableBlock('table-contract');
    const measure = tableMeasure(180, 40);

    const layout = layoutDocument([block], [measure], DEFAULT_OPTIONS);

    expect(layout.pages[0].fragments[0]).toMatchObject({
      kind: 'table',
      blockId: 'table-contract',
      fromRow: 0,
      toRow: 1,
      width: 180,
      height: 40,
    });
  });

  it('consumes page and column break measures as layout control flow without fragments', () => {
    const pageBreak: PageBreakBlock = { kind: 'pageBreak', id: 'page-break' };
    const columnBreak: ColumnBreakBlock = { kind: 'columnBreak', id: 'column-break' };
    const blocks: FlowBlock[] = [
      paragraphBlock('p1'),
      columnBreak,
      paragraphBlock('p2'),
      pageBreak,
      paragraphBlock('p3'),
    ];
    const measures: Measure[] = [
      paragraphMeasure([20]),
      { kind: 'columnBreak' },
      paragraphMeasure([20]),
      { kind: 'pageBreak' },
      paragraphMeasure([20]),
    ];

    const layout = layoutDocument(blocks, measures, {
      ...DEFAULT_OPTIONS,
      columns: { count: 2, gap: 20 },
    });

    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0].fragments.map((fragment) => fragment.blockId)).toEqual(['p1', 'p2']);
    expect(layout.pages[1].fragments.map((fragment) => fragment.blockId)).toEqual(['p3']);
    expect(layout.pages[0].fragments[1].x).toBeGreaterThan(layout.pages[0].fragments[0].x);
  });

  it('consumes section break measures as layout control flow without fragments', () => {
    const firstSection: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb-first',
      attrs: { isFirstSection: true },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    };
    const nextPageSection: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb-next',
      type: 'nextPage',
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    };
    const blocks: FlowBlock[] = [firstSection, paragraphBlock('p1'), nextPageSection, paragraphBlock('p2')];
    const measures: Measure[] = [
      { kind: 'sectionBreak' },
      paragraphMeasure([20]),
      { kind: 'sectionBreak' },
      paragraphMeasure([20]),
    ];

    const layout = layoutDocument(blocks, measures, DEFAULT_OPTIONS);

    expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    const allBlockIds = layout.pages.flatMap((p) => p.fragments.map((f) => f.blockId));
    expect(allBlockIds).toEqual(['p1', 'p2']);
    expect(allBlockIds).not.toContain('sb-first');
    expect(allBlockIds).not.toContain('sb-next');
    expect(layout.pages[0].fragments[0]).toMatchObject({ kind: 'para', blockId: 'p1' });
    expect(layout.pages[1].fragments[0]).toMatchObject({ kind: 'para', blockId: 'p2' });
  });

  it('fails fast for mismatched FlowBlock and Measure kinds', () => {
    expect(() =>
      layoutDocument([paragraphBlock('paragraph-contract')], [{ kind: 'pageBreak' }], DEFAULT_OPTIONS),
    ).toThrow(/expected paragraph measure/);
  });

  // Today layoutDocument throws for ListBlock; when list layout lands, implement real
  // assertions (e.g. list-item fragments, marker metrics) and drop this todo.
  it.todo('consumes ListBlock + ListMeasure in layoutDocument (list-item fragments, marker widths, pagination)');
});
