import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processUploadedImage } from './processUploadedImage.js';

function createMockCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: null,
    toDataURL: vi.fn(() => 'data:image/png;base64,resized'),
    toBlob: vi.fn((callback) => callback(new Blob(['mock'], { type: 'image/png' }))),
  };

  const context = {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    putImageData: vi.fn(),
    imageSmoothingEnabled: false,
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(Math.max(canvas.width * canvas.height * 4, 16)),
    })),
    createImageData: vi.fn((w, h) => ({
      data: new Uint8ClampedArray(Math.max(w * h * 4, 16)),
    })),
  };

  Object.defineProperty(context, 'imageSmoothingQuality', {
    get: () => 'high',
    set: vi.fn(),
  });

  canvas.getContext = vi.fn(() => context);

  return canvas;
}

describe('processUploadedImage', () => {
  let originalCreateElement;
  let originalImage;
  let originalCreateObjectURL;

  beforeEach(() => {
    originalCreateElement = document.createElement;
    originalImage = window.Image;
    originalCreateObjectURL = URL.createObjectURL;

    const canvases = [];
    document.createElement = vi.fn((tag) => {
      if (tag === 'canvas') {
        const canvas = createMockCanvas();
        canvases.push(canvas);
        return canvas;
      }
      return originalCreateElement.call(document, tag);
    });

    class MockImage {
      constructor() {
        this.width = 800;
        this.height = 600;
        this.onload = null;
        this.onerror = null;
      }
      set src(value) {
        if (value === 'error') {
          this.onerror?.(new Error('fail'));
        } else {
          this.onload?.();
        }
      }
    }

    window.Image = MockImage;
    URL.createObjectURL = vi.fn(() => 'blob://mock');
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    window.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    vi.restoreAllMocks();
  });

  it('returns a resized base64 string when provided with base64 input', async () => {
    const base64 = 'data:image/png;base64,' + Buffer.from('image-data').toString('base64');
    const result = await processUploadedImage(base64, () => ({ width: 1000, height: 1000 }));

    expect(typeof result).toBe('string');
    expect(result).toBe('data:image/png;base64,resized');
  });

  it('returns a File and logical dimensions when provided a File input', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    const getMaxContentSize = () => ({ width: 200, height: 200 });

    const result = await processUploadedImage(file, getMaxContentSize);

    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe('photo.png');
    expect(result.file.type).toBe('image/png');
    expect(result.width).toBeLessThanOrEqual(200);
    expect(result.height).toBeLessThanOrEqual(200);
  });
});
