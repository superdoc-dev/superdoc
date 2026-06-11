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

  it('keeps positioned tab spans at line-box top (not half-leading offset)', () => {
    const block: FlowBlock = {
      kind: 'paragraph',
      id: 'segment-positioned-tab-leader',
      runs: [
        { text: 'Premises:', fontFamily: 'Arial', fontSize: 11 },
        { kind: 'tab', text: '\t', width: 400, fontSize: 11, underline: { style: 'single' } },
        { text: 'Date:', fontFamily: 'Arial', fontSize: 11 },
      ],
    };

    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 2,
          toChar: 5,
          width: 480,
          maxWidth: 624,
          ascent: 9.5,
          descent: 2.5,
          lineHeight: 17.59,
          segments: [
            { runIndex: 0, fromChar: 0, toChar: 9, width: 58 },
            { runIndex: 2, fromChar: 0, toChar: 5, width: 32, x: 448 },
          ],
        },
      ],
      totalHeight: 17.59,
    };

    const layout: Layout = {
      pageSize: { w: 816, h: 1056 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'segment-positioned-tab-leader',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 624,
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

    const lineEl = mount.querySelector('.superdoc-line') as HTMLElement | null;
    expect(lineEl).toBeTruthy();

    const tabSpan = Array.from(lineEl!.querySelectorAll<HTMLElement>('span')).find(
      (el) => el.style.position === 'absolute' && parseFloat(el.style.width || '0') > 100,
    );
    expect(tabSpan).toBeTruthy();
    expect(tabSpan!.style.top).toBe('0px');
  });
});
