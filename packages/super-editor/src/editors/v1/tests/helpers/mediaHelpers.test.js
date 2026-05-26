import { describe, expect, it } from 'vitest';
import {
  getDataUriMetadata,
  getFallbackImageNameFromDataUri,
  sanitizeDocxMediaName,
  tryDecodeDataUriText,
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

describe('getDataUriMetadata', () => {
  it('extracts MIME type, base64 flag, payload, and normalized extension', () => {
    const result = getDataUriMetadata('data:image/svg+xml;charset=utf-8;base64,PHN2Zy8+');

    expect(result).toEqual({
      hasPayloadSeparator: true,
      rawMimeType: 'image/svg+xml',
      mimeType: 'image/svg+xml',
      isBase64: true,
      payload: 'PHN2Zy8+',
      extension: 'svg',
    });
  });

  it('handles no-parameter SVG data URIs without including the payload in the extension', () => {
    const result = getDataUriMetadata('data:image/svg+xml,%3Csvg%2F%3E');

    expect(result).toMatchObject({
      mimeType: 'image/svg+xml',
      payload: '%3Csvg%2F%3E',
      extension: 'svg',
    });
  });

  it('returns null for non-data URI input', () => {
    expect(getDataUriMetadata('word/media/image.png')).toBeNull();
  });
});

describe('getFallbackImageNameFromDataUri', () => {
  it('returns a filename with extension extracted from data URI', () => {
    const dataUri = 'data:image/png;base64,AAAA';
    expect(getFallbackImageNameFromDataUri(dataUri)).toBe('image.png');
  });

  it('normalises the extension casing', () => {
    const dataUri = 'data:image/JPEG;base64,AAAA';
    expect(getFallbackImageNameFromDataUri(dataUri)).toBe('image.jpg');
  });

  it('returns fallback when type cannot be derived', () => {
    expect(getFallbackImageNameFromDataUri('data:,')).toBe('image');
    expect(getFallbackImageNameFromDataUri('data:text/html,%3Cp%3Ebad%3C%2Fp%3E')).toBe('image');
    expect(getFallbackImageNameFromDataUri('', 'custom')).toBe('custom');
  });
});

describe('tryDecodeDataUriText', () => {
  it('decodes percent-encoded data URI text payloads', () => {
    expect(tryDecodeDataUriText('%3Csvg%2F%3E')).toBe('<svg/>');
  });

  it('returns null for malformed percent escapes', () => {
    expect(tryDecodeDataUriText('%')).toBeNull();
  });
});
