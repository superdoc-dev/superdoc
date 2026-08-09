/**
 * atomic-first-page — provisional vs exact measure-cache identity.
 *
 * A provisional (partial-pagination) header/footer layout preserves
 * source-cached NUMPAGES/SECTIONPAGES text, so its measured line widths can
 * differ from the exact layout of the SAME blocks. The two modes must never
 * share measure-cache entries: the resolved field text can coincide today and
 * diverge after the exact repaint.
 */

import { describe, expect, it, vi } from 'vite-plus/test';
import type { FlowBlock, Measure, ParagraphBlock, TextRun } from '@superdoc/contracts';
import { HeaderFooterLayoutCache, layoutHeaderFooterWithCache } from '../src/layoutHeaderFooter';

const CONSTRAINTS = {
  width: 624,
  height: 96,
  pageWidth: 816,
  pageHeight: 1056,
  margins: { top: 96, right: 96, bottom: 96, left: 96, header: 48, footer: 48 },
};

function footerBlocks(): FlowBlock[] {
  return [
    {
      kind: 'paragraph',
      id: 'ftr-p-1',
      runs: [
        { text: 'Page ', fontFamily: 'Arial', fontSize: 12 },
        { text: '0', token: 'pageNumber', fontFamily: 'Arial', fontSize: 12 } as TextRun,
        { text: ' of ', fontFamily: 'Arial', fontSize: 12 },
        { text: '12', token: 'totalPageCount', fontFamily: 'Arial', fontSize: 12 } as TextRun,
      ],
    } as ParagraphBlock,
  ];
}

const measureBlock = vi.fn(
  async (block: FlowBlock): Promise<Measure> => ({
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: (block as ParagraphBlock).runs.length - 1,
        toChar: 0,
        width: 100,
        ascent: 8,
        descent: 2,
        lineHeight: 12,
      },
    ],
    totalHeight: 12,
  }),
);

describe('atomic-first-page — provisional/exact measure-cache separation', () => {
  it('never reuses provisional measures for an exact layout of the same blocks (and vice versa)', async () => {
    const cache = new HeaderFooterLayoutCache();

    measureBlock.mockClear();
    await layoutHeaderFooterWithCache(
      { default: footerBlocks() },
      CONSTRAINTS,
      measureBlock,
      cache,
      1,
      undefined,
      'footer',
      'font-sig-1',
      undefined,
      { pageCountFieldsExact: false },
    );
    const provisionalMeasures = measureBlock.mock.calls.length;
    expect(provisionalMeasures).toBeGreaterThan(0);

    // Same blocks, same font signature, same constraints — exact mode must
    // re-measure rather than replay the provisional entries.
    await layoutHeaderFooterWithCache(
      { default: footerBlocks() },
      CONSTRAINTS,
      measureBlock,
      cache,
      1,
      undefined,
      'footer',
      'font-sig-1',
      undefined,
    );
    expect(measureBlock.mock.calls.length).toBeGreaterThan(provisionalMeasures);
    const exactMeasures = measureBlock.mock.calls.length;

    // Repeat provisional layout replays the provisional cache (no new
    // measures): the split is by mode, not a blanket cache disable.
    await layoutHeaderFooterWithCache(
      { default: footerBlocks() },
      CONSTRAINTS,
      measureBlock,
      cache,
      1,
      undefined,
      'footer',
      'font-sig-1',
      undefined,
      { pageCountFieldsExact: false },
    );
    expect(measureBlock.mock.calls.length).toBe(exactMeasures);
  });
});
