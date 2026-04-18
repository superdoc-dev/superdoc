/**
 * Parse an OOXML EncryptionInfo stream into structured parameters.
 *
 * The EncryptionInfo stream layout:
 *   Bytes 0-1: Version (uint16 LE) — 0x0004 for Agile
 *   Bytes 2-3: Reserved (uint16 LE) — 0x0004 for Agile
 *   Bytes 4-7: Flags (uint32 LE) — 0x00000040 for Agile
 *   Bytes 8+:  XML descriptor (Agile only)
 *
 * @see https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-offcrypto/87020a34-e73f-4139-99bc-bbdf6cf6fa55
 */

import { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';

/** Encryption parameters parsed from an Agile EncryptionInfo XML descriptor. */
export interface AgileEncryptionParams {
  /* --- Key data (top-level <keyData> element) --- */
  keySalt: Uint8Array;
  keyBits: number;
  hashAlgorithm: string;
  hashSize: number;
  blockSize: number;
  cipherAlgorithm: string;
  cipherChaining: string;

  /* --- Password key encryptor (<p:encryptedKey>) --- */
  spinCount: number;
  passwordSalt: Uint8Array;
  passwordHashAlgorithm: string;
  passwordKeyBits: number;
  passwordBlockSize: number;
  encryptedVerifierHashInput: Uint8Array;
  encryptedVerifierHashValue: Uint8Array;
  encryptedKeyValue: Uint8Array;

  /* --- Data integrity (<dataIntegrity>) --- */
  encryptedHmacKey: Uint8Array;
  encryptedHmacValue: Uint8Array;
}

export type EncryptionType = 'agile';

export interface ParsedEncryptionInfo {
  type: EncryptionType;
  params: AgileEncryptionParams;
}

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

const AGILE_VERSION = 0x0004;
const AGILE_RESERVED = 0x0004;
const STANDARD_VERSION_3 = 0x0003;
const STANDARD_VERSION_4 = 0x0004;
const STANDARD_RESERVED = 0x0003;
const MIN_HEADER_SIZE = 8;

function readUint16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract all attributes from the first XML element matching a given local name.
 * Works in any JS environment (no DOMParser needed).
 *
 * The Agile EncryptionInfo XML is flat and well-structured — every element we
 * need is a self-closing tag with only attributes:
 *   <keyData saltValue="..." keyBits="256" .../>
 *   <p:encryptedKey spinCount="100000" .../>
 *
 * This regex approach is safe for this specific, spec-defined XML structure.
 */
function extractElementAttrs(xml: string, localName: string): Record<string, string> | null {
  // Match <prefix:localName ...> or <localName ...> (self-closing or not)
  const tagPattern = new RegExp(`<(?:\\w+:)?${localName}\\b([^>]*)/?>`);
  const match = xml.match(tagPattern);
  if (!match) return null;

  const attrs: Record<string, string> = {};
  const attrPattern = /(\w+)="([^"]*)"/g;
  let attrMatch;
  while ((attrMatch = attrPattern.exec(match[1])) !== null) {
    attrs[attrMatch[1]] = attrMatch[2];
  }
  return attrs;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  // Node.js
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function requireAttr(attrs: Record<string, string> | null, name: string, label: string): string {
  const value = attrs?.[name];
  if (value == null) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      `Missing required attribute "${name}" on <${label}>`,
    );
  }
  return value;
}

function requireBase64Attr(attrs: Record<string, string> | null, name: string, label: string): Uint8Array {
  return base64ToBytes(requireAttr(attrs, name, label));
}

