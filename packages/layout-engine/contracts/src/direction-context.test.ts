import { describe, expect, it } from 'vitest';
import { getParagraphInlineDirection, getTableVisualDirection } from './direction-context.js';

describe('getParagraphInlineDirection', () => {
  it('returns undefined for null/undefined attrs', () => {
    expect(getParagraphInlineDirection(undefined)).toBeUndefined();
    expect(getParagraphInlineDirection(null)).toBeUndefined();
  });

  it('prefers directionContext.inlineDirection over paragraphProperties.rightToLeft', () => {
    const attrs = {
      directionContext: { inlineDirection: 'rtl' as const },
      paragraphProperties: { rightToLeft: false },
    };
    expect(getParagraphInlineDirection(attrs)).toBe('rtl');
  });

  it('falls back past directionContext when inlineDirection is null', () => {
    // Per resolver semantics, inlineDirection=null/undefined means "no explicit
    // w:bidi"; paragraphProperties.rightToLeft is the PM-node/editor fallback.
    const attrs = {
      directionContext: { inlineDirection: null },
      paragraphProperties: { rightToLeft: true },
    };
    expect(getParagraphInlineDirection(attrs)).toBe('rtl');
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

describe('getTableVisualDirection', () => {
  it('returns undefined for null/undefined attrs', () => {
    expect(getTableVisualDirection(undefined)).toBeUndefined();
    expect(getTableVisualDirection(null)).toBeUndefined();
  });

  it('prefers tableDirectionContext.visualDirection over legacy fields', () => {
    const attrs = {
      tableDirectionContext: { visualDirection: 'rtl' as const },
      tableProperties: { rightToLeft: false },
    };
    expect(getTableVisualDirection(attrs)).toBe('rtl');
  });

  it('falls back past tableDirectionContext when visualDirection is null', () => {
    const attrs = {
      tableDirectionContext: { visualDirection: null },
      tableProperties: { rightToLeft: true },
    };
    expect(getTableVisualDirection(attrs)).toBe('rtl');
  });

  it('falls back past tableDirectionContext when visualDirection is undefined', () => {
    const attrs = {
      tableDirectionContext: { visualDirection: undefined },
      tableProperties: { rightToLeft: true },
    };
    expect(getTableVisualDirection(attrs)).toBe('rtl');
  });

  it('falls back to tableProperties.rightToLeft', () => {
    expect(getTableVisualDirection({ tableProperties: { rightToLeft: true } })).toBe('rtl');
    expect(getTableVisualDirection({ tableProperties: { rightToLeft: false } })).toBe('ltr');
  });

  it('accepts bidiVisual as an alias for rightToLeft', () => {
    expect(getTableVisualDirection({ tableProperties: { bidiVisual: true } })).toBe('rtl');
    expect(getTableVisualDirection({ tableProperties: { bidiVisual: false } })).toBe('ltr');
  });

  it('returns undefined when no signal is present', () => {
    expect(getTableVisualDirection({})).toBeUndefined();
    expect(getTableVisualDirection({ tableDirectionContext: {} })).toBeUndefined();
    expect(getTableVisualDirection({ tableProperties: {} })).toBeUndefined();
  });
});
