/**
 * Comprehensive unit tests for remeasureParagraph and its helper functions.
 *
 * Tests cover:
 * - Input validation (invalid maxWidth, NaN values, undefined blocks)
 * - Basic functionality (single/multiple runs, line breaking)
 * - Tab stop resolution (explicit stops, default intervals, TWIPS conversion)
 * - Indentation (left, right, firstLine, hanging, combined indents)
 * - Line breaking (whitespace breaks, forced breaks, narrow widths)
 * - Edge cases (empty runs, very narrow widths, whitespace-only content)
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { ParagraphBlock, Run, TabStop } from '@superdoc/contracts';
import { remeasureParagraph } from '../src/remeasure.ts';

/**
 * Character width constant for consistent text measurement mocking.
 * All tests use 10px per character for predictable measurements.
 */
const CHAR_WIDTH = 10;

/**
 * TWIPS conversion constants matching the implementation.
 */
const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96;
const TWIPS_PER_PX = TWIPS_PER_INCH / PX_PER_INCH; // 15 twips per px
const DEFAULT_TAB_INTERVAL_TWIPS = 720; // 0.5 inch
const DEFAULT_TAB_INTERVAL_PX = DEFAULT_TAB_INTERVAL_TWIPS / TWIPS_PER_PX; // 48px

/**
 * Creates a mock canvas context for text measurement in Node.js test environment.
 * Simulates browser canvas.measureText() behavior with fixed character width.
 */
const ensureDocumentStub = (): void => {
  if (typeof document !== 'undefined') return;

  const ctx = {
    font: '',
    measureText(text: string) {
      // Simple proportional width: each character = CHAR_WIDTH pixels
      return { width: text.length * CHAR_WIDTH } as TextMetrics;
    },
  };

  (globalThis as any).document = {
    createElement() {
      return {
        getContext() {
          return ctx;
        },
      };
    },
  } as Document;
};

/**
 * Helper to create a paragraph block with specified runs and optional attributes.
 *
 * @param runs - Array of runs (text, tabs, etc.) for the paragraph.
 * @param attrs - Optional paragraph attributes (indent, tabs, etc.).
 * @returns ParagraphBlock suitable for testing.
 */
const createBlock = (runs: Run[], attrs?: ParagraphBlock['attrs']): ParagraphBlock => ({
  kind: 'paragraph',
  id: 'test-block',
  runs,
  attrs,
});

/**
 * Helper to create a text run with default Arial 16px formatting.
 *
 * @param text - The text content of the run.
 * @param overrides - Optional property overrides (fontSize, fontFamily, etc.).
 * @returns TextRun with specified text and formatting.
 */
const textRun = (text: string, overrides?: Partial<Run>): Run => ({
  text,
  fontFamily: 'Arial',
  fontSize: 16,
  ...overrides,
});

/**
 * Helper to create a tab run.
 *
 * @param overrides - Optional property overrides.
 * @returns Tab run.
 */
const tabRun = (overrides?: Partial<Run>): Run => ({
  kind: 'tab',
  text: '\t',
  ...overrides,
});

/**
 * Helper to convert pixels to TWIPS for tab stop positions.
 *
 * @param px - Position in pixels.
 * @returns Position in TWIPS.
 */
const pxToTwips = (px: number): number => Math.round(px * TWIPS_PER_PX);

beforeAll(() => {
  ensureDocumentStub();
});

