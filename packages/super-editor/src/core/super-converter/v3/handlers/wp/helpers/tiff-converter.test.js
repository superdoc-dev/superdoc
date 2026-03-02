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

    it('returns a PNG data URI for valid TIFF input', () => {
      const fakePixelData = new Uint8Array(2 * 2 * 3); // 2x2 RGB image
      vi.doMock('tiff', () => ({
        decode: (_buf, opts) => {
          // First call with ignoreImageData returns metadata only
          if (opts?.ignoreImageData) return [{ width: 2, height: 2 }];
          return [{ width: 2, height: 2, data: fakePixelData, samplesPerPixel: 3, alpha: false }];
        },
      }));

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
          putImageData: () => {},
        }),
        toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
      };
      const spy = vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);

      return import('./tiff-converter.js?happy').then(({ convertTiffToPng: fn }) => {
        const result = fn('SU8qAA==');
        expect(result).toEqual({ dataUri: 'data:image/png;base64,iVBORw0KGgo=', format: 'png' });

        spy.mockRestore();
        vi.doUnmock('tiff');
      });
    });

    it('returns null for TIFF with dimensions exceeding pixel limit', () => {
      // Mock tiff metadata-only decode to return oversized dimensions
      // (100k × 10k = 1 billion pixels). The full decode should never be called.
      const fullDecode = vi.fn();
      vi.doMock('tiff', () => ({
        decode: (_buf, opts) => {
          if (opts?.ignoreImageData) return [{ width: 100_000, height: 10_000 }];
          fullDecode();
          return [{ width: 100_000, height: 10_000, data: new Uint8Array(4), samplesPerPixel: 1, alpha: false }];
        },
      }));

      return import('./tiff-converter.js?oversized').then(({ convertTiffToPng: fn }) => {
        const result = fn('SU8qAA==');
        expect(result).toBeNull();
        expect(fullDecode).not.toHaveBeenCalled();
        vi.doUnmock('tiff');
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
