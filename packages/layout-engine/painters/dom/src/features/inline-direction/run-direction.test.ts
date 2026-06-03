import { describe, expect, it } from 'vitest';
import {
  resolveRunDirectionAttribute,
  normalizeRtlDateTokenForWordParity,
  RTL_DATE_LIKE_TOKEN_RE,
  STRONG_RTL_CHAR_RE,
  LATIN_DIGIT_NEUTRAL_ONLY_RE,
} from './run-direction.js';

describe('resolveRunDirectionAttribute', () => {
  describe('rtl-tagged runs', () => {
    it('returns "rtl" for Hebrew text', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: 'שלום',
          effectiveText: 'שלום',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });

    it('returns "rtl" for Arabic text', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: 'مرحبا',
          effectiveText: 'مرحبا',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });

    it('returns null for Latin-only text (Word-parity: §17.3.2.30 unspecified)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: 'Hello',
          effectiveText: 'Hello',
          isRtlTagged: true,
        }),
      ).toBe(null);
    });

    it('returns null for digit-only text', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: '2026',
          effectiveText: '2026',
          isRtlTagged: true,
        }),
      ).toBe(null);
    });

    it('returns "rtl" for date-like numeric (isolates the date as RTL unit)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: '2026-03-15',
          effectiveText: '2026-03-15',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });

    it('returns "rtl" for mixed strong-RTL + Latin (Hebrew present)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: 'first שלום',
          effectiveText: 'first שלום',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });

    it('returns "rtl" for empty text (honor source signal when no content)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: '',
          effectiveText: '',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });

    it('returns "rtl" for whitespace-only text', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: '   ',
          effectiveText: '   ',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });

    // Fail-safe: anything that doesn't match the Latin/digit/neutral set OR the
    // strong-RTL set still honors the source signal. East Asian, presentation
    // forms, symbols outside the neutral set all fall into this branch.
    it('returns "rtl" for text that is neither Latin nor strong-RTL', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: '世界',
          effectiveText: '世界',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });

    it('uses effectiveText when runText is undefined', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: undefined,
          effectiveText: 'שלום',
          isRtlTagged: true,
        }),
      ).toBe('rtl');
    });
  });

  describe('non-rtl-tagged runs', () => {
    it('returns "ltr" for date-like numeric (Word-parity in RTL paragraph)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: '2026-03-15',
          effectiveText: '2026-03-15',
          isRtlTagged: false,
        }),
      ).toBe('ltr');
    });

    it('returns null for plain Latin (let paragraph + UBA decide)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: 'Hello',
          effectiveText: 'Hello',
          isRtlTagged: false,
        }),
      ).toBe(null);
    });

    it('returns null for Hebrew text without w:rtl (paragraph context resolves)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: 'שלום',
          effectiveText: 'שלום',
          isRtlTagged: false,
        }),
      ).toBe(null);
    });

    it('returns null when runText is undefined (no date pattern to match)', () => {
      expect(
        resolveRunDirectionAttribute({
          runText: undefined,
          effectiveText: '2026-03-15',
          isRtlTagged: false,
        }),
      ).toBe(null);
    });
  });
});

describe('normalizeRtlDateTokenForWordParity', () => {
  const RLM = '\u200F';

  it('wraps separators with RLM in date-like text', () => {
    expect(normalizeRtlDateTokenForWordParity('2026-03-15')).toBe(`2026${RLM}-${RLM}03${RLM}-${RLM}15`);
  });

  it('handles slash separators', () => {
    expect(normalizeRtlDateTokenForWordParity('15/03/2026')).toBe(`15${RLM}/${RLM}03${RLM}/${RLM}2026`);
  });

  it('handles dot separators', () => {
    expect(normalizeRtlDateTokenForWordParity('1.2.3')).toBe(`1${RLM}.${RLM}2${RLM}.${RLM}3`);
  });

  it('wraps the leading sign too (no special-case for leading "-")', () => {
    // Implementation is text.replace(/[./-]/g, ...). The leading sign is also
    // a `-`, so it gets RLM-wrapped. This matches the pre-extraction behavior.
    expect(normalizeRtlDateTokenForWordParity('-2026-03')).toBe(`${RLM}-${RLM}2026${RLM}-${RLM}03`);
  });

  it('returns unchanged for non-date text', () => {
    expect(normalizeRtlDateTokenForWordParity('Hello world')).toBe('Hello world');
    expect(normalizeRtlDateTokenForWordParity('2026')).toBe('2026'); // no separator
    expect(normalizeRtlDateTokenForWordParity('שלום')).toBe('שלום');
  });
});

