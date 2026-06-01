/**
 * SD-2986/B1: drift-detection parity test.
 *
 * `v1 layout-adapter/footnote-formatting.ts` deliberately inlines its number-format
 * switch instead of reusing layout-engine's `formatPageNumber` — the package
 * graph forbids the adapter from importing layout-engine at runtime (Guard C in
 * `architecture-boundaries.test.ts`). To keep the two implementations in sync
 * we assert here that they agree on every supported format for cardinals 1..100.
 *
 * If you add a new format to one helper, this test will fail until you add the
 * matching case in the other helper. That is the intended behavior.
 */

import { describe, it, expect } from 'vitest';
import { formatPageNumber } from '@superdoc/layout-engine';
import { formatFootnoteCardinal } from '@core/layout-adapter/footnote-formatting.js';

const FORMATS = ['decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter', 'numberInDash'] as const;

describe('SD-2986/B1: footnote formatter parity with formatPageNumber', () => {
  for (const fmt of FORMATS) {
    it(`agrees with formatPageNumber for ${fmt} on 1..100`, () => {
      for (let n = 1; n <= 100; n += 1) {
        expect(formatFootnoteCardinal(n, fmt)).toBe(formatPageNumber(n, fmt));
      }
    });
  }

  it('falls back to decimal for an unknown format string (matches expectations only — formatPageNumber rejects unknowns at the type level)', () => {
    expect(formatFootnoteCardinal(7, 'chickenLetters')).toBe('7');
    expect(formatFootnoteCardinal(7, undefined)).toBe('7');
  });

  it('clamps cardinals < 1 to 1 in both helpers', () => {
    expect(formatFootnoteCardinal(0, 'decimal')).toBe(formatPageNumber(0, 'decimal'));
    expect(formatFootnoteCardinal(-3, 'upperRoman')).toBe(formatPageNumber(-3, 'upperRoman'));
  });

  // Direct-string assertions: parity-only tests close the loop only if both
  // helpers are correct. Pin the expected output for the less-obvious formats
  // so a regression in BOTH helpers (e.g. someone "fixing" the inlined
  // numberInDash to ` ${num} ` style) fails here rather than silently passing.
  it('formats numberInDash as -n- in both helpers', () => {
    for (const n of [1, 5, 12, 99]) {
      const expected = `-${n}-`;
      expect(formatFootnoteCardinal(n, 'numberInDash')).toBe(expected);
      expect(formatPageNumber(n, 'numberInDash')).toBe(expected);
    }
  });

  it('formats upperRoman correctly in both helpers', () => {
    // Roman numerals are a common source of off-by-one or 9-vs-IX style bugs.
    expect(formatFootnoteCardinal(1, 'upperRoman')).toBe('I');
    expect(formatFootnoteCardinal(4, 'upperRoman')).toBe('IV');
    expect(formatFootnoteCardinal(9, 'upperRoman')).toBe('IX');
    expect(formatFootnoteCardinal(40, 'upperRoman')).toBe('XL');
    expect(formatFootnoteCardinal(90, 'upperRoman')).toBe('XC');
    expect(formatPageNumber(1, 'upperRoman')).toBe('I');
    expect(formatPageNumber(4, 'upperRoman')).toBe('IV');
    expect(formatPageNumber(9, 'upperRoman')).toBe('IX');
    expect(formatPageNumber(40, 'upperRoman')).toBe('XL');
    expect(formatPageNumber(90, 'upperRoman')).toBe('XC');
  });

  it('formats lowerRoman correctly in both helpers', () => {
    expect(formatFootnoteCardinal(1, 'lowerRoman')).toBe('i');
    expect(formatFootnoteCardinal(4, 'lowerRoman')).toBe('iv');
    expect(formatFootnoteCardinal(9, 'lowerRoman')).toBe('ix');
    expect(formatPageNumber(1, 'lowerRoman')).toBe('i');
    expect(formatPageNumber(4, 'lowerRoman')).toBe('iv');
    expect(formatPageNumber(9, 'lowerRoman')).toBe('ix');
  });

  it('formats upperLetter / lowerLetter using base-26 cycle (a, b, ..., z, aa)', () => {
    expect(formatFootnoteCardinal(1, 'upperLetter')).toBe('A');
    expect(formatFootnoteCardinal(26, 'upperLetter')).toBe('Z');
    expect(formatFootnoteCardinal(27, 'upperLetter')).toBe('AA');
    expect(formatFootnoteCardinal(1, 'lowerLetter')).toBe('a');
    expect(formatFootnoteCardinal(26, 'lowerLetter')).toBe('z');
    expect(formatFootnoteCardinal(27, 'lowerLetter')).toBe('aa');
    expect(formatPageNumber(1, 'upperLetter')).toBe('A');
    expect(formatPageNumber(26, 'upperLetter')).toBe('Z');
    expect(formatPageNumber(27, 'upperLetter')).toBe('AA');
    expect(formatPageNumber(1, 'lowerLetter')).toBe('a');
    expect(formatPageNumber(26, 'lowerLetter')).toBe('z');
    expect(formatPageNumber(27, 'lowerLetter')).toBe('aa');
  });
});
