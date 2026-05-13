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

  it('falls back past directionContext when inlineDirection is null', () => {
    // Per resolver semantics, inlineDirection=null/undefined means "no explicit
    // w:bidi"; the legacy `direction` field is the next fallback in the chain.
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
