import { describe, it, expect } from 'vitest';
import { parseEncryptionInfo } from './parse-encryption-info.js';
import { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';

/** Build a minimal EncryptionInfo header with version/reserved bytes. */
function buildHeader(version: number, reserved: number): Uint8Array {
  const header = new Uint8Array(8);
  header[0] = version & 0xff;
  header[1] = (version >> 8) & 0xff;
  header[2] = reserved & 0xff;
  header[3] = (reserved >> 8) & 0xff;
  // Flags at offset 4 (uint32 LE) — 0x40 for Agile
  header[4] = 0x40;
  return header;
}

/** Build a complete Agile EncryptionInfo blob with valid XML. */
function buildAgileEncryptionInfo(): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption"
            xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password">
  <keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64"
           cipherAlgorithm="AES" cipherChaining="ChainingModeCBC"
           hashAlgorithm="SHA512" saltValue="AAAAAAAAAAAAAAAAAAAAAA=="/>
  <dataIntegrity encryptedHmacKey="AAAAAAAAAAAAAAAAAAAAAA=="
                 encryptedHmacValue="AAAAAAAAAAAAAAAAAAAAAA=="/>
  <keyEncryptors>
    <keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password">
      <p:encryptedKey spinCount="100000" saltSize="16" blockSize="16"
                      keyBits="256" hashSize="64"
                      cipherAlgorithm="AES" cipherChaining="ChainingModeCBC"
                      hashAlgorithm="SHA512" saltValue="BBBBBBBBBBBBBBBBBBBBBB=="
                      encryptedVerifierHashInput="CCCCCCCCCCCCCCCCCCCCCC=="
                      encryptedVerifierHashValue="DDDDDDDDDDDDDDDDDDDDDD=="
                      encryptedKeyValue="EEEEEEEEEEEEEEEEEEEEEE=="/>
    </keyEncryptor>
  </keyEncryptors>
</encryption>`;

  const xmlBytes = new TextEncoder().encode(xml);
  const header = buildHeader(0x0004, 0x0004);
  const result = new Uint8Array(header.length + xmlBytes.length);
  result.set(header);
  result.set(xmlBytes, header.length);
  return result;
}

describe('parseEncryptionInfo', () => {
  it('parses valid Agile EncryptionInfo', () => {
    const data = buildAgileEncryptionInfo();
    const result = parseEncryptionInfo(data);

    expect(result.type).toBe('agile');
    expect(result.params.keyBits).toBe(256);
    expect(result.params.hashAlgorithm).toBe('SHA512');
    expect(result.params.cipherAlgorithm).toBe('AES');
    expect(result.params.spinCount).toBe(100000);
    expect(result.params.passwordKeyBits).toBe(256);
    expect(result.params.blockSize).toBe(16);
    expect(result.params.keySalt).toBeInstanceOf(Uint8Array);
    expect(result.params.passwordSalt).toBeInstanceOf(Uint8Array);
    expect(result.params.encryptedVerifierHashInput).toBeInstanceOf(Uint8Array);
    expect(result.params.encryptedVerifierHashValue).toBeInstanceOf(Uint8Array);
    expect(result.params.encryptedKeyValue).toBeInstanceOf(Uint8Array);
    expect(result.params.encryptedHmacKey).toBeInstanceOf(Uint8Array);
    expect(result.params.encryptedHmacValue).toBeInstanceOf(Uint8Array);
  });

  it('throws ENCRYPTION_UNSUPPORTED for Standard Encryption (version=3, reserved=3)', () => {
    const data = buildHeader(0x0003, 0x0003);
    try {
      parseEncryptionInfo(data);
      expect.fail('Expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.ENCRYPTION_UNSUPPORTED);
      expect((err as DocxEncryptionError).message).toContain('Standard Encryption');
    }
  });

  it('throws ENCRYPTION_UNSUPPORTED for Standard Encryption (version=4, reserved=3)', () => {
    const data = buildHeader(0x0004, 0x0003);
    try {
      parseEncryptionInfo(data);
      expect.fail('Expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.ENCRYPTION_UNSUPPORTED);
    }
  });

  it('throws ENCRYPTION_UNSUPPORTED for legacy RC4 (version <= 2)', () => {
    const data = buildHeader(0x0002, 0x0002);
    try {
      parseEncryptionInfo(data);
      expect.fail('Expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.ENCRYPTION_UNSUPPORTED);
      expect((err as DocxEncryptionError).message).toContain('RC4');
    }
  });

  it('throws DECRYPTION_FAILED for truncated data', () => {
    const data = new Uint8Array([0x04, 0x00]);
    try {
      parseEncryptionInfo(data);
      expect.fail('Expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.DECRYPTION_FAILED);
      expect((err as DocxEncryptionError).message).toContain('too short');
    }
  });

  it('throws ENCRYPTION_UNSUPPORTED for unrecognized version', () => {
    const data = buildHeader(0x0099, 0x0099);
    try {
      parseEncryptionInfo(data);
      expect.fail('Expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxEncryptionError);
      expect((err as DocxEncryptionError).code).toBe(DocxEncryptionErrorCode.ENCRYPTION_UNSUPPORTED);
    }
  });
});
