import { describe, expect, it, vi } from 'vitest';

import { incrementalLayout } from '../src/incrementalLayout';

import type { FlowBlock, Measure, SectionBreakBlock } from '@superdoc/contracts';

const makeParagraph = (id: string, text: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
});

const makeParagraphMeasure = (lineHeight: number, runLength: number, maxWidth: number): Measure => ({
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: runLength,
      width: Math.min(maxWidth, runLength * 7),
      ascent: lineHeight * 0.8,
      descent: lineHeight * 0.2,
      lineHeight,
      maxWidth,
    },
  ],
  totalHeight: lineHeight,
});

describe('incrementalLayout semantic flow', () => {
  it('rewrites section-break columns to single-column semantic width before layout', async () => {
    const semanticMargins = { top: 24, right: 100, bottom: 36, left: 100 };
    const semanticContentWidth = 600;
    const semanticPageWidth = semanticContentWidth + semanticMargins.left + semanticMargins.right;

    const firstSectionBreak: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      type: 'continuous',
      attrs: { isFirstSection: true, source: 'sectPr' },
      // Intentionally narrow + multi-column: would reduce paragraph fragment width
      // without semantic rewrite in incrementalLayout.
      pageSize: { w: 320, h: 900 },
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
      columns: { count: 2, gap: 24 },
    };

    const paragraph = makeParagraph('p-1', 'Semantic section rewrite keeps this paragraph full-width.');
    const paragraphTextLength = paragraph.kind === 'paragraph' ? paragraph.runs[0].text.length : 1;

    const measureBlock = vi.fn(async (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => {
      if (block.kind !== 'paragraph') {
        throw new Error(`Unexpected block kind in test measure: ${block.kind}`);
      }
      return makeParagraphMeasure(20, paragraphTextLength, constraints.maxWidth);
    });

    const result = await incrementalLayout(
      [],
      null,
      [firstSectionBreak, paragraph],
      {
        flowMode: 'semantic',
        pageSize: { w: semanticPageWidth, h: 900 },
        margins: semanticMargins,
        semantic: {
          contentWidth: semanticContentWidth,
          marginTop: semanticMargins.top,
          marginBottom: semanticMargins.bottom,
        },
      },
      measureBlock,
    );

    const paragraphFragment = result.layout.pages
      .flatMap((page) => page.fragments)
      .find((fragment) => fragment.kind === 'para' && fragment.blockId === paragraph.id);

    expect(paragraphFragment).toBeDefined();
    expect(paragraphFragment?.width).toBe(semanticContentWidth);
  });

  it('skips header/footer layout work in semantic flow mode', async () => {
    const paragraph = makeParagraph('body-1', 'Body content');
    const headerParagraph = makeParagraph('header-1', 'Header content');

    const measureBlock = vi.fn(async (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => {
      if (block.kind !== 'paragraph') {
        throw new Error(`Unexpected block kind in test measure: ${block.kind}`);
      }
      const runLength = block.runs[0]?.text?.length ?? 1;
      return makeParagraphMeasure(20, runLength, constraints.maxWidth);
    });

    const headerMeasure = vi.fn(async (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => {
      if (block.kind !== 'paragraph') {
        throw new Error(`Unexpected header block kind in test measure: ${block.kind}`);
      }
      const runLength = block.runs[0]?.text?.length ?? 1;
      return makeParagraphMeasure(20, runLength, constraints.maxWidth);
    });

    const result = await incrementalLayout(
      [],
      null,
      [paragraph],
      {
        flowMode: 'semantic',
        pageSize: { w: 800, h: 900 },
        margins: { top: 40, right: 100, bottom: 40, left: 100 },
        semantic: { contentWidth: 600, marginTop: 40, marginBottom: 40 },
      },
      measureBlock,
      {
        headerBlocks: { default: [headerParagraph] },
        constraints: { width: 600, height: 80 },
        measure: headerMeasure,
      },
    );

    expect(result.headers).toBeUndefined();
    expect(result.footers).toBeUndefined();
    expect(headerMeasure).not.toHaveBeenCalled();
  });
});
