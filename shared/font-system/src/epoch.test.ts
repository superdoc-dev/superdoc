import { describe, it, expect, beforeEach } from 'vitest';
import { getFontConfigVersion, bumpFontConfigVersion, __resetFontConfigVersion } from './index';

describe('fontConfigVersion epoch', () => {
  beforeEach(() => __resetFontConfigVersion());

  it('starts at 0', () => {
    expect(getFontConfigVersion()).toBe(0);
  });

  it('bump increments and returns the new value', () => {
    expect(bumpFontConfigVersion()).toBe(1);
    expect(bumpFontConfigVersion()).toBe(2);
    expect(getFontConfigVersion()).toBe(2);
  });

  it('reset returns to 0', () => {
    bumpFontConfigVersion();
    __resetFontConfigVersion();
    expect(getFontConfigVersion()).toBe(0);
  });
});
