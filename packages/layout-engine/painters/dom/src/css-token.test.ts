import { describe, expect, it } from 'vitest';
import { cssToken } from './css-token.js';

describe('cssToken', () => {
  it('builds a var() string with the fallback embedded', () => {
    const token = cssToken('--sd-ui-bg', '#ffffff');
    expect(token.css).toBe('var(--sd-ui-bg, #ffffff)');
  });

  it('stores the fallback separately for jsdom environments', () => {
    const token = cssToken('--sd-ui-bg', '#ffffff');
    expect(token.fallback).toBe('#ffffff');
  });

  it('keeps css and fallback in sync', () => {
    const token = cssToken('--sd-comments-highlight-external', '#B1124B40');
    expect(token.css).toContain(token.fallback);
  });

  it('works with rgba values', () => {
    const token = cssToken('--sd-ui-tools-item-bg', 'rgba(219, 219, 219, 0.6)');
    expect(token.css).toBe('var(--sd-ui-tools-item-bg, rgba(219, 219, 219, 0.6))');
    expect(token.fallback).toBe('rgba(219, 219, 219, 0.6)');
  });
});
