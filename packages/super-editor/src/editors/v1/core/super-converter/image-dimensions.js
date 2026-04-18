import { base64ToUint8Array } from './helpers.js';

/**
 * Read intrinsic image dimensions from raw binary headers.
 * Supports PNG, JPEG, GIF, BMP, and WEBP.
 *
 * @param {Uint8Array} bytes - Raw image bytes
 * @returns {{ width: number, height: number } | null} Dimensions or null if unreadable
 */
export function readImageDimensions(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;

  // PNG: IHDR chunk at bytes 16-23 (big-endian int32 width, height)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getInt32(16);
    const height = view.getInt32(20);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  // JPEG: Scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return readJpegDimensions(bytes);
  }

  // GIF: Logical screen descriptor at bytes 6-9 (little-endian uint16)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    if (bytes.length < 10) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  // BMP: DIB header at bytes 18-25 (little-endian int32)
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    if (bytes.length < 26) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getInt32(18, true);
    const height = Math.abs(view.getInt32(22, true)); // height can be negative (top-down)
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return readWebpDimensions(bytes);
  }

  return null;
}

/**
 * Scan JPEG markers for SOF0/SOF2 to read width/height.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
function readJpegDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2; // skip SOI (0xFFD8)

  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];

    // SOF0 (0xC0) or SOF2 (0xC2) — baseline or progressive
    if (marker === 0xc0 || marker === 0xc2) {
      if (offset + 9 > bytes.length) return null;
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }

    // Skip non-SOF markers: read segment length and advance
    if (marker === 0xd9) return null; // EOI — end of image
    if (marker === 0xda) return null; // SOS — start of scan (no more metadata)

    const segmentLength = view.getUint16(offset + 2);
    offset += 2 + segmentLength;
  }

  return null;
}

/**
 * Read WEBP dimensions from VP8, VP8L, or VP8X sub-chunks.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
function readWebpDimensions(bytes) {
  if (bytes.length < 16) return null;

  // Check sub-chunk type at byte 12
  const chunkTag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunkTag === 'VP8 ') {
    // Lossy VP8: frame header starts at byte 20 (after 12-byte RIFF header + 8 chunk header)
    // Bytes 26-27: width (LE uint16, lower 14 bits), 28-29: height (LE uint16, lower 14 bits)
    if (bytes.length < 30) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  if (chunkTag === 'VP8L') {
    // Lossless VP8L: signature byte at 21, then 4 bytes of packed width/height
    if (bytes.length < 25) return null;
    // Bytes 21-24 contain packed dimensions (after 0x2f signature byte at offset 21)
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = (((b1 & 0x3f) << 8) | b0) + 1;
    const height = (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6)) + 1;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  if (chunkTag === 'VP8X') {
    // Extended VP8X: canvas size at bytes 24-29
    // width = 24-bit LE uint at byte 24 + 1, height = 24-bit LE uint at byte 27 + 1
    if (bytes.length < 30) return null;
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  return null;
}

/**
 * Extract dimensions from a data URI's base64 payload.
 *
 * @param {string} dataUri - A data URI (e.g. "data:image/png;base64,...")
 * @returns {{ width: number, height: number } | null} Dimensions or null
 */
export function readImageDimensionsFromDataUri(dataUri) {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) return null;

  const commaIndex = dataUri.indexOf(',');
  if (commaIndex === -1) return null;

  const base64Payload = dataUri.slice(commaIndex + 1);
  if (!base64Payload) return null;

  try {
    const bytes = base64ToUint8Array(base64Payload);
    return readImageDimensions(bytes);
  } catch {
    return null;
  }
}
