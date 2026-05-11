/**
 * SD-2986/B1: drift-detection parity test.
 *
 * `pm-adapter/src/footnote-formatting.ts` deliberately inlines its number-format
 * switch instead of reusing layout-engine's `formatPageNumber` — the package
 * graph forbids pm-adapter from importing layout-engine at runtime (Guard C in
 * `architecture-boundaries.test.ts`). To keep the two implementations in sync
 * we assert here that they agree on every supported format for cardinals 1..100.
 *
 * If you add a new format to one helper, this test will fail until you add the
 * matching case in the other helper. That is the intended behavior.
 */

import { describe, it, expect } from 'vitest';
import { formatPageNumber } from '@superdoc/layout-engine';
import { formatFootnoteCardinal } from '@superdoc/pm-adapter/footnote-formatting.js';

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
});
