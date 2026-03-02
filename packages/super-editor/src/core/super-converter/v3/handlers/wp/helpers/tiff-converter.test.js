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

    it('converts a greyscale (1 channel) TIFF to PNG', () => {
      // 2x2 greyscale: pixel values [50, 100, 150, 200]
      const greyData = new Uint8Array([50, 100, 150, 200]);
      vi.doMock('tiff', () => ({
        decode: (_buf, opts) => {
          if (opts?.ignoreImageData) return [{ width: 2, height: 2 }];
          return [{ width: 2, height: 2, data: greyData, samplesPerPixel: 1, alpha: false }];
        },
      }));

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
          putImageData: () => {},
        }),
        toDataURL: () => 'data:image/png;base64,grey',
      };
      const spy = vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);

      return import('./tiff-converter.js?grey').then(({ convertTiffToPng: fn }) => {
        const result = fn('SU8qAA==');
        expect(result).toEqual({ dataUri: 'data:image/png;base64,grey', format: 'png' });
        spy.mockRestore();
        vi.doUnmock('tiff');
      });
    });

    it('converts a grey+alpha (2 channel) TIFF to PNG', () => {
      // 2x1 grey+alpha: [grey, alpha, grey, alpha]
      const greyAlphaData = new Uint8Array([128, 255, 64, 128]);
      vi.doMock('tiff', () => ({
        decode: (_buf, opts) => {
          if (opts?.ignoreImageData) return [{ width: 2, height: 1 }];
          return [{ width: 2, height: 1, data: greyAlphaData, samplesPerPixel: 2, alpha: true }];
        },
      }));

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
          putImageData: () => {},
        }),
        toDataURL: () => 'data:image/png;base64,greyAlpha',
      };
      const spy = vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);

      return import('./tiff-converter.js?greyAlpha').then(({ convertTiffToPng: fn }) => {
        const result = fn('SU8qAA==');
        expect(result).toEqual({ dataUri: 'data:image/png;base64,greyAlpha', format: 'png' });
        spy.mockRestore();
        vi.doUnmock('tiff');
      });
    });

    it('normalizes Uint16Array pixel data to 8-bit', () => {
      // 1x1 RGB with 16-bit values; 65535 → 255, 32768 → 128, 0 → 0
      const uint16Data = new Uint16Array([65535, 32768, 0]);
      vi.doMock('tiff', () => ({
        decode: (_buf, opts) => {
          if (opts?.ignoreImageData) return [{ width: 1, height: 1 }];
          return [{ width: 1, height: 1, data: uint16Data, samplesPerPixel: 3, alpha: false }];
        },
      }));

      const putCalls = [];
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
          putImageData: (imageData) => putCalls.push(Array.from(imageData.data)),
        }),
        toDataURL: () => 'data:image/png;base64,u16',
      };
      const spy = vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);

      return import('./tiff-converter.js?uint16').then(({ convertTiffToPng: fn }) => {
        const result = fn('SU8qAA==');
        expect(result).toEqual({ dataUri: 'data:image/png;base64,u16', format: 'png' });
        // Verify normalization: (65535+128)/257|0 = 255, (32768+128)/257|0 = 128, (0+128)/257|0 = 0
        expect(putCalls[0][0]).toBe(255);
        expect(putCalls[0][1]).toBe(128);
        expect(putCalls[0][2]).toBe(0);
        expect(putCalls[0][3]).toBe(255); // alpha
        spy.mockRestore();
        vi.doUnmock('tiff');
      });
    });

    it('normalizes Float32Array pixel data to 8-bit', () => {
      // 1x1 RGB with float values; 1.0 → 255, 0.5 → 128, 0.0 → 0
      const floatData = new Float32Array([1.0, 0.5, 0.0]);
      vi.doMock('tiff', () => ({
        decode: (_buf, opts) => {
          if (opts?.ignoreImageData) return [{ width: 1, height: 1 }];
          return [{ width: 1, height: 1, data: floatData, samplesPerPixel: 3, alpha: false }];
        },
      }));

      const putCalls = [];
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
          putImageData: (imageData) => putCalls.push(Array.from(imageData.data)),
        }),
        toDataURL: () => 'data:image/png;base64,f32',
      };
      const spy = vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);

      return import('./tiff-converter.js?float32').then(({ convertTiffToPng: fn }) => {
        const result = fn('SU8qAA==');
        expect(result).toEqual({ dataUri: 'data:image/png;base64,f32', format: 'png' });
        // Verify normalization: 1.0 → 255, 0.5 → 128, 0.0 → 0
        expect(putCalls[0][0]).toBe(255);
        expect(putCalls[0][1]).toBe(128);
        expect(putCalls[0][2]).toBe(0);
        expect(putCalls[0][3]).toBe(255); // alpha
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
