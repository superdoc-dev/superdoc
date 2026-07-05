import { describe, expect, it } from 'vitest';
import { normalizeTargetPath } from './media-target-path.js';

describe('normalizeTargetPath', () => {
  it('keeps empty targets unchanged', () => {
    expect(normalizeTargetPath()).toBe('');
    expect(normalizeTargetPath('')).toBe('');
  });

  it('keeps word-relative targets unchanged after trimming leading slashes', () => {
    expect(normalizeTargetPath('word/media/image.png')).toBe('word/media/image.png');
    expect(normalizeTargetPath('/word/media/image.png')).toBe('word/media/image.png');
  });

  it('prefixes media-relative and bare targets with word', () => {
    expect(normalizeTargetPath('media/image.png')).toBe('word/media/image.png');
    expect(normalizeTargetPath('/media/image.png')).toBe('word/media/image.png');
    expect(normalizeTargetPath('image.png')).toBe('word/image.png');
  });
});
