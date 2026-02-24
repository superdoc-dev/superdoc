import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlock, ParagraphMeasure, SectionBreakBlock } from '@superdoc/contracts';
import { incrementalLayout, measureCache } from '../src/incrementalLayout';

const makeParagraph = (id: string, text: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
});

const makeSectionBreak = (id: string, left: number, right: number): SectionBreakBlock => ({
  kind: 'sectionBreak',
  id,
  margins: { top: 20, right, bottom: 20, left },
});

describe('incrementalLayout previous-measure reuse', () => {
  beforeEach(() => {
    measureCache.clear();
  });

  it('remeasures stable blocks when their section width changes even if global max constraints are unchanged', async () => {
    const options = {
      pageSize: { w: 300, h: 400 },
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      columns: { count: 1, gap: 0 },
    };

    const intro = makeParagraph('intro', 'Intro paragraph');
    const sectionBreakBefore = makeSectionBreak('section-1', 60, 140); // 100px content width
    const sectionBreakAfter = makeSectionBreak('section-1', 80, 140); // 80px content width
    const body = makeParagraph('body', 'Body paragraph');

    const previousBlocks: FlowBlock[] = [intro, sectionBreakBefore, body];
    const nextBlocks: FlowBlock[] = [intro, sectionBreakAfter, body];

    const measureBlock = vi.fn(async (_block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => {
      return {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 1,
            width: constraints.maxWidth,
            ascent: 8,
            descent: 2,
            lineHeight: 10,
          },
        ],
        totalHeight: 10,
      } satisfies ParagraphMeasure;
    });

    const firstPass = await incrementalLayout([], null, previousBlocks, options, measureBlock);
    const firstPassBodyMeasure = firstPass.measures[2] as ParagraphMeasure;
    expect(firstPassBodyMeasure.lines?.[0]?.width).toBe(100);

    measureBlock.mockClear();

    const secondPass = await incrementalLayout(
      previousBlocks,
      firstPass.layout,
      nextBlocks,
      options,
      measureBlock,
      undefined,
      firstPass.measures,
    );

    const secondPassBodyMeasure = secondPass.measures[2] as ParagraphMeasure;
    expect(secondPassBodyMeasure.lines?.[0]?.width).toBe(80);
    expect(measureBlock).toHaveBeenCalledTimes(1);
  });
});
