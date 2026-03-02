/**
 * TIFF to PNG Converter
 *
 * Converts TIFF images to PNG format using the `tiff` package (image-js/tiff)
 * for decoding and Canvas for encoding. Browsers cannot natively render TIFF
 * images, so this converts them at import time to a browser-friendly format.
 *
 * @module tiff-converter
 */

import { decode } from 'tiff';
import { dataUriToArrayBuffer } from '../../../../helpers.js';

// Optional DOM environment provided by callers (e.g., JSDOM in Node)
let domEnvironment = null;

// Safety limit: reject TIFF images whose decoded RGBA buffer would exceed this
// pixel count. 100 million pixels ≈ 400 MB of RGBA data — well above any
// realistic document image while still preventing DoS from malicious dimensions.
const MAX_PIXEL_COUNT = 100_000_000;

/**
 * Configure a DOM environment that can be used when running in Node.
 *
 * @param {{ mockWindow?: Window|null, window?: Window|null, mockDocument?: Document|null, document?: Document|null }|null} env
 */
export const setTiffDomEnvironment = (env) => {
  domEnvironment = env || null;
};

/**
 * Checks if a file extension is a TIFF format.
 *
 * @param {string} extension - File extension to check
 * @returns {boolean} True if the extension is 'tiff' or 'tif'
 */
export function isTiffExtension(extension) {
  const ext = extension?.toLowerCase();
  return ext === 'tiff' || ext === 'tif';
}

/**
 * Get a canvas element, trying the global document first, then the domEnvironment.
 *
 * @returns {HTMLCanvasElement|null}
 */
function createCanvas() {
  if (typeof document !== 'undefined') {
    return document.createElement('canvas');
  }

  const env = domEnvironment || {};
  const doc = env.document || env.mockDocument || env.window?.document || env.mockWindow?.document || null;
  if (doc) {
    return doc.createElement('canvas');
  }

  return null;
}

/**
 * Convert decoded pixel data to RGBA format.
 * The `tiff` package returns pixel data whose channel count depends on the
 * image (greyscale=1, grey+alpha=2, RGB=3, RGBA=4). Canvas requires RGBA.
 *
 * @param {Uint8Array} data - Decoded pixel data
 * @param {number} samplesPerPixel - Number of channels per pixel
 * @param {boolean} hasAlpha - Whether the image has an alpha channel
 * @param {number} pixelCount - Total number of pixels (width × height)
 * @returns {Uint8Array} RGBA pixel data
 */
function toRGBA(data, samplesPerPixel, hasAlpha, pixelCount) {
  if (samplesPerPixel === 4 && hasAlpha) return data;

  const rgba = new Uint8Array(pixelCount * 4);

  if (samplesPerPixel === 3) {
    // RGB → RGBA
    for (let i = 0; i < pixelCount; i++) {
      rgba[i * 4] = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else if (samplesPerPixel === 2 && hasAlpha) {
    // Grey + Alpha → RGBA
    for (let i = 0; i < pixelCount; i++) {
      const g = data[i * 2];
      rgba[i * 4] = g;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = g;
      rgba[i * 4 + 3] = data[i * 2 + 1];
    }
  } else if (samplesPerPixel === 1) {
    // Greyscale → RGBA
    for (let i = 0; i < pixelCount; i++) {
      rgba[i * 4] = data[i];
      rgba[i * 4 + 1] = data[i];
      rgba[i * 4 + 2] = data[i];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    return null;
  }

  return rgba;
}

/**
 * Converts a TIFF image to a PNG data URI.
 *
 * @param {string} data - Base64 encoded data or data URI of the TIFF file
 * @returns {{ dataUri: string, format: string }|null} Data URI plus format, or null if conversion fails
 */
export function convertTiffToPng(data) {
  try {
    if (typeof data !== 'string') return null;

    const buffer = dataUriToArrayBuffer(data);

    // Read metadata first without decompressing pixel data so the size
    // guard fires before a huge RGBA buffer is allocated.
    const meta = decode(buffer, { ignoreImageData: true });
    if (!meta || meta.length === 0) return null;

    const { width, height } = meta[0];
    if (!width || !height || width * height > MAX_PIXEL_COUNT) return null;

    // Dimensions are safe — decode pixel data
    const ifds = decode(buffer);
    const ifd = ifds[0];

    let pixelData = ifd.data;
    if (!pixelData || pixelData.length === 0) return null;

    // Normalize higher bit-depth data to 8-bit for canvas
    if (pixelData instanceof Uint16Array) {
      pixelData = Uint8Array.from(pixelData, (v) => ((v + 128) / 257) | 0);
    } else if (pixelData instanceof Float32Array) {
      pixelData = Uint8Array.from(pixelData, (v) => (Math.min(Math.max(v, 0), 1) * 255 + 0.5) | 0);
    }

    const samplesPerPixel = ifd.samplesPerPixel ?? (ifd.alpha ? 2 : 1);
    const rgba = toRGBA(pixelData, samplesPerPixel, ifd.alpha, width * height);
    if (!rgba) return null;

    // Render to canvas and export as PNG
    const canvas = createCanvas();
    if (!canvas) {
      console.warn('TIFF conversion requires a DOM environment with canvas support');
      return null;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);

    const dataUri = canvas.toDataURL('image/png');
    if (!dataUri || dataUri === 'data:,') return null;

    return { dataUri, format: 'png' };
  } catch (error) {
    console.warn('Failed to convert TIFF to PNG:', error.message);
    return null;
  }
}
