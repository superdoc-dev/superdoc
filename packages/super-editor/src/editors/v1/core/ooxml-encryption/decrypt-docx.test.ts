import { describe, it, expect } from 'vitest';
import { decryptDocxIfNeeded } from './decrypt-docx.js';
import { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';

describe('decryptDocxIfNeeded', () => {
  it('passes through a normal ZIP file unchanged', async () => {
    // Minimal valid-looking ZIP (just the magic bytes + padding)
    const zipBytes = new Uint8Array(64);
    zipBytes[0] = 0x50; // P
    zipBytes[1] = 0x4b; // K
    zipBytes[2] = 0x03;
    zipBytes[3] = 0x04;

    const result = await decryptDocxIfNeeded(zipBytes);

    expect(result.wasEncrypted).toBe(false);
    expect(result.data[0]).toBe(0x50);
    expect(result.data[1]).toBe(0x4b);
  });

  it('throws DECRYPTION_FAILED for unrecognized file format', async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

    try {
      await decryptDocxIfNeeded(garbage);
      expect.fail('Expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.DECRYPTION_FAILED);
      expect((err as DocxEncryptionError).message).toContain('Unrecognized');
    }
  });

  it('accepts ArrayBuffer input', async () => {
    const buf = new ArrayBuffer(64);
    const view = new Uint8Array(buf);
    view[0] = 0x50;
    view[1] = 0x4b;
    view[2] = 0x03;
    view[3] = 0x04;

    const result = await decryptDocxIfNeeded(buf);
    expect(result.wasEncrypted).toBe(false);
  });

  it('throws PASSWORD_REQUIRED for a CFB container without password', async () => {
    // Build a minimal CFB-like buffer. The CFB magic is detected, then
    // the password check fires before any actual CFB parsing.
    // We need actual CFB bytes for the detection to work.
    const cfbMagic = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    // Pad to reasonable size (real CFB needs more, but detection happens on magic bytes)
    const data = new Uint8Array(512);
    data.set(cfbMagic);

    try {
      await decryptDocxIfNeeded(data);
      expect.fail('Expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.PASSWORD_REQUIRED);
    }
  });
});
