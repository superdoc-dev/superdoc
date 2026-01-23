import { describe, it, expect, beforeAll } from 'vitest';
import { measureBlock } from './index.js';
import type {
  FlowBlock,
  ParagraphMeasure,
  ImageMeasure,
  Measure,
  DrawingMeasure,
  DrawingBlock,
} from '@superdoc/contracts';

const expectParagraphMeasure = (measure: Measure): ParagraphMeasure => {
  expect(measure.kind).toBe('paragraph');
  return measure as ParagraphMeasure;
};

const extractLineText = (block: FlowBlock, line: ParagraphMeasure['lines'][number]): string => {
  if (block.kind !== 'paragraph') return '';
  const runs = (block as FlowBlock).runs || [];
  const parts: string[] = [];
  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex++) {
    const run = runs[runIndex] as { text?: string };
    if (!run || typeof run.text !== 'string') continue;
    const start = runIndex === line.fromRun ? line.fromChar : 0;
    const end = runIndex === line.toRun ? line.toChar : run.text.length;
    parts.push(run.text.slice(start, end));
  }
  return parts.join('');
};

const expectImageMeasure = (measure: Measure): ImageMeasure => {
  expect(measure.kind).toBe('image');
  return measure as ImageMeasure;
};

const expectDrawingMeasure = (measure: Measure): DrawingMeasure => {
  expect(measure.kind).toBe('drawing');
  return measure as DrawingMeasure;
};

