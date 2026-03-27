import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getFileOpener } from './getFileOpener.js';
import { handleImageUpload } from './handleImageUpload.js';
import { processUploadedImage, getAllowedImageDimensions } from './processUploadedImage.js';

describe('image helper utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('opens file input and resolves selected file', async () => {
    const originalCreateElement = document.createElement;
    let capturedInput;
    document.createElement = vi.fn((tag) => {
      const element = originalCreateElement.call(document, tag);
      if (tag === 'input') capturedInput = element;
      return element;
    });

    const openFile = getFileOpener();
    const promise = openFile();
    const file = new File(['data'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(capturedInput, 'files', {
      value: {
        item: () => file,
      },
      configurable: true,
    });
    capturedInput.onchange();
    const result = await promise;
    expect(result).toEqual({ file });
    document.createElement = originalCreateElement;
  });

  it('converts files to data URLs with handleImageUpload', async () => {
    vi.useFakeTimers();
    const mockReader = {
      readAsDataURL: vi.fn(function () {
        this.onload({ target: { result: 'data:image/png;base64,TEST' } });
      }),
      set onload(fn) {
        this._onload = fn;
      },
      get onload() {
        return this._onload;
      },
      set onerror(fn) {
        this._onerror = fn;
      },
      get onerror() {
        return this._onerror;
      },
    };
    vi.stubGlobal(
      'FileReader',
      vi.fn(() => mockReader),
    );

    const file = new File(['data'], 'image.png', { type: 'image/png' });
    const promise = handleImageUpload(file);
    vi.advanceTimersByTime(250);
    const result = await promise;
    expect(result).toBe('data:image/png;base64,TEST');
    vi.useRealTimers();
  });

  it('computes allowed image dimensions respecting constraints', () => {
    const { width, height } = getAllowedImageDimensions(1200, 400, () => ({ width: 400, height: 300 }));
    expect(width).toBeLessThanOrEqual(400);
    expect(height).toBeLessThanOrEqual(300);
  });

  it('processing image returns resized base64 when no resize needed', async () => {
    const originalImage = globalThis.Image;
    class MockImage {
      constructor() {
        this.width = 200;
        this.height = 100;
      }
      set onload(fn) {
        this._onload = fn;
      }
      get onload() {
        return this._onload;
      }
      set onerror(fn) {
        this._onerror = fn;
      }
      set src(value) {
        this._src = value;
        setTimeout(() => this._onload && this._onload());
      }
    }
    globalThis.Image = MockImage;

    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
      }),
      toDataURL: vi.fn(() => 'data:image/png;base64,MOCK'),
    };
    const originalCreateElement = document.createElement;
    document.createElement = vi.fn((tag) => (tag === 'canvas' ? canvas : originalCreateElement.call(document, tag)));

    const getMaxContentSize = () => ({ width: 500, height: 500 });

    const dataUrl = await processUploadedImage('data:image/png;base64,original', getMaxContentSize);
    expect(dataUrl).toBe('data:image/png;base64,MOCK');

    document.createElement = originalCreateElement;
    globalThis.Image = originalImage;
  });
});
