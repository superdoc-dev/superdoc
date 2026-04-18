import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { _testHelpers } from './agile-decryptor.js';

const { encodeUtf16le, constantTimeEqual, generateIV } = _testHelpers;

describe('encodeUtf16le', () => {
  it('encodes ASCII string as UTF-16LE', () => {
    const result = encodeUtf16le('AB');
    expect(Array.from(result)).toEqual([0x41, 0x00, 0x42, 0x00]);
  });

  it('encodes empty string as empty array', () => {
    const result = encodeUtf16le('');
    expect(result.length).toBe(0);
  });

  it('encodes non-ASCII characters', () => {
    // Euro sign € = U+20AC -> LE: AC 20
    const result = encodeUtf16le('€');
    expect(Array.from(result)).toEqual([0xac, 0x20]);
  });

  it('encodes a typical password', () => {
    const result = encodeUtf16le('password');
    expect(result.length).toBe(16); // 8 chars * 2 bytes
    // 'p' = 0x70
    expect(result[0]).toBe(0x70);
    expect(result[1]).toBe(0x00);
  });
});

describe('constantTimeEqual', () => {
  it('returns true for identical arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('returns false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('returns false for arrays of different lengths', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('returns true for empty arrays', () => {
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });

  it('returns false when only one bit differs', () => {
    const a = new Uint8Array([0xff]);
    const b = new Uint8Array([0xfe]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });
});

describe('generateIV', () => {
  it('uses the raw salt as the IV source when no block key is provided', async () => {
    const salt = new Uint8Array([0x10, 0x20, 0x30, 0x40]);

    const result = await generateIV('SHA512', salt, undefined, 8);

    expect(Array.from(result)).toEqual([0x10, 0x20, 0x30, 0x40, 0x36, 0x36, 0x36, 0x36]);
  });

  it('hashes salt + blockKey when a block key is provided', async () => {
    const salt = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const blockKey = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);

    const result = await generateIV('SHA512', salt, blockKey, 16);
    const expected = createHash('sha512')
      .update(Buffer.from(salt))
      .update(Buffer.from(blockKey))
      .digest()
      .subarray(0, 16);

    expect(Array.from(result)).toEqual(Array.from(expected));
  });
});
