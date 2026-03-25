/**
 * Agile Encryption key derivation and decryption using the Web Crypto API.
 *
 * Implements the MS-OFFCRYPTO Agile Encryption spec:
 * - Password → key derivation (§2.3.6.2)
 * - Password verification (§2.3.6.4)
 * - Package decryption in 4096-byte segments (§2.3.6.5)
 *
 * Uses SubtleCrypto (available in all modern browsers and Node.js 18+).
 *
 * @see https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-offcrypto/9d9cebee-a465-4c2f-a4df-d9ae83be5d77
 */

import type { AgileEncryptionParams } from './parse-encryption-info.js';
import { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';

// ---------------------------------------------------------------------------
// Block keys defined by the spec (MS-OFFCRYPTO §2.3.6.2, §2.3.6.4)
// ---------------------------------------------------------------------------

const BLOCK_KEY_VERIFIER_INPUT = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
const BLOCK_KEY_VERIFIER_VALUE = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
const BLOCK_KEY_ENCRYPTED_KEY = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);
const BLOCK_KEY_HMAC_KEY = new Uint8Array([0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6]);
const BLOCK_KEY_HMAC_VALUE = new Uint8Array([0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33]);

/** Segment size for Agile EncryptedPackage decryption. */
const SEGMENT_SIZE = 4096;

/** Size of the plaintext-length header at the start of EncryptedPackage. */
const PACKAGE_HEADER_SIZE = 8;

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'Web Crypto API (SubtleCrypto) is not available in this environment',
    );
  }
  return subtle;
}

/** Map OOXML hash names ('SHA512') to Web Crypto names ('SHA-512'). */
function toWebCryptoHash(ooxmlName: string): AlgorithmIdentifier {
  const map: Record<string, string> = {
    SHA1: 'SHA-1',
    'SHA-1': 'SHA-1',
    SHA256: 'SHA-256',
    'SHA-256': 'SHA-256',
    SHA384: 'SHA-384',
    'SHA-384': 'SHA-384',
    SHA512: 'SHA-512',
    'SHA-512': 'SHA-512',
  };
  const mapped = map[ooxmlName];
  if (!mapped) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      `Unsupported hash algorithm: ${ooxmlName}`,
    );
  }
  return mapped;
}

/** Encode a JavaScript string as UTF-16LE bytes (OOXML password encoding). */
function encodeUtf16le(str: string): Uint8Array {
  const buf = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

/** Concatenate multiple Uint8Arrays into one. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Write a 32-bit unsigned integer as 4 bytes little-endian. */
function uint32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}

/** Coerce a Uint8Array to a plain ArrayBuffer so it satisfies the BufferSource type in strict TS. */
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

async function hash(algorithm: AlgorithmIdentifier, data: Uint8Array): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const digest = await subtle.digest(algorithm, toBuffer(data));
  return new Uint8Array(digest);
}

/**
 * Decrypt data using AES-CBC with no automatic padding removal.
 *
 * Web Crypto always enforces PKCS#7 padding on decrypt. The OOXML spec uses
 * raw AES-CBC (zero-padded to the block boundary, no PKCS#7). To bridge the
 * gap we encrypt a synthetic PKCS#7 padding block (16 bytes of 0x10) using
 * the last ciphertext block as IV, then append it. Web Crypto sees valid
 * PKCS#7 at the end and strips it, giving us the raw decrypted bytes which
 * we truncate to the original ciphertext length.
 */
