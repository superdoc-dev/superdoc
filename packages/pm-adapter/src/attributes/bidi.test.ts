import { describe, it, expect } from 'vitest';
import { mirrorIndentForRtl } from './bidi.js';
import type { ParagraphIndent } from '@superdoc/contracts';

describe('mirrorIndentForRtl', () => {
  it('swaps left and right', () => {
    const input: ParagraphIndent = { left: 10, right: 20 };
    expect(mirrorIndentForRtl(input)).toEqual({ left: 20, right: 10 });
  });

  it('inverts firstLine and hanging', () => {
    const input: ParagraphIndent = { firstLine: 12, hanging: -8 };
    expect(mirrorIndentForRtl(input)).toEqual({ firstLine: -12, hanging: 8 });
  });

  it('handles combined indent values', () => {
    const input: ParagraphIndent = { left: 24, right: 48, firstLine: 6, hanging: 0 };
    expect(mirrorIndentForRtl(input)).toEqual({ left: 48, right: 24, firstLine: -6, hanging: -0 });
  });

  it('returns same object when no mirrorable fields exist', () => {
    const input: ParagraphIndent = {};
    expect(mirrorIndentForRtl(input)).toBe(input);
  });

  it('does not mutate input', () => {
    const input: ParagraphIndent = { left: 10, right: 20, firstLine: 5 };
    const original = { ...input };
    mirrorIndentForRtl(input);
    expect(input).toEqual(original);
  });
});
