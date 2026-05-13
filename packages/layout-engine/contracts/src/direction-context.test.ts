import { describe, expect, it } from 'vitest';
import { getParagraphInlineDirection } from './direction-context.js';

describe('getParagraphInlineDirection', () => {
  it('returns undefined for null/undefined attrs', () => {
    expect(getParagraphInlineDirection(undefined)).toBeUndefined();
    expect(getParagraphInlineDirection(null)).toBeUndefined();
  });

  it('prefers directionContext.inlineDirection over legacy fields', () => {
    const attrs = {
      directionContext: { inlineDirection: 'rtl' as const },
      direction: 'ltr',
      rtl: false,
    };
    expect(getParagraphInlineDirection(attrs)).toBe('rtl');
  });

  it('returns undefined when directionContext is present with no inlineDirection', () => {
    // Per resolver semantics, undefined means "no explicit w:bidi"; UAX #9 takes over.
    const attrs = { directionContext: { inlineDirection: null }, direction: 'rtl' };
    expect(getParagraphInlineDirection(attrs)).toBe('rtl');
  });

  it('falls back to attrs.direction', () => {
    expect(getParagraphInlineDirection({ direction: 'rtl' })).toBe('rtl');
    expect(getParagraphInlineDirection({ direction: 'ltr' })).toBe('ltr');
  });

  it('falls back to attrs.dir', () => {
    expect(getParagraphInlineDirection({ dir: 'rtl' })).toBe('rtl');
    expect(getParagraphInlineDirection({ dir: 'ltr' })).toBe('ltr');
  });

  it('falls back to attrs.rtl boolean', () => {
    expect(getParagraphInlineDirection({ rtl: true })).toBe('rtl');
    expect(getParagraphInlineDirection({ rtl: false })).toBe('ltr');
  });

  it('falls back to paragraphProperties.rightToLeft', () => {
    expect(getParagraphInlineDirection({ paragraphProperties: { rightToLeft: true } })).toBe('rtl');
    expect(getParagraphInlineDirection({ paragraphProperties: { rightToLeft: false } })).toBe('ltr');
  });

  it('returns undefined when no signal is present', () => {
    expect(getParagraphInlineDirection({})).toBeUndefined();
    expect(getParagraphInlineDirection({ directionContext: {} })).toBeUndefined();
    expect(getParagraphInlineDirection({ paragraphProperties: {} })).toBeUndefined();
  });
});
