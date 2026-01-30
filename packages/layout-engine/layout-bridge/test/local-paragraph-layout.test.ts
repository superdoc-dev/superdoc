/**
 * Tests for LocalParagraphLayout
 *
 * Validates synchronous paragraph layout with <5ms performance.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LocalParagraphLayout } from '../src/local-paragraph-layout';
import { FontMetricsCache } from '../src/font-metrics-cache';
import type { TextRun } from '../src/local-paragraph-layout';

describe('LocalParagraphLayout', () => {
  let fontCache: FontMetricsCache;
  let layoutEngine: LocalParagraphLayout;
  const fontKey = 'Arial|16|normal|normal';

  beforeEach(() => {
    fontCache = new FontMetricsCache();
    layoutEngine = new LocalParagraphLayout(fontCache);

    // Pre-warm font cache
    fontCache.warmCache([{ fontKey }]);
  });

  describe('layout', () => {
    it('should layout single line paragraph', () => {
      const text = 'Hello world';
      const result = layoutEngine.layout(text, fontKey, 500);

      expect(result.lines.length).toBe(1);
      expect(result.lines[0].localStart).toBe(0);
      expect(result.lines[0].localEnd).toBe(text.length);
      expect(result.lines[0].width).toBeGreaterThan(0);
      expect(result.lines[0].height).toBeGreaterThan(0);
      expect(result.totalHeight).toBe(result.lines[0].height);
    });

    it('should layout multi-line paragraph', () => {
      const text = 'This is a longer paragraph that should wrap across multiple lines when the width is constrained.';
      const result = layoutEngine.layout(text, fontKey, 200);

      expect(result.lines.length).toBeGreaterThan(1);
      expect(result.totalHeight).toBe(result.lines.length * result.lines[0].height);

      // Verify lines are contiguous
      for (let i = 1; i < result.lines.length; i++) {
        expect(result.lines[i].localStart).toBeGreaterThanOrEqual(result.lines[i - 1].localEnd);
      }
    });

    it('should respect max width constraint', () => {
      const text = 'Short text but very narrow width';
      const maxWidth = 100;
      const result = layoutEngine.layout(text, fontKey, maxWidth);

      for (const line of result.lines) {
        expect(line.width).toBeLessThanOrEqual(maxWidth + 10); // Allow small tolerance
      }
    });

    it('should handle empty text', () => {
      const result = layoutEngine.layout('', fontKey, 500);

      expect(result.lines.length).toBe(0);
      expect(result.totalHeight).toBe(0);
      expect(result.width).toBe(0);
    });

    it('should handle single character', () => {
      const result = layoutEngine.layout('A', fontKey, 500);

      expect(result.lines.length).toBe(1);
      expect(result.lines[0].localStart).toBe(0);
      expect(result.lines[0].localEnd).toBe(1);
    });

    it('should handle explicit line breaks', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const result = layoutEngine.layout(text, fontKey, 500);

      expect(result.lines.length).toBe(3);
      expect(result.lines[0].localEnd).toBeLessThanOrEqual(7); // "Line 1\n"
      expect(result.lines[1].localStart).toBeGreaterThanOrEqual(7);
    });

    it('should break at word boundaries', () => {
      const text = 'word1 word2 word3 word4 word5';
      const result = layoutEngine.layout(text, fontKey, 100);

      // Should break between words, not in middle of words
      for (const line of result.lines) {
        const lineText = text.substring(line.localStart, line.localEnd);
        // Line should not start with space (unless it's the first line)
        if (line.localStart > 0) {
          expect(lineText[0]).not.toBe(' ');
        }
      }
    });

    it('should handle very long word (force break)', () => {
      const longWord = 'A'.repeat(100);
      const result = layoutEngine.layout(longWord, fontKey, 50);

      // Should break even though there are no spaces
      expect(result.lines.length).toBeGreaterThan(1);
    });

    it('should track maximum line width', () => {
      const text = 'Short line\nVery very very long line that should be the widest\nMedium line';
      const result = layoutEngine.layout(text, fontKey, 500);

      // Width should be the width of the widest line
      const maxLineWidth = Math.max(...result.lines.map((l) => l.width));
      expect(result.width).toBe(maxLineWidth);
    });

    it('should handle zero or negative max width', () => {
      const text = 'Hello world';

      const result1 = layoutEngine.layout(text, fontKey, 0);
      expect(result1.lines.length).toBe(0);

      const result2 = layoutEngine.layout(text, fontKey, -100);
      expect(result2.lines.length).toBe(0);
    });
  });

  describe('layoutRuns', () => {
    it('should layout single run', () => {
      const runs: TextRun[] = [{ text: 'Hello world', fontKey }];

      const result = layoutEngine.layoutRuns(runs, 500);

      expect(result.lines.length).toBe(1);
      expect(result.lines[0].localStart).toBe(0);
      expect(result.lines[0].localEnd).toBe(11);
    });

    it('should layout multiple runs with same font', () => {
      const runs: TextRun[] = [
        { text: 'Hello ', fontKey },
        { text: 'world', fontKey },
      ];

      const result = layoutEngine.layoutRuns(runs, 500);

      expect(result.lines.length).toBe(1);
      expect(result.lines[0].localStart).toBe(0);
      expect(result.lines[0].localEnd).toBe(11);
    });

    it('should layout multiple runs with different fonts', () => {
      const boldFontKey = 'Arial|16|bold|normal';
      fontCache.warmCache([{ fontKey: boldFontKey }]);

      const runs: TextRun[] = [
        { text: 'Normal ', fontKey },
        { text: 'Bold ', fontKey: boldFontKey },
        { text: 'Normal', fontKey },
      ];

      const result = layoutEngine.layoutRuns(runs, 500);

      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.totalHeight).toBeGreaterThan(0);
    });

    it('should handle empty runs array', () => {
      const result = layoutEngine.layoutRuns([], 500);

      expect(result.lines.length).toBe(0);
      expect(result.totalHeight).toBe(0);
    });

    it('should handle runs with empty text', () => {
      const runs: TextRun[] = [{ text: '', fontKey }];

      const result = layoutEngine.layoutRuns(runs, 500);

      expect(result.lines.length).toBe(1); // Empty paragraph still has one line
      expect(result.lines[0].localStart).toBe(0);
      expect(result.lines[0].localEnd).toBe(0);
    });

    it('should wrap multi-run paragraph across lines', () => {
      const runs: TextRun[] = [
        { text: 'This is ', fontKey },
        { text: 'a longer paragraph ', fontKey },
        { text: 'that should wrap ', fontKey },
        { text: 'across multiple lines.', fontKey },
      ];

      const result = layoutEngine.layoutRuns(runs, 150);

      expect(result.lines.length).toBeGreaterThan(1);

      // Verify lines are contiguous
      for (let i = 1; i < result.lines.length; i++) {
        expect(result.lines[i].localStart).toBeGreaterThanOrEqual(result.lines[i - 1].localEnd);
      }
    });

    it('should respect max width with mixed fonts', () => {
      const boldFontKey = 'Arial|16|bold|normal';
      fontCache.warmCache([{ fontKey: boldFontKey }]);

      const runs: TextRun[] = [
        { text: 'Normal text ', fontKey },
        { text: 'Bold text ', fontKey: boldFontKey },
        { text: 'Normal again', fontKey },
      ];

      const maxWidth = 150;
      const result = layoutEngine.layoutRuns(runs, maxWidth);

      for (const line of result.lines) {
        expect(line.width).toBeLessThanOrEqual(maxWidth + 10);
      }
    });
  });

  describe('estimateHeight', () => {
    it('should estimate height for short text', () => {
      const textLength = 20;
      const height = layoutEngine.estimateHeight(textLength, fontKey, 500);

      expect(height).toBeGreaterThan(0);
      // Short text should fit in one line
      const metrics = fontCache.getMetrics(fontKey);
      expect(height).toBeLessThanOrEqual((metrics?.lineHeight ?? 20) * 2);
    });

    it('should estimate height for long text', () => {
      const textLength = 1000;
      const height = layoutEngine.estimateHeight(textLength, fontKey, 200);

      expect(height).toBeGreaterThan(0);
      // Long text should span multiple lines
      const metrics = fontCache.getMetrics(fontKey);
      const lineHeight = metrics?.lineHeight ?? 20;
      // With 1000 chars and narrow width, should have many lines
      expect(height).toBeGreaterThan(lineHeight);
    });

    it('should estimate higher for narrower width', () => {
      const textLength = 100;

      const height1 = layoutEngine.estimateHeight(textLength, fontKey, 500);
      const height2 = layoutEngine.estimateHeight(textLength, fontKey, 200);

      // With narrower width, same text should take more vertical space
      expect(height2).toBeGreaterThanOrEqual(height1);
    });

    it('should handle zero-length text', () => {
      const height = layoutEngine.estimateHeight(0, fontKey, 500);

      expect(height).toBeGreaterThan(0); // At least one line height
    });

    it('should return fallback for unknown font', () => {
      const unknownFont = 'UnknownFont|16|normal|normal';
      const height = layoutEngine.estimateHeight(100, unknownFont, 500);

      expect(height).toBe(20); // Default fallback
    });
  });

  describe('performance', () => {
    it('should layout typical paragraph in <5ms', () => {
      const text =
        'This is a typical paragraph with several words that might wrap across two or three lines depending on the width constraints.';
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        layoutEngine.layout(text, fontKey, 300);
      }
      const end = performance.now();

      const avgTime = (end - start) / iterations;
      expect(avgTime).toBeLessThan(5);
    });

    it('should layout multi-run paragraph in <10ms', () => {
      const runs: TextRun[] = [
        { text: 'This is ', fontKey },
        { text: 'a paragraph ', fontKey },
        { text: 'with multiple ', fontKey },
        { text: 'formatting runs ', fontKey },
        { text: 'that should still ', fontKey },
        { text: 'be fast.', fontKey },
      ];

      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        layoutEngine.layoutRuns(runs, 300);
      }
      const end = performance.now();

      const avgTime = (end - start) / iterations;
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only spaces', () => {
      const text = '     ';
      const result = layoutEngine.layout(text, fontKey, 500);

      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('should handle text with multiple consecutive spaces', () => {
      const text = 'word1    word2    word3';
      const result = layoutEngine.layout(text, fontKey, 500);

      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('should handle mixed whitespace', () => {
      const text = 'word1\t\tword2\n\nword3';
      const result = layoutEngine.layout(text, fontKey, 500);

      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('should handle Unicode characters', () => {
      const text = 'Hello 世界 مرحبا';
      const result = layoutEngine.layout(text, fontKey, 500);

      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.totalHeight).toBeGreaterThan(0);
    });

    it('should handle very narrow width (single character per line)', () => {
      const text = 'ABC';
      const result = layoutEngine.layout(text, fontKey, 10);

      // Should force break to fit narrow width
      expect(result.lines.length).toBeGreaterThan(0);
    });
  });
});
