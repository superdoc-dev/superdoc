import { describe, expect, it } from 'vitest';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import { createTestPainter } from './_test-utils.js';

const makeLayout = (blockId: string): Layout => ({
  pageSize: { w: 400, h: 500 },
  pages: [
    {
      number: 1,
      fragments: [{ kind: 'para', blockId, fromLine: 0, toLine: 1, x: 20, y: 20, width: 300 }],
    },
  ],
});

const makeMeasure = (runLength: number): Measure => ({
  kind: 'paragraph',
  lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: runLength, width: 200, ascent: 12, descent: 4, lineHeight: 20 }],
  totalHeight: 20,
});

describe('RTL date parity', () => {
  it('injects RLM around date separators for rtl date-like text runs', () => {
    const blockId = 'rtl-date';
    const runText = '23.03.2026';
    const block: FlowBlock = {
      kind: 'paragraph',
      id: blockId,
      attrs: { direction: 'rtl' },
      runs: [
        {
          text: runText,
          fontFamily: 'David, sans-serif',
          fontSize: 16,
          bidi: { rtl: true },
          pmStart: 1,
          pmEnd: 11,
        },
      ],
    };

    const mount = document.createElement('div');
    const painter = createTestPainter({ blocks: [block], measures: [makeMeasure(runText.length)] });
    painter.paint(makeLayout(blockId), mount);

    const span = mount.querySelector('.superdoc-line span');
    expect(span).toBeTruthy();
    expect(span?.getAttribute('dir')).toBe('rtl');
    expect(span?.textContent).toBe('23\u200F.\u200F03\u200F.\u200F2026');
  });

  it('forces ltr direction for non-rtl date-like text runs', () => {
    const blockId = 'ltr-date';
    const runText = '-03-23';
    const block: FlowBlock = {
      kind: 'paragraph',
      id: blockId,
      attrs: { direction: 'rtl' },
      runs: [{ text: runText, fontFamily: 'David, sans-serif', fontSize: 16, pmStart: 1, pmEnd: 7 }],
    };

    const mount = document.createElement('div');
    const painter = createTestPainter({ blocks: [block], measures: [makeMeasure(runText.length)] });
    painter.paint(makeLayout(blockId), mount);

    const span = mount.querySelector('.superdoc-line span');
    expect(span).toBeTruthy();
    expect(span?.getAttribute('dir')).toBe('ltr');
    expect(span?.textContent).toBe(runText);
  });
});
