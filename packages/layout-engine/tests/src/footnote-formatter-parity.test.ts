/**
 * SD-2986/B1: drift-detection parity test.
 *
 * `v1 layout-adapter/footnote-formatting.ts` deliberately inlines its number-format
 * switch instead of reusing layout-engine's `formatPageNumber` — the package
 * graph forbids the adapter from importing layout-engine at runtime (Guard C in
 * `architecture-boundaries.test.ts`). To keep the shared semantics in sync we
 * assert here that they agree on formats with the same expected rendering.
 *
 * If you add a new shared-semantics format to one helper, this test should fail
 * until you add the matching case in the other helper. Helper-specific formats
 * are pinned by direct-string assertions below.
 */

import { describe, it, expect } from 'vitest';
import { formatPageNumber } from '@superdoc/layout-engine';
import { formatFootnoteCardinal } from '@core/layout-adapter/footnote-formatting.js';

const SHARED_FORMATS = ['decimal', 'upperRoman', 'lowerRoman'] as const;

describe('SD-2986/B1: footnote formatter parity with formatPageNumber', () => {
  for (const fmt of SHARED_FORMATS) {
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

  it('formats numberInDash according to each helper contract', () => {
    for (const n of [1, 5, 12, 99]) {
      expect(formatFootnoteCardinal(n, 'numberInDash')).toBe(`-${n}-`);
      expect(formatPageNumber(n, 'numberInDash')).toBe(`- ${n} -`);
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

  it('formats footnote upperLetter / lowerLetter using spreadsheet-style letters', () => {
    expect(formatFootnoteCardinal(1, 'upperLetter')).toBe('A');
    expect(formatFootnoteCardinal(26, 'upperLetter')).toBe('Z');
    expect(formatFootnoteCardinal(27, 'upperLetter')).toBe('AA');
    expect(formatFootnoteCardinal(28, 'upperLetter')).toBe('AB');
    expect(formatFootnoteCardinal(1, 'lowerLetter')).toBe('a');
    expect(formatFootnoteCardinal(26, 'lowerLetter')).toBe('z');
    expect(formatFootnoteCardinal(27, 'lowerLetter')).toBe('aa');
    expect(formatFootnoteCardinal(28, 'lowerLetter')).toBe('ab');
  });

  it('formats page upperLetter / lowerLetter using repeated letters', () => {
    expect(formatPageNumber(1, 'upperLetter')).toBe('A');
    expect(formatPageNumber(26, 'upperLetter')).toBe('Z');
    expect(formatPageNumber(27, 'upperLetter')).toBe('AA');
    expect(formatPageNumber(28, 'upperLetter')).toBe('BB');
    expect(formatPageNumber(1, 'lowerLetter')).toBe('a');
    expect(formatPageNumber(26, 'lowerLetter')).toBe('z');
    expect(formatPageNumber(27, 'lowerLetter')).toBe('aa');
    expect(formatPageNumber(28, 'lowerLetter')).toBe('bb');
  });
});
