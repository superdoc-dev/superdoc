import { describe, expect, it } from 'vitest';
import { resolveBlockImageClipPath } from './image-block.js';

describe('resolveBlockImageClipPath', () => {
  it('prefers a top-level clipPath over attrs.clipPath', () => {
    expect(
      resolveBlockImageClipPath({
        clipPath: 'inset(1% 2% 3% 4%)',
        attrs: { clipPath: 'inset(5% 6% 7% 8%)' },
      }),
    ).toBe('inset(1% 2% 3% 4%)');
  });

  it('falls back to attrs.clipPath when top-level clipPath is absent', () => {
    expect(resolveBlockImageClipPath({ attrs: { clipPath: 'inset(5% 6% 7% 8%)' } })).toBe('inset(5% 6% 7% 8%)');
  });

  it('ignores unsupported clip-path values', () => {
    expect(resolveBlockImageClipPath({ clipPath: 'url(#clip)' })).toBe('');
  });
});
