import { describe, it, expect, beforeEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';

describe('DomPainter formatting marks', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  function createParagraphBlock(text: string): FlowBlock {
    return {
      kind: 'paragraph',
      id: 'paragraph-1',
      runs: [
        {
          text,
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: text.length,
        },
      ],
      attrs: {},
    };
  }

  function createParagraphMeasure(text: string, width = 80): Measure {
    return {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: text.length,
          width,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };
  }

  function createParagraphLayout(): Layout {
    return {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'paragraph-1',
              fromLine: 0,
              toLine: 1,
              x: 48,
              y: 40,
              width: 300,
            },
          ],
        },
      ],
    };
  }

  it('renders space wrappers and a paragraph mark only when enabled', () => {
    const text = 'A B  C';
    const block = createParagraphBlock(text);
    const measure = createParagraphMeasure(text, 72);
    const layout = createParagraphLayout();

    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      showFormattingMarks: true,
    });

    painter.paint(layout, container);

    expect(container.classList.contains('superdoc-show-formatting-marks')).toBe(true);
    expect(document.head.querySelector('[data-superdoc-formatting-marks-styles="true"]')).toBeTruthy();

    const textRun = container.querySelector<HTMLElement>('span[data-pm-start="0"]');
    expect(textRun?.textContent).toBe(text);
    expect(textRun?.querySelectorAll('.superdoc-formatting-space-mark')).toHaveLength(3);

    const paragraphMark = container.querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark');
    expect(paragraphMark?.textContent).toBe('¶');
    expect(paragraphMark?.style.left).toBe('72px');
    expect(document.head.textContent).toContain('--sd-formatting-paragraph-mark-gap');
  });

  it('does not add formatting mark DOM when disabled', () => {
    const text = 'A B';
    const block = createParagraphBlock(text);
    const measure = createParagraphMeasure(text);
    const layout = createParagraphLayout();

    const painter = createDomPainter({ blocks: [block], measures: [measure] });

    painter.paint(layout, container);

    expect(container.classList.contains('superdoc-show-formatting-marks')).toBe(false);
    expect(container.querySelector('.superdoc-formatting-space-mark')).toBeNull();
    expect(container.querySelector('.superdoc-formatting-paragraph-mark')).toBeNull();
  });

  it('can toggle formatting marks on an existing painter', () => {
    const text = 'A B';
    const block = createParagraphBlock(text);
    const measure = createParagraphMeasure(text);
    const layout = createParagraphLayout();

    const painter = createDomPainter({ blocks: [block], measures: [measure] });
    painter.paint(layout, container);
    expect(container.querySelector('.superdoc-formatting-paragraph-mark')).toBeNull();

    painter.setShowFormattingMarks(true);
    painter.paint(layout, container);
    expect(container.classList.contains('superdoc-show-formatting-marks')).toBe(true);
    expect(container.querySelector('.superdoc-formatting-paragraph-mark')).toBeTruthy();

    painter.setShowFormattingMarks(false);
    painter.paint(layout, container);
    expect(container.classList.contains('superdoc-show-formatting-marks')).toBe(false);
    expect(container.querySelector('.superdoc-formatting-paragraph-mark')).toBeNull();
  });
});
