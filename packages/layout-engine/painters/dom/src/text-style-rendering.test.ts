/**
 * Tests for text style CSS rendering in DomPainter
 *
 * Tests CSS rendering of text styles including textTransform
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout } from '@superdoc/contracts';

const expectCssColor = (actual: string, expectedHex: string): void => {
  const normalizedActual = actual.replace(/\s+/g, '').toLowerCase();
  let normalizedHex = expectedHex.toLowerCase();
  if (!normalizedHex.startsWith('#')) {
    normalizedHex = `#${normalizedHex}`;
  }
  if (normalizedHex.length === 4) {
    normalizedHex = `#${normalizedHex[1]}${normalizedHex[1]}${normalizedHex[2]}${normalizedHex[2]}${normalizedHex[3]}${normalizedHex[3]}`;
  }
  const r = Number.parseInt(normalizedHex.slice(1, 3), 16);
  const g = Number.parseInt(normalizedHex.slice(3, 5), 16);
  const b = Number.parseInt(normalizedHex.slice(5, 7), 16);
  const rgb = `rgb(${r},${g},${b})`;
  expect([normalizedHex, rgb]).toContain(normalizedActual);
};

describe('DomPainter text style CSS rendering', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  /**
   * Helper to create a paragraph block with text runs
   */
  function createParagraphBlock(blockId: string, runs: FlowBlock['runs']): FlowBlock {
    return {
      kind: 'paragraph',
      id: blockId,
      runs,
      attrs: {},
    };
  }

  /**
   * Helper to create measure for a paragraph
   */
  function createParagraphMeasure(lineCount: number = 1): Measure {
    return {
      kind: 'paragraph',
      lines: Array.from({ length: lineCount }, (_, i) => ({
        fromRun: 0,
        fromChar: i * 10,
        toRun: 0,
        toChar: (i + 1) * 10,
        width: 100,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      })),
      totalHeight: lineCount * 20,
    };
  }

  /**
   * Helper to create layout for a paragraph
   */
  function createParagraphLayout(blockId: string): Layout {
    return {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId,
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

  describe('textTransform CSS rendering', () => {
    it('should apply uppercase textTransform to span element', () => {
      const block = createParagraphBlock('para-1', [
        {
          text: 'hello world',
          fontFamily: 'Arial',
          fontSize: 16,
          textTransform: 'uppercase',
          pmStart: 0,
          pmEnd: 11,
        },
      ]);

      const measure = createParagraphMeasure();
      const layout = createParagraphLayout('para-1');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.style.textTransform).toBe('uppercase');
    });

    it('should apply lowercase textTransform to span element', () => {
      const block = createParagraphBlock('para-2', [
        {
          text: 'HELLO WORLD',
          fontFamily: 'Arial',
          fontSize: 16,
          textTransform: 'lowercase',
          pmStart: 0,
          pmEnd: 11,
        },
      ]);

      const measure = createParagraphMeasure();
      const layout = createParagraphLayout('para-2');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.style.textTransform).toBe('lowercase');
    });

    it('should apply capitalize textTransform to span element', () => {
      const block = createParagraphBlock('para-3', [
        {
          text: 'hello world',
          fontFamily: 'Arial',
          fontSize: 16,
          textTransform: 'capitalize',
          pmStart: 0,
          pmEnd: 11,
        },
      ]);

      const measure = createParagraphMeasure();
      const layout = createParagraphLayout('para-3');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.style.textTransform).toBe('capitalize');
    });

    it('should apply none textTransform to span element', () => {
      const block = createParagraphBlock('para-4', [
        {
          text: 'Hello World',
          fontFamily: 'Arial',
          fontSize: 16,
          textTransform: 'none',
          pmStart: 0,
          pmEnd: 11,
        },
      ]);

      const measure = createParagraphMeasure();
      const layout = createParagraphLayout('para-4');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.style.textTransform).toBe('none');
    });

    it('should not apply textTransform when undefined', () => {
      const block = createParagraphBlock('para-5', [
        {
          text: 'hello world',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: 11,
        },
      ]);

      const measure = createParagraphMeasure();
      const layout = createParagraphLayout('para-5');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.style.textTransform).toBe('');
    });

    it('should handle multiple runs with different textTransform values', () => {
      const block = createParagraphBlock('para-6', [
        {
          text: 'hello',
          fontFamily: 'Arial',
          fontSize: 16,
          textTransform: 'uppercase',
          pmStart: 0,
          pmEnd: 5,
        },
        {
          text: ' ',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 5,
          pmEnd: 6,
        },
        {
          text: 'WORLD',
          fontFamily: 'Arial',
          fontSize: 16,
          textTransform: 'lowercase',
          pmStart: 6,
          pmEnd: 11,
        },
      ]);

      const measure = {
        kind: 'paragraph' as const,
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 2,
            toChar: 11,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout = createParagraphLayout('para-6');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const spans = container.querySelectorAll('span');
      expect(spans.length).toBeGreaterThanOrEqual(2);

      // First run should have uppercase
      const firstSpan = Array.from(spans).find((s) => s.textContent === 'hello');
      expect(firstSpan?.style.textTransform).toBe('uppercase');

      // Third run should have lowercase
      const thirdSpan = Array.from(spans).find((s) => s.textContent === 'WORLD');
      expect(thirdSpan?.style.textTransform).toBe('lowercase');
    });

    it('should work together with other text styles', () => {
      const block = createParagraphBlock('para-7', [
        {
          text: 'styled text',
          fontFamily: 'Arial',
          fontSize: 16,
          bold: true,
          italic: true,
          color: '#FF0000',
          textTransform: 'uppercase',
          pmStart: 0,
          pmEnd: 11,
        },
      ]);

      const measure = createParagraphMeasure();
      const layout = createParagraphLayout('para-7');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.style.textTransform).toBe('uppercase');
      expect(span?.style.fontWeight).toBe('bold');
      expect(span?.style.fontStyle).toBe('italic');
      expectCssColor(span?.style.color ?? '', '#ff0000');
    });

    it('should handle empty text with textTransform', () => {
      const block = createParagraphBlock('para-8', [
        {
          text: '',
          fontFamily: 'Arial',
          fontSize: 16,
          textTransform: 'uppercase',
          pmStart: 0,
          pmEnd: 0,
        },
      ]);

      const measure = {
        kind: 'paragraph' as const,
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 0,
            width: 0,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const layout = createParagraphLayout('para-8');

      const painter = createDomPainter({
        blocks: [block],
        measures: [measure],
      });

      painter.paint(layout, container);

      // Should render without errors
      expect(container.children.length).toBeGreaterThan(0);
    });
  });
});
