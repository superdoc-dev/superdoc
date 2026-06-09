import { describe, it, expect } from 'vitest';
import { Image } from './image.js';

describe('Image extension defaults', () => {
  it('includes intrinsic size styling on the root image element', () => {
    const { style } = Image.options.htmlAttributes;
    expect(style).toContain('display: inline-block');
  });

  it('stores layout image presentation attrs without rendering them through ProseMirror DOM', () => {
    const attrs = Image.config.addAttributes.call({ options: Image.options });

    expect(attrs.shapeClipPath).toEqual({
      default: null,
      rendered: false,
    });
    expect(attrs.objectFit).toEqual({
      default: null,
      rendered: false,
    });
  });
});
