import { describe, expect, it } from 'vitest';
import { renderParagraphContent } from './renderParagraphContent.js';
import type { Line, ParagraphBlock, ParagraphMeasure } from '@superdoc/contracts';

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
      contextSection: 'body',
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
      contextSection: 'body',
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
});
