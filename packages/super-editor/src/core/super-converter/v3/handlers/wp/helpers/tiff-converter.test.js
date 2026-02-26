import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTiffExtension, convertTiffToPng, setTiffDomEnvironment } from './tiff-converter.js';

describe('tiff-converter', () => {
  describe('isTiffExtension', () => {
    it('returns true for tiff extension', () => {
      expect(isTiffExtension('tiff')).toBe(true);
      expect(isTiffExtension('TIFF')).toBe(true);
      expect(isTiffExtension('Tiff')).toBe(true);
    });

    it('returns true for tif extension', () => {
      expect(isTiffExtension('tif')).toBe(true);
      expect(isTiffExtension('TIF')).toBe(true);
      expect(isTiffExtension('Tif')).toBe(true);
    });

    it('returns false for other extensions', () => {
      expect(isTiffExtension('png')).toBe(false);
      expect(isTiffExtension('jpg')).toBe(false);
      expect(isTiffExtension('jpeg')).toBe(false);
      expect(isTiffExtension('gif')).toBe(false);
      expect(isTiffExtension('svg')).toBe(false);
      expect(isTiffExtension('emf')).toBe(false);
      expect(isTiffExtension('wmf')).toBe(false);
      expect(isTiffExtension('')).toBe(false);
      expect(isTiffExtension(null)).toBe(false);
      expect(isTiffExtension(undefined)).toBe(false);
    });
  });

  describe('convertTiffToPng', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns null for invalid data', () => {
      const result = convertTiffToPng('not-valid-base64!!!');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = convertTiffToPng('');
      expect(result).toBeNull();
    });

    it('returns null for null input', () => {
      const result = convertTiffToPng(null);
      expect(result).toBeNull();
    });

    it('returns null for undefined input', () => {
      const result = convertTiffToPng(undefined);
      expect(result).toBeNull();
    });

    it('returns null for non-TIFF base64 data', () => {
      // A valid base64 string that isn't TIFF data
      const result = convertTiffToPng('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
      expect(result).toBeNull();
    });

    it('returns null for TIFF with dimensions exceeding pixel limit', () => {
      // Mock utif2 to return oversized dimensions via raw IFD tags
      // (t256=ImageWidth, t257=ImageLength — 100k × 10k = 1 billion pixels)
      vi.doMock('utif2', () => ({
        decode: () => [{ t256: [100_000], t257: [10_000] }],
        decodeImage: () => undefined,
        toRGBA8: () => new Uint8Array(4),
      }));

      // Re-import to pick up the mock
      return import('./tiff-converter.js?oversized').then(({ convertTiffToPng: fn }) => {
        const result = fn(new Uint8Array([0x49, 0x49, 0x2a, 0x00]));
        expect(result).toBeNull();
        vi.doUnmock('utif2');
      });
    });
  });

  describe('setTiffDomEnvironment', () => {
    it('accepts an environment object without error', () => {
      expect(() => setTiffDomEnvironment({ window: {}, document: {} })).not.toThrow();
    });

    it('accepts null to clear environment', () => {
      expect(() => setTiffDomEnvironment(null)).not.toThrow();
    });
  });
});
