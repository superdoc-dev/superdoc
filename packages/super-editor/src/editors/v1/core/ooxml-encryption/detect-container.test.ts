import { describe, it, expect } from 'vitest';
import { detectContainerType } from './detect-container.js';

describe('detectContainerType', () => {
  it('detects a ZIP archive from magic bytes', () => {
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    expect(detectContainerType(zipHeader)).toBe('zip');
  });

  it('detects a CFB container from magic bytes', () => {
    const cfbHeader = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(detectContainerType(cfbHeader)).toBe('cfb');
  });

  it('returns "unknown" for random bytes', () => {
    const random = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    expect(detectContainerType(random)).toBe('unknown');
  });

  it('returns "unknown" for an empty buffer', () => {
    expect(detectContainerType(new Uint8Array(0))).toBe('unknown');
  });

  it('returns "unknown" for a buffer shorter than the magic length', () => {
    expect(detectContainerType(new Uint8Array([0x50, 0x4b]))).toBe('unknown');
  });

  it('works with an ArrayBuffer input', () => {
    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    view.set([0x50, 0x4b, 0x03, 0x04]);
    expect(detectContainerType(buf)).toBe('zip');
  });

  it('detects ZIP even with trailing data', () => {
    const data = new Uint8Array(1024);
    data[0] = 0x50;
    data[1] = 0x4b;
    data[2] = 0x03;
    data[3] = 0x04;
    expect(detectContainerType(data)).toBe('zip');
  });

  it('does not false-positive on partial CFB magic', () => {
    // Only first 4 bytes of CFB magic
    const partial = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00, 0x00, 0x00]);
    expect(detectContainerType(partial)).toBe('unknown');
  });
});
