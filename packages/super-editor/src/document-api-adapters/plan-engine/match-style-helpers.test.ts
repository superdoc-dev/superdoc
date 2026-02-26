import { describe, expect, it } from 'vitest';
import type { CapturedRun } from './style-resolver.js';
import {
  marksEqual,
  coalesceRuns,
  toMatchStyle,
  extractRunStyleId,
  normalizeHexColor,
  parseFontSizePt,
  assertRunTilingInvariant,
} from './match-style-helpers.js';
import type { MatchRun } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Mock mark factory — minimal PM mark shape for testing
// ---------------------------------------------------------------------------

function mockMark(name: string, attrs: Record<string, unknown> = {}) {
  return {
    type: { name },
    attrs,
    eq(other: any) {
      if (other.type.name !== name) return false;
      const keys = new Set([...Object.keys(attrs), ...Object.keys(other.attrs)]);
      for (const k of keys) {
        if (attrs[k] !== other.attrs[k]) return false;
      }
      return true;
    },
  };
}

function run(from: number, to: number, marks: ReturnType<typeof mockMark>[]): CapturedRun {
  return { from, to, charCount: to - from, marks: marks as any };
}

// ---------------------------------------------------------------------------
// marksEqual
// ---------------------------------------------------------------------------

describe('marksEqual', () => {
  it('returns true for two empty mark arrays', () => {
    expect(marksEqual([], [])).toBe(true);
  });

  it('returns true for identical single-mark arrays', () => {
    const a = [mockMark('bold')];
    const b = [mockMark('bold')];
    expect(marksEqual(a as any, b as any)).toBe(true);
  });

  it('returns false for different mark types', () => {
    const a = [mockMark('bold')];
    const b = [mockMark('italic')];
    expect(marksEqual(a as any, b as any)).toBe(false);
  });

  it('returns false for different lengths', () => {
    const a = [mockMark('bold'), mockMark('italic')];
    const b = [mockMark('bold')];
    expect(marksEqual(a as any, b as any)).toBe(false);
  });

  it('returns false when marks differ by attrs (same type name)', () => {
    const a = [mockMark('textStyle', { color: '#ff0000' })];
    const b = [mockMark('textStyle', { color: '#0000ff' })];
    expect(marksEqual(a as any, b as any)).toBe(false);
  });

  it('returns true when marks have identical type and attrs', () => {
    const a = [mockMark('bold'), mockMark('textStyle', { color: '#ff0000' })];
    const b = [mockMark('bold'), mockMark('textStyle', { color: '#ff0000' })];
    expect(marksEqual(a as any, b as any)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coalesceRuns (D4)
// ---------------------------------------------------------------------------

describe('coalesceRuns', () => {
  it('returns empty array for empty input', () => {
    expect(coalesceRuns([])).toEqual([]);
  });

  it('returns single run unchanged', () => {
    const result = coalesceRuns([run(0, 5, [mockMark('bold')])]);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe(0);
    expect(result[0].to).toBe(5);
  });

  it('merges adjacent runs with identical mark-signature', () => {
    const result = coalesceRuns([run(0, 3, [mockMark('bold')]), run(3, 7, [mockMark('bold')])]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ from: 0, to: 7, charCount: 7 });
  });

  it('does NOT merge adjacent runs with different mark-signature', () => {
    const result = coalesceRuns([run(0, 3, [mockMark('bold')]), run(3, 7, [mockMark('italic')])]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ from: 0, to: 3 });
    expect(result[1]).toMatchObject({ from: 3, to: 7 });
  });

  it('does NOT merge runs that share core-4 booleans but differ in attrs', () => {
    // Both have textStyle mark, but different color attrs → different signature
    const result = coalesceRuns([
      run(0, 3, [mockMark('bold'), mockMark('textStyle', { color: '#ff0000' })]),
      run(3, 7, [mockMark('bold'), mockMark('textStyle', { color: '#0000ff' })]),
    ]);
    expect(result).toHaveLength(2);
  });

  it('drops zero-width runs', () => {
    const result = coalesceRuns([
      run(0, 3, [mockMark('bold')]),
      run(3, 3, [mockMark('italic')]), // zero-width
      run(3, 7, [mockMark('bold')]),
    ]);
    // The zero-width run is dropped, and the two bold runs merge
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ from: 0, to: 7 });
  });

  it('sorts unsorted runs by offset before merging', () => {
    const result = coalesceRuns([run(5, 10, [mockMark('bold')]), run(0, 5, [mockMark('bold')])]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ from: 0, to: 10 });
  });

  it('merges three consecutive identical-signature runs', () => {
    const result = coalesceRuns([run(0, 3, []), run(3, 6, []), run(6, 10, [])]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ from: 0, to: 10, charCount: 10 });
  });
});