async function decryptAesCbc(keyBytes: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const blockSize = 16;

  const key = await subtle.importKey('raw', toBuffer(keyBytes), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);

  // Build a valid PKCS#7 tail: encrypt a full padding block (0x10 * 16)
  // using the last ciphertext block as the CBC IV so it chains correctly.
  const lastBlock = ciphertext.subarray(ciphertext.length - blockSize);
  const pkcs7Plaintext = new Uint8Array(blockSize);
  pkcs7Plaintext.fill(blockSize);

  const encryptedPadding = new Uint8Array(
    await subtle.encrypt({ name: 'AES-CBC', iv: toBuffer(lastBlock) }, key, pkcs7Plaintext),
  );
  // Web Crypto adds its own PKCS#7 block during encrypt — take only the first block.
  const paddingBlock = encryptedPadding.subarray(0, blockSize);

  // Append the encrypted padding block to the original ciphertext
  const withPadding = new Uint8Array(ciphertext.length + blockSize);
  withPadding.set(ciphertext);
  withPadding.set(paddingBlock, ciphertext.length);

  const decrypted = await subtle.decrypt({ name: 'AES-CBC', iv: toBuffer(iv) }, key, withPadding);
  // Return only the bytes corresponding to the original ciphertext length
  return new Uint8Array(decrypted).subarray(0, ciphertext.length);
}

// ---------------------------------------------------------------------------
// Agile key derivation (MS-OFFCRYPTO §2.3.6.2)
// ---------------------------------------------------------------------------

/**
 * Derive an encryption key from a password using the Agile KDF.
 *
 * Algorithm:
 * 1. H0 = Hash(salt + passwordUtf16le)
 * 2. For i = 0..spinCount-1: Hi = Hash(LE32(i) + H_{i-1})
 * 3. Hderived = Hash(H_last + blockKey)
 * 4. If hashSize < keyBits/8: pad with 0x36 to cbRequiredKeyLength
 *    If hashSize > keyBits/8: truncate
 * 5. Return derived key
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
  spinCount: number,
  keyBits: number,
  hashAlgorithm: string,
  blockKey: Uint8Array,
): Promise<Uint8Array> {
  const algo = toWebCryptoHash(hashAlgorithm);
  const passwordBytes = encodeUtf16le(password);

  // Step 1: H0 = Hash(salt + password)
  let h = await hash(algo, concat(salt, passwordBytes));

  // Step 2: Iterate spinCount times
  for (let i = 0; i < spinCount; i++) {
    h = await hash(algo, concat(uint32LE(i), h));
  }

  // Step 3: Hderived = Hash(H_last + blockKey)
  const hDerived = await hash(algo, concat(h, blockKey));

  // Step 4: Adjust to required key length
  const requiredBytes = keyBits / 8;
  if (hDerived.length >= requiredBytes) {
    return hDerived.subarray(0, requiredBytes);
  }

  // Pad with 0x36 repeating to fill required length
  const padded = new Uint8Array(requiredBytes);
  padded.set(hDerived);
  padded.fill(0x36, hDerived.length);
  return padded;
}

/**
 * Generate the IV for AES-CBC as specified by MS-OFFCRYPTO §2.3.4.12.
 *
 * - If blockKey is provided: IV = Hash(keySalt + blockKey)
 * - If blockKey is omitted:  IV = keySalt
 *
 * The result is then truncated or padded with 0x36 to blockSize bytes.
 */
async function generateIV(
  hashAlgorithm: string,
  salt: Uint8Array,
  blockKey: Uint8Array | undefined,
  blockSize: number,
): Promise<Uint8Array> {
  let ivSource: Uint8Array;
  if (blockKey) {
    const algo = toWebCryptoHash(hashAlgorithm);
    ivSource = await hash(algo, concat(salt, blockKey));
  } else {
    ivSource = salt;
  }

  if (ivSource.length >= blockSize) return ivSource.subarray(0, blockSize);

  const padded = new Uint8Array(blockSize);
  padded.set(ivSource);
  padded.fill(0x36, ivSource.length);
  return padded;
}

// ---------------------------------------------------------------------------
// Password verification (MS-OFFCRYPTO §2.3.6.4)
// ---------------------------------------------------------------------------

/**
 * Verify the password against the encrypted verifier, then return the
 * decrypted document encryption key.
 *
 * @returns The decrypted encryption key for the package
 * @throws {DocxEncryptionError} PASSWORD_INVALID if verification fails
 */
