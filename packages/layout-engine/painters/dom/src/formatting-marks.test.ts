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

  function createParagraphBlock(text: string, attrs: FlowBlock['attrs'] = {}): FlowBlock {
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
      attrs,
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

  it('positions paragraph marks after inline-flow paragraph indents', () => {
    const text = 'Indented text';
    const block = createParagraphBlock(text, {
      indent: {
        left: 36,
        firstLine: 12,
      },
    });
    const measure = createParagraphMeasure(text, 96);
    const layout = createParagraphLayout();

    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      showFormattingMarks: true,
    });

    painter.paint(layout, container);

    const line = container.querySelector<HTMLElement>('.superdoc-line');
    expect(line?.style.paddingLeft).toBe('36px');
    expect(line?.style.textIndent).toBe('12px');

    const paragraphMark = container.querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark');
    expect(paragraphMark?.style.left).toBe('144px');
  });

  it('renders paragraph marks only on the final visual line of wrapped paragraphs', () => {
    const text = 'Wrapped paragraph text';
    const block = createParagraphBlock(text);
    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 8,
          width: 64,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
        {
          fromRun: 0,
          fromChar: 8,
          toRun: 0,
          toChar: text.length,
          width: 112,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 40,
    };
    const layout = createParagraphLayout();
    layout.pages[0].fragments[0].toLine = 2;

    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      showFormattingMarks: true,
    });

    painter.paint(layout, container);

    const lines = container.querySelectorAll<HTMLElement>('.superdoc-line');
    expect(lines[0].querySelector('.superdoc-formatting-paragraph-mark')).toBeNull();

    const paragraphMark = lines[1].querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark');
    expect(container.querySelectorAll('.superdoc-formatting-paragraph-mark')).toHaveLength(1);
    expect(paragraphMark?.textContent).toBe('¶');
    expect(paragraphMark?.style.left).toBe('112px');
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