describe('regex coverage smoke tests', () => {
  it('RTL_DATE_LIKE_TOKEN_RE matches numeric dates', () => {
    expect(RTL_DATE_LIKE_TOKEN_RE.test('2026-03-15')).toBe(true);
    expect(RTL_DATE_LIKE_TOKEN_RE.test('15/03/2026')).toBe(true);
    expect(RTL_DATE_LIKE_TOKEN_RE.test('1.2.3')).toBe(true);
    expect(RTL_DATE_LIKE_TOKEN_RE.test('-2026-03')).toBe(true);
    expect(RTL_DATE_LIKE_TOKEN_RE.test('2026')).toBe(false); // no separator
    expect(RTL_DATE_LIKE_TOKEN_RE.test('a-b-c')).toBe(false);
  });

  it('STRONG_RTL_CHAR_RE matches Hebrew and Arabic core blocks', () => {
    expect(STRONG_RTL_CHAR_RE.test('שלום')).toBe(true);
    expect(STRONG_RTL_CHAR_RE.test('مرحبا')).toBe(true);
    expect(STRONG_RTL_CHAR_RE.test('Hello')).toBe(false);
    expect(STRONG_RTL_CHAR_RE.test('2026')).toBe(false);
  });

  // SD-3169: presentation forms used by legacy fonts must classify as strong-RTL
  // for mixed-bidi boundary detection to fire on them. Run-direction rendering
  // already fails safe for these (unknown text → 'rtl'), but the regex must
  // recognize them directly so the painter's helper stays consistent with the
  // mixed-bidi-backspace boundary detector.
  it('STRONG_RTL_CHAR_RE matches Hebrew/Arabic presentation forms', () => {
    // Hebrew Presentation Forms FB1D-FB4F
    expect(STRONG_RTL_CHAR_RE.test('\uFB21')).toBe(true); // Hebrew Letter Wide Alef
    expect(STRONG_RTL_CHAR_RE.test('\uFB4F')).toBe(true); // Hebrew Ligature Alef Lamed
    // Arabic Presentation Forms-A FB50-FDFF
    expect(STRONG_RTL_CHAR_RE.test('\uFB50')).toBe(true); // Arabic Letter Alef Wasla Isolated
    expect(STRONG_RTL_CHAR_RE.test('\uFDF2')).toBe(true); // Arabic Ligature Allah Isolated
    // Arabic Presentation Forms-B FE70-FEFF
    expect(STRONG_RTL_CHAR_RE.test('\uFE70')).toBe(true); // Arabic Fathatan Isolated
    expect(STRONG_RTL_CHAR_RE.test('\uFEFC')).toBe(true); // Arabic Ligature Lam With Alef Final
  });

  it('STRONG_RTL_CHAR_RE excludes noncharacters and the BOM', () => {
    // FDD0-FDEF are Unicode noncharacters in the Arabic-A range.
    expect(STRONG_RTL_CHAR_RE.test('\uFDD0')).toBe(false);
    expect(STRONG_RTL_CHAR_RE.test('\uFDEF')).toBe(false);
    // FEFF is ZERO WIDTH NO-BREAK SPACE / BOM, not RTL.
    expect(STRONG_RTL_CHAR_RE.test('\uFEFF')).toBe(false);
  });

  it('LATIN_DIGIT_NEUTRAL_ONLY_RE matches Latin + digit + neutral chars', () => {
    expect(LATIN_DIGIT_NEUTRAL_ONLY_RE.test('Hello world')).toBe(true);
    expect(LATIN_DIGIT_NEUTRAL_ONLY_RE.test('copy 2')).toBe(true);
    expect(LATIN_DIGIT_NEUTRAL_ONLY_RE.test('a/b-c.d')).toBe(true);
    expect(LATIN_DIGIT_NEUTRAL_ONLY_RE.test('שלום')).toBe(false);
    expect(LATIN_DIGIT_NEUTRAL_ONLY_RE.test('Hello שלום')).toBe(false);
  });
});