function requireIntAttr(attrs: Record<string, string> | null, name: string, label: string): number {
  const value = parseInt(requireAttr(attrs, name, label), 10);
  if (Number.isNaN(value)) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      `Invalid integer for attribute "${name}" on <${label}>`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

function parseAgileXml(xmlBytes: Uint8Array): AgileEncryptionParams {
  const xml = new TextDecoder('utf-8').decode(xmlBytes);

  const keyData = extractElementAttrs(xml, 'keyData');
  const dataIntegrity = extractElementAttrs(xml, 'dataIntegrity');
  const encryptedKey = extractElementAttrs(xml, 'encryptedKey');

  return {
    // Key data
    keySalt: requireBase64Attr(keyData, 'saltValue', 'keyData'),
    keyBits: requireIntAttr(keyData, 'keyBits', 'keyData'),
    hashAlgorithm: requireAttr(keyData, 'hashAlgorithm', 'keyData'),
    hashSize: requireIntAttr(keyData, 'hashSize', 'keyData'),
    blockSize: requireIntAttr(keyData, 'blockSize', 'keyData'),
    cipherAlgorithm: requireAttr(keyData, 'cipherAlgorithm', 'keyData'),
    cipherChaining: requireAttr(keyData, 'cipherChaining', 'keyData'),

    // Password encryptor
    spinCount: requireIntAttr(encryptedKey, 'spinCount', 'encryptedKey'),
    passwordSalt: requireBase64Attr(encryptedKey, 'saltValue', 'encryptedKey'),
    passwordHashAlgorithm: requireAttr(encryptedKey, 'hashAlgorithm', 'encryptedKey'),
    passwordKeyBits: requireIntAttr(encryptedKey, 'keyBits', 'encryptedKey'),
    passwordBlockSize: requireIntAttr(encryptedKey, 'blockSize', 'encryptedKey'),
    encryptedVerifierHashInput: requireBase64Attr(encryptedKey, 'encryptedVerifierHashInput', 'encryptedKey'),
    encryptedVerifierHashValue: requireBase64Attr(encryptedKey, 'encryptedVerifierHashValue', 'encryptedKey'),
    encryptedKeyValue: requireBase64Attr(encryptedKey, 'encryptedKeyValue', 'encryptedKey'),

    // Data integrity
    encryptedHmacKey: requireBase64Attr(dataIntegrity, 'encryptedHmacKey', 'dataIntegrity'),
    encryptedHmacValue: requireBase64Attr(dataIntegrity, 'encryptedHmacValue', 'dataIntegrity'),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the raw EncryptionInfo stream into structured Agile encryption parameters.
 *
 * @param data Raw bytes of the EncryptionInfo stream from the CFB container
 * @throws {DocxEncryptionError} ENCRYPTION_UNSUPPORTED for non-Agile formats
 * @throws {DocxEncryptionError} DECRYPTION_FAILED for malformed/truncated data
 */
export function parseEncryptionInfo(data: Uint8Array): ParsedEncryptionInfo {
  if (data.length < MIN_HEADER_SIZE) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      `EncryptionInfo too short: ${data.length} bytes (minimum ${MIN_HEADER_SIZE})`,
    );
  }

  const version = readUint16LE(data, 0);
  const reserved = readUint16LE(data, 2);

  // Agile: version=4, reserved=4
  if (version === AGILE_VERSION && reserved === AGILE_RESERVED) {
    const xmlBytes = data.subarray(MIN_HEADER_SIZE);
    return { type: 'agile', params: parseAgileXml(xmlBytes) };
  }

  // Standard: version=3 or 4, reserved=3
  if ((version === STANDARD_VERSION_3 || version === STANDARD_VERSION_4) && reserved === STANDARD_RESERVED) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.ENCRYPTION_UNSUPPORTED,
      'Standard Encryption (Office 2007) is not yet supported. Only Agile Encryption (Office 2010+) is supported.',
    );
  }

  // Legacy RC4 (version <= 2)
  if (version <= 0x0002) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.ENCRYPTION_UNSUPPORTED,
      'Legacy RC4 encryption is not supported. Only Agile Encryption (Office 2010+) is supported.',
    );
  }

  throw new DocxEncryptionError(
    DocxEncryptionErrorCode.ENCRYPTION_UNSUPPORTED,
    `Unrecognized EncryptionInfo version=${version} reserved=${reserved}`,
  );
}