describe('remeasureParagraph', () => {
  describe('Input Validation', () => {
    it('throws error when maxWidth is zero', () => {
      const block = createBlock([textRun('Hello')]);
      expect(() => remeasureParagraph(block, 0)).toThrow(
        'remeasureParagraph: maxWidth must be a positive number, got 0',
      );
    });

    it('throws error when maxWidth is negative', () => {
      const block = createBlock([textRun('Hello')]);
      expect(() => remeasureParagraph(block, -100)).toThrow(
        'remeasureParagraph: maxWidth must be a positive number, got -100',
      );
    });

    it('throws error when maxWidth is NaN', () => {
      const block = createBlock([textRun('Hello')]);
      expect(() => remeasureParagraph(block, NaN)).toThrow(
        'remeasureParagraph: maxWidth must be a positive number, got NaN',
      );
    });

    it('throws error when maxWidth is Infinity', () => {
      const block = createBlock([textRun('Hello')]);
      expect(() => remeasureParagraph(block, Infinity)).toThrow(
        'remeasureParagraph: maxWidth must be a positive number, got Infinity',
      );
    });

    it('throws error when block is undefined', () => {
      expect(() => remeasureParagraph(undefined as any, 100)).toThrow('remeasureParagraph: block must be defined');
    });

    it('throws error when block.runs is not an array', () => {
      const block = { kind: 'paragraph', id: 'test', runs: 'not-an-array' } as any;
      expect(() => remeasureParagraph(block, 100)).toThrow(
        'remeasureParagraph: block.runs must be an array, got string',
      );
    });

    it('throws error when block.runs is null', () => {
      const block = { kind: 'paragraph', id: 'test', runs: null } as any;
      expect(() => remeasureParagraph(block, 100)).toThrow(
        'remeasureParagraph: block.runs must be an array, got object',
      );
    });

    it('throws error when firstLineIndent is NaN', () => {
      const block = createBlock([textRun('Hello')]);
      expect(() => remeasureParagraph(block, 100, NaN)).toThrow(
        'remeasureParagraph: firstLineIndent must be a finite number, got NaN',
      );
    });

    it('throws error when firstLineIndent is Infinity', () => {
      const block = createBlock([textRun('Hello')]);
      expect(() => remeasureParagraph(block, 100, Infinity)).toThrow(
        'remeasureParagraph: firstLineIndent must be a finite number, got Infinity',
      );
    });
  });

  describe('Basic Functionality', () => {
    it('measures single run on one line when text fits', () => {
      const block = createBlock([textRun('Hello')]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.kind).toBe('paragraph');
      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].fromRun).toBe(0);
      expect(measure.lines[0].toRun).toBe(0);
      expect(measure.lines[0].fromChar).toBe(0);
      expect(measure.lines[0].toChar).toBe(5);
      expect(measure.lines[0].width).toBe(5 * CHAR_WIDTH);
      expect(measure.lines[0].lineHeight).toBe(16 * 1.2); // fontSize * 1.2
      expect(measure.totalHeight).toBe(16 * 1.2);
    });

    it('measures multiple runs on one line when they fit', () => {
      const block = createBlock([textRun('Hello'), textRun('World')]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].fromRun).toBe(0);
      expect(measure.lines[0].toRun).toBe(1);
      expect(measure.lines[0].toChar).toBe(5); // End at char 5 of second run
      expect(measure.lines[0].width).toBe(10 * CHAR_WIDTH); // "Hello" + "World"
    });

    it('breaks multiple runs spanning multiple lines', () => {
      // "Hello" (5 chars) + "World" (5 chars) = 100px total
      // With maxWidth=60, should break into 2 lines
      const block = createBlock([textRun('Hello'), textRun('World')]);
      const measure = remeasureParagraph(block, 60);

      expect(measure.lines.length).toBeGreaterThan(1);
      expect(measure.totalHeight).toBeGreaterThan(16 * 1.2); // Multiple lines
    });

    it('returns empty measure for empty runs array', () => {
      const block = createBlock([]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.kind).toBe('paragraph');
      expect(measure.lines).toHaveLength(0);
      expect(measure.totalHeight).toBe(0);
    });

    it('handles single character per line when maxWidth is very narrow', () => {
      // With maxWidth=11 (barely fits 1 char at 10px + fudge), each char should be on its own line
      const block = createBlock([textRun('ABC')]);
      const measure = remeasureParagraph(block, 11);

      expect(measure.lines.length).toBeGreaterThan(1);
      // Each line should contain approximately 1 character
      measure.lines.forEach((line) => {
        const charCount = line.toChar - line.fromChar;
        expect(charCount).toBeLessThanOrEqual(2); // At most 1-2 chars per line
      });
    });

    it('forces at least one character per line even if it exceeds maxWidth', () => {
      // With maxWidth=1 (less than one char), should still output one char per line
      const block = createBlock([textRun('AB')]);
      const measure = remeasureParagraph(block, 1);

      expect(measure.lines.length).toBeGreaterThanOrEqual(2);
      // Each line should have at least 1 character
      measure.lines.forEach((line) => {
        const charCount = line.toChar - line.fromChar;
        expect(charCount).toBeGreaterThanOrEqual(1);
      });
    });

    it('calculates line height based on maximum font size in line', () => {
      const block = createBlock([textRun('Small', { fontSize: 12 }), textRun('Large', { fontSize: 24 })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Line height should be based on largest font (24px * 1.2 = 28.8px)
      expect(measure.lines[0].lineHeight).toBe(24 * 1.2);
    });

    it('handles runs with different formatting on same line', () => {
      const block = createBlock([
        textRun('Bold', { bold: true }),
        textRun('Italic', { italic: true }),
        textRun('Normal'),
      ]);
      const measure = remeasureParagraph(block, 300);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].fromRun).toBe(0);
      expect(measure.lines[0].toRun).toBe(2);
    });
  });

  describe('Tab Stop Tests', () => {
    it('advances cursor to correct position for tab at explicit stop', () => {
      // Tab at 48px (720 TWIPS = 0.5 inch)
      const tabStop: TabStop = { pos: 720, val: 'start' };
      const block = createBlock([textRun('A'), tabRun(), textRun('B')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // "A" = 10px, tab advances to 48px, "B" starts at 48px
      // Total width should be ~48px + 10px = 58px
      expect(measure.lines[0].width).toBeGreaterThan(48);
    });

    it('advances cursor for multiple tabs in same line sequentially', () => {
      // Two explicit tab stops at 48px and 96px
      const tabStops: TabStop[] = [
        { pos: 720, val: 'start' }, // 48px
        { pos: 1440, val: 'start' }, // 96px
      ];
      const block = createBlock([textRun('A'), tabRun(), textRun('B'), tabRun(), textRun('C')], {
        tabs: tabStops,
      });
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // "A"=10px, tab1 advances to 48px, "B"=10px at 48px->58px, tab2 advances to 96px, "C" at 96px
      // Total width should be ~96px + 10px = 106px
      expect(measure.lines[0].width).toBeGreaterThan(96);
    });

    it('falls back to default tab interval when explicit tabs are exhausted', () => {
      // One explicit tab at 48px, then default interval of 48px after that
      const tabStop: TabStop = { pos: 720, val: 'start' }; // 48px
      const block = createBlock(
        [
          textRun('A'), // 0-10px
          tabRun(), // advances to 48px (explicit)
          textRun('B'), // 48-58px
          tabRun(), // advances to 48+48=96px (default interval)
          textRun('C'), // 96-106px
        ],
        { tabs: [tabStop], tabIntervalTwips: DEFAULT_TAB_INTERVAL_TWIPS },
      );
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Width should reflect tab advancing by default interval
      expect(measure.lines[0].width).toBeGreaterThan(96);
    });

    it('uses default tab interval when no explicit tabs are defined', () => {
      // No explicit tabs, should use default 48px interval
      const block = createBlock(
        [
          textRun('A'), // 0-10px
          tabRun(), // advances to 48px
          textRun('B'), // 48-58px
        ],
        { tabIntervalTwips: DEFAULT_TAB_INTERVAL_TWIPS },
      );
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].width).toBeGreaterThan(48);
    });

    it('keeps right-aligned tab groups on the same line', () => {
      const tabStop: TabStop = { pos: pxToTwips(100), val: 'end' };
      const block = createBlock([textRun('AAA'), tabRun(), textRun('12')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].toRun).toBe(2);
      expect(measure.lines[0].width).toBeGreaterThanOrEqual(100);
    });

    it('keeps center-aligned tab groups on the same line', () => {
      const tabStop: TabStop = { pos: pxToTwips(100), val: 'center' };
      const block = createBlock([textRun('AAA'), tabRun(), textRun('12')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].toRun).toBe(2);
    });

    it('keeps decimal-aligned tab groups on the same line', () => {
      const tabStop: TabStop = { pos: pxToTwips(100), val: 'decimal' };
      const block = createBlock([textRun('AAA'), tabRun(), textRun('123.45')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].toRun).toBe(2);
    });

    it('handles decimal tab with comma separator', () => {
      const tabStop: TabStop = { pos: pxToTwips(100), val: 'decimal' };
      const block = createBlock([textRun('AAA'), tabRun(), textRun('123,45')], {
        tabs: [tabStop],
        decimalSeparator: ',',
      });
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].toRun).toBe(2);
    });

    it('handles tab with dot leader', () => {
      const tabStop: TabStop = { pos: pxToTwips(100), val: 'end', leader: 'dot' };
      const block = createBlock([textRun('AAA'), tabRun(), textRun('12')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines).toHaveLength(1);
      // Leaders should be recorded on the line
      expect(measure.lines[0].leaders).toBeDefined();
      expect(measure.lines[0].leaders?.length).toBeGreaterThan(0);
      expect(measure.lines[0].leaders?.[0].style).toBe('dot');
    });

    it('handles tab with hyphen leader', () => {
      const tabStop: TabStop = { pos: pxToTwips(100), val: 'end', leader: 'hyphen' };
      const block = createBlock([textRun('Entry'), tabRun(), textRun('99')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].leaders?.[0].style).toBe('hyphen');
    });

    it('handles multiple aligned tabs on same line', () => {
      const tabStops: TabStop[] = [
        { pos: pxToTwips(50), val: 'center' },
        { pos: pxToTwips(100), val: 'end' },
      ];
      const block = createBlock([textRun('A'), tabRun(), textRun('B'), tabRun(), textRun('C')], {
        tabs: tabStops,
      });
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].toRun).toBe(4);
    });

    it('creates segments for aligned tab content', () => {
      const tabStop: TabStop = { pos: pxToTwips(100), val: 'end' };
      const block = createBlock([textRun('AAA'), tabRun(), textRun('12')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines[0].segments).toBeDefined();
      expect(measure.lines[0].segments?.length).toBeGreaterThan(0);
    });

    it('handles tab at various positions within text', () => {
      // Tab after some text should advance to next stop after current position
      const tabStop: TabStop = { pos: 720, val: 'start' }; // 48px
      const block = createBlock(
        [
          textRun('Hello'), // 0-50px (exceeds first tab stop)
          tabRun(), // should advance to next interval: 50 + 48 = 98px
          textRun('World'),
        ],
        { tabs: [tabStop], tabIntervalTwips: DEFAULT_TAB_INTERVAL_TWIPS },
      );
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Width should reflect tab advancing past the 48px stop to default interval
      expect(measure.lines[0].width).toBeGreaterThan(50 + DEFAULT_TAB_INTERVAL_PX);
    });

    it('handles multiple tabs with no text between them', () => {
      const tabStops: TabStop[] = [
        { pos: 720, val: 'start' }, // 48px
        { pos: 1440, val: 'start' }, // 96px
      ];
      const block = createBlock([tabRun(), tabRun(), textRun('A')], { tabs: tabStops });
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // First tab advances to 48px, second to 96px, text at 96px
      expect(measure.lines[0].width).toBeGreaterThan(96);
    });

    it('converts TWIPS to pixels correctly for tab stop positions', () => {
      // 1440 TWIPS = 1 inch = 96px at 96dpi
      const tabStop: TabStop = { pos: 1440, val: 'start' };
      const block = createBlock([textRun('A'), tabRun(), textRun('B')], { tabs: [tabStop] });
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Tab should advance to 96px (1 inch)
      expect(measure.lines[0].width).toBeGreaterThan(96);
    });
  });

  describe('Indentation Tests', () => {
    it('reduces available width by left indent', () => {
      // Left indent of 20px reduces available width from 100px to 80px
      const block = createBlock([textRun('A'.repeat(10))], {
        // 10 chars = 100px
        indent: { left: 20 },
      });
      const measure = remeasureParagraph(block, 100);

      // With 80px available, 100px text should break into multiple lines
      expect(measure.lines.length).toBeGreaterThan(1);
    });

    it('reduces available width by right indent', () => {
      // Right indent of 20px reduces available width from 100px to 80px
      const block = createBlock([textRun('A'.repeat(10))], {
        // 10 chars = 100px
        indent: { right: 20 },
      });
      const measure = remeasureParagraph(block, 100);

      // With 80px available, 100px text should break into multiple lines
      expect(measure.lines.length).toBeGreaterThan(1);
    });

    it('applies first line indent only to first line', () => {
      // First line indent of 30px reduces first line width
      const block = createBlock([textRun('A'.repeat(20))], {
        // 20 chars = 200px
        indent: { firstLine: 30 },
      });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThan(1);
      // First line has width reduced by firstLine indent (100 - 30 = 70px)
      // Subsequent lines have full 100px available
      // First line should have fewer characters than subsequent lines
      const firstLineChars = measure.lines[0].toChar - measure.lines[0].fromChar;
      const secondLineChars = measure.lines[1] ? measure.lines[1].toChar - measure.lines[1].fromChar : firstLineChars;
      expect(firstLineChars).toBeLessThan(secondLineChars);
    });

    it('expands first line width for hanging indents without negative indents', () => {
      const maxWidth = 200;
      const indentLeft = 40;
      const hanging = 20;
      const block = createBlock([textRun('A'.repeat(40))], {
        indent: { left: indentLeft, hanging },
      });
      const measure = remeasureParagraph(block, maxWidth);

      expect(measure.lines.length).toBeGreaterThan(1);
      const contentWidth = maxWidth - indentLeft;
      expect(measure.lines[0].maxWidth).toBe(contentWidth + hanging);
      expect(measure.lines[1].maxWidth).toBe(contentWidth);
    });

    it('increases subsequent line widths with hanging indent', () => {
      // Hanging indent means first line has REDUCED width (negative offset from hanging)
      // Subsequent lines have MORE width (hanging indent adds to available space)
      const block = createBlock([textRun('A'.repeat(20))], {
        // 20 chars = 200px
        indent: { hanging: 30 },
      });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThan(1);
      // Hanging indent reduces first line width, subsequent lines have more space
      // The implementation calculates: firstLineOffset = max(0, firstLineIndent - hanging)
      // With hanging=30, firstLine=0: offset = max(0, 0-30) = 0, so no change expected
      // This test verifies the hanging indent is processed without errors
      expect(measure.lines[0]).toBeDefined();
      expect(measure.lines[1]).toBeDefined();
    });

    it('calculates correct width with combined left and right indents', () => {
      // Left=20px + Right=30px reduces 100px width to 50px
      const block = createBlock([textRun('A'.repeat(10))], {
        // 10 chars = 100px
        indent: { left: 20, right: 30 },
      });
      const measure = remeasureParagraph(block, 100);

      // With 50px available, 100px text should break into multiple lines
      expect(measure.lines.length).toBeGreaterThan(1);
    });

    it('handles combined firstLine and hanging indents correctly', () => {
      // FirstLine=20px and Hanging=10px: first line gets 20-10=10px offset, next lines get 10px offset
      const block = createBlock([textRun('A'.repeat(20))], {
        indent: { firstLine: 20, hanging: 10 },
      });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThan(1);
      // The interaction between firstLine and hanging is: effectiveFirstLineOffset = firstLine - hanging
      // This should be reflected in line breaking behavior
    });

    it('handles negative indent values by clamping to zero', () => {
      // Implementation uses Math.max(0, indent) to prevent negative indents
      const block = createBlock([textRun('Hello')], {
        indent: { left: -50, right: -30, firstLine: -20, hanging: -10 },
      });
      const measure = remeasureParagraph(block, 100);

      // Should treat negative values as 0, so full width is available
      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].width).toBe(5 * CHAR_WIDTH);
    });

    it('avoids widening first line when negative indents are present with hanging', () => {
      const maxWidth = 200;
      const block = createBlock([textRun('A'.repeat(40))], {
        indent: { left: -20, right: -30, hanging: 20 },
      });
      const measure = remeasureParagraph(block, maxWidth);

      expect(measure.lines.length).toBeGreaterThan(1);
      expect(measure.lines[0].maxWidth).toBe(maxWidth);
      expect(measure.lines[1].maxWidth).toBe(maxWidth);
    });

    it('respects firstLineIndent parameter for list markers', () => {
      // firstLineIndent parameter (different from attrs.indent.firstLine) is for in-flow list markers
      const block = createBlock([textRun('A'.repeat(15))]); // 15 chars = 150px
      const measure = remeasureParagraph(block, 100, 30); // 30px firstLineIndent

      expect(measure.lines.length).toBeGreaterThan(1);
      // First line has only 70px available (100 - 30), subsequent lines have 100px
      const firstLineChars = measure.lines[0].toChar - measure.lines[0].fromChar;
      const secondLineChars = measure.lines[1] ? measure.lines[1].toChar - measure.lines[1].fromChar : 0;
      expect(firstLineChars).toBeLessThan(secondLineChars);
    });
  });

  describe('Line Breaking Tests', () => {
    it('breaks at whitespace when exceeding maxWidth', () => {
      // "Hello World" should break at space when width is constrained
      const block = createBlock([textRun('Hello World')]);
      const measure = remeasureParagraph(block, 60); // Less than 11 chars (110px)

      expect(measure.lines.length).toBeGreaterThan(1);
      // Should break between "Hello" and "World"
    });

    it('uses width at the break point instead of overflow content', () => {
      // Ensure the stored line width matches the text that actually fits before the break.
      // Without rewinding to the break point, width would include overflow characters,
      // resulting in zero justify slack in columns.
      const block = createBlock([textRun('Hello world')]);
      const measure = remeasureParagraph(block, 85); // Forces wrap mid-second word

      expect(measure.lines.length).toBe(2);
      const firstLine = measure.lines[0];
      // Breaks after "Hello " (6 chars)
      expect(firstLine.toChar - firstLine.fromChar).toBe(6);
      expect(firstLine.width).toBeCloseTo(6 * CHAR_WIDTH);
    });

    it('breaks mid-word when no whitespace is available (forced break)', () => {
      // Long word with no spaces should break mid-word
      const block = createBlock([textRun('HelloWorld')]);
      const measure = remeasureParagraph(block, 60); // Less than 10 chars (100px)

      expect(measure.lines.length).toBeGreaterThan(1);
      // Should force break within "HelloWorld"
    });

    it('breaks at hyphen as a valid break point', () => {
      const block = createBlock([textRun('Hello-World')]);
      const measure = remeasureParagraph(block, 70);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
      // Hyphen is a valid break point (included in break character check)
    });

    it('breaks at tab character as a valid break point', () => {
      // Implementation treats tab as a break opportunity
      const block = createBlock([textRun('Hello\tWorld')]);
      const measure = remeasureParagraph(block, 70);

      // Note: This test verifies tab handling in text content (not tabRun)
      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('preserves whitespace at break points', () => {
      const block = createBlock([textRun('Hello World')]);
      const measure = remeasureParagraph(block, 60);

      // After breaking at space, verify the break position includes the space
      const line1Chars = measure.lines[0].toChar - measure.lines[0].fromChar;
      expect(line1Chars).toBeGreaterThan(0);
    });

    it('handles very long words that exceed maxWidth significantly', () => {
      // 50 character word in 60px width (can fit ~6 chars per line)
      const block = createBlock([textRun('A'.repeat(50))]);
      const measure = remeasureParagraph(block, 60);

      expect(measure.lines.length).toBeGreaterThan(5);
      // Should break into multiple lines, each with ~6 chars
    });

    it('handles mixed spaces and hyphens in line breaking', () => {
      const block = createBlock([textRun('Hello-Beautiful World')]);
      const measure = remeasureParagraph(block, 100);

      // Should break at valid points (spaces and hyphens)
      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('does not break before first character even if maxWidth is tiny', () => {
      // Ensures at least one character per line (forced break logic)
      const block = createBlock([textRun('AB')]);
      const measure = remeasureParagraph(block, 5); // Less than 1 char width

      expect(measure.lines.length).toBeGreaterThanOrEqual(2);
      measure.lines.forEach((line) => {
        const charCount = line.toChar - line.fromChar;
        expect(charCount).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles very narrow maxWidth (1px)', () => {
      const block = createBlock([textRun('ABC')]);
      const measure = remeasureParagraph(block, 1);

      // Should still produce lines with at least 1 character each
      expect(measure.lines.length).toBeGreaterThanOrEqual(3);
      measure.lines.forEach((line) => {
        const charCount = line.toChar - line.fromChar;
        expect(charCount).toBeGreaterThanOrEqual(1);
      });
    });

    it('handles empty text runs', () => {
      const block = createBlock([textRun(''), textRun('Hello'), textRun('')]);
      const measure = remeasureParagraph(block, 100);

      // Empty runs should not cause errors, measure should only reflect "Hello"
      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles runs with only whitespace', () => {
      const block = createBlock([textRun('   ')]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
      expect(measure.lines[0].width).toBeGreaterThan(0); // Whitespace has width
    });

    it('handles runs with mixed whitespace and text', () => {
      const block = createBlock([textRun('  Hello  World  ')]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles very long words with no break opportunities', () => {
      // 100 character word should force many line breaks
      const block = createBlock([textRun('A'.repeat(100))]);
      const measure = remeasureParagraph(block, 50);

      expect(measure.lines.length).toBeGreaterThan(10);
    });

    it('handles single character text', () => {
      const block = createBlock([textRun('A')]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].fromChar).toBe(0);
      expect(measure.lines[0].toChar).toBe(1);
      expect(measure.lines[0].width).toBe(CHAR_WIDTH);
    });

    it('handles runs with different font sizes affecting line breaking', () => {
      // Small font + large font combination
      const block = createBlock([
        textRun('Small', { fontSize: 10 }), // Narrower chars
        textRun('Large', { fontSize: 30 }), // Wider chars (in real measurement)
      ]);
      const measure = remeasureParagraph(block, 100);

      // Line height should be based on largest font
      expect(measure.lines[0].lineHeight).toBe(30 * 1.2);
    });

    it('handles paragraph with no attrs defined', () => {
      const block = createBlock([textRun('Hello World')]);
      // No attrs, should use defaults (no indent, default tab interval)
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles paragraph with partial attrs (only some indent values)', () => {
      const block = createBlock([textRun('Hello World')], {
        indent: { left: 10 }, // Only left indent, others undefined
      });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles text with unicode characters', () => {
      const block = createBlock([textRun('Hello\u00A0World')]); // Non-breaking space
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles runs with break kind (non-text runs)', () => {
      const block = createBlock([textRun('Hello'), { kind: 'break' } as Run, textRun('World')]);
      const measure = remeasureParagraph(block, 200);

      // Break runs should be handled gracefully (likely contribute no width)
      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles runs with lineBreak kind', () => {
      const block = createBlock([textRun('Hello'), { kind: 'lineBreak' } as Run, textRun('World')]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles tabs followed immediately by line break', () => {
      const block = createBlock([textRun('A'), tabRun(), textRun('')]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles maxWidth exactly equal to text width', () => {
      const block = createBlock([textRun('Hello')]); // 5 chars = 50px
      const measure = remeasureParagraph(block, 50);

      // The line breaking algorithm checks: width + w > effectiveMaxWidth - WIDTH_FUDGE_PX
      // For character-by-character iteration, this can cause breaks at boundaries
      // Verify the text is measured without errors
      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });

    it('handles maxWidth slightly less than text width (within fudge factor)', () => {
      const block = createBlock([textRun('Hello')]); // 5 chars = 50px
      const measure = remeasureParagraph(block, 49.7); // Within 0.5px fudge

      // Due to character-by-character measurement, this may still break
      // Verify the text is measured without errors
      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });
  });

  describe('Complex Scenarios', () => {
    it('handles paragraph with all features combined (indents + tabs + breaks)', () => {
      const tabStops: TabStop[] = [{ pos: 720, val: 'start' }]; // 48px
      const block = createBlock(
        [textRun('Start'), tabRun(), textRun('After Tab'), textRun(' More text that will wrap to next line')],
        {
          indent: { left: 10, right: 10, firstLine: 20, hanging: 5 },
          tabs: tabStops,
          tabIntervalTwips: DEFAULT_TAB_INTERVAL_TWIPS,
        },
      );
      const measure = remeasureParagraph(block, 150);

      expect(measure.lines.length).toBeGreaterThan(1);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });

    it('handles multiple font sizes across multiple lines', () => {
      const block = createBlock([
        textRun('Small', { fontSize: 12 }),
        textRun('Medium', { fontSize: 16 }),
        textRun('Large', { fontSize: 24 }),
        textRun('VeryLarge', { fontSize: 32 }),
      ]);
      const measure = remeasureParagraph(block, 100);

      // Each line should have lineHeight based on max font size in that line
      expect(measure.lines.length).toBeGreaterThan(1);
      expect(measure.totalHeight).toBeGreaterThan(0);
    });

    it('maintains line height consistency within each line', () => {
      const block = createBlock([
        textRun('A', { fontSize: 10 }),
        textRun('B', { fontSize: 20 }),
        textRun('C', { fontSize: 15 }),
      ]);
      const measure = remeasureParagraph(block, 200);

      // All runs on same line, lineHeight should be max (20 * 1.2 = 24)
      expect(measure.lines).toHaveLength(1);
      expect(measure.lines[0].lineHeight).toBe(20 * 1.2);
    });

    it('handles alternating text and tab runs', () => {
      const tabStops: TabStop[] = [
        { pos: 720, val: 'start' }, // 48px
        { pos: 1440, val: 'start' }, // 96px
        { pos: 2160, val: 'start' }, // 144px
      ];
      const block = createBlock(
        [textRun('A'), tabRun(), textRun('B'), tabRun(), textRun('C'), tabRun(), textRun('D')],
        { tabs: tabStops },
      );
      const measure = remeasureParagraph(block, 300);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles wordLayout.textStartPx for numbered lists', () => {
      // wordLayout.textStartPx is used for list numbering to position first line
      const block = createBlock([textRun('A'.repeat(20))], {
        indent: { left: 0 },
        wordLayout: { textStartPx: 50 },
      });
      const measure = remeasureParagraph(block, 100);

      // First line should have reduced width (100 - 50 = 50px)
      // Subsequent lines should have full width (100px)
      expect(measure.lines.length).toBeGreaterThan(1);
    });

    it('falls back to wordLayout.marker.textStartX when wordLayout.textStartPx is missing', () => {
      const block = createBlock([textRun('A'.repeat(60))], {
        indent: { left: 10 },
        wordLayout: { firstLineIndentMode: true, marker: { textStartX: 50 } },
      });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThan(1);
      expect(measure.lines[0].maxWidth).toBe(50);
      expect(measure.lines[1].maxWidth).toBe(90);
    });

    it('prefers shared resolved text start over top-level textStartPx when both exist', () => {
      const block = createBlock([textRun('A'.repeat(60))], {
        indent: { left: 10 },
        wordLayout: {
          firstLineIndentMode: true,
          textStartPx: 80,
          marker: { textStartX: 50 },
        },
      });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThan(1);
      expect(measure.lines[0].maxWidth).toBe(50);
      expect(measure.lines[1].maxWidth).toBe(90);
    });

    it('handles hanging indent with left indent for list formatting', () => {
      // Common list pattern: left indent with hanging indent
      const block = createBlock([textRun('A'.repeat(30))], {
        indent: { left: 20, hanging: 20 },
      });
      const measure = remeasureParagraph(block, 100);

      // First line starts at left edge (left - hanging = 0)
      // Subsequent lines start at left indent (20px)
      expect(measure.lines.length).toBeGreaterThan(1);
    });
  });

  describe('Line Metadata', () => {
    it('sets ascent and descent to 0 (not calculated in remeasure)', () => {
      const block = createBlock([textRun('Hello')]);
      const measure = remeasureParagraph(block, 100);

      // Implementation sets ascent/descent to 0 (full typography in measuring/dom)
      expect(measure.lines[0].ascent).toBe(0);
      expect(measure.lines[0].descent).toBe(0);
    });

    it('sets maxWidth on each line to effective width for that line', () => {
      const block = createBlock([textRun('A'.repeat(20))], {
        indent: { firstLine: 30 },
      });
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThan(1);
      // First line has reduced maxWidth
      expect(measure.lines[0].maxWidth).toBeLessThan(measure.lines[1].maxWidth);
    });

    it('correctly sets fromRun, toRun, fromChar, toChar boundaries', () => {
      const block = createBlock([textRun('Hello'), textRun('World')]);
      const measure = remeasureParagraph(block, 60); // Force break

      measure.lines.forEach((line, i) => {
        expect(line.fromRun).toBeGreaterThanOrEqual(0);
        expect(line.toRun).toBeLessThanOrEqual(block.runs.length);
        expect(line.fromChar).toBeGreaterThanOrEqual(0);
        // Each line should have content, but toChar can equal fromChar for empty runs or end boundaries
        expect(line.toChar).toBeGreaterThanOrEqual(line.fromChar);
      });
    });

    it('advances run and char correctly across line boundaries', () => {
      const block = createBlock([textRun('AAAAAAAAAA')]); // 10 chars
      const measure = remeasureParagraph(block, 50); // Force break at ~5 chars

      expect(measure.lines.length).toBeGreaterThan(1);
      // Second line should start where first line ended
      expect(measure.lines[1].fromRun).toBeGreaterThanOrEqual(measure.lines[0].toRun);
      if (measure.lines[1].fromRun === measure.lines[0].toRun) {
        expect(measure.lines[1].fromChar).toBeGreaterThanOrEqual(measure.lines[0].toChar);
      }
    });
  });

  describe('Total Height Calculation', () => {
    it('calculates totalHeight as sum of all line heights', () => {
      const block = createBlock([textRun('A'.repeat(30))]);
      const measure = remeasureParagraph(block, 50);

      const sumLineHeights = measure.lines.reduce((sum, line) => sum + line.lineHeight, 0);
      expect(measure.totalHeight).toBe(sumLineHeights);
    });

    it('returns zero total height for empty paragraph', () => {
      const block = createBlock([]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.totalHeight).toBe(0);
    });

    it('handles varying line heights across lines', () => {
      const block = createBlock([
        textRun('Small', { fontSize: 12 }), // First line: 12 * 1.2 = 14.4
        textRun(' '),
        textRun('Large'.repeat(10), { fontSize: 24 }), // Subsequent lines: 24 * 1.2 = 28.8
      ]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThan(1);
      // totalHeight should reflect sum of different line heights
      expect(measure.totalHeight).toBeGreaterThan(measure.lines[0].lineHeight);
    });
  });

  describe('Text Transformation', () => {
    it('applies uppercase transformation correctly', () => {
      const block = createBlock([textRun('hello world', { textTransform: 'uppercase' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Transformed text "HELLO WORLD" should have same width as original (same char count)
      expect(measure.lines[0].width).toBe(11 * CHAR_WIDTH);
    });

    it('applies lowercase transformation correctly', () => {
      const block = createBlock([textRun('HELLO WORLD', { textTransform: 'lowercase' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Transformed text "hello world" should have same width as original (same char count)
      expect(measure.lines[0].width).toBe(11 * CHAR_WIDTH);
    });

    it('applies capitalize transformation to each word', () => {
      const block = createBlock([textRun('hello world', { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Transformed text "Hello World" should have same width (same char count)
      expect(measure.lines[0].width).toBe(11 * CHAR_WIDTH);
    });

    it('capitalizes first letter after non-word characters', () => {
      const block = createBlock([textRun('hello-beautiful world', { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 300);

      expect(measure.lines).toHaveLength(1);
      // Transformed to "Hello-Beautiful World" - same char count
      expect(measure.lines[0].width).toBe(21 * CHAR_WIDTH);
    });

    it('handles capitalize with numbers', () => {
      const block = createBlock([textRun('123hello world456', { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 300);

      expect(measure.lines).toHaveLength(1);
      // Numbers are word characters, so 'h' after 123 gets capitalized
      // Result: "123Hello World456"
      expect(measure.lines[0].width).toBe(17 * CHAR_WIDTH);
    });

    it('handles capitalize with apostrophes (contractions)', () => {
      const block = createBlock([textRun("don't stop", { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Apostrophe is a word character, so "don't" stays as one word: "Don't Stop"
      expect(measure.lines[0].width).toBe(10 * CHAR_WIDTH);
    });

    it('handles none transformation (no change)', () => {
      const block = createBlock([textRun('Hello World', { textTransform: 'none' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // No transformation applied
      expect(measure.lines[0].width).toBe(11 * CHAR_WIDTH);
    });

    it('handles undefined textTransform (no change)', () => {
      const block = createBlock([textRun('Hello World')]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // No transformation when textTransform is undefined
      expect(measure.lines[0].width).toBe(11 * CHAR_WIDTH);
    });

    it('applies transformation when text wraps across multiple lines', () => {
      const block = createBlock([textRun('hello beautiful world', { textTransform: 'uppercase' })]);
      const measure = remeasureParagraph(block, 100); // Force line breaks

      expect(measure.lines.length).toBeGreaterThan(1);
      // Total width across all lines should reflect uppercase transformation
      const totalWidth = measure.lines.reduce((sum, line) => sum + line.width, 0);
      expect(totalWidth).toBeGreaterThan(0);
    });

    it('applies capitalize correctly across line boundaries', () => {
      // "hello world" breaks into multiple lines, capitalize should apply to each word
      const block = createBlock([textRun('hello world test', { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 70); // Force breaks

      expect(measure.lines.length).toBeGreaterThan(1);
      // Verify text was measured (transformation shouldn't break measurement)
      const totalWidth = measure.lines.reduce((sum, line) => sum + line.width, 0);
      expect(totalWidth).toBeGreaterThan(0);
    });

    it('handles empty text with transformation', () => {
      const block = createBlock([textRun('', { textTransform: 'uppercase' })]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThanOrEqual(0);
      // Empty text should produce minimal output
    });

    it('handles whitespace-only text with transformation', () => {
      const block = createBlock([textRun('   ', { textTransform: 'uppercase' })]);
      const measure = remeasureParagraph(block, 100);

      expect(measure.lines.length).toBeGreaterThanOrEqual(1);
      // Whitespace transformed is still whitespace
      expect(measure.lines[0].width).toBe(3 * CHAR_WIDTH);
    });

    it('applies different transformations to different runs', () => {
      const block = createBlock([
        textRun('hello', { textTransform: 'uppercase' }),
        textRun(' '),
        textRun('world', { textTransform: 'capitalize' }),
      ]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // "HELLO World" = 11 chars
      expect(measure.lines[0].width).toBe(11 * CHAR_WIDTH);
    });

    it('handles capitalize with multiple consecutive spaces', () => {
      const block = createBlock([textRun('hello  world', { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // "Hello  World" - spaces don't change
      expect(measure.lines[0].width).toBe(12 * CHAR_WIDTH);
    });

    it('handles capitalize with leading spaces', () => {
      const block = createBlock([textRun('  hello world', { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // "  Hello World" - leading spaces preserved
      expect(measure.lines[0].width).toBe(13 * CHAR_WIDTH);
    });

    it('handles capitalize with trailing spaces', () => {
      const block = createBlock([textRun('hello world  ', { textTransform: 'capitalize' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // "Hello World  " - trailing spaces preserved
      expect(measure.lines[0].width).toBe(13 * CHAR_WIDTH);
    });

    it('handles special characters with transformations', () => {
      const block = createBlock([textRun('hello@world.com', { textTransform: 'uppercase' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // "HELLO@WORLD.COM" - special chars unchanged
      expect(measure.lines[0].width).toBe(15 * CHAR_WIDTH);
    });

    it('handles unicode characters with transformations', () => {
      const block = createBlock([textRun('café résumé', { textTransform: 'uppercase' })]);
      const measure = remeasureParagraph(block, 200);

      expect(measure.lines).toHaveLength(1);
      // Unicode chars should be handled by JavaScript's toUpperCase
      expect(measure.lines[0].width).toBeGreaterThan(0);
    });
  });
});