async function verifyPasswordAndGetKey(password: string, params: AgileEncryptionParams): Promise<Uint8Array> {
  const { passwordSalt, spinCount, passwordHashAlgorithm, passwordKeyBits, passwordBlockSize } = params;

  // Derive the three keys from the password
  const keyVerifierInput = await deriveKey(
    password,
    passwordSalt,
    spinCount,
    passwordKeyBits,
    passwordHashAlgorithm,
    BLOCK_KEY_VERIFIER_INPUT,
  );
  const keyVerifierValue = await deriveKey(
    password,
    passwordSalt,
    spinCount,
    passwordKeyBits,
    passwordHashAlgorithm,
    BLOCK_KEY_VERIFIER_VALUE,
  );
  const keyEncryptedKey = await deriveKey(
    password,
    passwordSalt,
    spinCount,
    passwordKeyBits,
    passwordHashAlgorithm,
    BLOCK_KEY_ENCRYPTED_KEY,
  );

  // Agile password verification uses the raw password salt as the IV source
  // for all three encrypted password-verifier values.
  const passwordVerifierIv = await generateIV(passwordHashAlgorithm, passwordSalt, undefined, passwordBlockSize);

  // Decrypt the verifier hash input
  const verifierHashInput = await decryptAesCbc(
    keyVerifierInput,
    passwordVerifierIv,
    params.encryptedVerifierHashInput,
  );

  // Decrypt the verifier hash value
  const verifierHashValue = await decryptAesCbc(
    keyVerifierValue,
    passwordVerifierIv,
    params.encryptedVerifierHashValue,
  );

  // Compute the hash of the decrypted verifier input
  const algo = toWebCryptoHash(passwordHashAlgorithm);
  const computedHash = await hash(algo, verifierHashInput);

  // Compare: the decrypted verifier hash value (truncated to hash size) must match
  const expectedHash = verifierHashValue.subarray(0, computedHash.length);
  if (!constantTimeEqual(computedHash, expectedHash)) {
    throw new DocxEncryptionError(DocxEncryptionErrorCode.PASSWORD_INVALID, 'The password is incorrect');
  }

  // Password verified — decrypt the actual document encryption key
  return decryptAesCbc(keyEncryptedKey, passwordVerifierIv, params.encryptedKeyValue);
}

/** Constant-time comparison to avoid timing attacks on password verification. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Package decryption (MS-OFFCRYPTO §2.3.6.5)
// ---------------------------------------------------------------------------

/**
 * Decrypt the EncryptedPackage stream in 4096-byte segments.
 *
 * Each segment uses an IV derived from: Hash(keySalt + LE32(segmentIndex)),
 * truncated to blockSize.
 */
async function decryptPackageSegments(
  encryptionKey: Uint8Array,
  params: AgileEncryptionParams,
  encryptedPackage: Uint8Array,
): Promise<Uint8Array> {
  const { keySalt, hashAlgorithm, blockSize } = params;
  const algo = toWebCryptoHash(hashAlgorithm);

  // First 8 bytes: original plaintext size (uint64 LE, but we only read low 32 bits — files > 4GB are impractical)
  if (encryptedPackage.length < PACKAGE_HEADER_SIZE) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'EncryptedPackage too short to contain size header',
    );
  }

  const plaintextSize =
    encryptedPackage[0] |
    (encryptedPackage[1] << 8) |
    (encryptedPackage[2] << 16) |
    ((encryptedPackage[3] << 24) >>> 0);

  const encryptedData = encryptedPackage.subarray(PACKAGE_HEADER_SIZE);
  const segmentCount = Math.ceil(encryptedData.length / SEGMENT_SIZE);
  const decryptedChunks: Uint8Array[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const segmentStart = i * SEGMENT_SIZE;
    const segmentEnd = Math.min(segmentStart + SEGMENT_SIZE, encryptedData.length);
    const segment = encryptedData.subarray(segmentStart, segmentEnd);

    // IV = Hash(keySalt + LE32(segmentIndex)), truncated/padded to blockSize
    const ivHash = await hash(algo, concat(keySalt, uint32LE(i)));
    const iv = ivHash.length >= blockSize ? ivHash.subarray(0, blockSize) : ivHash;

    const decrypted = await decryptAesCbc(encryptionKey, iv, segment);
    decryptedChunks.push(decrypted);
  }

  // Concatenate and trim to original plaintext size
  const fullDecrypted = concat(...decryptedChunks);
  return fullDecrypted.subarray(0, plaintextSize);
}

