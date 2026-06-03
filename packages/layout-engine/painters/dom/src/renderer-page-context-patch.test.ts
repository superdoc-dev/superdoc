import { describe, expect, it } from 'vitest';
import type { FlowBlock, Layout, Measure, TextRun } from '@superdoc/contracts';
import { createTestPainter } from './_test-utils.js';

const pageNumberBlock: FlowBlock = {
  kind: 'paragraph',
  id: 'page-number-block',
  runs: [
    {
      text: '0',
      token: 'pageNumber',
      pageNumberFieldFormat: { format: 'upperRoman' },
      fontFamily: 'Arial',
      fontSize: 12,
    } as TextRun,
  ],
};

const pageNumberMeasure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 10,
      ascent: 8,
      descent: 2,
      lineHeight: 10,
    },
  ],
  totalHeight: 10,
};

const staticBlock: FlowBlock = {
  kind: 'paragraph',
  id: 'static-block',
  runs: [
    {
      text: 'Static',
      fontFamily: 'Arial',
      fontSize: 12,
    },
  ],
};

const staticMeasure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 6,
      width: 40,
      ascent: 8,
      descent: 2,
      lineHeight: 10,
    },
  ],
  totalHeight: 10,
};

function makeLayout(displayNumber: number): Layout {
  return {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        displayNumber,
        fragments: [
          {
            kind: 'para',
            blockId: 'page-number-block',
            fromLine: 0,
            toLine: 1,
            x: 0,
            y: 0,
            width: 200,
          },
          {
            kind: 'para',
            blockId: 'static-block',
            fromLine: 0,
            toLine: 1,
            x: 0,
            y: 20,
            width: 200,
          },
        ],
      },
    ],
  };
}

describe('DomPainter page-number context patching', () => {
  it('rebuilds token fragments when display page number changes during incremental patch', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const painter = createTestPainter({
      blocks: [pageNumberBlock, staticBlock],
      measures: [pageNumberMeasure, staticMeasure],
    });

    painter.paint(makeLayout(5), mount);
    expect(mount.textContent).toContain('V');
    const staticFragment = mount.querySelector('[data-block-id="static-block"]');
    expect(staticFragment).toBeTruthy();

    painter.paint(makeLayout(8), mount);
    expect(mount.textContent).toContain('VIII');
    expect(mount.querySelector('[data-block-id="static-block"]')).toBe(staticFragment);
  });
});
