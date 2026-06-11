import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resolveLayout } from '@superdoc/layout-resolved';
import { createDomPainter } from '../index.js';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';

describe('segment-positioned SDT baseline alignment', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  it('aligns label text with inline SDT value text on the same vertical origin', () => {
    const block: FlowBlock = {
      kind: 'paragraph',
      id: 'segment-positioned-sdt-baseline',
      runs: [
        { text: 'KvK', fontFamily: 'Arial', fontSize: 12 },
        { kind: 'tab', text: '\t', width: 48, fontSize: 12 },
        {
          text: 'KvK_number',
          fontFamily: 'Arial',
          fontSize: 12,
          sdt: {
            type: 'structuredContent',
            scope: 'inline',
            id: 'sdt-kvk',
            alias: 'KvK number',
          },
        },
      ],
    };

    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 2,
          toChar: 10,
          width: 140,
          maxWidth: 200,
          ascent: 11.173828125,
          descent: 2.8828125,
          lineHeight: 14.056640625,
          segments: [
            { runIndex: 0, fromChar: 0, toChar: 3, width: 21 },
            { runIndex: 2, fromChar: 0, toChar: 10, width: 71, x: 48 },
          ],
        },
      ],
      totalHeight: 14.056640625,
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'segment-positioned-sdt-baseline',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 200,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ contentControlsChrome: 'none' });
    const resolvedLayout = resolveLayout({
      layout,
      flowMode: 'paginated',
      blocks: [block],
      measures: [measure],
    });
    painter.paint({ layout, resolvedLayout, blocks: [block], measures: [measure] }, mount);

    const labelSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find(
      (el) => el.textContent === 'KvK',
    ) as HTMLElement | undefined;
    const valueSpan = Array.from(mount.querySelectorAll('.superdoc-line span')).find(
      (el) => el.textContent === 'KvK_number',
    ) as HTMLElement | undefined;
    const sdtWrapper = mount.querySelector('[data-sdt-id="sdt-kvk"]') as HTMLElement | null;

    expect(labelSpan).toBeTruthy();
    expect(valueSpan).toBeTruthy();
    expect(sdtWrapper?.dataset.segmentPositioned).toBe('true');
    expect(sdtWrapper?.style.padding).toBe('0px');

    const visualTop = (el: HTMLElement): number => {
      let node: HTMLElement | null = el;
      let top = 0;
      while (node && !node.classList.contains('superdoc-line')) {
        top += parseFloat(node.style.top || '0');
        node = node.parentElement;
      }
      return top;
    };

    expect(visualTop(labelSpan!)).toBeCloseTo(visualTop(valueSpan!), 2);
    expect(labelSpan!.style.lineHeight).toBe(valueSpan!.style.lineHeight);
  });
});
