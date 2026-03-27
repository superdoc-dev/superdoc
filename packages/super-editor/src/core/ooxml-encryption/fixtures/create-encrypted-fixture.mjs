/* global TextEncoder */

/**
 * Generate a password-encrypted .docx test fixture.
 *
 * Creates a minimal .docx ZIP (containing [Content_Types].xml and word/document.xml),
 * encrypts it using the MS-OFFCRYPTO Agile Encryption spec (Office 2010+), and wraps
 * the result in a CFB/OLE container with EncryptionInfo and EncryptedPackage streams.
 *
 * Encryption parameters:
 *   - Cipher: AES-256-CBC
 *   - Hash: SHA-512
 *   - Spin count: 100000
 *   - Password: "test123"
 *
 * Usage:
 *   node packages/super-editor/src/core/ooxml-encryption/fixtures/create-encrypted-fixture.mjs
 *
 * @see https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-offcrypto/
 */

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCfbContainer } from '../cfb-builder.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PASSWORD = 'test123';

// ---------------------------------------------------------------------------
// Encryption parameters (matching Office 2010+ Agile defaults)
// ---------------------------------------------------------------------------

const HASH_ALGORITHM = 'SHA-512';
const CIPHER_ALGORITHM = 'AES';
const CIPHER_CHAINING = 'ChainingModeCBC';
const KEY_BITS = 256;
const HASH_SIZE = 64; // SHA-512 = 64 bytes
const BLOCK_SIZE = 16; // AES block size
const SPIN_COUNT = 100000;
const SEGMENT_SIZE = 4096;

// Block keys from MS-OFFCRYPTO §2.3.6.2, §2.3.6.4
const BLOCK_KEY_VERIFIER_INPUT = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
const BLOCK_KEY_VERIFIER_VALUE = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
const BLOCK_KEY_ENCRYPTED_KEY = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);
const BLOCK_KEY_DATA_INTEGRITY_1 = new Uint8Array([0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6]);
const BLOCK_KEY_DATA_INTEGRITY_2 = new Uint8Array([0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33]);

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

const subtle = globalThis.crypto.subtle;

