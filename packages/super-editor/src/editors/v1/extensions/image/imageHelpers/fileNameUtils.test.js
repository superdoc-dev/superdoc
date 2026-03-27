import { describe, expect, it } from 'vitest';
import { buildMediaPath, ensureUniqueFileName, sanitizeImageFileName } from './fileNameUtils.js';

describe('sanitizeImageFileName', () => {
  it('strips unsafe characters and diacritics', () => {
    const name = 'Screénshot 2025/09/22 at 3.45.41\u202fPM.PNG';
    expect(sanitizeImageFileName(name)).toBe('Screenshot_2025_09_22_at_3.45.41_PM.png');
  });

  it('falls back to default when name is unusable', () => {
    expect(sanitizeImageFileName('????')).toBe('image');
  });

  it('preserves valid names', () => {
    expect(sanitizeImageFileName('diagram-1.png')).toBe('diagram-1.png');
  });

  it('allows dots in the base name when already safe', () => {
    expect(sanitizeImageFileName('diagram.v1.final.PNG')).toBe('diagram.v1.final.png');
  });

  it('returns sanitized base when extension is missing', () => {
    expect(sanitizeImageFileName('.env')).toBe('env');
  });

  it('falls back gracefully when input is nullish', () => {
    expect(sanitizeImageFileName(null)).toBe('image');
    expect(sanitizeImageFileName(undefined)).toBe('image');
  });

  it('handles non-string inputs without trim()', () => {
    expect(sanitizeImageFileName({})).toBe('image');
  });
});

describe('ensureUniqueFileName', () => {
  it('returns sanitized name when not present', () => {
    const result = ensureUniqueFileName('Screenshot.png', new Set(['existing.png']));
    expect(result).toBe('Screenshot.png');
  });

  it('appends suffix when a collision occurs', () => {
    const existing = new Set(['Screenshot.png', 'Screenshot-1.png']);
    const result = ensureUniqueFileName('Screenshot.png', existing);
    expect(result).toBe('Screenshot-2.png');
  });

  it('sanitizes before ensuring uniqueness', () => {
    const existing = new Set(['Screenshot_2025-09-22_at_3.45.41_PM.png']);
    const result = ensureUniqueFileName('Screenshot 2025-09-22 at 3.45.41\u202fPM.png', existing);
    expect(result).toBe('Screenshot_2025-09-22_at_3.45.41_PM-1.png');
  });

  it('handles collections without a has method', () => {
    const result = ensureUniqueFileName('Report.png', []);
    expect(result).toBe('Report.png');
  });

  it('increments until an available suffix is found', () => {
    const existing = new Set(['image.png', 'image-1.png', 'image-2.png']);
    const result = ensureUniqueFileName('image.png', existing);
    expect(result).toBe('image-3.png');
  });

  it('handles names without extensions when generating suffixes', () => {
    const existing = new Set(['image', 'image-1', 'image-2']);
    const result = ensureUniqueFileName('image', existing);
    expect(result).toBe('image-3');
  });
});

describe('buildMediaPath', () => {
  it('prefixes media directory', () => {
    expect(buildMediaPath('foo.png')).toBe('word/media/foo.png');
  });
});
