import { describe, expect, it } from 'vitest';
import {
  getFallbackImageNameFromDataUri,
  sanitizeDocxMediaName,
} from '../../core/super-converter/helpers/mediaHelpers.js';

describe('sanitizeDocxMediaName', () => {
  it('keeps valid characters unchanged', () => {
    const input = 'agreementinput-1758564220741-261745068086';
    expect(sanitizeDocxMediaName(input)).toBe(input);
  });

  it('replaces invalid characters with underscores', () => {
    const input = 'field name@2024!*';
    expect(sanitizeDocxMediaName(input)).toBe('field_name_2024__');
  });

  it('falls back when the input is falsy', () => {
    expect(sanitizeDocxMediaName('', 'fallback')).toBe('fallback');
    expect(sanitizeDocxMediaName(null, 'fallback')).toBe('fallback');
  });

  it('replaces every invalid character even if it means all underscores', () => {
    expect(sanitizeDocxMediaName('!!!', 'default')).toBe('___');
  });
});

describe('getFallbackImageNameFromDataUri', () => {
  it('returns a filename with extension extracted from data URI', () => {
    const dataUri = 'data:image/png;base64,AAAA';
    expect(getFallbackImageNameFromDataUri(dataUri)).toBe('image.png');
  });

  it('normalises the extension casing', () => {
    const dataUri = 'data:image/JPEG;base64,AAAA';
    expect(getFallbackImageNameFromDataUri(dataUri)).toBe('image.jpeg');
  });

  it('returns fallback when type cannot be derived', () => {
    expect(getFallbackImageNameFromDataUri('data:,')).toBe('image');
    expect(getFallbackImageNameFromDataUri('', 'custom')).toBe('custom');
  });
});