describe('measureBlock', () => {
  // Ensure we're in a jsdom environment
  beforeAll(() => {
    expect(typeof document).toBe('object');
    expect(typeof document.createElement).toBe('function');
  });

  describe('basic measurement', () => {
    it('measures a simple single-line block', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Hello',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0]).toMatchObject({
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
      });
      expect(measure.lines[0].width).toBeGreaterThan(0);
      // Ascent/descent now use actual font metrics from Canvas API instead of
      // hardcoded 0.8/0.2 approximations. This prevents text clipping.
      // Values vary by font, so we check for reasonable ranges.
      expect(measure.lines[0].ascent).toBeGreaterThan(0);
      expect(measure.lines[0].ascent).toBeLessThan(16 * 1.2); // Should be reasonable for 16px font
      expect(measure.lines[0].descent).toBeGreaterThan(0);
      expect(measure.lines[0].descent).toBeLessThan(16 * 0.5);
      // lineHeight should be at least ascent + descent (+ safety margin)
      expect(measure.lines[0].lineHeight).toBeGreaterThanOrEqual(measure.lines[0].ascent + measure.lines[0].descent);
      expect(measure.totalHeight).toBe(measure.lines[0].lineHeight);
    });

    it('breaks lines when text exceeds maxWidth', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'This is a long paragraph that should break into multiple lines',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Use a narrow width to force line breaks
      const measure = expectParagraphMeasure(await measureBlock(block, 100));

      expect(measure.lines.length).toBeGreaterThan(1);
      // totalHeight should equal sum of all line heights (which now use actual font metrics)
      const expectedHeight = measure.lines.reduce((sum, line) => sum + line.lineHeight, 0);
      expect(measure.totalHeight).toBe(expectedHeight);

      // All lines except maybe the last should be near maxWidth
      for (let i = 0; i < measure.lines.length - 1; i++) {
        expect(measure.lines[i].width).toBeLessThanOrEqual(100);
      }
    });

    it('falls back when text runs are missing font size', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          // Intentionally omitting fontSize to test fallback behavior
          {
            text: 'Hello',
            fontFamily: 'Arial',
          } as unknown as TextRun,
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(Number.isFinite(measure.lines[0].lineHeight)).toBe(true);
      expect(measure.lines[0].lineHeight).toBeGreaterThan(0);
      expect(measure.lines[0].width).toBeGreaterThan(0);
    });

    it('uses content width for wordLayout list first lines with standard hanging indent', async () => {
      // Standard hanging indent pattern: marker is positioned in the hanging area (left of text),
      // NOT inline with text. The marker doesn't consume horizontal space on the first line.
      const maxWidth = 200;
      const indentLeft = 32;
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'wordlayout-list',
        runs: [
          {
            text: 'List item text that should wrap correctly even with a hanging indent marker present',
            fontFamily: 'Times New Roman',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: indentLeft, hanging: indentLeft },
          wordLayout: {
            indentLeftPx: indentLeft,
            // Note: firstLineIndentMode is NOT set, so this is standard hanging indent
            marker: {
              markerText: '1.',
              markerBoxWidthPx: 20,
              gutterWidthPx: 12,
              run: {
                fontFamily: 'Times New Roman',
                fontSize: 16,
                bold: false,
                italic: false,
                letterSpacing: 0,
              },
            },
          },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));
      // For standard hanging indent, the marker is in the hanging area (doesn't take in-flow space).
      // First line available width = maxWidth - indentLeft (same as subsequent lines).
      expect(measure.lines[0].maxWidth).toBe(maxWidth - indentLeft);
    });

    it('uses textStartPx for wordLayout list first lines when textStartPx > indentLeft', async () => {
      const maxWidth = 200;
      const textStartPx = 100; // Where text actually starts (after marker + tab)
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'wordlayout-list-firstline',
        runs: [
          {
            text: 'List item text should wrap based on textStartPx when marker occupies space',
            fontFamily: 'Times New Roman',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: 0, firstLine: 48 },
          wordLayout: {
            indentLeftPx: 0,
            textStartPx,
            marker: {
              markerText: '(a)',
              markerBoxWidthPx: 24,
              gutterWidthPx: 8,
              run: {
                fontFamily: 'Times New Roman',
                fontSize: 16,
                bold: false,
                italic: false,
                letterSpacing: 0,
              },
            },
          },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));
      // When textStartPx > indentLeft, available width = maxWidth - textStartPx
      expect(measure.lines[0].maxWidth).toBe(maxWidth - textStartPx);
    });

    it('falls back to marker.textStartX when wordLayout.textStartPx is missing', async () => {
      const maxWidth = 200;
      const textStartX = 96; // First-line text start after marker + tab
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'wordlayout-list-textStartX',
        runs: [
          {
            text: 'List item text should wrap based on marker.textStartX when textStartPx is missing',
            fontFamily: 'Times New Roman',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: 0, firstLine: 48 },
          wordLayout: {
            indentLeftPx: 0,
            // Intentionally omit top-level textStartPx to simulate partial/legacy producers.
            marker: {
              markerText: '(a)',
              markerBoxWidthPx: 24,
              gutterWidthPx: 8,
              textStartX,
              run: {
                fontFamily: 'Times New Roman',
                fontSize: 16,
                bold: false,
                italic: false,
                letterSpacing: 0,
              },
            },
          },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));
      expect(measure.lines[0].maxWidth).toBe(maxWidth - textStartX);
    });

    it('expands first-line width for hanging indents on non-list paragraphs', async () => {
      const maxWidth = 400;
      const indentLeft = 48;
      const hanging = 24;
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'hanging-indent-non-list',
        runs: [
          {
            text: 'This paragraph uses a hanging indent with enough text to wrap onto multiple lines for testing.',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: indentLeft, hanging },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, maxWidth));
      expect(measure.lines.length).toBeGreaterThan(1);

      const contentWidth = maxWidth - indentLeft;
      expect(measure.lines[0].maxWidth).toBe(contentWidth + hanging);
      expect(measure.lines[1].maxWidth).toBe(contentWidth);
    });

    it('measures empty block correctly', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 200));

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].width).toBeGreaterThanOrEqual(0);
      expect(measure.lines[0].lineHeight).toBeGreaterThanOrEqual(16);
      expect(measure.lines[0].lineHeight).toBeLessThan(16 * 1.15);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });

    it('preserves marker measurements for empty list paragraphs', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'empty-list',
        runs: [
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: 0, hanging: 18 },
          wordLayout: {
            indentLeftPx: 0,
            marker: {
              markerText: '1.',
              gutterWidthPx: 8,
              run: {
                fontFamily: 'Arial',
                fontSize: 16,
                bold: false,
                italic: false,
                letterSpacing: 0,
              },
            },
          },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 200));

      expect(measure.lines).toHaveLength(1);
      expect(measure.marker).toBeDefined();
      expect(measure.marker?.markerWidth).toBeGreaterThan(0);
      expect(measure.marker?.markerTextWidth).toBeGreaterThan(0);
    });

    it('creates a new line for explicit lineBreak runs', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Heading text',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          { kind: 'lineBreak' },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 500));

      expect(measure.lines).toHaveLength(2);
      expect(measure.lines[0].width).toBeGreaterThan(0);
      expect(measure.lines[1].width).toBe(0);
      expect(measure.totalHeight).toBeCloseTo(measure.lines[0].lineHeight + measure.lines[1].lineHeight, 5);
    });

    it('places following text on the next line after a lineBreak run', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Line one',
            fontFamily: 'Arial',
            fontSize: 14,
          },
          { kind: 'lineBreak' },
          {
            text: 'Line two',
            fontFamily: 'Arial',
            fontSize: 14,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 500));

      expect(measure.lines).toHaveLength(2);
      expect(measure.lines[0].width).toBeGreaterThan(0);
      expect(measure.lines[1].width).toBeGreaterThan(0);
    });

    it('creates an empty line for leading lineBreak at start of paragraph', async () => {
      // Regression test: DOCX documents can have <w:br/> at the start of a paragraph
      // (e.g., signature blocks with blank lines before "By:" text). These leading
      // line breaks must create an empty line, not be silently dropped.
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          { kind: 'lineBreak' },
          {
            text: 'By: ___________________________',
            fontFamily: 'Arial',
            fontSize: 14,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 500));

      // Should have 2 lines: an empty line from the leading lineBreak, then the text
      expect(measure.lines).toHaveLength(2);
      expect(measure.lines[0].width).toBe(0); // Empty line from leading lineBreak
      expect(measure.lines[1].width).toBeGreaterThan(0); // "By: ___" text
    });

    it('handles multiple leading lineBreaks at start of paragraph', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          { kind: 'lineBreak' },
          { kind: 'lineBreak' },
          {
            text: 'Content after two breaks',
            fontFamily: 'Arial',
            fontSize: 14,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 500));

      // Should have 3 lines: two empty lines, then text
      expect(measure.lines).toHaveLength(3);
      expect(measure.lines[0].width).toBe(0);
      expect(measure.lines[1].width).toBe(0);
      expect(measure.lines[2].width).toBeGreaterThan(0);
    });

    it('uses the first text run font size for leading lineBreak height', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          { kind: 'lineBreak' },
          {
            text: 'Heading text',
            fontFamily: 'Arial',
            fontSize: 24,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 500));

      expect(measure.lines).toHaveLength(2);
      expect(measure.lines[0].lineHeight).toBeCloseTo(measure.lines[1].lineHeight, 3);
    });
  });

  describe('multi-run blocks', () => {
    it('measures blocks with multiple runs', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Hello ',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            text: 'world',
            fontFamily: 'Arial',
            fontSize: 16,
            bold: true,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].fromRun).toBe(0);
      expect(measure.lines[0].toRun).toBeGreaterThanOrEqual(0);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });

    it('breaks across multiple runs correctly', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'This is ',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            text: 'a very long text ',
            fontFamily: 'Arial',
            fontSize: 16,
            bold: true,
          },
          {
            text: 'that spans multiple runs',
            fontFamily: 'Arial',
            fontSize: 16,
            italic: true,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 150));

      expect(measure.lines.length).toBeGreaterThan(1);
      // Lines should reference the correct run indices
      measure.lines.forEach((line) => {
        expect(line.fromRun).toBeGreaterThanOrEqual(0);
        expect(line.toRun).toBeLessThanOrEqual(2);
        expect(line.toRun).toBeGreaterThanOrEqual(line.fromRun);
      });
    });
  });

  describe('advanced styling', () => {
    it('accounts for letter spacing in measured width', async () => {
      const baseBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'letters',
        runs: [{ text: 'Spacing test', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {},
      };

      const spacedBlock: FlowBlock = {
        ...baseBlock,
        id: 'letters-spaced',
        runs: [{ ...baseBlock.runs[0], letterSpacing: 2 }],
      };

      const baseMeasure = expectParagraphMeasure(await measureBlock(baseBlock, 400));
      const spacedMeasure = expectParagraphMeasure(await measureBlock(spacedBlock, 400));

      expect(spacedMeasure.lines[0].width).toBeGreaterThan(baseMeasure.lines[0].width);
    });

    it('reduces available width when paragraph indent is set', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'indented',
        runs: [
          {
            text: 'This is a long paragraph that should wrap to multiple lines when indented.',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          indent: { left: 40, right: 20, firstLine: 30 },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      const effectiveWidth = 400 - 40 - 20 - 30;
      expect(measure.lines[0].width).toBeLessThanOrEqual(effectiveWidth + 5);
    });

    it('aligns runs using decimal tab stops when defined', async () => {
      const decimalBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'decimal-tab',
        runs: [
          {
            text: 'Price:\t12.99',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          tabs: [{ pos: 72, align: 'decimal' }],
        },
      };

      const leftBlock: FlowBlock = {
        ...decimalBlock,
        id: 'left-tab',
        attrs: {
          tabs: [{ pos: 72, align: 'left' }],
        },
      };

      const decimalMeasure = expectParagraphMeasure(await measureBlock(decimalBlock, 400));
      const leftMeasure = expectParagraphMeasure(await measureBlock(leftBlock, 400));

      expect(decimalMeasure.lines[0].width).toBeLessThanOrEqual(leftMeasure.lines[0].width);
    });

    it('respects locale-specific decimal separators', async () => {
      const decimalBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'decimal-tab-comma',
        runs: [
          {
            text: 'Total:	12,75',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          tabs: [{ pos: 72, align: 'decimal' }],
          decimalSeparator: ',',
        },
      };

      const controlBlock: FlowBlock = {
        ...decimalBlock,
        id: 'decimal-tab-left-control',
        attrs: {
          tabs: [{ pos: 72, align: 'left' }],
        },
      };

      const decimalMeasure = expectParagraphMeasure(await measureBlock(decimalBlock, 400));
      const controlMeasure = expectParagraphMeasure(await measureBlock(controlBlock, 400));

      expect(decimalMeasure.lines[0].width).toBeLessThanOrEqual(controlMeasure.lines[0].width);
    });

    it('centers the segment after a center tab stop', async () => {
      const centerBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'center-tab',
        runs: [{ text: 'Title\tCentered', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          // Using legacy shape for brevity; engine path normalizes internally
          tabs: [{ pos: 100, align: 'center' }],
        },
      };

      const leftBlock: FlowBlock = {
        ...centerBlock,
        id: 'center-tab-left',
        attrs: { tabs: [{ pos: 100, align: 'left' }] },
      };

      const centerMeasure = expectParagraphMeasure(await measureBlock(centerBlock, 400));
      const leftMeasure = expectParagraphMeasure(await measureBlock(leftBlock, 400));

      // Center alignment should not exceed left-aligned width for the same stop
      expect(centerMeasure.lines[0].width).toBeLessThanOrEqual(leftMeasure.lines[0].width);
      expect(centerMeasure.lines[0].width).toBeGreaterThan(0);
    });

    it('right-aligns the segment after an end tab stop', async () => {
      const endBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'end-tab',
        runs: [{ text: 'Total\t123.45', fontFamily: 'Arial', fontSize: 16 }],
        attrs: {
          tabs: [{ pos: 120, align: 'right' }],
        },
      };

      const leftBlock: FlowBlock = {
        ...endBlock,
        id: 'end-tab-left',
        attrs: { tabs: [{ pos: 120, align: 'left' }] },
      };

      const endMeasure = expectParagraphMeasure(await measureBlock(endBlock, 400));
      const leftMeasure = expectParagraphMeasure(await measureBlock(leftBlock, 400));

      // End alignment places text so its right edge hits the stop; width should be reasonable
      expect(endMeasure.lines[0].width).toBeLessThanOrEqual(leftMeasure.lines[0].width);
      expect(endMeasure.lines[0].width).toBeGreaterThan(0);
    });

    it('defaults to period (.) when decimalSeparator not specified', async () => {
      const decimalBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'decimal-tab-default',
        runs: [
          {
            text: 'Price:	99.99',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          tabs: [{ pos: 72, align: 'decimal' }],
          // decimalSeparator not specified - should default to '.'
        },
      };

      const controlBlock: FlowBlock = {
        ...decimalBlock,
        id: 'decimal-tab-left-control',
        attrs: {
          tabs: [{ pos: 72, align: 'left' }],
        },
      };

      const decimalMeasure = expectParagraphMeasure(await measureBlock(decimalBlock, 400));
      const controlMeasure = expectParagraphMeasure(await measureBlock(controlBlock, 400));

      // With decimal alignment on '.', the text should align properly
      expect(decimalMeasure.lines[0].width).toBeLessThanOrEqual(controlMeasure.lines[0].width);
      expect(decimalMeasure.lines[0].width).toBeGreaterThan(0);
    });

    it('falls back to tab position when decimal separator is absent', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'decimal-missing',
        runs: [
          {
            text: 'Total:\tValue',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          tabs: [{ pos: 60, align: 'decimal' }],
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      expect(measure.lines[0].width).toBeGreaterThan(0);
    });

    it('right-aligns multiple runs after an end tab stop as a group', async () => {
      // This tests the "Page 1 of 2" footer scenario where multiple runs follow a right-aligned tab.
      // All content after the tab should be treated as a unit for alignment purposes,
      // matching Microsoft Word's behavior.
      const multiRunBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'multi-run-end-tab',
        runs: [
          { kind: 'tab' } as Run,
          { text: 'Page ', fontFamily: 'Arial', fontSize: 12 },
          { text: '1', fontFamily: 'Arial', fontSize: 12, bold: true },
          { text: ' of ', fontFamily: 'Arial', fontSize: 12 },
          { text: '2', fontFamily: 'Arial', fontSize: 12, bold: true },
        ],
        attrs: {
          tabs: [{ pos: 300, val: 'end' }],
        },
      };

      // Single run version for comparison
      const singleRunBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'single-run-end-tab',
        runs: [{ kind: 'tab' } as Run, { text: 'Page 1 of 2', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          tabs: [{ pos: 300, val: 'end' }],
        },
      };

      const multiRunMeasure = expectParagraphMeasure(await measureBlock(multiRunBlock, 400));
      const singleRunMeasure = expectParagraphMeasure(await measureBlock(singleRunBlock, 400));

      // Both should fit on a single line
      expect(multiRunMeasure.lines).toHaveLength(1);
      expect(singleRunMeasure.lines).toHaveLength(1);

      // The line widths should be approximately equal (both end at the tab stop)
      // The multi-run version should NOT wrap due to improper segment-by-segment alignment
      expect(multiRunMeasure.lines[0].width).toBeCloseTo(singleRunMeasure.lines[0].width, 0);

      // The first segment after the tab should have an explicit x position
      const multiRunSegments = multiRunMeasure.lines[0].segments;
      expect(multiRunSegments).toBeDefined();
      expect(multiRunSegments!.length).toBeGreaterThan(1);

      // Find the first text segment (after the tab run at index 0)
      const firstTextSegment = multiRunSegments!.find((s) => s.runIndex > 0);
      expect(firstTextSegment).toBeDefined();
      expect(firstTextSegment!.x).toBeDefined();
      // The x position should be less than the tab stop (content is right-aligned)
      expect(firstTextSegment!.x).toBeLessThan(300);
    });

    it('positions leading spaces correctly in tab alignment groups', async () => {
      // Regression test: leading spaces in runs after a tab must advance the X position.
      // Bug: " of " run's leading space was positioned but didn't update activeTabGroup.currentX,
      // causing "of " to overlap with the space at the same X position.
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'space-positioning-test',
        runs: [
          { kind: 'tab' } as Run,
          { text: 'A', fontFamily: 'Arial', fontSize: 12 },
          { text: ' B', fontFamily: 'Arial', fontSize: 12 }, // Leading space before B
        ],
        attrs: {
          tabs: [{ pos: 200, val: 'end' }],
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 300));
      expect(measure.lines).toHaveLength(1);

      const segments = measure.lines[0].segments!;
      // Should have: tab segment, "A" segment, " " (space) segment, "B" segment
      // Find segments by content
      const textSegments = segments.filter((s) => s.runIndex > 0);
      expect(textSegments.length).toBeGreaterThanOrEqual(3); // A, space, B (at minimum)

      // All text segments should have explicit X positions (in tab alignment group)
      for (const seg of textSegments) {
        expect(seg.x).toBeDefined();
      }

      // Verify segments don't overlap: each segment's X should be >= previous segment's X + width
      for (let i = 1; i < textSegments.length; i++) {
        const prev = textSegments[i - 1];
        const curr = textSegments[i];
        // Current X should be at or after previous segment ends
        expect(curr.x).toBeGreaterThanOrEqual(prev.x! + prev.width - 0.5); // Allow small rounding tolerance
      }
    });

    it('converts spacing multipliers using the baseline line height', async () => {
      const fontSize = 16;
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'spaced',
        runs: [
          {
            text: 'Line height test',
            fontFamily: 'Arial',
            fontSize,
          },
        ],
        attrs: {
          spacing: { line: 1.5, lineRule: 'auto' },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      // Word 2007+ uses fontSize × 1.15 as "single" line spacing (not just ascent+descent).
      // The Canvas TextMetrics API doesn't expose lineGap, so we approximate it with 1.15×.
      // The spacing multiplier (1.5) is applied to this base.
      const singleLineHeight = fontSize * 1.15;
      expect(measure.lines[0].lineHeight).toBeCloseTo(1.5 * singleLineHeight, 1);
    });

    it('applies higher auto multipliers to the baseline line height', async () => {
      const fontSize = 16;
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'double-spaced',
        runs: [
          {
            text: 'Double spaced text',
            fontFamily: 'Arial',
            fontSize,
          },
        ],
        attrs: {
          spacing: { line: 2, lineRule: 'auto' },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      // Word 2007+ uses fontSize × 1.15 as "single" line spacing.
      // The spacing multiplier (2.0) is applied to this base.
      const singleLineHeight = fontSize * 1.15;
      expect(measure.lines[0].lineHeight).toBeCloseTo(2 * singleLineHeight, 1);
    });

    it('applies large auto values as multipliers', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'absolute-spacing',
        runs: [
          {
            text: 'Absolute spacing',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {
          spacing: { line: 42, lineRule: 'auto' },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      const singleLineHeight = 16 * 1.15;
      expect(measure.lines[0].lineHeight).toBeCloseTo(42 * singleLineHeight, 1);
    });

    it('does not clamp line height for very small fonts', async () => {
      const smallFontSize = 8; // Very small font
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'small-font',
        runs: [
          {
            text: 'Tiny text',
            fontFamily: 'Arial',
            fontSize: smallFontSize,
          },
        ],
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      const expectedLineHeight = smallFontSize * 1.15; // 8 * 1.15 = 9.2px
      expect(measure.lines[0].lineHeight).toBeCloseTo(expectedLineHeight, 1);
      expect(measure.lines[0].lineHeight).toBeLessThan(16);
    });

    it('uses 1.15 multiplier for normal fonts', async () => {
      const fontSize = 20;
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'normal-font',
        runs: [
          {
            text: 'Normal text',
            fontFamily: 'Arial',
            fontSize,
          },
        ],
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      // Normal font should use fontSize * 1.15
      const expectedLineHeight = fontSize * 1.15; // 20 * 1.15 = 23px
      expect(measure.lines[0].lineHeight).toBeCloseTo(expectedLineHeight, 1);
    });

    it('bypasses 1.15 base with exact lineRule', async () => {
      const fontSize = 16;
      const exactHeight = 30;
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'exact-height',
        runs: [
          {
            text: 'Exact line height',
            fontFamily: 'Arial',
            fontSize,
          },
        ],
        attrs: {
          spacing: { line: exactHeight, lineRule: 'exact' },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      // With lineRule: 'exact', should use the exact value, not the 1.15 base
      expect(measure.lines[0].lineHeight).toBeCloseTo(exactHeight, 1);
    });

    it('uses max of base and specified value with atLeast lineRule', async () => {
      const fontSize = 16;
      const atLeastHeight = 12; // Less than base (16 * 1.15 = 18.4)
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'at-least-height',
        runs: [
          {
            text: 'At least line height',
            fontFamily: 'Arial',
            fontSize,
          },
        ],
        attrs: {
          spacing: { line: atLeastHeight, lineRule: 'atLeast' },
        },
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      // With lineRule: 'atLeast', should use max of base (18.4) and specified (12)
      const baseLineHeight = fontSize * 1.15; // 18.4
      expect(measure.lines[0].lineHeight).toBeCloseTo(baseLineHeight, 1);
    });

    it('ensures line height is never smaller than glyph bounds to prevent clipping', async () => {
      // This test verifies the clamp: Math.max(fontSize * 1.15, ascent + descent)
      // For any font, line height must be >= ascent + descent to prevent glyph overlap
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'clamp-test',
        runs: [
          {
            text: 'Test clipping prevention',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 400));
      const glyphBounds = measure.lines[0].ascent + measure.lines[0].descent;
      // Line height must always accommodate the full glyph bounds
      expect(measure.lines[0].lineHeight).toBeGreaterThanOrEqual(glyphBounds);
    });

    it('measures list blocks and returns marker widths and indents', async () => {
      const listBlock: FlowBlock = {
        kind: 'list',
        id: 'list-1',
        listType: 'number',
        items: [
          {
            id: 'item-1',
            marker: { kind: 'number', text: '1.', level: 0, order: 1 },
            paragraph: {
              kind: 'paragraph',
              id: 'para-1',
              runs: [{ text: 'First', fontFamily: 'Arial', fontSize: 16 }],
              attrs: { indent: { left: 24, hanging: 18 } },
            },
          },
          {
            id: 'item-2',
            marker: { kind: 'number', text: '2.', level: 0, order: 2 },
            paragraph: {
              kind: 'paragraph',
              id: 'para-2',
              runs: [{ text: 'Second', fontFamily: 'Arial', fontSize: 16 }],
              attrs: { indent: { left: 24, hanging: 18 } },
            },
          },
        ],
      };

      const measure = await measureBlock(listBlock, 400);
      expect(measure.kind).toBe('list');
      if (measure.kind !== 'list') throw new Error('expected list measure');
      expect(measure.items).toHaveLength(2);
      expect(measure.items[0].markerWidth).toBeGreaterThan(0);
      expect(measure.items[0].markerTextWidth).toBeGreaterThan(0);
      expect(measure.items[0].indentLeft).toBe(24);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });
  });

  describe('typography metrics', () => {
    it('calculates correct metrics for standard font size', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Test',
            fontFamily: 'Arial',
            fontSize: 20,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      // Typography metrics now use actual Canvas API measurements instead of hardcoded ratios
      // This prevents text clipping for fonts with non-standard ascent/descent ratios
      expect(measure.lines[0].ascent).toBeGreaterThan(0);
      expect(measure.lines[0].ascent).toBeLessThan(20 * 1.2); // Reasonable for 20px font
      expect(measure.lines[0].descent).toBeGreaterThan(0);
      expect(measure.lines[0].descent).toBeLessThan(20 * 0.5);
      // lineHeight should be at least ascent + descent
      expect(measure.lines[0].lineHeight).toBeGreaterThanOrEqual(measure.lines[0].ascent + measure.lines[0].descent);
    });

    it('uses the largest fontSize in a line for metrics', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Small ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: 'Large',
            fontFamily: 'Arial',
            fontSize: 24,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      // Should use the larger font size (24) for line metrics
      // With actual font metrics, lineHeight is based on actual glyph bounds, not fontSize
      expect(measure.lines[0].lineHeight).toBeGreaterThan(20); // Should be based on 24px font
      expect(measure.lines[0].ascent).toBeGreaterThan(16); // Should reflect larger font
    });
  });

  describe('styling variations', () => {
    it('measures bold text correctly', async () => {
      const plainBlock: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const boldBlock: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Arial',
            fontSize: 16,
            bold: true,
          },
        ],
        attrs: {},
      };

      const plainMeasure = expectParagraphMeasure(await measureBlock(plainBlock, 1000));
      const boldMeasure = expectParagraphMeasure(await measureBlock(boldBlock, 1000));

      // Bold text should generally be wider
      expect(boldMeasure.lines[0].width).toBeGreaterThan(plainMeasure.lines[0].width);
    });

    it('measures italic text correctly', async () => {
      const plainBlock: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const italicBlock: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Arial',
            fontSize: 16,
            italic: true,
          },
        ],
        attrs: {},
      };

      const plainMeasure = expectParagraphMeasure(await measureBlock(plainBlock, 1000));
      const italicMeasure = expectParagraphMeasure(await measureBlock(italicBlock, 1000));

      // Both should have width > 0
      expect(italicMeasure.lines[0].width).toBeGreaterThan(0);
      expect(plainMeasure.lines[0].width).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles block with empty runs array', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 200));

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].width).toBe(0);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });

    it('handles very narrow maxWidth', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Test',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Even with narrow width, should produce valid measure
      const measure = expectParagraphMeasure(await measureBlock(block, 10));

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });

    it('handles single long word exceeding maxWidth by breaking mid-word', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Supercalifragilisticexpialidocious',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 100));

      // Should break the word across multiple lines, with each line fitting within maxWidth
      expect(measure.lines.length).toBeGreaterThan(1);
      // Each line (except possibly the last) should fit within maxWidth
      for (let i = 0; i < measure.lines.length - 1; i++) {
        expect(measure.lines[i].width).toBeLessThanOrEqual(100);
      }
      // All lines together should contain the full word
      const totalChars = measure.lines.reduce((sum, line) => sum + (line.toChar - line.fromChar), 0);
      expect(totalChars).toBe('Supercalifragilisticexpialidocious'.length);
    });
  });

  describe('mid-word breaking for table cells', () => {
    it('breaks a long word into multiple lines that fit within narrow maxWidth', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'mid-word-test-1',
        runs: [
          {
            text: 'Antidisestablishmentarianism',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Use a narrow maxWidth to force breaking
      const measure = expectParagraphMeasure(await measureBlock(block, 80));

      // Should break into multiple lines
      expect(measure.lines.length).toBeGreaterThan(1);

      // Each line should fit within maxWidth (with some tolerance for the last line)
      for (let i = 0; i < measure.lines.length - 1; i++) {
        expect(measure.lines[i].width).toBeLessThanOrEqual(80 + 1); // +1 for floating point
      }
    });

    it('preserves correct character positions when breaking mid-word', async () => {
      const word = 'HelloWorld';
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'mid-word-test-2',
        runs: [
          {
            text: word,
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Use very narrow width to force multiple breaks
      const measure = expectParagraphMeasure(await measureBlock(block, 40));

      // Verify character continuity - each line should pick up where the last left off
      let lastChar = 0;
      for (const line of measure.lines) {
        expect(line.fromChar).toBe(lastChar);
        expect(line.toChar).toBeGreaterThan(line.fromChar);
        lastChar = line.toChar;
      }

      // All characters should be accounted for
      expect(lastChar).toBe(word.length);
    });

    it('finishes existing line content before breaking a long word', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'mid-word-test-3',
        runs: [
          {
            text: 'Hi Supercalifragilisticexpialidocious',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 100));

      // First line should contain "Hi " before the long word breaks
      expect(measure.lines.length).toBeGreaterThan(1);

      // The first line should have content from "Hi " or be part of the broken word
      // Total chars should equal the full text length
      const totalChars = measure.lines.reduce((sum, line) => sum + (line.toChar - line.fromChar), 0);
      expect(totalChars).toBe('Hi Supercalifragilisticexpialidocious'.length);
    });

    it('handles words that fit exactly without unnecessary breaking', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'mid-word-test-4',
        runs: [
          {
            text: 'Hello',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // First measure to get the exact width
      const initialMeasure = expectParagraphMeasure(await measureBlock(block, 1000));
      const exactWidth = initialMeasure.lines[0].width;

      // Now measure with maxWidth equal to text width - should NOT break
      const exactMeasure = expectParagraphMeasure(await measureBlock(block, exactWidth));
      expect(exactMeasure.lines).toHaveLength(1);
    });

    it('handles very narrow cells with at least one character per line', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'mid-word-test-5',
        runs: [
          {
            text: 'ABC',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Use extremely narrow width (1px) - should still render each character
      const measure = expectParagraphMeasure(await measureBlock(block, 1));

      // Should have at least 1 character per line
      for (const line of measure.lines) {
        expect(line.toChar - line.fromChar).toBeGreaterThanOrEqual(1);
      }

      // All characters should be present
      const totalChars = measure.lines.reduce((sum, line) => sum + (line.toChar - line.fromChar), 0);
      expect(totalChars).toBe(3);
    });
  });

  describe('deterministic behavior', () => {
    it('produces consistent results for the same input', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Consistent measurement test',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure1 = expectParagraphMeasure(await measureBlock(block, 200));
      const measure2 = expectParagraphMeasure(await measureBlock(block, 200));

      expect(measure1.lines.length).toBe(measure2.lines.length);
      expect(measure1.totalHeight).toBe(measure2.totalHeight);
      expect(measure1.lines[0].width).toBe(measure2.lines[0].width);
    });
  });

  describe('tab measurement', () => {
    it('measures a simple tab with default tab stops', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Before',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            pmStart: 6,
            pmEnd: 7,
          },
          {
            text: 'After',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      // Tab run should have computed width
      const tabRun = block.runs[1];
      expect(tabRun.kind).toBe('tab');
      if (tabRun.kind === 'tab') {
        expect(tabRun.width).toBeGreaterThan(0);
      }
    });

    it('measures tab with explicit tab stops', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Name',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 200, val: 'left' }],
            tabIndex: 0,
            pmStart: 4,
            pmEnd: 5,
          },
          {
            text: 'Value',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const tabRun = block.runs[1];
      if (tabRun.kind === 'tab') {
        expect(tabRun.width).toBeGreaterThan(0);
        // Width should move text to position near 200px
        expect(tabRun.width).toBeLessThan(200);
      }
    });

    it('handles multiple tabs in a row', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'A',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            pmStart: 1,
            pmEnd: 2,
          },
          {
            kind: 'tab',
            text: '\t',
            pmStart: 2,
            pmEnd: 3,
          },
          {
            text: 'B',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      // Both tabs should have computed widths
      const tab1 = block.runs[1];
      const tab2 = block.runs[2];
      if (tab1.kind === 'tab' && tab2.kind === 'tab') {
        expect(tab1.width).toBeGreaterThan(0);
        expect(tab2.width).toBeGreaterThan(0);
      }
    });

    it('breaks line before tab if it would exceed maxWidth', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'This is a long text',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 200, val: 'left' }],
            pmStart: 19,
            pmEnd: 20,
          },
          {
            text: 'After tab',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Use narrow width to force line break
      const measure = expectParagraphMeasure(await measureBlock(block, 150));

      // Should break into multiple lines
      expect(measure.lines.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps tab on same line when it fits', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'A',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            pmStart: 1,
            pmEnd: 2,
          },
          {
            text: 'B',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      // Should fit on one line
      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].fromRun).toBe(0);
      expect(measure.lines[0].toRun).toBeGreaterThanOrEqual(2);
    });

    it('handles tab with leader style', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Chapter 1',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 300, val: 'right', leader: 'dot' }],
            leader: 'dot',
            pmStart: 9,
            pmEnd: 10,
          },
          {
            text: '42',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const tabRun = block.runs[1];
      if (tabRun.kind === 'tab') {
        expect(tabRun.width).toBeGreaterThan(0);
        expect(tabRun.leader).toBe('dot');
      }
    });

    it('preserves trailing spaces after tabs when line breaks', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Before',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            pmStart: 6,
            pmEnd: 7,
          },
          {
            text: 'Word Next',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Use narrow width to force line break after "Word "
      const measure = expectParagraphMeasure(await measureBlock(block, 100));

      // Should have multiple lines due to narrow width
      expect(measure.lines.length).toBeGreaterThan(1);

      // Find the line containing "Word " (the text after the tab)
      const lineWithWord = measure.lines.find((line) => {
        return line.segments?.some((seg) => {
          const run = block.runs[seg.runIndex];
          return run.kind !== 'tab' && 'text' in run && run.text.includes('Word');
        });
      });

      expect(lineWithWord).toBeDefined();

      if (lineWithWord) {
        // The segment should include the trailing space after "Word"
        const wordSegment = lineWithWord.segments?.find((seg) => {
          const run = block.runs[seg.runIndex];
          return run.kind !== 'tab' && 'text' in run && run.text.includes('Word');
        });

        expect(wordSegment).toBeDefined();

        if (wordSegment) {
          const run = block.runs[wordSegment.runIndex];
          if (run.kind !== 'tab' && 'text' in run) {
            const segmentText = run.text.substring(wordSegment.fromChar, wordSegment.toChar);
            // The segment should include "Word " (with trailing space)
            expect(segmentText).toBe('Word ');
          }
        }
      }
    });
  });

  describe('space-only runs', () => {
    it('counts width contributed by runs that contain only spaces', async () => {
      const baseRun = { fontFamily: 'Arial', fontSize: 16 };

      const combinedBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'space-between-runs',
        runs: [
          { ...baseRun, text: 'This' },
          { ...baseRun, text: ' ' }, // space in its own run
          { ...baseRun, text: 'CONFIDENTIALITY', bold: true },
        ],
        attrs: {},
      };

      const measureCombined = expectParagraphMeasure(await measureBlock(combinedBlock, 1000));
      expect(measureCombined.lines).toHaveLength(1);
      expect(measureCombined.lines[0].segments?.map((s) => s.runIndex)).toEqual([0, 1, 2]);

      const measureThis = expectParagraphMeasure(
        await measureBlock(
          { kind: 'paragraph', id: 'space-this', runs: [{ ...baseRun, text: 'This' }], attrs: {} },
          1000,
        ),
      );
      const measureSpace = expectParagraphMeasure(
        await measureBlock(
          { kind: 'paragraph', id: 'space-space', runs: [{ ...baseRun, text: ' ' }], attrs: {} },
          1000,
        ),
      );
      const measureConf = expectParagraphMeasure(
        await measureBlock(
          {
            kind: 'paragraph',
            id: 'space-conf',
            runs: [{ ...baseRun, text: 'CONFIDENTIALITY', bold: true }],
            attrs: {},
          },
          1000,
        ),
      );

      const expectedWidth = measureThis.lines[0].width + measureSpace.lines[0].width + measureConf.lines[0].width;

      expect(measureCombined.lines[0].width).toBeCloseTo(expectedWidth, 0);
    });
  });

  describe('explicit X positioning for tab-aligned text', () => {
    /**
     * These tests verify the bug fix for explicit segment X positioning.
     * The fix ensures that only the FIRST word after a tab gets explicit X coordinates,
     * not all subsequent words in the segment. This prevents incorrect text positioning.
     */

    it('sets explicit X only for first word after a tab', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'tab-explicit-x',
        runs: [
          {
            text: 'Before',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 200, val: 'left' }],
            pmStart: 6,
            pmEnd: 7,
          },
          {
            text: 'First Second Third',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const line = measure.lines[0];

      // Line should have segments due to tab alignment
      expect(line.segments).toBeDefined();
      expect(line.segments!.length).toBeGreaterThan(0);

      // Find segment(s) for the text after the tab (run index 2)
      const afterTabSegments = line.segments!.filter((seg) => seg.runIndex === 2);
      expect(afterTabSegments.length).toBeGreaterThan(0);

      // First segment after tab should have explicit X
      const firstSegment = afterTabSegments[0];
      expect(firstSegment.x).toBeDefined();
      expect(firstSegment.x).toBeGreaterThan(0);

      // If there are multiple words, subsequent segments should NOT have explicit X
      // (they should be merged or have undefined X)
      if (afterTabSegments.length > 1) {
        for (let i = 1; i < afterTabSegments.length; i++) {
          expect(afterTabSegments[i].x).toBeUndefined();
        }
      }
    });

    it('handles multiple words after tab without explicit X on subsequent words', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'multi-word-after-tab',
        runs: [
          {
            text: 'Label',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 150, val: 'left' }],
            pmStart: 5,
            pmEnd: 6,
          },
          {
            text: 'Word1 Word2 Word3 Word4',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const line = measure.lines[0];
      expect(line.segments).toBeDefined();

      const afterTabSegments = line.segments!.filter((seg) => seg.runIndex === 2);

      // First word after tab gets explicit X
      const firstWord = afterTabSegments.find((seg) => seg.fromChar === 0);
      expect(firstWord).toBeDefined();
      expect(firstWord!.x).toBeDefined();

      // Subsequent words should not have explicit X
      const subsequentWords = afterTabSegments.filter((seg) => seg.fromChar > 0);
      subsequentWords.forEach((seg) => {
        expect(seg.x).toBeUndefined();
      });
    });

    it('sets explicit X for first word after each tab in multiple tab scenario', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'multiple-tabs',
        runs: [
          {
            text: 'A',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 100, val: 'left' }],
            pmStart: 1,
            pmEnd: 2,
          },
          {
            text: 'First Second',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 300, val: 'left' }],
            pmStart: 14,
            pmEnd: 15,
          },
          {
            text: 'Third Fourth',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const line = measure.lines[0];
      expect(line.segments).toBeDefined();

      // After first tab (run 2)
      const afterFirstTab = line.segments!.filter((seg) => seg.runIndex === 2);
      const firstAfterTab1 = afterFirstTab.find((seg) => seg.fromChar === 0);
      expect(firstAfterTab1).toBeDefined();
      expect(firstAfterTab1!.x).toBeDefined();

      // After second tab (run 4)
      const afterSecondTab = line.segments!.filter((seg) => seg.runIndex === 4);
      const firstAfterTab2 = afterSecondTab.find((seg) => seg.fromChar === 0);
      expect(firstAfterTab2).toBeDefined();
      expect(firstAfterTab2!.x).toBeDefined();

      // Subsequent words in each segment should not have explicit X
      const laterWordsTab1 = afterFirstTab.filter((seg) => seg.fromChar > 0);
      laterWordsTab1.forEach((seg) => {
        expect(seg.x).toBeUndefined();
      });

      const laterWordsTab2 = afterSecondTab.filter((seg) => seg.fromChar > 0);
      laterWordsTab2.forEach((seg) => {
        expect(seg.x).toBeUndefined();
      });
    });

    it('does not set explicit X for words before tabs', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'before-tab',
        runs: [
          {
            text: 'Multiple Words Before Tab',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 200, val: 'left' }],
            pmStart: 25,
            pmEnd: 26,
          },
          {
            text: 'After',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const line = measure.lines[0];
      expect(line.segments).toBeDefined();

      // Words before tab should not have explicit X
      const beforeTabSegments = line.segments!.filter((seg) => seg.runIndex === 0);
      beforeTabSegments.forEach((seg) => {
        expect(seg.x).toBeUndefined();
      });

      // First word after tab should have explicit X
      const afterTabSegments = line.segments!.filter((seg) => seg.runIndex === 2);
      const firstAfterTab = afterTabSegments[0];
      expect(firstAfterTab.x).toBeDefined();
    });

    it('handles center-aligned tabs with explicit X only on first word', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'center-tab-explicit-x',
        runs: [
          {
            text: 'Left',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 200, val: 'center' }],
            pmStart: 4,
            pmEnd: 5,
          },
          {
            text: 'Centered Text',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const line = measure.lines[0];
      expect(line.segments).toBeDefined();

      const afterTabSegments = line.segments!.filter((seg) => seg.runIndex === 2);
      expect(afterTabSegments.length).toBeGreaterThan(0);

      // First segment after center tab should have explicit X
      const firstSegment = afterTabSegments[0];
      expect(firstSegment.x).toBeDefined();
    });

    it('handles right-aligned tabs with explicit X only on first word', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'right-tab-explicit-x',
        runs: [
          {
            text: 'Left',
            fontFamily: 'Arial',
            fontSize: 16,
          },
          {
            kind: 'tab',
            text: '\t',
            tabStops: [{ pos: 300, val: 'right' }],
            pmStart: 4,
            pmEnd: 5,
          },
          {
            text: 'Right Aligned Text',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 1000));

      expect(measure.lines).toHaveLength(1);
      const line = measure.lines[0];
      expect(line.segments).toBeDefined();

      const afterTabSegments = line.segments!.filter((seg) => seg.runIndex === 2);
      expect(afterTabSegments.length).toBeGreaterThan(0);

      // First segment after right tab should have explicit X
      const firstSegment = afterTabSegments[0];
      expect(firstSegment.x).toBeDefined();
    });
  });

  describe('letter spacing', () => {
    it('includes letterSpacing in width calculations', async () => {
      const blockNoSpacing: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Hello',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const blockWithSpacing: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'Hello',
            fontFamily: 'Arial',
            fontSize: 16,
            letterSpacing: 2,
          },
        ],
        attrs: {},
      };

      const measureNoSpacing = expectParagraphMeasure(await measureBlock(blockNoSpacing, 1000));
      const measureWithSpacing = expectParagraphMeasure(await measureBlock(blockWithSpacing, 1000));

      // "Hello" has 5 characters = 4 gaps × 2px = 8px extra width
      const expectedExtraWidth = 8;
      expect(measureWithSpacing.lines[0].width).toBeCloseTo(
        measureNoSpacing.lines[0].width + expectedExtraWidth,
        0, // Allow 1px tolerance for floating-point precision
      );
    });

    it('includes boundary spacing when appending to non-empty line', async () => {
      // Test that "Hello World" with letterSpacing = 2 includes all gaps:
      // - 4 gaps in "Hello" = 8px
      // - 1 boundary gap between "o" and " " = 2px
      // - 5 gaps in " World" = 10px
      // Total: 20px of letter spacing
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Hello World',
            fontFamily: 'Arial',
            fontSize: 16,
            letterSpacing: 2,
          },
        ],
        attrs: {},
      };

      const blockNoSpacing: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'Hello World',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measureSpacing = expectParagraphMeasure(await measureBlock(block, 1000));
      const measureNoSpacing = expectParagraphMeasure(await measureBlock(blockNoSpacing, 1000));

      // "Hello World" has 11 characters = 10 gaps × 2px = 20px extra
      const expectedExtraWidth = 20;
      expect(measureSpacing.lines[0].width).toBeCloseTo(
        measureNoSpacing.lines[0].width + expectedExtraWidth,
        0, // Allow 1px tolerance for floating-point precision
      );
    });

    it('causes earlier line breaks when letterSpacing increases width', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'This is a long paragraph that should break',
            fontFamily: 'Arial',
            fontSize: 16,
            letterSpacing: 3,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 150));

      // With letter spacing, should break into more lines
      expect(measure.lines.length).toBeGreaterThan(1);
    });

    it('handles letterSpacing with single character correctly', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'A',
            fontFamily: 'Arial',
            fontSize: 16,
            letterSpacing: 5,
          },
        ],
        attrs: {},
      };

      const blockNoSpacing: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'A',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measureSpacing = expectParagraphMeasure(await measureBlock(block, 1000));
      const measureNoSpacing = expectParagraphMeasure(await measureBlock(blockNoSpacing, 1000));

      // Single character has 0 gaps, so letterSpacing adds nothing
      expect(measureSpacing.lines[0].width).toBeCloseTo(measureNoSpacing.lines[0].width, 1);
    });
  });

  describe('overflow protection', () => {
    it('keeps justified line packed by allowing small space flex (Word parity case)', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'justify-word-parity',
        runs: [
          {
            text: 'Por este instrumento particular, de um lado a empresa ',
            fontFamily: 'Times New Roman',
            fontSize: 12,
          },
          {
            text: 'EMPRESA',
            fontFamily: 'Times New Roman',
            fontSize: 12,
            bold: true,
          },
          {
            text: ' ABC',
            fontFamily: 'Times New Roman',
            fontSize: 12,
            bold: true,
          },
          {
            text: ', pessoa jurídica de direito privado, inscrita no CNPJ sob n. XXXXXXXX com sede à Av. Presidente Juscelino Kubitschek, N° 2041, 22° Andar, Torre D, no Bairro Vila Nova Conceição na Cidade de São Paulo – SP – CEP 04.543-011, neste ato representado por seu representante legal',
            fontFamily: 'Times New Roman',
            fontSize: 12,
          },
          {
            text: ' FULANO DE TAL',
            fontFamily: 'Times New Roman',
            fontSize: 12,
            bold: true,
          },
        ],
        attrs: { alignment: 'justify' },
      };

      // Page width 12240 twips (8.5in) minus margins 1701/1134 twips ≈ 627px content width at 96dpi
      const measure = expectParagraphMeasure(await measureBlock(block, 627));
      const lineTexts = measure.lines.map((line) => extractLineText(block, line));
      const representadoIndex = lineTexts.findIndex((text) => text.includes('representado'));

      expect(representadoIndex).toBeGreaterThanOrEqual(0);
      const windowText = [lineTexts[representadoIndex], lineTexts[representadoIndex + 1] ?? '']
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      expect(windowText).toContain('neste ato representado por seu representante legal');
    });

    it('preserves leading spaces in runs (xml:space="preserve" case)', async () => {
      // When a run starts with a space (common in DOCX with xml:space="preserve"),
      // the space should be included in the line width, not dropped.
      // This tests the fix for segments like " Headquarters:" where split(' ') produces ['', 'Headquarters:']
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'leading-space-test',
        runs: [
          {
            text: 'Location',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: ' ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: 'of',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: ' Headquarters:',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 500));
      const lineText = extractLineText(block, measure.lines[0]);

      // The extracted text should include all spaces
      expect(lineText).toBe('Location of Headquarters:');

      // Also verify there's a space between 'of' and 'Headquarters'
      expect(lineText).toContain('of Headquarters');
    });

    it('preserves multiple consecutive spaces from split', async () => {
      // Test consecutive spaces which produce multiple empty strings from split(' ')
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'consecutive-spaces-test',
        runs: [
          {
            text: 'Hello  World', // Two spaces between Hello and World
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {},
      };

      const measure = expectParagraphMeasure(await measureBlock(block, 500));
      const lineText = extractLineText(block, measure.lines[0]);

      // Both spaces should be preserved
      expect(lineText).toBe('Hello  World');
    });

    it('prevents line width from exceeding maxWidth after appending segment with trailing space', async () => {
      // This test verifies the post-append overflow guard
      // Scenario: Word fits without space, but word+space exceeds maxWidth
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'WWWWW XXXXX', // Wide characters to trigger overflow
            fontFamily: 'Arial',
            fontSize: 20,
            bold: true,
          },
        ],
        attrs: {},
      };

      // Measure first word to get its width
      const firstWordBlock: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'WWWWW',
            fontFamily: 'Arial',
            fontSize: 20,
            bold: true,
          },
        ],
        attrs: {},
      };

      const firstWordMeasure = expectParagraphMeasure(await measureBlock(firstWordBlock, 1000));
      const firstWordWidth = firstWordMeasure.lines[0].width;

      // Set maxWidth just barely larger than first word (without space)
      // The post-append guard should prevent overflow when space is added
      const measure = expectParagraphMeasure(await measureBlock(block, firstWordWidth + 3));

      // All lines must respect maxWidth
      for (const line of measure.lines) {
        expect(line.width).toBeLessThanOrEqual(firstWordWidth + 3);
      }

      // Should have wrapped to multiple lines
      expect(measure.lines.length).toBeGreaterThan(1);
    });

    it('handles bounding box width for italic text with overhang', async () => {
      // Italic text can have glyphs that extend beyond advance width
      // Bounding box measurement should account for this
      const italicBlock: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'flying', // 'f' and 'y' have overhang in italic
            fontFamily: 'Arial',
            fontSize: 16,
            italic: true,
          },
        ],
        attrs: {},
      };

      const normalBlock: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'flying',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const italicMeasure = expectParagraphMeasure(await measureBlock(italicBlock, 1000));
      const normalMeasure = expectParagraphMeasure(await measureBlock(normalBlock, 1000));

      // Italic should have measurable width (may be wider or similar to normal)
      expect(italicMeasure.lines[0].width).toBeGreaterThan(0);
      expect(normalMeasure.lines[0].width).toBeGreaterThan(0);

      // The key is that bounding box prevents clipping
      // Both should fit within their measured widths without visual overflow
      expect(italicMeasure.lines[0].width).toBeGreaterThanOrEqual(normalMeasure.lines[0].width * 0.8);
    });
  });

  describe('trailing space behavior', () => {
    it('does not count trailing space toward maxWidth fit check', async () => {
      // Create a scenario where a word + space would exceed maxWidth,
      // but the word alone fits exactly
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Word1 Word2 Word3',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Measure to find the width of "Word1"
      const word1Block: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'Word1',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const word1Measure = expectParagraphMeasure(await measureBlock(word1Block, 1000));
      const word1Width = word1Measure.lines[0].width;

      // Set maxWidth slightly larger than word1Width
      // "Word1 " should fit on first line even though it includes a space,
      // because trailing spaces don't count in the fit check
      const measure = expectParagraphMeasure(await measureBlock(block, word1Width + 2));

      // Should have multiple lines since "Word2" won't fit on the first line
      expect(measure.lines.length).toBeGreaterThan(1);

      // First line should end after "Word1" (5 characters)
      // Note: Trailing space is trimmed from line width
      expect(measure.lines[0].toChar).toBe(5);
    });

    it('includes space width when mid-line', async () => {
      const blockNoSpace: FlowBlock = {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'HelloWorld',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const blockWithSpace: FlowBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [
          {
            text: 'Hello World',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const measureNoSpace = expectParagraphMeasure(await measureBlock(blockNoSpace, 1000));
      const measureWithSpace = expectParagraphMeasure(await measureBlock(blockWithSpace, 1000));

      // "Hello World" should be wider than "HelloWorld" due to space
      expect(measureWithSpace.lines[0].width).toBeGreaterThan(measureNoSpace.lines[0].width);
    });
  });

  describe('image measurement', () => {
    it('reports intrinsic size when within constraints', async () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-0',
        src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
        width: 200,
        height: 100,
      };

      const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 400, maxHeight: 400 }));
      expect(measure.width).toBe(200);
      expect(measure.height).toBe(100);
    });

    it('scales width proportionally when exceeding maxWidth', async () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
        width: 800,
        height: 400,
      };

      const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 400 }));
      expect(measure.width).toBe(400);
      expect(measure.height).toBe(200);
    });

    it('bypasses maxWidth for page-relative anchored images', async () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-page-anchor',
        src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
        width: 800,
        height: 400,
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
        },
      };

      const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 200, maxHeight: 400 }));
      expect(measure.width).toBe(800);
      expect(measure.height).toBe(400);
    });

    it('bypasses maxWidth for margin-relative anchored images', async () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-margin-anchor',
        src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
        width: 640,
        height: 320,
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'margin',
        },
      };

      const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 150, maxHeight: 400 }));
      expect(measure.width).toBe(640);
      expect(measure.height).toBe(320);
    });

    it('respects maxHeight constraints', async () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-2',
        src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
        width: 400,
        height: 800,
      };

      const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 600, maxHeight: 300 }));
      expect(Math.round(measure.height)).toBe(300);
      expect(measure.width).toBeCloseTo(150);
    });

    describe('negative positioning bypass logic', () => {
      it('bypasses maxHeight when anchored image has offsetV < 0', async () => {
        const block: FlowBlock = {
          kind: 'image',
          id: 'img-negative-offset',
          src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
          width: 200,
          height: 100,
          anchor: {
            isAnchored: true,
            offsetV: -24,
          },
        };

        // maxHeight is 50, but bypass should allow full 100px height
        const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 400, maxHeight: 50 }));
        expect(measure.width).toBe(200);
        expect(measure.height).toBe(100);
      });

      it('bypasses maxHeight when anchored image has margin.top < 0', async () => {
        const block: FlowBlock = {
          kind: 'image',
          id: 'img-negative-margin',
          src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
          width: 200,
          height: 100,
          anchor: {
            isAnchored: true,
          },
          margin: {
            top: -24,
          },
        };

        // maxHeight is 50, but bypass should allow full 100px height
        const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 400, maxHeight: 50 }));
        expect(measure.width).toBe(200);
        expect(measure.height).toBe(100);
      });

      it('does NOT bypass maxHeight when anchored image has offsetV === 0', async () => {
        const block: FlowBlock = {
          kind: 'image',
          id: 'img-zero-offset',
          src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
          width: 200,
          height: 100,
          anchor: {
            isAnchored: true,
            offsetV: 0,
          },
        };

        // maxHeight is 50, should scale down since no negative offset
        const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 400, maxHeight: 50 }));
        expect(measure.height).toBe(50);
        expect(measure.width).toBe(100);
      });

      it('does NOT bypass maxHeight when image is not anchored', async () => {
        const block: FlowBlock = {
          kind: 'image',
          id: 'img-not-anchored',
          src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
          width: 200,
          height: 100,
          anchor: {
            isAnchored: false,
          },
          margin: {
            top: -24,
          },
        };

        // maxHeight is 50, should scale down since not anchored
        const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 400, maxHeight: 50 }));
        expect(measure.height).toBe(50);
        expect(measure.width).toBe(100);
      });

      it('bypasses maxHeight when objectFit is set to cover', async () => {
        const block: FlowBlock = {
          kind: 'image',
          id: 'img-cover-fit',
          src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
          width: 200,
          height: 100,
          objectFit: 'cover',
        };

        // objectFit: cover should render at exact dimensions, CSS handles content scaling/clipping
        const measure = expectImageMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 40 }));
        expect(measure.width).toBe(200);
        expect(measure.height).toBe(100);
      });
    });
  });

  describe('drawing measurement', () => {
    it('honors rotated geometry', async () => {
      const block: DrawingBlock = {
        kind: 'drawing',
        id: 'drawing-0',
        drawingKind: 'vectorShape',
        geometry: {
          width: 120,
          height: 60,
          rotation: 90,
        },
      };

      const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500 }));
      expect(measure.width).toBeCloseTo(60);
      expect(measure.height).toBeCloseTo(120);
      expect(measure.scale).toBe(1);
    });

    it('resolves full-width drawings using maxWidth constraints and indents', async () => {
      const block: DrawingBlock = {
        kind: 'drawing',
        id: 'drawing-full-width',
        drawingKind: 'vectorShape',
        geometry: {
          width: 1,
          height: 2,
          rotation: 0,
          flipH: false,
          flipV: false,
        },
        attrs: {
          isFullWidth: true,
          hrIndentLeft: -20,
          hrIndentRight: 10,
        },
      };

      const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 300, maxHeight: 20 }));
      expect(measure.width).toBe(310);
      expect(measure.height).toBe(2);
      expect(measure.geometry.width).toBe(310);
    });

    it('scales proportionally when exceeding constraints', async () => {
      const block: DrawingBlock = {
        kind: 'drawing',
        id: 'drawing-1',
        drawingKind: 'vectorShape',
        geometry: {
          width: 400,
          height: 200,
          rotation: 0,
        },
      };

      const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 200, maxHeight: 150 }));
      expect(measure.width).toBeCloseTo(200);
      expect(measure.height).toBeCloseTo(100);
      expect(measure.scale).toBeCloseTo(0.5);
    });

    it('normalizes rotation within geometry', async () => {
      const block: DrawingBlock = {
        kind: 'drawing',
        id: 'drawing-rot',
        drawingKind: 'vectorShape',
        geometry: {
          width: 50,
          height: 20,
          rotation: -450,
        },
      };

      const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 200 }));
      expect(measure.geometry.rotation).toBe(270);
    });

    describe('negative positioning bypass logic', () => {
      it('bypasses maxHeight when anchored drawing has offsetV < 0', async () => {
        const block: DrawingBlock = {
          kind: 'drawing',
          id: 'drawing-negative-offset',
          drawingKind: 'vectorShape',
          geometry: {
            width: 100,
            height: 200,
            rotation: 0,
          },
          anchor: {
            isAnchored: true,
            offsetV: -50,
          },
        };

        const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 100 }));
        // Should NOT scale height due to negative offsetV bypass
        expect(measure.height).toBe(200);
        expect(measure.width).toBe(100);
        expect(measure.scale).toBe(1);
      });

      it('bypasses maxHeight when anchored drawing has margin.top < 0', async () => {
        const block: DrawingBlock = {
          kind: 'drawing',
          id: 'drawing-negative-margin',
          drawingKind: 'vectorShape',
          geometry: {
            width: 100,
            height: 200,
            rotation: 0,
          },
          anchor: {
            isAnchored: true,
            offsetV: 0,
          },
          margin: {
            top: -30,
          },
        };

        const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 100 }));
        // Should NOT scale height due to negative margin.top bypass
        expect(measure.height).toBe(200);
        expect(measure.width).toBe(100);
        expect(measure.scale).toBe(1);
      });

      it('does NOT bypass maxHeight when anchored drawing has offsetV === 0', async () => {
        const block: DrawingBlock = {
          kind: 'drawing',
          id: 'drawing-zero-offset',
          drawingKind: 'vectorShape',
          geometry: {
            width: 100,
            height: 200,
            rotation: 0,
          },
          anchor: {
            isAnchored: true,
            offsetV: 0,
          },
          margin: {
            top: 0,
          },
        };

        const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 100 }));
        // Should scale height because offsetV and margin.top are both 0 (not negative)
        expect(measure.height).toBe(100);
        expect(measure.width).toBe(50);
        expect(measure.scale).toBe(0.5);
      });

      it('does NOT bypass maxHeight when non-anchored drawing has negative margin', async () => {
        const block: DrawingBlock = {
          kind: 'drawing',
          id: 'drawing-not-anchored',
          drawingKind: 'vectorShape',
          geometry: {
            width: 100,
            height: 200,
            rotation: 0,
          },
          anchor: {
            isAnchored: false,
          },
          margin: {
            top: -30,
          },
        };

        const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 100 }));
        // Should scale height because drawing is not anchored
        expect(measure.height).toBe(100);
        expect(measure.width).toBe(50);
        expect(measure.scale).toBe(0.5);
      });

      it('respects maxHeight when anchored drawing has positive offsets', async () => {
        const block: DrawingBlock = {
          kind: 'drawing',
          id: 'drawing-positive-offset',
          drawingKind: 'vectorShape',
          geometry: {
            width: 100,
            height: 200,
            rotation: 0,
          },
          anchor: {
            isAnchored: true,
            offsetV: 10,
          },
          margin: {
            top: 5,
          },
        };

        const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 100 }));
        // Should scale height because both offsetV and margin.top are positive
        expect(measure.height).toBe(100);
        expect(measure.width).toBe(50);
        expect(measure.scale).toBe(0.5);
      });

      it('bypasses maxHeight when one of offsetV or margin.top is negative (OR condition)', async () => {
        const block: DrawingBlock = {
          kind: 'drawing',
          id: 'drawing-mixed-offsets',
          drawingKind: 'vectorShape',
          geometry: {
            width: 100,
            height: 200,
            rotation: 0,
          },
          anchor: {
            isAnchored: true,
            offsetV: 10,
          },
          margin: {
            top: -20,
          },
        };

        const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 100 }));
        // Should NOT scale height because margin.top is negative (OR condition)
        expect(measure.height).toBe(200);
        expect(measure.width).toBe(100);
        expect(measure.scale).toBe(1);
      });

      it('bypasses maxHeight when offsetV is negative even with positive margin.top', async () => {
        const block: DrawingBlock = {
          kind: 'drawing',
          id: 'drawing-negative-offsetV-positive-margin',
          drawingKind: 'vectorShape',
          geometry: {
            width: 100,
            height: 200,
            rotation: 0,
          },
          anchor: {
            isAnchored: true,
            offsetV: -15,
          },
          margin: {
            top: 25,
          },
        };

        const measure = expectDrawingMeasure(await measureBlock(block, { maxWidth: 500, maxHeight: 100 }));
        // Should NOT scale height because offsetV is negative (OR condition)
        expect(measure.height).toBe(200);
        expect(measure.width).toBe(100);
        expect(measure.scale).toBe(1);
      });
    });
  });

  describe('table measurement with column widths', () => {
    it('uses provided column widths from w:tblGrid', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'table-0',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1',
                  runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-2',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2',
                  runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
        columnWidths: [100, 150, 200], // Specific widths from OOXML
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');
      expect(measure.columnWidths).toEqual([100, 150, 200]);
      expect(measure.totalWidth).toBe(450);
    });

    it('scales column widths proportionally when exceeding available width', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'table-1',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1',
                  runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
        columnWidths: [400, 400], // Total 800px
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');
      // Should scale: 400 * (600/800) = 300
      expect(measure.columnWidths[0]).toBe(300);
      expect(measure.columnWidths[1]).toBe(300);
      expect(measure.totalWidth).toBe(600);
    });

    it('falls back to equal distribution without columnWidths', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'table-2',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1',
                  runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-2',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2',
                  runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
        // No columnWidths provided
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');
      // Should distribute equally: 600 / 3 = 200
      expect(measure.columnWidths).toEqual([200, 200, 200]);
      expect(measure.totalWidth).toBe(600);
    });

    it('pads missing column widths with equal distribution', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'table-3',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1',
                  runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-2',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2',
                  runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
        columnWidths: [100, 150], // Only 2 widths, but 3 columns
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');
      expect(measure.columnWidths).toHaveLength(3);
      expect(measure.columnWidths[0]).toBe(100);
      expect(measure.columnWidths[1]).toBe(150);
      // Remaining space: 600 - 250 = 350, divided by 1 missing column
      expect(measure.columnWidths[2]).toBe(350);
    });

    it('truncates extra column widths', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'table-4',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1',
                  runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
        columnWidths: [100, 150, 200, 250], // 4 widths, but only 2 columns
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');
      expect(measure.columnWidths).toHaveLength(2);
      expect(measure.columnWidths).toEqual([100, 150]);
    });
  });

  describe('multi-paragraph cell support', () => {
    it('measures cell with multiple paragraphs and accumulates height', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'multi-para-table',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'First paragraph', fontFamily: 'Arial', fontSize: 12 }],
                    attrs: {},
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'Second paragraph', fontFamily: 'Arial', fontSize: 12 }],
                    attrs: {},
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'Third paragraph', fontFamily: 'Arial', fontSize: 12 }],
                    attrs: {},
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [200],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];
      expect(cellMeasure.blocks).toHaveLength(3);

      // Each paragraph should be measured
      expect(cellMeasure.blocks[0].kind).toBe('paragraph');
      expect(cellMeasure.blocks[1].kind).toBe('paragraph');
      expect(cellMeasure.blocks[2].kind).toBe('paragraph');

      // Heights should accumulate (3 paragraphs + padding)
      const para1Height = cellMeasure.blocks[0].totalHeight;
      const para2Height = cellMeasure.blocks[1].totalHeight;
      const para3Height = cellMeasure.blocks[2].totalHeight;
      const totalContentHeight = para1Height + para2Height + para3Height;
      const padding = 4; // Default top (2) + bottom (2)

      expect(cellMeasure.height).toBe(totalContentHeight + padding);
    });

    it('measures cell with empty blocks array', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'empty-blocks-table',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [],
              },
            ],
          },
        ],
        columnWidths: [200],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];
      expect(cellMeasure.blocks).toHaveLength(0);

      // Height should be just padding
      const padding = 4; // Default top (2) + bottom (2)
      expect(cellMeasure.height).toBe(padding);
    });

    it('maintains backward compatibility with legacy paragraph field', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'legacy-paragraph-table',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'Legacy paragraph', fontFamily: 'Arial', fontSize: 12 }],
                  attrs: {},
                },
              },
            ],
          },
        ],
        columnWidths: [200],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];

      // Should have blocks array from paragraph fallback
      expect(cellMeasure.blocks).toHaveLength(1);
      expect(cellMeasure.blocks[0].kind).toBe('paragraph');

      // Should also have paragraph field for backward compatibility
      expect(cellMeasure.paragraph).toBeDefined();
      expect(cellMeasure.paragraph?.kind).toBe('paragraph');
    });

    it('calculates height correctly including padding for multi-block cells', async () => {
      const customPadding = { top: 10, bottom: 20, left: 5, right: 5 };
      const block: FlowBlock = {
        kind: 'table',
        id: 'padding-table',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Paragraph with custom padding', fontFamily: 'Arial', fontSize: 12 }],
                    attrs: {},
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'Second paragraph', fontFamily: 'Arial', fontSize: 12 }],
                    attrs: {},
                  },
                ],
                attrs: {
                  padding: customPadding,
                },
              },
            ],
          },
        ],
        columnWidths: [200],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];
      const para1Height = cellMeasure.blocks[0].totalHeight;
      const para2Height = cellMeasure.blocks[1].totalHeight;
      const totalContentHeight = para1Height + para2Height;
      const expectedHeight = totalContentHeight + customPadding.top + customPadding.bottom;

      expect(cellMeasure.height).toBe(expectedHeight);
    });

    it('handles cells with both blocks and paragraph fields (prefers blocks)', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'both-fields-table',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-in-blocks',
                    runs: [{ text: 'From blocks array', fontFamily: 'Arial', fontSize: 12 }],
                    attrs: {},
                  },
                ],
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-legacy',
                  runs: [{ text: 'From paragraph field', fontFamily: 'Arial', fontSize: 12 }],
                  attrs: {},
                },
              },
            ],
          },
        ],
        columnWidths: [200],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];

      // Should use blocks array (not paragraph field)
      expect(cellMeasure.blocks).toHaveLength(1);
      expect((cellMeasure.blocks[0] as any).lines?.[0]).toBeDefined();
    });
  });

  describe('scaleColumnWidths behavior', () => {
    it('scales column widths proportionally when exceeding target', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'scale-test-1',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-2',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100, 200, 100], // Total 400px, ratio 1:2:1
      };

      const measure = await measureBlock(block, { maxWidth: 300 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Should scale from 400px to 300px maintaining 1:2:1 ratio
      // 100 * (300/400) = 75, 200 * (300/400) = 150
      expect(measure.columnWidths[0]).toBe(75);
      expect(measure.columnWidths[1]).toBe(150);
      expect(measure.columnWidths[2]).toBe(75);
      expect(measure.totalWidth).toBe(300);
    });

    it('does not scale when widths are within target', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'scale-test-2',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [50, 50], // Total 100px
      };

      const measure = await measureBlock(block, { maxWidth: 200 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Should not scale - widths are within target
      expect(measure.columnWidths).toEqual([50, 50]);
      expect(measure.totalWidth).toBe(100);
    });

    it('produces exact sum after rounding adjustment', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'scale-test-3',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-2',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [34, 33, 34], // Total 101px - exceeds target to trigger scaling
      };

      const measure = await measureBlock(block, { maxWidth: 100 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Sum should be exactly 100 after rounding adjustment
      const sum = measure.columnWidths.reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
      expect(measure.totalWidth).toBe(100);
    });

    it('handles empty array gracefully', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'scale-test-4',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [], // Empty array
      };

      const measure = await measureBlock(block, { maxWidth: 200 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Should fall back to equal distribution
      expect(measure.columnWidths).toEqual([200]);
    });

    it('enforces minimum width of 1px per column', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'scale-test-5',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-2',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-3',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-3',
                    runs: [{ text: 'D', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [1000, 1000, 1000, 1000], // Very wide, will scale down dramatically
      };

      const measure = await measureBlock(block, { maxWidth: 10 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Each column should be at least 1px
      measure.columnWidths.forEach((width) => {
        expect(width).toBeGreaterThanOrEqual(1);
      });
      // Total should equal maxWidth
      expect(measure.totalWidth).toBe(10);
    });
  });

  describe('WIDTH_FUDGE_PX tolerance behavior', () => {
    it('allows text to fit within 0.5px tolerance without breaking line', async () => {
      // Create a simple test with a single word to verify tolerance behavior
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'fudge-test-1',
        runs: [
          {
            text: 'Word',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Measure first to get actual width
      const initialMeasure = expectParagraphMeasure(await measureBlock(block, 1000));
      const textWidth = initialMeasure.lines[0].width;

      // Now measure with maxWidth equal to text width
      // The WIDTH_FUDGE_PX tolerance should allow it to still fit
      const constrainedMeasure = expectParagraphMeasure(await measureBlock(block, textWidth));

      expect(constrainedMeasure.lines).toHaveLength(1);
      expect(constrainedMeasure.lines[0].width).toBeCloseTo(textWidth, 1);
    });

    it('breaks line when width exceeds tolerance', async () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'fudge-test-2',
        runs: [
          {
            text: 'Word1 Word2 Word3',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Measure to get the width of "Word1 "
      const word1Block: FlowBlock = {
        kind: 'paragraph',
        id: 'word1-measure',
        runs: [
          {
            text: 'Word1 ',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const word1Measure = expectParagraphMeasure(await measureBlock(word1Block, 1000));
      const word1Width = word1Measure.lines[0].width;

      // Set maxWidth to word1Width + small amount that's still less than adding Word2
      // This should force "Word2 Word3" to wrap to next line
      const tightMeasure = expectParagraphMeasure(await measureBlock(block, word1Width + 5));

      // Should break into multiple lines
      expect(tightMeasure.lines.length).toBeGreaterThan(1);
    });

    it('prevents premature line breaks with floating-point measurement variations', async () => {
      // Test that the tolerance absorbs minor measurement differences
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'fudge-test-3',
        runs: [
          {
            text: 'A',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Measure the single character
      const charMeasure = expectParagraphMeasure(await measureBlock(block, 1000));
      const charWidth = charMeasure.lines[0].width;

      // Set maxWidth to exactly the measured width
      // Without WIDTH_FUDGE_PX, floating-point rounding could cause unwanted breaks
      const exactMeasure = expectParagraphMeasure(await measureBlock(block, charWidth));

      // Should still fit on one line
      expect(exactMeasure.lines).toHaveLength(1);
    });

    it('applies tolerance consistently for word boundaries', async () => {
      // Test demonstrates that WIDTH_FUDGE_PX prevents unnecessary line breaks
      // when measured width is very close to maxWidth
      const singleWordBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'fudge-test-4a',
        runs: [
          {
            text: 'LongWordHere',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Measure a single long word
      const wordMeasure = expectParagraphMeasure(await measureBlock(singleWordBlock, 1000));
      const wordWidth = wordMeasure.lines[0].width;

      // Set maxWidth to exactly the word width
      // The WIDTH_FUDGE_PX tolerance allows it to fit without forcing a break
      const exactFitMeasure = expectParagraphMeasure(await measureBlock(singleWordBlock, wordWidth));
      expect(exactFitMeasure.lines).toHaveLength(1);

      // Now create a two-word scenario where first word + space fits
      const twoWordBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'fudge-test-4b',
        runs: [
          {
            text: 'Word1 Word2',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      // Measure just "Word1 " to know where the break should occur
      const firstWordBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'fudge-test-4c',
        runs: [
          {
            text: 'Word1 ',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
        attrs: {},
      };

      const firstWordMeasure = expectParagraphMeasure(await measureBlock(firstWordBlock, 1000));
      const firstWordWidth = firstWordMeasure.lines[0].width;

      // Set maxWidth to just after first word - should force second word to new line
      const breakMeasure = expectParagraphMeasure(await measureBlock(twoWordBlock, firstWordWidth + 2));
      expect(breakMeasure.lines.length).toBeGreaterThan(1);
    });
  });

  describe('percentage table width (SD-1239)', () => {
    it('scales column widths to 100% of available width when tableWidth type is pct with value 5000', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-100',
        attrs: {
          tableWidth: { value: 5000, type: 'pct' }, // 5000 = 100%
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100, 100], // Original: 200px total
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // With 100% width (5000), should scale to full 600px available width
      // Original 200px → 600px means 3x scale: 100 * 3 = 300 each
      expect(measure.totalWidth).toBe(600);
      expect(measure.columnWidths[0]).toBe(300);
      expect(measure.columnWidths[1]).toBe(300);
    });

    it('scales column widths to 50% of available width when tableWidth type is pct with value 2500', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-50',
        attrs: {
          tableWidth: { value: 2500, type: 'pct' }, // 2500 = 50%
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100, 100], // Original: 200px total
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // With 50% width (2500), should scale to 300px (half of 600px available)
      // Original 200px → 300px means 1.5x scale: 100 * 1.5 = 150 each
      expect(measure.totalWidth).toBe(300);
      expect(measure.columnWidths[0]).toBe(150);
      expect(measure.columnWidths[1]).toBe(150);
    });

    it('handles percentage width with width property instead of value', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-width-prop',
        attrs: {
          tableWidth: { width: 2500, type: 'pct' }, // Using width property
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100], // Original: 100px
      };

      const measure = await measureBlock(block, { maxWidth: 400 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // With 50% width, should scale to 200px (half of 400px)
      expect(measure.totalWidth).toBe(200);
      expect(measure.columnWidths[0]).toBe(200);
    });

    it('caps percentage width at maxWidth when percentage exceeds available space', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-capped',
        attrs: {
          tableWidth: { value: 5000, type: 'pct' }, // 100%
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [800], // Original: 800px, already > maxWidth
      };

      const measure = await measureBlock(block, { maxWidth: 400 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Even at 100%, should not exceed maxWidth of 400px
      expect(measure.totalWidth).toBe(400);
    });

    it('maintains column width ratios when scaling to percentage width', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-ratios',
        attrs: {
          tableWidth: { value: 5000, type: 'pct' }, // 100%
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-2',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'C', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [50, 100, 50], // 1:2:1 ratio, 200px total
      };

      const measure = await measureBlock(block, { maxWidth: 400 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Should scale to 400px maintaining 1:2:1 ratio
      // 50 * 2 = 100, 100 * 2 = 200, 50 * 2 = 100
      expect(measure.totalWidth).toBe(400);
      expect(measure.columnWidths[0]).toBe(100);
      expect(measure.columnWidths[1]).toBe(200);
      expect(measure.columnWidths[2]).toBe(100);
    });

    it('handles explicit pixel width (type: px)', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'px-table',
        attrs: {
          tableWidth: { width: 300, type: 'px' },
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100, 100], // Original: 200px
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Explicit 300px width should scale columns from 200px to 300px
      expect(measure.totalWidth).toBe(300);
      expect(measure.columnWidths[0]).toBe(150);
      expect(measure.columnWidths[1]).toBe(150);
    });

    it('ignores zero percentage value', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-zero',
        attrs: {
          tableWidth: { value: 0, type: 'pct' }, // 0 = invalid
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Zero percentage is invalid - should fall back to auto layout
      // Auto layout without explicit width means column widths used as-is
      expect(measure.totalWidth).toBe(100);
      expect(measure.columnWidths[0]).toBe(100);
    });

    it('ignores negative percentage value', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-negative',
        attrs: {
          tableWidth: { value: -2500, type: 'pct' }, // Negative = invalid
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [150],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Negative percentage is invalid - should fall back to auto layout
      expect(measure.totalWidth).toBe(150);
      expect(measure.columnWidths[0]).toBe(150);
    });

    it('ignores NaN percentage value', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-nan',
        attrs: {
          tableWidth: { value: NaN, type: 'pct' }, // NaN = invalid
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [200],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // NaN is invalid - should fall back to auto layout
      expect(measure.totalWidth).toBe(200);
      expect(measure.columnWidths[0]).toBe(200);
    });

    it('ignores Infinity percentage value', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-infinity',
        attrs: {
          tableWidth: { value: Infinity, type: 'pct' }, // Infinity = invalid
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [175],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Infinity is invalid - should fall back to auto layout
      expect(measure.totalWidth).toBe(175);
      expect(measure.columnWidths[0]).toBe(175);
    });

    it('ignores tableWidth with missing both width and value properties', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'pct-table-missing-props',
        attrs: {
          tableWidth: { type: 'pct' }, // Missing value/width = invalid
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [120],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Missing value is invalid - should fall back to auto layout
      expect(measure.totalWidth).toBe(120);
      expect(measure.columnWidths[0]).toBe(120);
    });

    it('ignores tableWidth when type is pixel with invalid value', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'px-table-nan',
        attrs: {
          tableWidth: { width: NaN, type: 'pixel' }, // NaN pixel width = invalid
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [130],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // NaN pixel width is invalid - should fall back to auto layout
      expect(measure.totalWidth).toBe(130);
      expect(measure.columnWidths[0]).toBe(130);
    });

    it('handles missing tableWidth property entirely', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'table-no-width',
        attrs: {}, // No tableWidth property at all
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [140],
      };

      const measure = await measureBlock(block, { maxWidth: 600 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // No tableWidth - auto layout uses column widths as-is
      expect(measure.totalWidth).toBe(140);
      expect(measure.columnWidths[0]).toBe(140);
    });

    it('does NOT scale up column widths for fixed layout tables with explicit width', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'fixed-layout-no-scale-up',
        attrs: {
          tableLayout: 'fixed',
          tableWidth: { width: 600, type: 'px' }, // Explicit 600px width
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100, 100], // Original: 200px total, explicit width is 600px
      };

      const measure = await measureBlock(block, { maxWidth: 800 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Fixed layout should preserve original column widths, NOT scale up to 600px
      // This is Word behavior: fixed layout tables honor the grid column widths exactly
      expect(measure.totalWidth).toBe(200);
      expect(measure.columnWidths[0]).toBe(100);
      expect(measure.columnWidths[1]).toBe(100);
    });

    it('scales DOWN column widths for fixed layout tables when exceeding target width', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'fixed-layout-scale-down',
        attrs: {
          tableLayout: 'fixed',
          tableWidth: { width: 300, type: 'px' }, // Explicit 300px width
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [300, 300], // Original: 600px total, exceeds explicit width of 300px
      };

      const measure = await measureBlock(block, { maxWidth: 800 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Fixed layout SHOULD scale down when columns exceed the explicit width
      expect(measure.totalWidth).toBe(300);
      expect(measure.columnWidths[0]).toBe(150);
      expect(measure.columnWidths[1]).toBe(150);
    });

    it('scales up column widths for auto layout tables with explicit pixel width', async () => {
      const block: FlowBlock = {
        kind: 'table',
        id: 'auto-layout-scale-up',
        attrs: {
          // No tableLayout means auto layout
          tableWidth: { width: 400, type: 'px' }, // Explicit 400px width
        },
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              {
                id: 'cell-0-1',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'B', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
        columnWidths: [100, 100], // Original: 200px total
      };

      const measure = await measureBlock(block, { maxWidth: 800 });

      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      // Auto layout with explicit width SHOULD scale up to fill the explicit width
      expect(measure.totalWidth).toBe(400);
      expect(measure.columnWidths[0]).toBe(200);
      expect(measure.columnWidths[1]).toBe(200);
    });
  });

  describe('table cell measurement with spacing.after', () => {
    it('should add spacing.after to content height for all paragraphs', async () => {
      const table: FlowBlock = {
        kind: 'table',
        id: 'table-spacing',
        attrs: {},
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                attrs: {},
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'First paragraph', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: 10 } },
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'Last paragraph', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: 20 } },
                  },
                ],
              },
            ],
          },
        ],
      };

      const measure = await measureBlock(table, 1000);
      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];
      const block0Measure = cellMeasure.blocks[0];
      const block1Measure = cellMeasure.blocks[1];

      // Content height should include both paragraph heights and both spacing.after values
      // First paragraph: height + 10px spacing
      // Last paragraph: height + 20px spacing (even though it's the last paragraph)
      expect(block0Measure.kind).toBe('paragraph');
      expect(block1Measure.kind).toBe('paragraph');

      const para0Height = block0Measure.kind === 'paragraph' ? block0Measure.totalHeight : 0;
      const para1Height = block1Measure.kind === 'paragraph' ? block1Measure.totalHeight : 0;

      // Cell height includes: para0Height + 10 + para1Height + 20 + padding (default 2 top + 2 bottom)
      const expectedCellHeight = para0Height + 10 + para1Height + 20 + 4;
      expect(cellMeasure.height).toBe(expectedCellHeight);
    });

    it('should only add spacing when greater than 0', async () => {
      const table: FlowBlock = {
        kind: 'table',
        id: 'table-zero-spacing',
        attrs: {},
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                attrs: {},
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Zero spacing', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: 0 } },
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'Negative spacing', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: -5 } },
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'Positive spacing', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: 15 } },
                  },
                ],
              },
            ],
          },
        ],
      };

      const measure = await measureBlock(table, 1000);
      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];
      const block0 = cellMeasure.blocks[0];
      const block1 = cellMeasure.blocks[1];
      const block2 = cellMeasure.blocks[2];

      const para0Height = block0.kind === 'paragraph' ? block0.totalHeight : 0;
      const para1Height = block1.kind === 'paragraph' ? block1.totalHeight : 0;
      const para2Height = block2.kind === 'paragraph' ? block2.totalHeight : 0;

      // Only positive spacing should be added
      // Zero and negative spacing should not be added
      // Cell height = para0 + para1 + para2 + 15 (positive spacing) + 4 (padding)
      const expectedCellHeight = para0Height + para1Height + para2Height + 15 + 4;
      expect(cellMeasure.height).toBe(expectedCellHeight);
    });

    it('should handle cells without spacing.after', async () => {
      const table: FlowBlock = {
        kind: 'table',
        id: 'table-no-spacing',
        attrs: {},
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                attrs: {},
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'No spacing', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: {},
                  },
                ],
              },
            ],
          },
        ],
      };

      const measure = await measureBlock(table, 1000);
      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];
      const block0 = cellMeasure.blocks[0];

      const paraHeight = block0.kind === 'paragraph' ? block0.totalHeight : 0;

      // Cell height should just be paragraph height + padding (no spacing.after)
      const expectedCellHeight = paraHeight + 4;
      expect(cellMeasure.height).toBe(expectedCellHeight);
    });

    it('should not include anchored images in table cell height', async () => {
      const table: FlowBlock = {
        kind: 'table',
        id: 'table-anchored-image',
        attrs: {},
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                attrs: {},
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 16 }],
                  },
                  {
                    kind: 'image',
                    id: 'img-0',
                    src: 'data:image/png;base64,AAA',
                    anchor: { isAnchored: true, vRelativeFrom: 'paragraph', offsetV: 5 },
                    wrap: { type: 'None' },
                    attrs: { anchorParagraphId: 'para-0' },
                  },
                ],
              },
            ],
          },
        ],
      };

      const measure = await measureBlock(table, 1000);
      expect(measure.kind).toBe('table');
      const cellMeasure = measure.rows[0].cells[0];
      const paraMeasure = cellMeasure.blocks[0];

      expect(paraMeasure.kind).toBe('paragraph');
      const paraHeight = paraMeasure.kind === 'paragraph' ? paraMeasure.totalHeight : 0;

      // Anchored image is out-of-flow: it should not increase cell height.
      const expectedCellHeight = paraHeight + 4; // default top+bottom padding
      expect(cellMeasure.height).toBe(expectedCellHeight);
    });

    it('should handle type safety for spacing.after', async () => {
      const table: FlowBlock = {
        kind: 'table',
        id: 'table-type-safety',
        attrs: {},
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                attrs: {},
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Valid number', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: 10 } },
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'Invalid string', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: '10' as unknown as number } },
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-2',
                    runs: [{ text: 'Undefined', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: undefined } },
                  },
                ],
              },
            ],
          },
        ],
      };

      const measure = await measureBlock(table, 1000);
      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];
      const block0 = cellMeasure.blocks[0];
      const block1 = cellMeasure.blocks[1];
      const block2 = cellMeasure.blocks[2];

      const para0Height = block0.kind === 'paragraph' ? block0.totalHeight : 0;
      const para1Height = block1.kind === 'paragraph' ? block1.totalHeight : 0;
      const para2Height = block2.kind === 'paragraph' ? block2.totalHeight : 0;

      // Only the valid number should add spacing
      // Cell height = para0 + 10 (valid spacing) + para1 + para2 + 4 (padding)
      const expectedCellHeight = para0Height + 10 + para1Height + para2Height + 4;
      expect(cellMeasure.height).toBe(expectedCellHeight);
    });

    it('should handle mixed block types with spacing', async () => {
      const table: FlowBlock = {
        kind: 'table',
        id: 'table-mixed-blocks',
        attrs: {},
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0-0',
                attrs: {},
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Paragraph with spacing', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: 10 } },
                  },
                  {
                    kind: 'image',
                    id: 'img-0',
                    src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                    width: 100,
                    height: 100,
                  },
                  {
                    kind: 'paragraph',
                    id: 'para-1',
                    runs: [{ text: 'Another paragraph', fontFamily: 'Arial', fontSize: 16 }],
                    attrs: { spacing: { after: 5 } },
                  },
                ],
              },
            ],
          },
        ],
      };

      const measure = await measureBlock(table, 1000);
      expect(measure.kind).toBe('table');
      if (measure.kind !== 'table') throw new Error('expected table measure');

      const cellMeasure = measure.rows[0].cells[0];

      // Should handle mixed block types correctly
      // Paragraphs should have spacing.after applied, image should not
      expect(cellMeasure.blocks).toHaveLength(3);
      expect(cellMeasure.blocks[0].kind).toBe('paragraph');
      expect(cellMeasure.blocks[1].kind).toBe('image');
      expect(cellMeasure.blocks[2].kind).toBe('paragraph');

      const block0 = cellMeasure.blocks[0];
      const block1 = cellMeasure.blocks[1];
      const block2 = cellMeasure.blocks[2];

      const para0Height = block0.kind === 'paragraph' ? block0.totalHeight : 0;
      const imageHeight = block1.kind === 'image' ? block1.height : 0;
      const para1Height = block2.kind === 'paragraph' ? block2.totalHeight : 0;

      // Cell height = para0 + 10 + image + para1 + 5 + 4 (padding)
      const expectedCellHeight = para0Height + 10 + imageHeight + para1Height + 5 + 4;
      expect(cellMeasure.height).toBe(expectedCellHeight);
    });
  });
});
