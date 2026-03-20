import { describe, it, expect } from 'vitest';
import { readImageDimensions, readImageDimensionsFromDataUri } from './image-dimensions.js';

// ---------------------------------------------------------------------------
// Helpers to build minimal valid headers
// ---------------------------------------------------------------------------

function pngHeader(width, height) {
  // Minimal PNG: 8-byte signature + IHDR chunk (13 data bytes = width(4) + height(4) + depth(1) + colorType(1) + compression(1) + filter(1) + interlace(1))
  const buf = new ArrayBuffer(33);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // PNG signature
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR chunk: length (13)
  view.setUint32(8, 13);
  // IHDR tag
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  // width + height (big-endian)
  view.setInt32(16, width);
  view.setInt32(20, height);

  return bytes;
}

function jpegHeader(width, height) {
  // SOI + APP0 (minimal) + SOF0 with dimensions
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);

  // SOI
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  // APP0 marker (will be skipped)
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  view.setUint16(4, 5); // segment length = 5 (minimum: 2 + 3 bytes)
  bytes[6] = 0x00;
  bytes[7] = 0x00;
  bytes[8] = 0x00;
  // SOF0 marker
  bytes[9] = 0xff;
  bytes[10] = 0xc0;
  view.setUint16(11, 8); // segment length
  bytes[13] = 8; // precision
  view.setUint16(14, height);
  view.setUint16(16, width);

  return bytes;
}

function gifHeader(width, height) {
  // GIF89a + logical screen descriptor
  const bytes = new Uint8Array(13);
  const view = new DataView(bytes.buffer);

  // GIF89a signature
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  // Width + height (little-endian uint16)
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);

  return bytes;
}

function bmpHeader(width, height) {
  // BM + file header (14 bytes) + DIB header start with width/height
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x42; // B
  bytes[1] = 0x4d; // M
  // Skip file header bytes 2-13
  // DIB header: width at offset 18, height at offset 22 (little-endian int32)
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);

  return bytes;
}

function webpVP8Header(width, height) {
  // RIFF....WEBP VP8 chunk with dimensions
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46]); // RIFF
  view.setUint32(4, 22, true); // file size (not critical for parsing)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  // VP8 chunk
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  view.setUint32(16, 10, true); // chunk size
  // Frame header: 3 bytes of frame tag, then keyframe sync code (0x9D012A)
  bytes[20] = 0x9d;
  bytes[21] = 0x01;
  bytes[22] = 0x2a;
  // Padding bytes
  bytes[23] = 0x00;
  bytes[24] = 0x00;
  bytes[25] = 0x00;
  // width at 26-27 (LE uint16, lower 14 bits), height at 28-29
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);

  return bytes;
}

function webpVP8XHeader(width, height) {
  // RIFF....WEBP VP8X chunk with canvas dimensions
  const bytes = new Uint8Array(30);

  bytes.set([0x52, 0x49, 0x46, 0x46]); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  // VP8X chunk size at 16 (LE uint32) - 10
  bytes[16] = 10;
  // Flags at 20
  bytes[20] = 0x00;
  // Reserved bytes 21-23
  // Canvas width at 24-26 (24-bit LE, value = width - 1)
  const w = width - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  // Canvas height at 27-29 (24-bit LE, value = height - 1)
  const h = height - 1;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;

  return bytes;
}

function toDataUri(bytes, mimeType) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readImageDimensions', () => {
  it('reads PNG dimensions', () => {
    expect(readImageDimensions(pngHeader(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it('reads JPEG dimensions', () => {
    expect(readImageDimensions(jpegHeader(1024, 768))).toEqual({ width: 1024, height: 768 });
  });

  it('reads GIF dimensions', () => {
    expect(readImageDimensions(gifHeader(320, 240))).toEqual({ width: 320, height: 240 });
  });

  it('reads BMP dimensions', () => {
    expect(readImageDimensions(bmpHeader(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('reads BMP with negative height (top-down)', () => {
    expect(readImageDimensions(bmpHeader(640, -480))).toEqual({ width: 640, height: 480 });
  });

  it('reads WEBP VP8 (lossy) dimensions', () => {
    expect(readImageDimensions(webpVP8Header(400, 300))).toEqual({ width: 400, height: 300 });
  });

  it('reads WEBP VP8X (extended) dimensions', () => {
    expect(readImageDimensions(webpVP8XHeader(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('returns null for empty bytes', () => {
    expect(readImageDimensions(new Uint8Array(0))).toBeNull();
  });

  it('returns null for truncated PNG', () => {
    const truncated = pngHeader(800, 600).slice(0, 18);
    expect(readImageDimensions(truncated)).toBeNull();
  });

  it('returns null for unknown format', () => {
    const unknown = new Uint8Array(32);
    unknown.fill(0xab);
    expect(readImageDimensions(unknown)).toBeNull();
  });

  it('returns null for non-Uint8Array input', () => {
    expect(readImageDimensions('not bytes')).toBeNull();
    expect(readImageDimensions(null)).toBeNull();
    expect(readImageDimensions(undefined)).toBeNull();
  });

  it('returns null for PNG with zero dimensions', () => {
    expect(readImageDimensions(pngHeader(0, 600))).toBeNull();
    expect(readImageDimensions(pngHeader(800, 0))).toBeNull();
  });
});

describe('readImageDimensionsFromDataUri', () => {
  it('reads PNG dimensions from data URI', () => {
    const uri = toDataUri(pngHeader(800, 600), 'image/png');
    expect(readImageDimensionsFromDataUri(uri)).toEqual({ width: 800, height: 600 });
  });

  it('reads JPEG dimensions from data URI', () => {
    const uri = toDataUri(jpegHeader(1024, 768), 'image/jpeg');
    expect(readImageDimensionsFromDataUri(uri)).toEqual({ width: 1024, height: 768 });
  });

  it('reads GIF dimensions from data URI', () => {
    const uri = toDataUri(gifHeader(320, 240), 'image/gif');
    expect(readImageDimensionsFromDataUri(uri)).toEqual({ width: 320, height: 240 });
  });

  it('returns null for non-data-URI string', () => {
    expect(readImageDimensionsFromDataUri('https://example.com/image.png')).toBeNull();
  });

  it('returns null for malformed data URI', () => {
    expect(readImageDimensionsFromDataUri('data:image/png')).toBeNull(); // no comma
  });

  it('returns null for empty base64 payload', () => {
    expect(readImageDimensionsFromDataUri('data:image/png;base64,')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(readImageDimensionsFromDataUri(null)).toBeNull();
    expect(readImageDimensionsFromDataUri(123)).toBeNull();
  });
});
