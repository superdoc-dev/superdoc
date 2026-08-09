import { describe, expect, it } from 'bun:test';
import type {
  FlowBlock,
  Layout,
  Line,
  Measure,
  ParagraphMeasure,
  SectionBreakBlock,
  TableBlock,
} from '@superdoc/contracts';
import { layoutDocument, layoutDocumentRange, type LayoutOptions } from './index.js';

const OPTIONS: LayoutOptions = {
  pageSize: { w: 400, h: 240 },
  margins: { top: 30, right: 30, bottom: 30, left: 30 },
};

function line(height: number): Line {
  return {
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: 0,
    width: 80,
    ascent: height * 0.8,
    descent: height * 0.2,
    lineHeight: height,
  };
}

function paragraphMeasure(height = 24): ParagraphMeasure {
  return { kind: 'paragraph', lines: [line(height)], totalHeight: height };
}

function paragraph(id: string): FlowBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [{ text: id, fontFamily: 'Arial', fontSize: 12 }],
  };
}

function pageBreak(id: string): FlowBlock {
  return { kind: 'pageBreak', id };
}

function pageFixture(pageCount: number): { blocks: FlowBlock[]; measures: Measure[]; fullLayout: Layout } {
  const blocks: FlowBlock[] = [];
  const measures: Measure[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    blocks.push(paragraph(`p-${pageIndex}`));
    measures.push(paragraphMeasure());
    if (pageIndex < pageCount - 1) {
      blocks.push(pageBreak(`break-${pageIndex}`));
      measures.push({ kind: 'pageBreak' });
    }
  }
  return { blocks, measures, fullLayout: layoutDocument(blocks, measures, OPTIONS) };
}

function pageGeometry(layout: Layout, pageIndex: number): unknown {
  const page = layout.pages[pageIndex];
  return {
    number: page?.number,
    fragments: page?.fragments.map((fragment) => ({
      blockId: fragment.blockId,
      x: fragment.x,
      y: fragment.y,
      width: fragment.width,
      height: 'height' in fragment ? fragment.height : undefined,
      fromLine: 'fromLine' in fragment ? fragment.fromLine : undefined,
      toLine: 'toLine' in fragment ? fragment.toLine : undefined,
    })),
  };
}

