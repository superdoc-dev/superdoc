import { describe, it, expect } from 'vitest';
import { Image } from './image.js';

describe('Image extension defaults', () => {
  it('includes intrinsic size styling on the root image element', () => {
    const { style } = Image.options.htmlAttributes;
    expect(style).toContain('display: inline-block');
  });
});
