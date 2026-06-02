import { describe, expect, it } from 'vitest';
import { signaturesEqual } from './breaks.js';
import type { SectionSignature } from './types.js';

describe('section breaks', () => {
  describe('signaturesEqual', () => {
    const baseSignature: SectionSignature = {
      numbering: {
        format: 'decimal',
        start: 1,
        chapterStyle: 1,
        chapterSeparator: 'hyphen',
      },
    };

    it('should treat matching chapter numbering settings as equal', () => {
      expect(signaturesEqual(baseSignature, { ...baseSignature, numbering: { ...baseSignature.numbering } })).toBe(
        true,
      );
    });

    it('should treat differing chapterStyle values as different', () => {
      expect(
        signaturesEqual(baseSignature, {
          ...baseSignature,
          numbering: { ...baseSignature.numbering, chapterStyle: 2 },
        }),
      ).toBe(false);
    });

    it('should treat differing chapterSeparator values as different', () => {
      expect(
        signaturesEqual(baseSignature, {
          ...baseSignature,
          numbering: { ...baseSignature.numbering, chapterSeparator: 'period' },
        }),
      ).toBe(false);
    });
  });
});
