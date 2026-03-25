import { describe, it, expect } from 'vitest';
import { buildCfbContainer } from './cfb-builder.js';
import { extractEncryptionStreams } from './ole-reader.js';
import { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';

describe('extractEncryptionStreams', () => {
  const fakeEncryptionInfo = new Uint8Array([0x04, 0x00, 0x04, 0x00, 0x40, 0x00, 0x00, 0x00]);
  const fakeEncryptedPackage = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

  it('extracts both streams from a valid CFB container', () => {
    const cfbBytes = buildCfbContainer({
      '/EncryptionInfo': fakeEncryptionInfo,
      '/EncryptedPackage': fakeEncryptedPackage,
    });

    const streams = extractEncryptionStreams(cfbBytes);

    expect(streams.encryptionInfo).toBeInstanceOf(Uint8Array);
    expect(streams.encryptedPackage).toBeInstanceOf(Uint8Array);
    // Content should match what we put in
    expect(Array.from(streams.encryptionInfo)).toEqual(Array.from(fakeEncryptionInfo));
    expect(Array.from(streams.encryptedPackage)).toEqual(Array.from(fakeEncryptedPackage));
  });

  it('extracts a mixed mini-stream and FAT-stream container', () => {
    const largeEncryptedPackage = new Uint8Array(5000);
    for (let index = 0; index < largeEncryptedPackage.length; index++) {
      largeEncryptedPackage[index] = index % 251;
    }

    const cfbBytes = buildCfbContainer({
      '/EncryptionInfo': fakeEncryptionInfo,
      '/EncryptedPackage': largeEncryptedPackage,
    });

    const streams = extractEncryptionStreams(cfbBytes);

    expect(Array.from(streams.encryptionInfo)).toEqual(Array.from(fakeEncryptionInfo));
    expect(Array.from(streams.encryptedPackage)).toEqual(Array.from(largeEncryptedPackage));
  });

  it('throws DECRYPTION_FAILED when EncryptionInfo is missing', () => {
    const cfbBytes = buildCfbContainer({
      '/EncryptedPackage': fakeEncryptedPackage,
    });

    expect(() => extractEncryptionStreams(cfbBytes)).toThrow(DocxEncryptionError);
    try {
      extractEncryptionStreams(cfbBytes);
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.DECRYPTION_FAILED);
      expect((err as DocxEncryptionError).message).toContain('EncryptionInfo');
    }
  });

  it('throws DECRYPTION_FAILED when EncryptedPackage is missing', () => {
    const cfbBytes = buildCfbContainer({
      '/EncryptionInfo': fakeEncryptionInfo,
    });

    expect(() => extractEncryptionStreams(cfbBytes)).toThrow(DocxEncryptionError);
    try {
      extractEncryptionStreams(cfbBytes);
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.DECRYPTION_FAILED);
      expect((err as DocxEncryptionError).message).toContain('EncryptedPackage');
    }
  });

  it('throws DECRYPTION_FAILED for garbage data', () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

    expect(() => extractEncryptionStreams(garbage)).toThrow(DocxEncryptionError);
    try {
      extractEncryptionStreams(garbage);
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.DECRYPTION_FAILED);
    }
  });
});
