/**
 * TIFF to PNG Converter
 *
 * Converts TIFF images to PNG format using utif2 for decoding and Canvas for
 * encoding. Browsers cannot natively render TIFF images, so this converts them
 * at import time to a browser-friendly format.
 *
 * @module tiff-converter
 */

import * as UTIF from 'utif2';
import { base64ToUint8Array } from '../../../../helpers.js';

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
 * Converts a TIFF image to a PNG data URI.
 *
 * @param {string} data - Base64 encoded data or data URI of the TIFF file
 * @returns {{ dataUri: string, format: string }|null} Data URI plus format, or null if conversion fails
 */
export function convertTiffToPng(data) {
  try {
    // Parse input — accept data URI or raw base64
    let bytes;
    if (typeof data === 'string') {
      let base64 = data;
      if (data.startsWith('data:')) {
        const commaIndex = data.indexOf(',');
        if (commaIndex === -1) return null;
        base64 = data.substring(commaIndex + 1);
      }
      bytes = base64ToUint8Array(base64);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else if (ArrayBuffer.isView(data)) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
      return null;
    }

    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    // Decode TIFF — get Image File Directories (pages)
    const ifds = UTIF.decode(buffer);
    if (!ifds || ifds.length === 0) return null;

    // Validate dimensions from IFD metadata before decoding pixel data
    const { width, height } = ifds[0];
    if (!width || !height || width * height > MAX_PIXEL_COUNT) return null;

    // Decode pixel data for the first page
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    if (!rgba || rgba.length === 0) return null;

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
    imageData.data.set(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength));
    ctx.putImageData(imageData, 0, 0);

    const dataUri = canvas.toDataURL('image/png');
    if (!dataUri || dataUri === 'data:,') return null;

    return { dataUri, format: 'png' };
  } catch (error) {
    console.warn('Failed to convert TIFF to PNG:', error.message);
    return null;
  }
}
