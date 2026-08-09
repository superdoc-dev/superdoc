import { describe, expect, it } from 'vite-plus/test';

import { collectSectionBoundaryFillerBlockIds, doesFlowBlockProduceLayoutFragment, type FlowBlock } from './index.js';

describe('section-boundary layout eligibility', () => {
  it('collapses every empty paragraph in a forcing sectPr filler run', () => {
    const blocks = [
      { kind: 'paragraph', id: 'visible-before', runs: [{ kind: 'text', text: 'visible' }] },
      {
        kind: 'paragraph',
        id: 'empty-toc-entry',
        runs: [{ kind: 'text', text: '' }],
        attrs: { isTocEntry: true },
      },
      { kind: 'paragraph', id: 'empty-filler', runs: [{ kind: 'text', text: '' }] },
      { kind: 'paragraph', id: 'sectPr-marker', runs: [], attrs: { sectPrMarker: true } },
      {
        kind: 'sectionBreak',
        id: 'forcing-sectPr',
        type: 'nextPage',
        attrs: { source: 'sectPr' },
      },
      { kind: 'paragraph', id: 'visible-after', runs: [{ kind: 'text', text: 'visible' }] },
    ] as FlowBlock[];

    const suppressed = collectSectionBoundaryFillerBlockIds(blocks);

    expect([...suppressed]).toEqual(['sectPr-marker', 'empty-filler', 'empty-toc-entry']);
    expect(blocks.map((_, index) => doesFlowBlockProduceLayoutFragment(blocks, index, suppressed))).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('keeps ordinary blanks, list-marker blanks, and reviewable markers addressable', () => {
    const blocks = [
      { kind: 'paragraph', id: 'ordinary-blank', runs: [{ kind: 'text', text: '' }] },
      {
        kind: 'paragraph',
        id: 'numbered-blank',
        runs: [{ kind: 'text', text: '' }],
        attrs: { numberingProperties: { numId: '1', ilvl: 0 } },
      },
      {
        kind: 'paragraph',
        id: 'tracked-marker',
        runs: [],
        attrs: {
          sectPrMarker: true,
          paragraphMarkTrackedChange: { targetKind: 'section-break' },
        },
      },
      {
        kind: 'sectionBreak',
        id: 'forcing-sectPr',
        type: 'nextPage',
        attrs: { source: 'sectPr' },
      },
    ] as unknown as FlowBlock[];

    expect([...collectSectionBoundaryFillerBlockIds(blocks)]).toEqual([]);
  });

  it('keeps consecutive invisible carriers for explicit unequal-width sections out of printable layout', () => {
    const blocks = [
      { kind: 'paragraph', id: 'empty-before', runs: [{ kind: 'text', text: '' }] },
      { kind: 'paragraph', id: 'first-marker', runs: [], attrs: { sectPrMarker: true } },
      {
        kind: 'sectionBreak',
        id: 'first-continuous-break',
        type: 'continuous',
        columns: { count: 2, gap: 8, equalWidth: false, widths: [40, 80], gaps: [8] },
        attrs: { source: 'sectPr' },
      },
      { kind: 'paragraph', id: 'second-marker', runs: [], attrs: { sectPrMarker: true } },
      {
        kind: 'sectionBreak',
        id: 'second-continuous-break',
        type: 'continuous',
        columns: { count: 2, gap: 8, equalWidth: false, widths: [60, 100], gaps: [8] },
        attrs: { source: 'sectPr' },
      },
      { kind: 'paragraph', id: 'visible-after', runs: [{ kind: 'text', text: 'visible' }] },
    ] as FlowBlock[];

    expect(blocks.map((_, index) => doesFlowBlockProduceLayoutFragment(blocks, index))).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});
