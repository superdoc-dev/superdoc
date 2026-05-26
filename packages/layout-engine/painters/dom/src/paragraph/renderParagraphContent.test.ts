import { describe, expect, it } from 'vitest';
import { renderParagraphContent } from './renderParagraphContent.js';
import type { Line, ParagraphBlock, ParagraphMeasure, ResolvedParagraphContent } from '@superdoc/contracts';

describe('renderParagraphContent', () => {
  const line = (index: number): Line => ({
    fromRun: 0,
    fromChar: index,
    toRun: 0,
    toChar: index + 1,
    width: 10,
    ascent: 12,
    descent: 4,
    lineHeight: 20,
  });

  it('keeps partial body fragments at their rendered line height', () => {
    const doc = document.implementation.createHTMLDocument('paragraph-content');
    const frameEl = doc.createElement('div');
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'split-paragraph',
      runs: [{ text: 'abc', fontFamily: 'Arial', fontSize: 16 }],
    };
    const measure: ParagraphMeasure = {
      kind: 'paragraph',
      lines: [line(0), line(1), line(2)],
      totalHeight: 60,
    };

    const result = renderParagraphContent({
      doc,
      frameEl,
      block,
      measure,
      containerKind: 'body-fragment',
      width: 200,
      localStartLine: 0,
      localEndLine: 1,
      lineIndexOffset: 0,
      linesOverride: measure.lines.slice(0, 1),
      continuesOnNext: true,
      applySdtDataset: () => {},
      renderLine: () => doc.createElement('div'),
    });

    expect(result.renderedHeight).toBe(20);
    expect(result.totalHeight).toBe(20);
    expect(frameEl.style.height).toBe('20px');
  });

  it('marks the final remeasured override line as the paragraph final line', () => {
    const doc = document.implementation.createHTMLDocument('paragraph-content');
    const frameEl = doc.createElement('div');
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'remeasured-paragraph',
      runs: [{ text: 'abc', fontFamily: 'Arial', fontSize: 16 }],
    };
    const measure: ParagraphMeasure = {
      kind: 'paragraph',
      lines: [line(0)],
      totalHeight: 20,
    };
    const renderedLines: Array<{ lineIndex: number; isLastLine: boolean; skipJustify?: boolean }> = [];

    renderParagraphContent({
      doc,
      frameEl,
      block,
      measure,
      containerKind: 'body-fragment',
      width: 200,
      localStartLine: 0,
      localEndLine: 2,
      lineIndexOffset: 0,
      linesOverride: [line(0), line(1)],
      applySdtDataset: () => {},
      renderLine: ({ lineIndex, isLastLine, skipJustify }) => {
        renderedLines.push({ lineIndex, isLastLine, skipJustify });
        return doc.createElement('div');
      },
    });

    expect(renderedLines).toEqual([
      { lineIndex: 0, isLastLine: false, skipJustify: false },
      { lineIndex: 1, isLastLine: true, skipJustify: true },
    ]);
  });

  it('preserves paragraph right indent on list marker lines', () => {
    const doc = document.implementation.createHTMLDocument('paragraph-content');
    const frameEl = doc.createElement('div');
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'list-paragraph',
      attrs: {
        indent: { left: 24, hanging: 12, right: 18 },
        wordLayout: {
          marker: {
            markerText: '1.',
            suffix: 'space',
            run: { fontFamily: 'Arial', fontSize: 16 },
          },
        },
      },
      runs: [{ text: 'abc', fontFamily: 'Arial', fontSize: 16 }],
    };
    const measure: ParagraphMeasure = {
      kind: 'paragraph',
      lines: [line(0)],
      marker: {
        markerWidth: 10,
        markerTextWidth: 8,
      },
      totalHeight: 20,
    };
    let lineEl: HTMLElement | undefined;

    renderParagraphContent({
      doc,
      frameEl,
      block,
      measure,
      containerKind: 'body-fragment',
      width: 200,
      localStartLine: 0,
      localEndLine: 1,
      markerWidth: 10,
      markerTextWidth: 8,
      applySdtDataset: () => {},
      renderLine: () => {
        lineEl = doc.createElement('div');
        return lineEl;
      },
    });

    expect(lineEl?.style.cssText).toContain('padding-right: 18px');
  });

  it('renders resolved RTL list markers on the right side', () => {
    const doc = document.implementation.createHTMLDocument('paragraph-content');
    const frameEl = doc.createElement('div');
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'resolved-list-paragraph',
      attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      runs: [{ text: 'abc', fontFamily: 'Arial', fontSize: 16 }],
    };
    const resolvedContent: ResolvedParagraphContent = {
      lines: [
        {
          line: line(0),
          lineIndex: 0,
          availableWidth: 160,
          skipJustify: true,
          paddingLeftPx: 0,
          paddingRightPx: 0,
          textIndentPx: 0,
          isListFirstLine: true,
          hasExplicitSegmentPositioning: false,
          indentOffset: 30,
        },
      ],
      marker: {
        text: '1.',
        justification: 'right',
        suffix: 'space',
        markerStartPx: 6,
        suffixWidthPx: 4,
        firstLinePaddingLeftPx: 30,
        run: { fontFamily: 'Arial', fontSize: 16 },
      },
    };

    renderParagraphContent({
      doc,
      frameEl,
      block,
      measure: { kind: 'paragraph', lines: [line(0)], totalHeight: 20 },
      containerKind: 'body-fragment',
      width: 200,
      localStartLine: 0,
      localEndLine: 1,
      resolvedContent,
      applySdtDataset: () => {},
      renderLine: () => doc.createElement('div'),
    });

    const lineEl = frameEl.lastElementChild as HTMLElement;
    const markerEl = lineEl.querySelector<HTMLElement>('.superdoc-list-marker');
    expect(lineEl.style.paddingRight).toBe('30px');
    expect(markerEl?.style.right).toBe('6px');
  });

  it('converts the final paragraph mark for resolved content', () => {
    const doc = document.implementation.createHTMLDocument('paragraph-content');
    const frameEl = doc.createElement('div');
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'resolved-cell-paragraph',
      runs: [{ text: 'abc', fontFamily: 'Arial', fontSize: 16 }],
    };
    const resolvedContent: ResolvedParagraphContent = {
      lines: [
        {
          line: line(0),
          lineIndex: 0,
          availableWidth: 160,
          skipJustify: true,
          paddingLeftPx: 0,
          paddingRightPx: 0,
          textIndentPx: 0,
          isListFirstLine: false,
          hasExplicitSegmentPositioning: false,
          indentOffset: 0,
        },
      ],
    };

    renderParagraphContent({
      doc,
      frameEl,
      block,
      measure: { kind: 'paragraph', lines: [line(0)], totalHeight: 20 },
      containerKind: 'table-cell',
      width: 200,
      localStartLine: 0,
      localEndLine: 1,
      resolvedContent,
      convertFinalParagraphMark: true,
      applySdtDataset: () => {},
      renderLine: () => {
        const lineEl = doc.createElement('div');
        const mark = doc.createElement('span');
        mark.classList.add('superdoc-formatting-paragraph-mark');
        mark.textContent = '¶';
        lineEl.appendChild(mark);
        return lineEl;
      },
    });

    const mark = frameEl.querySelector<HTMLElement>('.superdoc-formatting-paragraph-mark');
    expect(mark?.classList.contains('superdoc-formatting-cell-mark')).toBe(true);
    expect(mark?.textContent).toBe('¤');
  });
});
