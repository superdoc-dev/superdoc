import { describe, it, expect } from 'vitest';
import { isExtensionRulesEnabled } from './isExtentionRulesEnabled.js';

describe('isExtensionRulesEnabled', () => {
  const extension = { name: 'placeholder' };

  it('returns boolean flag when provided', () => {
    expect(isExtensionRulesEnabled(extension, true)).toBe(true);
    expect(isExtensionRulesEnabled(extension, false)).toBe(false);
  });

  it('checks membership when array is provided', () => {
    expect(isExtensionRulesEnabled(extension, ['placeholder', 'image'])).toBe(true);
    expect(isExtensionRulesEnabled(extension, [{ name: 'image' }])).toBe(false);
  });
});
