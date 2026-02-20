import { beforeAll, describe, expect, it } from 'vitest';
import type { FlowBlock, Line, Run } from '@superdoc/contracts';
import { findCharacterAtX, measureCharacterX, charOffsetToPm } from '../src/text-measurement.ts';

// Helper to count spaces (tests functionality indirectly through justify calculations)
const countSpaces = (text: string): number => {
  let spaces = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === ' ' || text[i] === '\u00A0') {
      spaces += 1;
    }
  }
  return spaces;
};

// Helper to test justify adjustment by measuring with different available widths
const testJustifyAdjustment = (
  block: FlowBlock,
  line: Line,
  availableWidth: number,
): { extraPerSpace: number; totalSpaces: number } => {
  // Measure a position with normal width
  const normalWidth = measureCharacterX(block, line, 1, line.width);
  // Measure with increased available width (which should add justify spacing)
  const wideWidth = measureCharacterX(block, line, 1, availableWidth);

  // If justified, the difference reveals the extra spacing
  const diff = wideWidth - normalWidth;
  const spaceCount = countSpaces(
    line.segments ? '' : block.kind === 'paragraph' ? block.runs.map((r) => ('text' in r ? r.text : '')).join('') : '',
  );

  return {
    extraPerSpace: spaceCount > 0 ? diff / spaceCount : 0,
    totalSpaces: spaceCount,
  };
};

const CHAR_WIDTH = 10;

