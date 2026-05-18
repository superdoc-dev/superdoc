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
      attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
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
      attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
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

  // Mixed runs remain separate spans. In RTL paragraphs we now avoid forcing
  // per-run dir="rtl" for plain Latin/digit tokens, so numeric rtl-tagged runs
  // can inherit paragraph direction without isolated run reordering.
  it('paints mixed rtl + ltr runs on the same line as separate spans with date-only ltr override', () => {
    const blockId = 'mixed';
    const ltrText = '-03-23';
    const rtlText = '2026';
    const totalLen = ltrText.length + rtlText.length;
    const block: FlowBlock = {
      kind: 'paragraph',
      id: blockId,
      attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      runs: [
        { text: ltrText, fontFamily: 'David, sans-serif', fontSize: 16, pmStart: 1, pmEnd: 7 },
        { text: rtlText, fontFamily: 'David, sans-serif', fontSize: 16, bidi: { rtl: true }, pmStart: 7, pmEnd: 11 },
      ],
    };

    const measure = {
      kind: 'paragraph' as const,
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 1,
          toChar: rtlText.length,
          width: 200,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const mount = document.createElement('div');
    const painter = createTestPainter({ blocks: [block], measures: [measure] });
    painter.paint(makeLayout(blockId), mount);

    const spans = mount.querySelectorAll('.superdoc-line span');
    expect(spans.length).toBe(2);
    expect(spans[0].getAttribute('dir')).toBe('ltr');
    expect(spans[0].textContent).toBe(ltrText);
    expect(spans[1].getAttribute('dir')).toBeNull();
    expect(spans[1].textContent).toBe(rtlText);
  });

  // Rtl-tagged numeric runs in RTL paragraphs do not force dir="rtl" anymore.
  // This avoids undesired token inversion in mixed header/footer runs like "copy 2".
  it('does not force per-run rtl dir for non-date numeric runs in RTL paragraphs', () => {
    const blockId = 'rtl-numeric';
    const runText = '2026';
    const block: FlowBlock = {
      kind: 'paragraph',
      id: blockId,
      attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      runs: [
        { text: runText, fontFamily: 'David, sans-serif', fontSize: 16, bidi: { rtl: true }, pmStart: 1, pmEnd: 5 },
      ],
    };

    const mount = document.createElement('div');
    const painter = createTestPainter({ blocks: [block], measures: [makeMeasure(runText.length)] });
    painter.paint(makeLayout(blockId), mount);

    const span = mount.querySelector('.superdoc-line span');
    expect(span?.getAttribute('dir')).toBeNull();
    expect(span?.textContent).toBe(runText);
    expect(span?.textContent).not.toContain('\u200F');
  });

  // SD-3098: non-rtl plain text in RTL paragraphs must NOT get dir="ltr"
  // (only date-like non-rtl runs get the LTR force). Otherwise we'd override
  // browser bidi everywhere and break legitimate Hebrew/Arabic-only paragraphs.
  it('leaves non-rtl plain text runs without a dir attribute', () => {
    const blockId = 'plain';
    const runText = 'Hello world';
    const block: FlowBlock = {
      kind: 'paragraph',
      id: blockId,
      attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      runs: [{ text: runText, fontFamily: 'David, sans-serif', fontSize: 16, pmStart: 1, pmEnd: 12 }],
    };

    const mount = document.createElement('div');
    const painter = createTestPainter({ blocks: [block], measures: [makeMeasure(runText.length)] });
    painter.paint(makeLayout(blockId), mount);

    const span = mount.querySelector('.superdoc-line span');
    expect(span?.getAttribute('dir')).toBeNull();
    expect(span?.textContent).toBe(runText);
  });
});
