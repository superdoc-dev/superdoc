import { describe, it, expect, beforeAll } from 'vitest';
import { measureBlock } from './index.js';
import type { FlowBlock, ParagraphMeasure, Measure } from '@superdoc/contracts';

/**
 * Integration tests for negative indent functionality.
 *
 * Negative indents allow text to extend into the page margin area per OOXML specification.
 * This is commonly used in documents to create special formatting effects like:
 * - Text that extends beyond the normal content area
 * - Hanging indents for lists or citations
 * - Special paragraph styles that need to extend into margins
 *
 * These tests verify that negative left and right indents correctly expand the
 * available content width for text measurement.
 */

const expectParagraphMeasure = (measure: Measure): ParagraphMeasure => {
  expect(measure.kind).toBe('paragraph');
  return measure as ParagraphMeasure;
};

describe('negative indent measurement', () => {
  beforeAll(() => {
    expect(typeof document).toBe('object');
    expect(typeof document.createElement).toBe('function');
  });

  describe('negative left indent', () => {
    it('expands content width when left indent is negative', async () => {
      const maxWidth = 400;
      const negativeIndent = -48;

      const blockWithNegativeIndent: FlowBlock = {
        kind: 'paragraph',
        id: 'para-neg-left',
        runs: [
          {
            text: 'Text with negative left indent extends into left margin',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: negativeIndent },
        },
      };

      const blockWithoutIndent: FlowBlock = {
        kind: 'paragraph',
        id: 'para-no-indent',
        runs: [
          {
            text: 'Text with negative left indent extends into left margin',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measureWithNegative = expectParagraphMeasure(await measureBlock(blockWithNegativeIndent, maxWidth));
      const measureWithoutIndent = expectParagraphMeasure(await measureBlock(blockWithoutIndent, maxWidth));

      // Negative left indent should increase available width
      const expectedWidth = maxWidth + Math.abs(negativeIndent);
      expect(measureWithNegative.lines[0].maxWidth).toBe(expectedWidth);
      expect(measureWithNegative.lines[0].maxWidth).toBeGreaterThan(measureWithoutIndent.lines[0].maxWidth);
    });

    it('correctly calculates content width with large negative left indent', async () => {
      const maxWidth = 468; // Typical content width (8.5" - 1" margins)
      const largeNegativeIndent = -144; // 2 inches into margin

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-large-neg-left',
        runs: [
          {
            text: 'This text extends far into the left margin area with a large negative indent value',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {
          indent: { left: largeNegativeIndent },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Content width should be expanded by the negative indent amount
      const expectedWidth = maxWidth + Math.abs(largeNegativeIndent);
      expect(measure.lines[0].maxWidth).toBe(expectedWidth);
      expect(measure.lines[0].maxWidth).toBe(612); // Should allow full page width
    });

    it('handles small negative left indent values', async () => {
      const maxWidth = 400;
      const smallNegativeIndent = -6; // Quarter of an em

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-small-neg-left',
        runs: [
          {
            text: 'Text with small negative indent',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: smallNegativeIndent },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      expect(measure.lines[0].maxWidth).toBe(maxWidth + Math.abs(smallNegativeIndent));
      expect(measure.lines[0].maxWidth).toBe(406);
    });
  });

  describe('negative right indent', () => {
    it('expands content width when right indent is negative', async () => {
      const maxWidth = 400;
      const negativeIndent = -48;

      const blockWithNegativeIndent: FlowBlock = {
        kind: 'paragraph',
        id: 'para-neg-right',
        runs: [
          {
            text: 'Text with negative right indent extends into right margin',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { right: negativeIndent },
        },
      };

      const blockWithoutIndent: FlowBlock = {
        kind: 'paragraph',
        id: 'para-no-indent',
        runs: [
          {
            text: 'Text with negative right indent extends into right margin',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measureWithNegative = expectParagraphMeasure(await measureBlock(blockWithNegativeIndent, maxWidth));
      const measureWithoutIndent = expectParagraphMeasure(await measureBlock(blockWithoutIndent, maxWidth));

      // Negative right indent should increase available width
      const expectedWidth = maxWidth + Math.abs(negativeIndent);
      expect(measureWithNegative.lines[0].maxWidth).toBe(expectedWidth);
      expect(measureWithNegative.lines[0].maxWidth).toBeGreaterThan(measureWithoutIndent.lines[0].maxWidth);
    });

    it('correctly calculates content width with large negative right indent', async () => {
      const maxWidth = 468;
      const largeNegativeIndent = -144;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-large-neg-right',
        runs: [
          {
            text: 'This text extends far into the right margin area with a large negative indent value',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {
          indent: { right: largeNegativeIndent },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      const expectedWidth = maxWidth + Math.abs(largeNegativeIndent);
      expect(measure.lines[0].maxWidth).toBe(expectedWidth);
      expect(measure.lines[0].maxWidth).toBe(612);
    });
  });

  describe('combined negative indents', () => {
    it('expands content width when both left and right indents are negative', async () => {
      const maxWidth = 400;
      const negativeLeft = -48;
      const negativeRight = -36;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-both-neg',
        runs: [
          {
            text: 'Text with both negative indents extends into both margins',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, right: negativeRight },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Both negative indents should be added to expand width
      const expectedWidth = maxWidth + Math.abs(negativeLeft) + Math.abs(negativeRight);
      expect(measure.lines[0].maxWidth).toBe(expectedWidth);
      expect(measure.lines[0].maxWidth).toBe(484);
    });

    it('handles equal negative left and right indents', async () => {
      const maxWidth = 400;
      const negativeIndent = -50;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-equal-neg',
        runs: [
          {
            text: 'Text with equal negative indents on both sides',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: negativeIndent, right: negativeIndent },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      const expectedWidth = maxWidth + 2 * Math.abs(negativeIndent);
      expect(measure.lines[0].maxWidth).toBe(expectedWidth);
      expect(measure.lines[0].maxWidth).toBe(500);
    });
  });

  describe('mixed positive and negative indents', () => {
    it('correctly calculates width with positive left and negative right indent', async () => {
      const maxWidth = 400;
      const positiveLeft = 48;
      const negativeRight = -36;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-mixed-1',
        runs: [
          {
            text: 'Text with positive left indent and negative right indent',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: positiveLeft, right: negativeRight },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Positive left reduces width, negative right increases it
      const expectedWidth = maxWidth - positiveLeft + Math.abs(negativeRight);
      expect(measure.lines[0].maxWidth).toBe(expectedWidth);
      expect(measure.lines[0].maxWidth).toBe(388);
    });

    it('correctly calculates width with negative left and positive right indent', async () => {
      const maxWidth = 400;
      const negativeLeft = -48;
      const positiveRight = 36;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-mixed-2',
        runs: [
          {
            text: 'Text with negative left indent and positive right indent',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, right: positiveRight },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Negative left increases width, positive right reduces it
      const expectedWidth = maxWidth + Math.abs(negativeLeft) - positiveRight;
      expect(measure.lines[0].maxWidth).toBe(expectedWidth);
      expect(measure.lines[0].maxWidth).toBe(412);
    });

    it('handles case where positive and negative indents cancel out', async () => {
      const maxWidth = 400;
      const indent = 50;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-cancel',
        runs: [
          {
            text: 'Text where indents cancel out',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: indent, right: -indent },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Should result in original maxWidth
      expect(measure.lines[0].maxWidth).toBe(maxWidth);
    });
  });

  describe('negative indent with hanging indent', () => {
    it('calculates first line width correctly with negative left indent and hanging indent', async () => {
      const maxWidth = 400;
      const negativeLeft = -48;
      const hanging = 24;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-neg-hanging',
        runs: [
          {
            text: 'First line of text. Second line of text with hanging indent continues here and wraps.',
            fontFamily: 'Arial',
            fontSize: 14,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, hanging },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // First line: expanded by negative left, not affected by hanging
      const expectedFirstLineWidth = maxWidth + Math.abs(negativeLeft);
      expect(measure.lines[0].maxWidth).toBe(expectedFirstLineWidth);

      // Body lines use the same contentWidth as first line.
      // The hanging indent affects WHERE body lines start (position), not their available width.
      // Since indentLeft already accounts for body line position, body lines get full contentWidth.
      if (measure.lines.length > 1) {
        const expectedBodyLineWidth = maxWidth + Math.abs(negativeLeft);
        expect(measure.lines[1].maxWidth).toBe(expectedBodyLineWidth);
      }
    });

    it('calculates body line width correctly with negative indent and hanging indent', async () => {
      const maxWidth = 300;
      const negativeLeft = -36;
      const hanging = 18;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-body-hanging',
        runs: [
          {
            text: 'This is a longer paragraph with negative left indent and hanging indent. The first line should have more space, while subsequent lines should have the hanging indent applied. This ensures proper text flow.',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, hanging },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Should have multiple lines due to narrow maxWidth
      expect(measure.lines.length).toBeGreaterThan(1);

      // First line width
      const expectedFirstLineWidth = maxWidth + Math.abs(negativeLeft);
      expect(measure.lines[0].maxWidth).toBe(expectedFirstLineWidth);

      // Body lines use full contentWidth - hanging affects position, not available width
      const expectedBodyLineWidth = maxWidth + Math.abs(negativeLeft);
      expect(measure.lines[1].maxWidth).toBe(expectedBodyLineWidth);
      expect(measure.lines[1].maxWidth).toBe(336);
    });

    it('handles negative indent with firstLine indent', async () => {
      const maxWidth = 400;
      const negativeLeft = -48;
      const firstLine = 36;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-neg-firstline',
        runs: [
          {
            text: 'This paragraph has a negative left indent and a positive first line indent. The first line should be indented, but still benefit from the negative left indent on the base.',
            fontFamily: 'Arial',
            fontSize: 14,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, firstLine },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // First line: negative left expands, then firstLine reduces
      // contentWidth = maxWidth - negativeLeft (which adds) - 0 (no right)
      // firstLineWidth = contentWidth - firstLine
      const expectedFirstLineWidth = maxWidth + Math.abs(negativeLeft) - firstLine;
      expect(measure.lines[0].maxWidth).toBe(expectedFirstLineWidth);

      if (measure.lines.length > 1) {
        // Body lines: just the expanded width from negative indent
        const expectedBodyLineWidth = maxWidth + Math.abs(negativeLeft);
        expect(measure.lines[1].maxWidth).toBe(expectedBodyLineWidth);
      }
    });

    it('handles case where hanging is greater than firstLine with negative indent', async () => {
      const maxWidth = 400;
      const negativeLeft = -48;
      const firstLine = 10;
      const hanging = 30;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-hanging-gt-first',
        runs: [
          {
            text: 'This tests the edge case where hanging indent is greater than first line indent, combined with negative left indent. This should affect body line width.',
            fontFamily: 'Arial',
            fontSize: 14,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, firstLine, hanging },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      expect(measure.lines.length).toBeGreaterThan(1);

      // When hanging > firstLine, first line offset is clamped to 0.
      // Body lines use full contentWidth - hanging affects position, not available width.
      const contentWidth = maxWidth + Math.abs(negativeLeft);
      const rawFirstLineOffset = firstLine - hanging; // 10 - 30 = -20
      const clampedFirstLineOffset = Math.max(0, rawFirstLineOffset); // 0

      const expectedFirstLineWidth = contentWidth - clampedFirstLineOffset;
      const expectedBodyLineWidth = contentWidth; // Body lines use full contentWidth

      expect(measure.lines[0].maxWidth).toBe(expectedFirstLineWidth);
      expect(measure.lines[0].maxWidth).toBe(448);

      expect(measure.lines[1].maxWidth).toBe(expectedBodyLineWidth);
      expect(measure.lines[1].maxWidth).toBe(448);
    });
  });

  describe('edge cases', () => {
    it('handles zero indent after negative indent was used', async () => {
      const maxWidth = 400;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-zero-indent',
        runs: [
          {
            text: 'Text with zero indent (explicitly set)',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: 0, right: 0 },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Zero indent should not change width
      expect(measure.lines[0].maxWidth).toBe(maxWidth);
    });

    it('ensures minimum width of 1 even with extreme indents', async () => {
      const maxWidth = 100;
      const extremePositive = 1000;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-extreme-positive',
        runs: [
          {
            text: 'X',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: extremePositive },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Should enforce minimum width of 1
      expect(measure.lines[0].maxWidth).toBeGreaterThanOrEqual(1);
    });

    it('handles negative indent with multi-line text', async () => {
      const maxWidth = 200;
      const negativeLeft = -50;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-multiline-neg',
        runs: [
          {
            text: 'This is a long paragraph that will definitely wrap to multiple lines when measured with a narrow max width, testing that negative indent applies to all lines consistently.',
            fontFamily: 'Arial',
            fontSize: 14,
          },
        ],
        attrs: {
          indent: { left: negativeLeft },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      // Should have multiple lines
      expect(measure.lines.length).toBeGreaterThan(1);

      // All lines should have the same expanded maxWidth
      const expectedWidth = maxWidth + Math.abs(negativeLeft);
      measure.lines.forEach((line) => {
        expect(line.maxWidth).toBe(expectedWidth);
      });
    });

    it('handles negative indent with decimal values', async () => {
      const maxWidth = 400;
      const negativeLeft = -12.5;
      const negativeRight = -18.75;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-decimal-neg',
        runs: [
          {
            text: 'Text with decimal negative indents',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, right: negativeRight },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      const expectedWidth = maxWidth + Math.abs(negativeLeft) + Math.abs(negativeRight);
      expect(measure.lines[0].maxWidth).toBe(expectedWidth);
      expect(measure.lines[0].maxWidth).toBe(431.25);
    });
  });

  describe('real-world scenarios', () => {
    it('handles typical DOCX negative indent for extending text into margin', async () => {
      // Common scenario: 1" margins (72pt), negative indent of -0.5" (36pt)
      const contentWidth = 468; // 8.5" page - 1" margins on each side
      const halfInchNegative = -36;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-docx-scenario',
        runs: [
          {
            text: 'This paragraph uses a common DOCX pattern of negative indent to extend text into the left margin area, often used for special headings or callouts.',
            fontFamily: 'Calibri',
            fontSize: 11,
          },
        ],
        attrs: {
          indent: { left: halfInchNegative },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, contentWidth));

      // Should expand width by the negative indent amount
      expect(measure.lines[0].maxWidth).toBe(contentWidth + Math.abs(halfInchNegative));
      expect(measure.lines[0].maxWidth).toBe(504);
    });

    it('handles negative indent with list-style hanging indent', async () => {
      // Common list pattern: negative left margin with hanging indent
      const maxWidth = 468;
      const negativeLeft = -36; // Extend into margin
      const hanging = 24; // Indent for list text

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-list-style',
        runs: [
          {
            text: '• This is a list item with a bullet that extends into the margin area, while the wrapped text is indented.',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, hanging },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));

      expect(measure.lines.length).toBeGreaterThan(1);

      // First line (with bullet) gets full expanded width
      expect(measure.lines[0].maxWidth).toBe(maxWidth + Math.abs(negativeLeft));

      // Body lines also use full contentWidth - hanging affects position, not available width
      expect(measure.lines[1].maxWidth).toBe(maxWidth + Math.abs(negativeLeft));
    });

    it('keeps first-line width aligned when negative left/right indents include hanging', async () => {
      const maxWidth = 468;
      const negativeLeft = -36;
      const negativeRight = -54;
      const hanging = 24;

      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-neg-left-right-hanging',
        runs: [
          {
            text: 'This paragraph uses negative left and right indents with a hanging indent to ensure the first line does not expand beyond the body line width.',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {
          indent: { left: negativeLeft, right: negativeRight, hanging },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));
      expect(measure.lines.length).toBeGreaterThan(1);

      const contentWidth = maxWidth + Math.abs(negativeLeft) + Math.abs(negativeRight);
      expect(measure.lines[0].maxWidth).toBe(contentWidth);
      expect(measure.lines[1].maxWidth).toBe(contentWidth);
    });
  });
});