const ensureDocumentStub = (): void => {
  if (typeof document !== 'undefined') return;
  const ctx = {
    font: '',
    measureText(text: string) {
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

beforeAll(() => {
  ensureDocumentStub();
});

const createBlock = (runs: Run[]): FlowBlock => ({
  kind: 'paragraph',
  id: 'test-block',
  runs,
});

const baseLine = (overrides?: Partial<Line>): Line => ({
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 0,
  width: 200,
  ascent: 12,
  descent: 4,
  lineHeight: 20,
  ...overrides,
});

describe('text measurement utility', () => {
  it('measures across multiple runs', () => {
    const block = createBlock([
      { text: 'Hello', fontFamily: 'Arial', fontSize: 16 },
      { text: 'World', fontFamily: 'Arial', fontSize: 16 },
    ]);
    const line = baseLine({
      fromRun: 0,
      toRun: 1,
      toChar: 5,
    });

    expect(measureCharacterX(block, line, 5)).toBe(5 * CHAR_WIDTH);
    expect(measureCharacterX(block, line, 8)).toBe(8 * CHAR_WIDTH);
  });

  it('accounts for letter spacing when measuring', () => {
    const block = createBlock([{ text: 'AB', fontFamily: 'Arial', fontSize: 16, letterSpacing: 2 }]);
    const line = baseLine({
      fromRun: 0,
      toRun: 0,
      toChar: 2,
      width: CHAR_WIDTH * 2 + 2,
    });

    expect(measureCharacterX(block, line, 1)).toBe(CHAR_WIDTH + 2);
    expect(measureCharacterX(block, line, 2)).toBe(CHAR_WIDTH * 2 + 2);
  });

  it('maps X coordinates back to character offsets within runs', () => {
    const block = createBlock([
      { text: 'Hello', fontFamily: 'Arial', fontSize: 16 },
      { text: 'World', fontFamily: 'Arial', fontSize: 16 },
    ]);
    const line = baseLine({
      fromRun: 0,
      toRun: 1,
      toChar: 5,
    });

    const result = findCharacterAtX(block, line, 73, 0);
    expect(result.charOffset).toBe(7);
    expect(result.pmPosition).toBe(7);
  });

  it('preserves PM gaps between runs when mapping X to positions', () => {
    const block = createBlock([
      { text: 'Hello', fontFamily: 'Arial', fontSize: 16, pmStart: 2, pmEnd: 7 },
      { text: 'World', fontFamily: 'Arial', fontSize: 16, pmStart: 9, pmEnd: 14 },
    ]);
    const line = baseLine({
      fromRun: 0,
      toRun: 1,
      toChar: 5,
      width: 10 * CHAR_WIDTH,
    });

    const result = findCharacterAtX(block, line, 7 * CHAR_WIDTH, 2);
    expect(result.charOffset).toBe(7);
    expect(result.pmPosition).toBe(11);
  });

  it('respects letter spacing when mapping X to characters', () => {
    const block = createBlock([{ text: 'AB', fontFamily: 'Arial', fontSize: 16, letterSpacing: 2 }]);
    const line = baseLine({
      fromRun: 0,
      toRun: 0,
      toChar: 2,
      width: CHAR_WIDTH * 2 + 2,
    });

    const midGap = findCharacterAtX(block, line, CHAR_WIDTH + 1, 100);
    expect(midGap.charOffset).toBe(1);
    expect(midGap.pmPosition).toBe(101);

    const beyondEnd = findCharacterAtX(block, line, 1000, 100);
    expect(beyondEnd.charOffset).toBe(2);
    expect(beyondEnd.pmPosition).toBe(102);
  });

  it('handles tab runs with fixed width', () => {
    const block = createBlock([
      { text: 'Before', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 6 },
      { kind: 'tab', text: '\t', width: 48, pmStart: 6, pmEnd: 7 },
      { text: 'After', fontFamily: 'Arial', fontSize: 16, pmStart: 7, pmEnd: 12 },
    ]);
    const line = baseLine({
      fromRun: 0,
      toRun: 2,
      toChar: 5,
      width: 6 * CHAR_WIDTH + 48 + 5 * CHAR_WIDTH,
    });

    // Measure character positions
    // Before tab: positions 0-6
    expect(measureCharacterX(block, line, 6)).toBe(6 * CHAR_WIDTH);
    // At tab start (position 6 -> 7 in PM)
    expect(measureCharacterX(block, line, 7)).toBe(6 * CHAR_WIDTH + 48);
    // After tab
    expect(measureCharacterX(block, line, 8)).toBe(6 * CHAR_WIDTH + 48 + CHAR_WIDTH);
  });

  it('maps clicks on tabs to correct PM positions', () => {
    const block = createBlock([
      { text: 'A', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 1 },
      { kind: 'tab', text: '\t', width: 48, pmStart: 1, pmEnd: 2 },
      { text: 'B', fontFamily: 'Arial', fontSize: 16, pmStart: 2, pmEnd: 3 },
    ]);
    const line = baseLine({
      fromRun: 0,
      toRun: 2,
      toChar: 1,
      width: CHAR_WIDTH + 48 + CHAR_WIDTH,
    });

    // Click on left half of tab -> should return pmStart (before tab)
    const leftHalf = findCharacterAtX(block, line, CHAR_WIDTH + 20, 0);
    expect(leftHalf.pmPosition).toBe(1);

    // Click on right half of tab -> should return pmEnd (after tab)
    const rightHalf = findCharacterAtX(block, line, CHAR_WIDTH + 30, 0);
    expect(rightHalf.pmPosition).toBe(2);

    // Click after tab (in the 'B' character)
    const afterTab = findCharacterAtX(block, line, CHAR_WIDTH + 48 + 5, 0);
    expect(afterTab.pmPosition).toBeGreaterThanOrEqual(2);
    expect(afterTab.pmPosition).toBeLessThanOrEqual(3);
  });

  it('handles multiple consecutive tabs', () => {
    const block = createBlock([
      { text: 'A', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 1 },
      { kind: 'tab', text: '\t', width: 48, pmStart: 1, pmEnd: 2 },
      { kind: 'tab', text: '\t', width: 48, pmStart: 2, pmEnd: 3 },
      { text: 'B', fontFamily: 'Arial', fontSize: 16, pmStart: 3, pmEnd: 4 },
    ]);
    const line = baseLine({
      fromRun: 0,
      toRun: 3,
      toChar: 1,
      width: CHAR_WIDTH + 48 + 48 + CHAR_WIDTH,
    });

    // Position after first tab
    expect(measureCharacterX(block, line, 2)).toBe(CHAR_WIDTH + 48);
    // Position after second tab
    expect(measureCharacterX(block, line, 3)).toBe(CHAR_WIDTH + 48 + 48);

    // Click on first tab
    const firstTab = findCharacterAtX(block, line, CHAR_WIDTH + 24, 0);
    expect(firstTab.pmPosition).toBeGreaterThanOrEqual(1);
    expect(firstTab.pmPosition).toBeLessThanOrEqual(2);

    // Click on second tab
    const secondTab = findCharacterAtX(block, line, CHAR_WIDTH + 48 + 24, 0);
    expect(secondTab.pmPosition).toBeGreaterThanOrEqual(2);
    expect(secondTab.pmPosition).toBeLessThanOrEqual(3);
  });

  describe('charOffsetToPm edge cases', () => {
    it('clamps character offset beyond line bounds to end position', () => {
      const block = createBlock([{ text: 'Hello', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 5 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
      });

      // Character offset beyond line length should clamp to last valid PM position
      const result = charOffsetToPm(block, line, 100, 0);
      expect(result).toBe(5); // Should return pmEnd
    });

    it('clamps negative character offset to start position', () => {
      const block = createBlock([{ text: 'Hello', fontFamily: 'Arial', fontSize: 16, pmStart: 10, pmEnd: 15 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
      });

      // Negative offset should clamp to 0, which maps to pmStart
      const result = charOffsetToPm(block, line, -5, 10);
      expect(result).toBe(10); // Should return fallback/pmStart
    });

    it('handles runs with missing pmEnd gracefully', () => {
      const block = createBlock([
        { text: 'Test', fontFamily: 'Arial', fontSize: 16, pmStart: 5 } as any, // Missing pmEnd
      ]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 4,
      });

      // Should infer pmEnd from pmStart + text length
      const result = charOffsetToPm(block, line, 2, 5);
      expect(result).toBe(7); // pmStart (5) + offset (2)
    });

    it('handles runs with missing pmStart gracefully', () => {
      const block = createBlock([
        { text: 'Test', fontFamily: 'Arial', fontSize: 16, pmEnd: 10 } as any, // Missing pmStart
      ]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 4,
      });

      // When pmStart is missing, the function infers it from pmEnd - textLength
      // pmEnd = 10, textLength = 4, so inferred pmStart = 6
      // charOffset 2 maps to position 6 + 2 = 8
      const result = charOffsetToPm(block, line, 2, 100);
      expect(result).toBe(8); // inferred pmStart (6) + offset (2)
    });

    it('returns fallback position for non-paragraph blocks', () => {
      const block = {
        kind: 'table',
        id: 'test-block',
        rows: [],
      } as any;
      const line = baseLine();

      // Non-paragraph blocks should use fallback calculation
      const result = charOffsetToPm(block, line, 5, 50);
      expect(result).toBe(55); // fallback (50) + offset (5)
    });

    it('handles character offset at exact line boundary', () => {
      const block = createBlock([{ text: 'Exact', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 5 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
      });

      // Offset exactly at line end
      const result = charOffsetToPm(block, line, 5, 0);
      expect(result).toBe(5);
    });

    it('handles line with only tab runs', () => {
      const block = createBlock([
        { kind: 'tab', text: '\t', width: 48, pmStart: 0, pmEnd: 1 },
        { kind: 'tab', text: '\t', width: 48, pmStart: 1, pmEnd: 2 },
      ]);
      const line = baseLine({
        fromRun: 0,
        toRun: 1,
        toChar: 1, // Each tab counts as 1 character
        width: 96,
      });

      // First tab
      const result1 = charOffsetToPm(block, line, 0, 0);
      expect(result1).toBe(0);

      // Second tab
      const result2 = charOffsetToPm(block, line, 1, 0);
      expect(result2).toBe(1);

      // After both tabs
      const result3 = charOffsetToPm(block, line, 2, 0);
      expect(result3).toBe(2);
    });

    it('handles empty runs in the middle of a line', () => {
      const block = createBlock([
        { text: 'Before', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 6 },
        { text: '', fontFamily: 'Arial', fontSize: 16, pmStart: 6, pmEnd: 6 }, // Empty run
        { text: 'After', fontFamily: 'Arial', fontSize: 16, pmStart: 6, pmEnd: 11 },
      ]);
      const line = baseLine({
        fromRun: 0,
        toRun: 2,
        toChar: 5,
      });

      // Character in first run
      const result1 = charOffsetToPm(block, line, 3, 0);
      expect(result1).toBe(3);

      // Character in last run (empty run shouldn't affect count)
      const result2 = charOffsetToPm(block, line, 8, 0);
      expect(result2).toBe(8);
    });

    it('handles runs with zero-length text correctly', () => {
      const block = createBlock([{ text: '', fontFamily: 'Arial', fontSize: 16, pmStart: 5, pmEnd: 5 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 0,
      });

      const result = charOffsetToPm(block, line, 0, 5);
      expect(result).toBe(5);
    });
  });

  describe('countSpaces helper', () => {
    // These tests verify the countSpaces helper used above
    it('counts regular spaces correctly', () => {
      expect(countSpaces('Hello World')).toBe(1);
      expect(countSpaces('A B C D')).toBe(3);
      expect(countSpaces('   ')).toBe(3);
    });

    it('counts non-breaking spaces correctly', () => {
      expect(countSpaces('Hello\u00A0World')).toBe(1);
      expect(countSpaces('\u00A0\u00A0\u00A0')).toBe(3);
    });

    it('counts both regular and non-breaking spaces', () => {
      expect(countSpaces('A \u00A0B')).toBe(2);
      expect(countSpaces(' \u00A0 \u00A0 ')).toBe(5);
    });

    it('returns zero for text with no spaces', () => {
      expect(countSpaces('HelloWorld')).toBe(0);
      expect(countSpaces('no-spaces')).toBe(0);
      expect(countSpaces('')).toBe(0);
    });

    it('does not count other whitespace characters', () => {
      // Tab, newline, etc. are not counted
      expect(countSpaces('Hello\tWorld')).toBe(0);
      expect(countSpaces('Hello\nWorld')).toBe(0);
    });
  });

  describe('justify alignment integration', () => {
    // These tests verify that justify alignment works correctly through the public API
    it('applies justify spacing for justified text', () => {
      // Use two runs so the first line is NOT the last line (last lines skip justify)
      const block = createBlock([
        { text: 'A B', fontFamily: 'Arial', fontSize: 16 },
        { text: 'C D', fontFamily: 'Arial', fontSize: 16 },
      ]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0, // First line only covers first run
        toChar: 3,
        width: 30,
        maxWidth: 100,
      });
      (block as any).attrs = { alignment: 'justify' };

      // Measure position 2 (after the space 'A B') - this should show justify adjustment
      const x2Normal = measureCharacterX(block, line, 2, 30); // No slack
      const x2Justified = measureCharacterX(block, line, 2, 100); // With slack

      // Justified should be wider (extra space distributed after first space)
      expect(x2Justified).toBeGreaterThan(x2Normal);
    });

    it('does not apply justify spacing for non-justified text', () => {
      const block = createBlock([{ text: 'A B', fontFamily: 'Arial', fontSize: 16 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 3,
        width: 30,
        maxWidth: 100,
      });
      (block as any).attrs = { alignment: 'left' };

      // With left alignment, no extra spacing should be applied
      const x2 = measureCharacterX(block, line, 2, 100);
      const x2Base = measureCharacterX(block, line, 2, 30);

      // Should be the same since no justify
      expect(x2).toBe(x2Base);
    });

    it('skips justify spacing on the last line of a paragraph', () => {
      // Single-line paragraph: the line IS the last line, so justify should be skipped
      const block = createBlock([{ text: 'A B', fontFamily: 'Arial', fontSize: 16 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0, // Same as block.runs.length - 1, so this is the last line
        toChar: 3,
        width: 30,
        maxWidth: 100,
      });
      (block as any).attrs = { alignment: 'justify' };

      // Even with slack available, last line should NOT have extra justify spacing
      const x2Normal = measureCharacterX(block, line, 2, 30);
      const x2WithSlack = measureCharacterX(block, line, 2, 100);

      // Should be the same since last line skips justify
      expect(x2WithSlack).toBe(x2Normal);
    });

    it('applies justify spacing on last line when paragraph ends with lineBreak', () => {
      // Paragraph ending with lineBreak (soft break / Shift+Enter) SHOULD justify the last line
      const block = createBlock([{ text: 'A B', fontFamily: 'Arial', fontSize: 16 }, { kind: 'lineBreak' as const }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0, // This line doesn't include the lineBreak run
        toChar: 3,
        width: 30,
        maxWidth: 100,
      });
      (block as any).attrs = { alignment: 'justify' };

      // With soft break at end, even last line should be justified
      const x2Normal = measureCharacterX(block, line, 2, 30);
      const x2Justified = measureCharacterX(block, line, 2, 100);

      // Should be justified (wider) because paragraph ends with lineBreak
      expect(x2Justified).toBeGreaterThan(x2Normal);
    });

    it('handles empty runs array without crashing', () => {
      // Empty runs should not crash and should not apply justify
      const block = createBlock([]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 0,
        width: 0,
        maxWidth: 100,
      });
      (block as any).attrs = { alignment: 'justify' };

      // Should not crash and should return 0 for character position 0
      const x0 = measureCharacterX(block, line, 0, 100);
      expect(x0).toBe(0);

      // findCharacterAtX should also handle empty runs
      const result = findCharacterAtX(block, line, 50, 0, 100);
      expect(result.charOffset).toBe(0);
      expect(result.pmPosition).toBe(0);
    });

    it('auto-derives correct flags for multi-line paragraphs', () => {
      // Multi-line paragraph: middle lines should be justified, last line should not
      const block = createBlock([
        { text: 'First line with spaces', fontFamily: 'Arial', fontSize: 16 },
        { text: 'Second line also spaced', fontFamily: 'Arial', fontSize: 16 },
        { text: 'Last line here', fontFamily: 'Arial', fontSize: 16 },
      ]);
      (block as any).attrs = { alignment: 'justify' };

      // First line (not last) - should be justified
      const firstLine = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 22,
        width: 220,
        maxWidth: 300,
      });

      const firstX = measureCharacterX(block, firstLine, 10, 300);
      const firstXNormal = measureCharacterX(block, firstLine, 10, 220);
      // Middle lines should be justified
      expect(firstX).toBeGreaterThan(firstXNormal);

      // Middle line (not last) - should be justified
      const middleLine = baseLine({
        fromRun: 1,
        toRun: 1,
        toChar: 23,
        width: 230,
        maxWidth: 300,
      });

      const middleX = measureCharacterX(block, middleLine, 10, 300);
      const middleXNormal = measureCharacterX(block, middleLine, 10, 230);
      // Middle lines should be justified
      expect(middleX).toBeGreaterThan(middleXNormal);

      // Last line - should NOT be justified (auto-derived)
      const lastLine = baseLine({
        fromRun: 2,
        toRun: 2,
        toChar: 14,
        width: 140,
        maxWidth: 300,
      });

      const lastX = measureCharacterX(block, lastLine, 10, 300);
      const lastXNormal = measureCharacterX(block, lastLine, 10, 140);
      // Last line should NOT be justified (same width)
      expect(lastX).toBe(lastXNormal);
    });
  });

  describe('center and right alignment', () => {
    it('applies center alignment offset', () => {
      const block = createBlock([{ text: 'Hello', fontFamily: 'Arial', fontSize: 16 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
        width: 50, // 5 chars * 10px CHAR_WIDTH
      });
      (block as any).attrs = { alignment: 'center' };

      // With available width of 200 and line width of 50, center offset should be (200-50)/2 = 75
      const x0 = measureCharacterX(block, line, 0, 200);
      expect(x0).toBe(75); // Should start at center offset

      const x3 = measureCharacterX(block, line, 3, 200);
      expect(x3).toBe(75 + 3 * CHAR_WIDTH); // Center offset + 3 chars
    });

    it('applies right alignment offset', () => {
      const block = createBlock([{ text: 'Hello', fontFamily: 'Arial', fontSize: 16 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
        width: 50, // 5 chars * 10px CHAR_WIDTH
      });
      (block as any).attrs = { alignment: 'right' };

      // With available width of 200 and line width of 50, right offset should be 200-50 = 150
      const x0 = measureCharacterX(block, line, 0, 200);
      expect(x0).toBe(150); // Should start at right offset

      const x3 = measureCharacterX(block, line, 3, 200);
      expect(x3).toBe(150 + 3 * CHAR_WIDTH); // Right offset + 3 chars
    });

    it('findCharacterAtX accounts for center alignment', () => {
      const block = createBlock([{ text: 'Hello', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 5 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
        width: 50, // 5 chars * 10px CHAR_WIDTH
      });
      (block as any).attrs = { alignment: 'center' };

      // Center offset = (200-50)/2 = 75
      // Click at x=75 should be at char 0
      const result0 = findCharacterAtX(block, line, 75, 0, 200);
      expect(result0.charOffset).toBe(0);
      expect(result0.pmPosition).toBe(0);

      // Click at x=85 should be near char 1 (75 + 10 = 85)
      const result1 = findCharacterAtX(block, line, 85, 0, 200);
      expect(result1.charOffset).toBe(1);
      expect(result1.pmPosition).toBe(1);

      // Click at x=0 (before centered text) should clamp to start
      const resultBefore = findCharacterAtX(block, line, 0, 0, 200);
      expect(resultBefore.charOffset).toBe(0);
    });

    it('findCharacterAtX accounts for right alignment', () => {
      const block = createBlock([{ text: 'Hello', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 5 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
        width: 50, // 5 chars * 10px CHAR_WIDTH
      });
      (block as any).attrs = { alignment: 'right' };

      // Right offset = 200-50 = 150
      // Click at x=150 should be at char 0
      const result0 = findCharacterAtX(block, line, 150, 0, 200);
      expect(result0.charOffset).toBe(0);
      expect(result0.pmPosition).toBe(0);

      // Click at x=0 (before right-aligned text) should clamp to start
      const resultBefore = findCharacterAtX(block, line, 0, 0, 200);
      expect(resultBefore.charOffset).toBe(0);
    });

    it('does not apply alignment offset for left-aligned text', () => {
      const block = createBlock([{ text: 'Hello', fontFamily: 'Arial', fontSize: 16 }]);
      const line = baseLine({
        fromRun: 0,
        toRun: 0,
        toChar: 5,
        width: 50,
      });
      (block as any).attrs = { alignment: 'left' };

      // With left alignment, no offset should be applied regardless of available width
      const x0 = measureCharacterX(block, line, 0, 200);
      expect(x0).toBe(0); // No offset for left alignment

      const x3 = measureCharacterX(block, line, 3, 200);
      expect(x3).toBe(3 * CHAR_WIDTH); // Just character position
    });
  });
});