// ---------------------------------------------------------------------------
// toMatchStyle (D15)
// ---------------------------------------------------------------------------

describe('toMatchStyle', () => {
  it('derives core-4 booleans from mark presence', () => {
    const marks = [mockMark('bold'), mockMark('italic')];
    const style = toMatchStyle(marks as any);
    expect(style.bold).toBe(true);
    expect(style.italic).toBe(true);
    expect(style.underline).toBe(false);
    expect(style.strike).toBe(false);
  });

  it('returns all-false for no core marks', () => {
    const style = toMatchStyle([] as any);
    expect(style).toMatchObject({ bold: false, italic: false, underline: false, strike: false });
  });

  it('extracts color from runProperties (precedence over textStyle)', () => {
    const marks = [mockMark('textStyle', { color: '#0000ff' }), mockMark('runProperties', { color: '#ff0000' })];
    const style = toMatchStyle(marks as any);
    expect(style.color).toBe('#ff0000');
  });

  it('falls back to textStyle when runProperties lacks the field', () => {
    const marks = [mockMark('textStyle', { color: '#00ff00' }), mockMark('runProperties', {})];
    const style = toMatchStyle(marks as any);
    expect(style.color).toBe('#00ff00');
  });

  it('normalizes bare 6-digit hex color', () => {
    const marks = [mockMark('runProperties', { color: 'ff0000' })];
    const style = toMatchStyle(marks as any);
    expect(style.color).toBe('#ff0000');
  });

  it('extracts fontFamily from mark attrs', () => {
    const marks = [mockMark('runProperties', { fontFamily: 'Calibri' })];
    const style = toMatchStyle(marks as any);
    expect(style.fontFamily).toBe('Calibri');
  });

  it('omits fontFamily for empty string', () => {
    const marks = [mockMark('runProperties', { fontFamily: '' })];
    const style = toMatchStyle(marks as any);
    expect(style.fontFamily).toBeUndefined();
  });

  it('extracts fontSizePt from runProperties (half-point conversion: 48hp → 24pt)', () => {
    // runProperties stores OOXML half-points (w:sz w:val), so 48 = 24pt
    const marks = [mockMark('runProperties', { fontSize: 48 })];
    const style = toMatchStyle(marks as any);
    expect(style.fontSizePt).toBe(24);
  });

  it('extracts fontSizePt from textStyle without half-point conversion', () => {
    // textStyle stores CSS/standard values, no division
    const marks = [mockMark('textStyle', { fontSize: 24 })];
    const style = toMatchStyle(marks as any);
    expect(style.fontSizePt).toBe(24);
  });

  it('extracts highlight from mark attrs', () => {
    const marks = [mockMark('runProperties', { highlight: '#ffff00' })];
    const style = toMatchStyle(marks as any);
    expect(style.highlight).toBe('#ffff00');
  });

  it('omits optional fields when no marks provide them', () => {
    const marks = [mockMark('bold')];
    const style = toMatchStyle(marks as any);
    expect(style.color).toBeUndefined();
    expect(style.highlight).toBeUndefined();
    expect(style.fontFamily).toBeUndefined();
    expect(style.fontSizePt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractRunStyleId (D10a)
// ---------------------------------------------------------------------------

describe('extractRunStyleId', () => {
  it('returns styleId from runProperties mark', () => {
    const marks = [mockMark('runProperties', { styleId: 'Hyperlink' })];
    expect(extractRunStyleId(marks as any)).toBe('Hyperlink');
  });

  it('returns undefined when no runProperties mark', () => {
    const marks = [mockMark('bold')];
    expect(extractRunStyleId(marks as any)).toBeUndefined();
  });

  it('returns undefined when styleId is empty string', () => {
    const marks = [mockMark('runProperties', { styleId: '' })];
    expect(extractRunStyleId(marks as any)).toBeUndefined();
  });

  it('returns undefined when styleId is absent', () => {
    const marks = [mockMark('runProperties', {})];
    expect(extractRunStyleId(marks as any)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeHexColor (D15)
// ---------------------------------------------------------------------------

describe('normalizeHexColor', () => {
  it('passes through 6-digit lowercase hex', () => {
    expect(normalizeHexColor('#ff0000')).toBe('#ff0000');
  });

  it('lowercases 6-digit hex', () => {
    expect(normalizeHexColor('#FF0000')).toBe('#ff0000');
  });

  it('expands 3-digit hex shorthand', () => {
    expect(normalizeHexColor('#f00')).toBe('#ff0000');
  });

  it('adds # prefix to bare 6-digit hex', () => {
    expect(normalizeHexColor('00ff00')).toBe('#00ff00');
  });

  it('parses rgb() format', () => {
    expect(normalizeHexColor('rgb(255, 0, 0)')).toBe('#ff0000');
  });

  it('parses rgb() with no spaces', () => {
    expect(normalizeHexColor('rgb(0,128,255)')).toBe('#0080ff');
  });

  it('maps named CSS color "red"', () => {
    expect(normalizeHexColor('red')).toBe('#ff0000');
  });

  it('maps named CSS color "cornflowerblue"', () => {
    expect(normalizeHexColor('cornflowerblue')).toBe('#6495ed');
  });

  it('returns undefined for empty string', () => {
    expect(normalizeHexColor('')).toBeUndefined();
  });

  it('returns undefined for unparseable value', () => {
    expect(normalizeHexColor('notacolor')).toBeUndefined();
  });

  it('returns undefined for rgb with out-of-range values', () => {
    expect(normalizeHexColor('rgb(256, 0, 0)')).toBeUndefined();
  });

  it('handles whitespace around value', () => {
    expect(normalizeHexColor('  #ff0000  ')).toBe('#ff0000');
  });
});

// ---------------------------------------------------------------------------
// parseFontSizePt (D15)
// ---------------------------------------------------------------------------

describe('parseFontSizePt', () => {
  it('returns number as-is for valid positive number', () => {
    expect(parseFontSizePt(12)).toBe(12);
  });

  it('rounds to 1 decimal place', () => {
    expect(parseFontSizePt(12.345)).toBe(12.3);
  });

  it('parses string "12pt"', () => {
    expect(parseFontSizePt('12pt')).toBe(12);
  });

  it('parses bare numeric string "24"', () => {
    expect(parseFontSizePt('24')).toBe(24);
  });

  it('returns undefined for NaN', () => {
    expect(parseFontSizePt(NaN)).toBeUndefined();
  });

  it('returns undefined for Infinity', () => {
    expect(parseFontSizePt(Infinity)).toBeUndefined();
  });

  it('returns undefined for negative number', () => {
    expect(parseFontSizePt(-5)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(parseFontSizePt(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(parseFontSizePt(undefined)).toBeUndefined();
  });

  it('returns undefined for non-numeric string', () => {
    expect(parseFontSizePt('abc')).toBeUndefined();
  });

  it('returns 0 for zero', () => {
    expect(parseFontSizePt(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// assertRunTilingInvariant (D4, D19)
// ---------------------------------------------------------------------------

describe('assertRunTilingInvariant', () => {
  function matchRun(start: number, end: number): MatchRun {
    return {
      range: { start, end },
      text: 'x'.repeat(end - start),
      styles: { bold: false, italic: false, underline: false, strike: false },
      ref: 'test-ref',
    };
  }

  it('passes for a single run that tiles the block range', () => {
    expect(() => assertRunTilingInvariant([matchRun(0, 10)], { start: 0, end: 10 }, 'b1')).not.toThrow();
  });

  it('passes for two runs that exactly tile the block range', () => {
    expect(() =>
      assertRunTilingInvariant([matchRun(0, 5), matchRun(5, 10)], { start: 0, end: 10 }, 'b1'),
    ).not.toThrow();
  });

  it('passes for empty runs with zero-width block range', () => {
    expect(() => assertRunTilingInvariant([], { start: 5, end: 5 }, 'b1')).not.toThrow();
  });

  it('throws INTERNAL_ERROR when first run does not start at block range start', () => {
    expect(() => assertRunTilingInvariant([matchRun(1, 10)], { start: 0, end: 10 }, 'b1')).toThrow(
      /INTERNAL_ERROR|run-tiling/,
    );
  });

  it('throws INTERNAL_ERROR when last run does not end at block range end', () => {
    expect(() => assertRunTilingInvariant([matchRun(0, 9)], { start: 0, end: 10 }, 'b1')).toThrow(
      /INTERNAL_ERROR|run-tiling/,
    );
  });

  it('throws INTERNAL_ERROR when there is a gap between adjacent runs', () => {
    expect(() => assertRunTilingInvariant([matchRun(0, 4), matchRun(6, 10)], { start: 0, end: 10 }, 'b1')).toThrow(
      /INTERNAL_ERROR|run-tiling/,
    );
  });

  it('throws INTERNAL_ERROR for no runs with non-empty block range', () => {
    expect(() => assertRunTilingInvariant([], { start: 0, end: 10 }, 'b1')).toThrow(/INTERNAL_ERROR|run-tiling/);
  });
});