describe('layoutDocumentRange', () => {
  it('renders first, middle, lower, and tail page segments from checkpoints without prefix blocks', () => {
    const fixture = pageFixture(6);
    const targets = [
      { name: 'first', pageIndex: 0, sourceOrdinal: 0 },
      { name: 'middle', pageIndex: 2, sourceOrdinal: 4 },
      { name: 'lower', pageIndex: 4, sourceOrdinal: 8 },
      { name: 'tail', pageIndex: 5, sourceOrdinal: 10 },
    ];

    for (const target of targets) {
      const result = layoutDocumentRange({
        sourceSegment: {
          blocks: [fixture.blocks[target.sourceOrdinal]!],
          measures: [fixture.measures[target.sourceOrdinal]!],
          sourceRange: { startOrdinal: target.sourceOrdinal, endOrdinalExclusive: target.sourceOrdinal + 1 },
        },
        startingCheckpoint: {
          pageIndex: target.pageIndex,
          sourceOrdinal: target.sourceOrdinal,
          pageNumber: target.pageIndex + 1,
          pageSize: OPTIONS.pageSize,
          margins: OPTIONS.margins,
        },
        pageRange: { startPageIndex: target.pageIndex, endPageIndexExclusive: target.pageIndex + 1 },
        options: OPTIONS,
      });

      expect(result.exactness, target.name).toBe('exact');
      expect(
        result.pages.map((page) => page.pageIndex),
        target.name,
      ).toEqual([target.pageIndex]);
      expect(result.pages[0]?.sourceRange, target.name).toEqual({
        startOrdinal: target.sourceOrdinal,
        endOrdinalExclusive: target.sourceOrdinal + 1,
      });
      expect(pageGeometry(result.layout, 0), target.name).toEqual(pageGeometry(fixture.fullLayout, target.pageIndex));
      expect(result.diagnostics).toContain(
        `range-layout-source:checkpoint:${target.pageIndex}:${target.sourceOrdinal}`,
      );
    }
  });

  it('supports a single-column section transition segment', () => {
    const section: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'section-simple',
      type: 'nextPage',
      margins: { top: 30, right: 30, bottom: 30, left: 30 },
      columns: { count: 1, gap: 0 },
    };

    const result = layoutDocumentRange({
      sourceSegment: {
        blocks: [section, paragraph('after-section')],
        measures: [{ kind: 'sectionBreak' }, paragraphMeasure()],
        sourceRange: { startOrdinal: 12, endOrdinalExclusive: 14 },
      },
      startingCheckpoint: {
        pageIndex: 6,
        sourceOrdinal: 12,
        pageNumber: 7,
        pageSize: OPTIONS.pageSize,
        margins: OPTIONS.margins,
      },
      pageRange: { startPageIndex: 6, endPageIndexExclusive: 8 },
      options: OPTIONS,
    });

    expect(result.exactness).toBe('exact');
    expect(
      result.pages.some((page) => page.page.fragments.some((fragment) => fragment.blockId === 'after-section')),
    ).toBe(true);
  });

  it('invalidates incomplete lower-page boundaries', () => {
    const fixture = pageFixture(4);
    const result = layoutDocumentRange({
      sourceSegment: {
        blocks: [fixture.blocks[6]!],
        measures: [fixture.measures[6]!],
        sourceRange: { startOrdinal: 6, endOrdinalExclusive: 7 },
      },
      startingCheckpoint: {
        pageIndex: 1,
        sourceOrdinal: 2,
        pageNumber: 2,
        pageSize: OPTIONS.pageSize,
        margins: OPTIONS.margins,
      },
      pageRange: { startPageIndex: 3, endPageIndexExclusive: 4 },
      boundaryPolicy: 'degraded-on-incomplete-state',
      options: OPTIONS,
    });

    expect(result.exactness).toBe('degraded-unsupported');
    expect(result.diagnostics[0]).toBe('range-boundary-missing-preceding-context:degraded-on-incomplete-state:2:6');
  });

  it('invalidates same-page boundaries with missing source prefix context', () => {
    const fixture = pageFixture(3);
    const result = layoutDocumentRange({
      sourceSegment: {
        blocks: [fixture.blocks[3]!],
        measures: [fixture.measures[3]!],
        sourceRange: { startOrdinal: 3, endOrdinalExclusive: 4 },
      },
      startingCheckpoint: {
        pageIndex: 1,
        sourceOrdinal: 2,
        pageNumber: 2,
        pageSize: OPTIONS.pageSize,
        margins: OPTIONS.margins,
      },
      pageRange: { startPageIndex: 1, endPageIndexExclusive: 2 },
      boundaryPolicy: 'degraded-on-incomplete-state',
      options: OPTIONS,
    });

    expect(result.exactness).toBe('degraded-unsupported');
    expect(result.diagnostics[0]).toBe('range-boundary-missing-source-prefix:degraded-on-incomplete-state:2:3');
  });

  it('degrades unsupported hard shapes until a validated windowed policy proves them', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 'table-1',
      rows: [
        {
          id: 'row-0',
          cells: [{ id: 'cell-0-0', paragraph: { kind: 'paragraph', id: 'para-0-0', runs: [] } }],
        },
      ],
    };
    const tableMeasure: Measure = {
      kind: 'table',
      rows: [
        {
          cells: [{ paragraph: { kind: 'paragraph', lines: [], totalHeight: 40 }, width: 340, height: 40 }],
          height: 40,
        },
      ],
      columnWidths: [340],
      totalWidth: 340,
      totalHeight: 40,
    };

    const result = layoutDocumentRange({
      sourceSegment: {
        blocks: [table],
        measures: [tableMeasure],
        sourceRange: { startOrdinal: 20, endOrdinalExclusive: 21 },
      },
      startingCheckpoint: {
        pageIndex: 10,
        sourceOrdinal: 20,
        pageNumber: 11,
        pageSize: OPTIONS.pageSize,
        margins: OPTIONS.margins,
      },
      pageRange: { startPageIndex: 10, endPageIndexExclusive: 11 },
      options: OPTIONS,
    });

    expect(result.exactness).toBe('degraded-unsupported');
    expect(result.diagnostics).toEqual(['unsupported-range-layout-block:table:table-1']);
  });
});
