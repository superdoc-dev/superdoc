import { describe, it, expect, vi } from 'vitest';
import { isList } from './is-list.js';

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: vi.fn((node) => node?.attrs?.paragraphProperties || {}),
}));

describe('isList', () => {
  it('returns true for paragraph nodes with numbering & list metadata', () => {
    const node = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
        listRendering: { numberingType: 'bullet' },
      },
    };

    expect(isList(node)).toBeTruthy();
  });

  it('returns false when numbering metadata is missing', () => {
    const node = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {},
        listRendering: { numberingType: 'decimal' },
      },
    };

    expect(isList(node)).toBeFalsy();
  });

  it('returns false when list rendering metadata is missing', () => {
    const node = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { numberingProperties: { numId: 2 } },
      },
    };

    expect(isList(node)).toBeFalsy();
  });

  it('returns false for non-paragraph nodes even with list attributes', () => {
    const node = {
      type: { name: 'orderedList' },
      attrs: {
        paragraphProperties: { numberingProperties: { numId: 5 } },
        listRendering: { numberingType: 'decimal' },
      },
    };

    expect(isList(node)).toBeFalsy();
  });

  it('returns false when attrs are missing entirely', () => {
    const node = {
      type: { name: 'paragraph' },
    };

    expect(isList(node)).toBeFalsy();
  });

  it('returns false for null/undefined', () => {
    expect(isList(null)).toBeFalsy();
    expect(isList(undefined)).toBeFalsy();
  });
});
