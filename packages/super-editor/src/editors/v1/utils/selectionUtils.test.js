import { describe, expect, it } from 'vitest';

import { hasExpandedSelection } from './selectionUtils.js';

describe('selectionUtils', () => {
  it('returns true for non-collapsed numeric ranges', () => {
    expect(hasExpandedSelection({ from: 10, to: 15 })).toBe(true);
  });

  it('returns false for collapsed ranges', () => {
    expect(hasExpandedSelection({ from: 10, to: 10 })).toBe(false);
  });

  it('returns false for missing or non-numeric boundaries', () => {
    expect(hasExpandedSelection(null)).toBe(false);
    expect(hasExpandedSelection({ from: undefined, to: 12 })).toBe(false);
    expect(hasExpandedSelection({ from: 12, to: Number.NaN })).toBe(false);
  });
});