// ---------------------------------------------------------------------------
// Data integrity verification (MS-OFFCRYPTO §2.3.6.4)
// ---------------------------------------------------------------------------

/**
 * Verify the HMAC of the encrypted package to detect tampering or corruption.
 *
 * Per MS-OFFCRYPTO §2.3.6.3, the HMAC is computed over the **encrypted** form
 * of the EncryptedPackage stream (from StreamDescriptor through the end of
 * StreamData — i.e. the entire EncryptedPackage byte sequence).
 *
 * 1. Decrypt the HMAC key using the document encryption key + BLOCK_KEY_HMAC_KEY
 * 2. Decrypt the expected HMAC value using encryption key + BLOCK_KEY_HMAC_VALUE
 * 3. Compute HMAC of the *encrypted* package bytes with the decrypted HMAC key
 * 4. Compare computed HMAC against expected HMAC
 */
async function verifyDataIntegrity(
  encryptionKey: Uint8Array,
  params: AgileEncryptionParams,
  encryptedPackage: Uint8Array,
): Promise<void> {
  const { keySalt, hashAlgorithm, blockSize, hashSize } = params;
  const algo = toWebCryptoHash(hashAlgorithm);
  const subtle = getSubtleCrypto();

  // Decrypt the HMAC key
  const ivHmacKey = await generateIV(hashAlgorithm, keySalt, BLOCK_KEY_HMAC_KEY, blockSize);
  const hmacKeyRaw = await decryptAesCbc(encryptionKey, ivHmacKey, params.encryptedHmacKey);
  const hmacKey = hmacKeyRaw.subarray(0, hashSize);

  // Decrypt the expected HMAC value
  const ivHmacValue = await generateIV(hashAlgorithm, keySalt, BLOCK_KEY_HMAC_VALUE, blockSize);
  const expectedHmac = await decryptAesCbc(encryptionKey, ivHmacValue, params.encryptedHmacValue);

  // Compute HMAC of the encrypted package (per spec §2.3.6.3)
  const cryptoKey = await subtle.importKey('raw', toBuffer(hmacKey), { name: 'HMAC', hash: algo }, false, ['sign']);
  const computedHmac = new Uint8Array(await subtle.sign('HMAC', cryptoKey, toBuffer(encryptedPackage)));

  // Compare (truncate expected to hash size in case of padding from AES block alignment)
  const expected = expectedHmac.subarray(0, computedHmac.length);
  if (!constantTimeEqual(computedHmac, expected)) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'Data integrity check failed — the encrypted package may be corrupt or tampered with',
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a password and decrypt an OOXML Agile-encrypted package.
 *
 * @param password User-supplied password
 * @param params Parsed AgileEncryptionParams from the EncryptionInfo stream
 * @param encryptedPackage Raw bytes of the EncryptedPackage stream
 * @returns Decrypted ZIP archive bytes (ready for JSZip)
 * @throws {DocxEncryptionError} PASSWORD_INVALID if the password is wrong
 * @throws {DocxEncryptionError} DECRYPTION_FAILED on crypto errors or integrity failure
 */
export async function decryptAgilePackage(
  password: string,
  params: AgileEncryptionParams,
  encryptedPackage: Uint8Array,
): Promise<Uint8Array> {
  try {
    const encryptionKey = await verifyPasswordAndGetKey(password, params);
    await verifyDataIntegrity(encryptionKey, params, encryptedPackage);
    return await decryptPackageSegments(encryptionKey, params, encryptedPackage);
  } catch (err) {
    if (err instanceof DocxEncryptionError) throw err;
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'Decryption failed unexpectedly',
      err instanceof Error ? err : undefined,
    );
  }
}

// ---------------------------------------------------------------------------
// Exported for testing only
// ---------------------------------------------------------------------------

export const _testHelpers = {
  encodeUtf16le,
  deriveKey,
  constantTimeEqual,
  generateIV,
};
