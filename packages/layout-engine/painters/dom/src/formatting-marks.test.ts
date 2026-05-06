import { describe, it, expect, beforeEach } from 'vitest';
import { createTestPainter as createDomPainter } from './_test-utils.js';
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
    expect(document.head.textContent).toContain(
      '[dir="rtl"] .superdoc-formatting-paragraph-mark {\n  transform: translateX(calc(-100% - var(--sd-formatting-paragraph-mark-gap, 0.2em)))',
    );
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

  it('positions paragraph marks at the visual text end for centered, right-aligned, and RTL text', () => {
    const text = 'Aligned text';
    const measure = createParagraphMeasure(text, 80);
    const layout = createParagraphLayout();

    const centerPainter = createDomPainter({
      blocks: [createParagraphBlock(text, { alignment: 'center' })],
      measures: [measure],
      showFormattingMarks: true,
    });

    centerPainter.paint(layout, container);

    const centerLine = container.querySelector<HTMLElement>('.superdoc-line');
    expect(centerLine?.style.textAlign).toBe('center');
    expect(centerLine?.querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark')?.style.left).toBe('190px');

    container.innerHTML = '';
    const rightPainter = createDomPainter({
      blocks: [createParagraphBlock(text, { alignment: 'right' })],
      measures: [measure],
      showFormattingMarks: true,
    });

    rightPainter.paint(layout, container);

    const rightLine = container.querySelector<HTMLElement>('.superdoc-line');
    expect(rightLine?.style.textAlign).toBe('right');
    expect(rightLine?.querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark')?.style.left).toBe('300px');

    container.innerHTML = '';
    const rtlPainter = createDomPainter({
      blocks: [createParagraphBlock(text, { direction: 'rtl' })],
      measures: [measure],
      showFormattingMarks: true,
    });

    rtlPainter.paint(layout, container);

    const rtlLine = container.querySelector<HTMLElement>('.superdoc-line');
    expect(rtlLine?.dir).toBe('rtl');
    expect(rtlLine?.style.textAlign).toBe('right');
    expect(rtlLine?.querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark')?.style.left).toBe('220px');
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

  it('renders paragraph marks only on the final visual line when a paragraph ends with an inline image', () => {
    const imageSrc =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const block: FlowBlock = {
      kind: 'paragraph',
      id: 'paragraph-1',
      runs: [
        {
          text: 'Text',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: 4,
        },
        {
          kind: 'image',
          src: imageSrc,
          width: 20,
          height: 20,
          pmStart: 4,
          pmEnd: 5,
        },
      ],
      attrs: {},
    };
    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 4,
          width: 32,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
        {
          fromRun: 1,
          fromChar: 0,
          toRun: 1,
          toChar: 1,
          width: 20,
          ascent: 16,
          descent: 4,
          lineHeight: 24,
        },
      ],
      totalHeight: 44,
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
    expect(lines[1].querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark')?.style.left).toBe('20px');
    expect(container.querySelectorAll('.superdoc-formatting-paragraph-mark')).toHaveLength(1);
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
