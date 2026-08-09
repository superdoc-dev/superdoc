import { describe, expect, it } from 'vitest';
import { inlineBoxStyleSignature, isFiniteNonNegativeInteger, normalizeInlineBoxLogicalSides } from './inline-box.js';

const style = {
  paddingInlineStart: 4,
  paddingInlineEnd: 5,
  paddingBlockStart: 1,
  paddingBlockEnd: 2,
  gapBefore: 3,
  gapAfter: 6,
  borderWidth: 1,
  backgroundColor: '#eef2ff',
  borderColor: '#a5b4fc',
  borderStyle: 'solid' as const,
  borderRadius: 4,
  color: '#111827',
};

describe('inline-box contract helpers', () => {
  it.each([0, 1, Number.MAX_SAFE_INTEGER])('accepts finite non-negative integer %s', (value) => {
    expect(isFiniteNonNegativeInteger(value)).toBe(true);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null])('rejects invalid pixel value %s', (value) => {
    expect(isFiniteNonNegativeInteger(value)).toBe(false);
  });

  it('normalizes scalar, logical-side, and absent values', () => {
    expect(normalizeInlineBoxLogicalSides(undefined)).toEqual({ start: 0, end: 0 });
    expect(normalizeInlineBoxLogicalSides(4)).toEqual({ start: 4, end: 4 });
    expect(normalizeInlineBoxLogicalSides({ start: 2, end: 6 })).toEqual({ start: 2, end: 6 });
  });

  it('fails closed when either logical side is invalid', () => {
    expect(normalizeInlineBoxLogicalSides({ start: 2, end: 1.5 })).toBeNull();
    expect(normalizeInlineBoxLogicalSides(-1)).toBeNull();
  });

  it('creates a stable style signature and changes for metric or appearance changes', () => {
    expect(inlineBoxStyleSignature({ ...style })).toBe(inlineBoxStyleSignature({ ...style }));
    for (const key of Object.keys(style) as Array<keyof typeof style>) {
      const changed = { ...style, [key]: typeof style[key] === 'number' ? 99 : `${style[key]}-changed` };
      expect(inlineBoxStyleSignature(changed), key).not.toBe(inlineBoxStyleSignature(style));
    }
  });
});