function concat(...arrays) {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function uint32LE(value) {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}

function uint64LE(value) {
  const buf = new Uint8Array(8);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  // high 32 bits are 0 for any reasonable file size
  return buf;
}

function encodeUtf16le(str) {
  const buf = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

function randomBytes(n) {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

async function hash(data) {
  const digest = await subtle.digest(HASH_ALGORITHM, data);
  return new Uint8Array(digest);
}

/**
 * Encrypt data using AES-CBC with zero-padding to block boundary.
 * OOXML uses raw AES-CBC without PKCS#7 — the plaintext is pre-padded to
 * a multiple of the block size with zeros.
 *
 * Web Crypto always applies PKCS#7, so we manually pad to a block boundary
 * with zeros, encrypt, and then strip the final block that Web Crypto adds.
 */
async function encryptAesCbc(keyBytes, iv, plaintext) {
  // Pad plaintext to block boundary with zeros
  const paddedLen = Math.ceil(plaintext.length / BLOCK_SIZE) * BLOCK_SIZE;
  const padded = new Uint8Array(paddedLen);
  padded.set(plaintext);

  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = await subtle.encrypt({ name: 'AES-CBC', iv }, key, padded);

  // Web Crypto appends a PKCS#7 padding block — strip it to get raw AES-CBC output
  return new Uint8Array(encrypted).subarray(0, paddedLen);
}

// ---------------------------------------------------------------------------
// Agile key derivation (MS-OFFCRYPTO §2.3.6.2) — same as decryptor
// ---------------------------------------------------------------------------

async function deriveKey(password, salt, spinCount, keyBits, blockKey) {
  const passwordBytes = encodeUtf16le(password);

  // Step 1: H0 = Hash(salt + password)
  let h = await hash(concat(salt, passwordBytes));

  // Step 2: Iterate spinCount times
  for (let i = 0; i < spinCount; i++) {
    h = await hash(concat(uint32LE(i), h));
  }

  // Step 3: Hderived = Hash(H_last + blockKey)
  const hDerived = await hash(concat(h, blockKey));

  // Step 4: Adjust to required key length
  const requiredBytes = keyBits / 8;
  if (hDerived.length >= requiredBytes) {
    return hDerived.subarray(0, requiredBytes);
  }

  const result = new Uint8Array(requiredBytes);
  result.set(hDerived);
  result.fill(0x36, hDerived.length);
  return result;
}

/**
 * Generate the IV for AES-CBC as specified by MS-OFFCRYPTO §2.3.4.12.
 *
 * - If blockKey is provided: IV = Hash(keySalt + blockKey)
 * - If blockKey is omitted:  IV = keySalt
 */
async function generateIV(salt, blockKey) {
  const ivSource = blockKey ? await hash(concat(salt, blockKey)) : salt;
  if (ivSource.length >= BLOCK_SIZE) return ivSource.subarray(0, BLOCK_SIZE);
  const padded = new Uint8Array(BLOCK_SIZE);
  padded.set(ivSource);
  padded.fill(0x36, ivSource.length);
  return padded;
}

// ---------------------------------------------------------------------------
// Create the encrypted verifier and key values (MS-OFFCRYPTO §2.3.6.4)
// ---------------------------------------------------------------------------

async function createPasswordVerifier(password, passwordSalt, encryptionKey) {
  // Generate random verifier input (hash size = 64 bytes for SHA-512)
  const verifierHashInput = randomBytes(HASH_SIZE);

  // Compute hash of verifier input
  const verifierHashValue = await hash(verifierHashInput);

  // Derive the three password keys
  const keyVerifierInput = await deriveKey(password, passwordSalt, SPIN_COUNT, KEY_BITS, BLOCK_KEY_VERIFIER_INPUT);
  const keyVerifierValue = await deriveKey(password, passwordSalt, SPIN_COUNT, KEY_BITS, BLOCK_KEY_VERIFIER_VALUE);
  const keyEncryptedKey = await deriveKey(password, passwordSalt, SPIN_COUNT, KEY_BITS, BLOCK_KEY_ENCRYPTED_KEY);

  // Agile password verification uses the raw password salt as the IV source
  // for all three encrypted password-verifier values.
  const passwordVerifierIv = await generateIV(passwordSalt);

  // Encrypt them
  const encryptedVerifierHashInput = await encryptAesCbc(keyVerifierInput, passwordVerifierIv, verifierHashInput);
  const encryptedVerifierHashValue = await encryptAesCbc(keyVerifierValue, passwordVerifierIv, verifierHashValue);
  const encryptedKeyValue = await encryptAesCbc(keyEncryptedKey, passwordVerifierIv, encryptionKey);

  return {
    encryptedVerifierHashInput,
    encryptedVerifierHashValue,
    encryptedKeyValue,
  };
}

// ---------------------------------------------------------------------------
// Encrypt the package in 4096-byte segments (MS-OFFCRYPTO §2.3.6.5)
// ---------------------------------------------------------------------------

async function encryptPackage(encryptionKey, keySalt, plaintext) {
  const segmentCount = Math.ceil(plaintext.length / SEGMENT_SIZE);
  const encryptedChunks = [];

  for (let i = 0; i < segmentCount; i++) {
    const segmentStart = i * SEGMENT_SIZE;
    const segmentEnd = Math.min(segmentStart + SEGMENT_SIZE, plaintext.length);
    const segment = plaintext.subarray(segmentStart, segmentEnd);

    // IV = Hash(keySalt + LE32(segmentIndex)), truncated to blockSize
    const ivHash = await hash(concat(keySalt, uint32LE(i)));
    const iv = ivHash.subarray(0, BLOCK_SIZE);

    const encrypted = await encryptAesCbc(encryptionKey, iv, segment);
    encryptedChunks.push(encrypted);
  }

  const encryptedData = concat(...encryptedChunks);

  // Prepend the 8-byte plaintext size header
  return concat(uint64LE(plaintext.length), encryptedData);
}

// ---------------------------------------------------------------------------
// Data integrity (MS-OFFCRYPTO §2.3.6.3)
// ---------------------------------------------------------------------------

async function createDataIntegrity(encryptionKey, keySalt, encryptedPackage) {
  // Per MS-OFFCRYPTO §2.3.6.3, the HMAC key and value are encrypted using
  // the document encryption key (secretKey), NOT a password-derived key.
  // IVs are derived from keyData.saltValue + blockKey.

  // Generate a random HMAC key
  const hmacKeyRandom = randomBytes(HASH_SIZE);

  // Encrypt the HMAC key with the document encryption key
  const ivHmacKey = await generateIV(keySalt, BLOCK_KEY_DATA_INTEGRITY_1);
  const encryptedHmacKey = await encryptAesCbc(encryptionKey, ivHmacKey, hmacKeyRandom);

  // Import the HMAC key for signing
  const hmacKey = await subtle.importKey(
    'raw',
    hmacKeyRandom,
    { name: 'HMAC', hash: HASH_ALGORITHM },
    false,
    ['sign'],
  );

  // HMAC over the encrypted package (per spec §2.3.6.3)
  const hmacValue = new Uint8Array(await subtle.sign('HMAC', hmacKey, encryptedPackage));

  // Encrypt the HMAC value with the document encryption key
  const ivHmacValue = await generateIV(keySalt, BLOCK_KEY_DATA_INTEGRITY_2);
  const encryptedHmacValue = await encryptAesCbc(encryptionKey, ivHmacValue, hmacValue);

  return { encryptedHmacKey, encryptedHmacValue };
}

// ---------------------------------------------------------------------------
// Build the EncryptionInfo XML
// ---------------------------------------------------------------------------

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function buildEncryptionInfoXml({
  keySalt,
  passwordSalt,
  encryptedVerifierHashInput,
  encryptedVerifierHashValue,
  encryptedKeyValue,
  encryptedHmacKey,
  encryptedHmacValue,
}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" ` +
    `xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password" ` +
    `xmlns:c="http://schemas.microsoft.com/office/2006/keyEncryptor/certificate">\r\n` +
    `  <keyData saltSize="16" blockSize="${BLOCK_SIZE}" keyBits="${KEY_BITS}" ` +
    `hashSize="${HASH_SIZE}" cipherAlgorithm="${CIPHER_ALGORITHM}" ` +
    `cipherChaining="${CIPHER_CHAINING}" hashAlgorithm="${HASH_ALGORITHM}" ` +
    `saltValue="${toBase64(keySalt)}"/>\r\n` +
    `  <dataIntegrity encryptedHmacKey="${toBase64(encryptedHmacKey)}" ` +
    `encryptedHmacValue="${toBase64(encryptedHmacValue)}"/>\r\n` +
    `  <keyEncryptors>\r\n` +
    `    <keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password">\r\n` +
    `      <p:encryptedKey spinCount="${SPIN_COUNT}" saltSize="16" ` +
    `blockSize="${BLOCK_SIZE}" keyBits="${KEY_BITS}" hashSize="${HASH_SIZE}" ` +
    `cipherAlgorithm="${CIPHER_ALGORITHM}" cipherChaining="${CIPHER_CHAINING}" ` +
    `hashAlgorithm="${HASH_ALGORITHM}" saltValue="${toBase64(passwordSalt)}" ` +
    `encryptedVerifierHashInput="${toBase64(encryptedVerifierHashInput)}" ` +
    `encryptedVerifierHashValue="${toBase64(encryptedVerifierHashValue)}" ` +
    `encryptedKeyValue="${toBase64(encryptedKeyValue)}"/>\r\n` +
    `    </keyEncryptor>\r\n` +
    `  </keyEncryptors>\r\n` +
    `</encryption>`;
}

// ---------------------------------------------------------------------------
// Build the EncryptionInfo stream (header + XML)
// ---------------------------------------------------------------------------

function buildEncryptionInfoStream(xml) {
  const xmlBytes = new TextEncoder().encode(xml);
  // Header: Version=4, Reserved=4, Flags=0x00000040 (Agile)
  const header = new Uint8Array(8);
  header[0] = 0x04; header[1] = 0x00; // Version = 4
  header[2] = 0x04; header[3] = 0x00; // Reserved = 4
  header[4] = 0x40; header[5] = 0x00; header[6] = 0x00; header[7] = 0x00; // Flags = 0x40
  return concat(header, xmlBytes);
}

// ---------------------------------------------------------------------------
// Create a minimal .docx ZIP
// ---------------------------------------------------------------------------

async function createMinimalDocx() {
  const zip = new JSZip();

  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            mc:Ignorable="w14 wp14">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello, encrypted world!</w:t>
      </w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`);

  zip.file('word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Creating minimal .docx ZIP...');
  const docxZip = await createMinimalDocx();
  console.log(`  ZIP size: ${docxZip.length} bytes`);

  // Generate random salts
  const keySalt = randomBytes(16);
  const passwordSalt = randomBytes(16);

  // Generate a random document encryption key
  const encryptionKey = randomBytes(KEY_BITS / 8);

  console.log('Deriving password keys (spinCount=100000, this may take a moment)...');

  // Create the password verifier values
  const verifier = await createPasswordVerifier(PASSWORD, passwordSalt, encryptionKey);

  console.log('Encrypting package...');

  // Encrypt the docx ZIP
  const encryptedPackage = await encryptPackage(encryptionKey, keySalt, docxZip);
  console.log(`  Encrypted package size: ${encryptedPackage.length} bytes`);

  // Create data integrity values
  const dataIntegrity = await createDataIntegrity(encryptionKey, keySalt, encryptedPackage);

  // Build the EncryptionInfo XML and stream
  const xml = buildEncryptionInfoXml({
    keySalt,
    passwordSalt,
    encryptedVerifierHashInput: verifier.encryptedVerifierHashInput,
    encryptedVerifierHashValue: verifier.encryptedVerifierHashValue,
    encryptedKeyValue: verifier.encryptedKeyValue,
    encryptedHmacKey: dataIntegrity.encryptedHmacKey,
    encryptedHmacValue: dataIntegrity.encryptedHmacValue,
  });

  const encryptionInfoStream = buildEncryptionInfoStream(xml);
  console.log(`  EncryptionInfo stream size: ${encryptionInfoStream.length} bytes`);

  // Build the CFB container
  console.log('Writing CFB container...');
  const cfbBytes = Buffer.from(buildCfbContainer({
    '/EncryptionInfo': encryptionInfoStream,
    '/EncryptedPackage': encryptedPackage,
  }));

  const outPath = join(__dirname, 'encrypted-hello.docx');
  writeFileSync(outPath, cfbBytes);
  console.log(`\nWritten: ${outPath}`);
  console.log(`  File size: ${cfbBytes.length} bytes`);
  console.log(`  Password: "${PASSWORD}"`);

  // Verify the output starts with CFB magic
  if (cfbBytes[0] === 0xd0 && cfbBytes[1] === 0xcf) {
    console.log('  ✓ CFB magic bytes confirmed');
  } else {
    console.error('  ✗ CFB magic bytes NOT found!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
