/**
 * High-level orchestrator for OOXML decryption.
 *
 * Detects the file format, extracts encryption metadata, verifies the password,
 * decrypts the package, and validates the output — all in one call.
 *
 * If the input is a normal ZIP, it passes through unchanged.
 */

import { detectContainerType } from './detect-container.js';
import { extractEncryptionStreams } from './ole-reader.js';
import { parseEncryptionInfo } from './parse-encryption-info.js';
import { decryptAgilePackage } from './agile-decryptor.js';
import { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';

export interface DecryptDocxOptions {
  /** Password to decrypt the document. Required for encrypted files. */
  password?: string;
}

export interface DecryptDocxResult {
  /** The file bytes (decrypted ZIP, or the original ZIP if unencrypted). */
  data: Uint8Array;
  /** Whether the file was actually encrypted (and decryption was performed). */
  wasEncrypted: boolean;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Verify the decrypted output starts with ZIP magic bytes.
 * Catches cases where decryption "succeeds" cryptographically but produces garbage.
 */
function validateDecryptedOutput(data: Uint8Array): void {
  if (detectContainerType(data) !== 'zip') {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'Decrypted output is not a valid ZIP archive — the file may be corrupt',
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decrypt a .docx file if it is encrypted, or pass it through if it is not.
 *
 * @param data Raw file bytes (ArrayBuffer, Uint8Array, or Buffer)
 * @param options Decryption options (password)
 * @returns The file bytes and whether decryption was performed
 *
 * @throws {DocxEncryptionError} PASSWORD_REQUIRED — encrypted file, no password supplied
 * @throws {DocxEncryptionError} PASSWORD_INVALID — wrong password
 * @throws {DocxEncryptionError} ENCRYPTION_UNSUPPORTED — recognized but unsupported encryption
 * @throws {DocxEncryptionError} DECRYPTION_FAILED — corrupt data or crypto failure
 */
export async function decryptDocxIfNeeded(
  data: ArrayBuffer | Uint8Array | Buffer,
  options?: DecryptDocxOptions,
): Promise<DecryptDocxResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const containerType = detectContainerType(bytes);

  // Normal ZIP — pass through unchanged
  if (containerType === 'zip') {
    return { data: bytes, wasEncrypted: false };
  }

  // Unknown format — not a ZIP and not a CFB
  if (containerType === 'unknown') {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'Unrecognized file format — expected a .docx (ZIP) or encrypted .docx (OLE/CFB)',
    );
  }

  // CFB container — encrypted document
  if (!options?.password) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.PASSWORD_REQUIRED,
      'This document is password-protected. A password is required to open it.',
    );
  }

  const streams = extractEncryptionStreams(bytes);
  const { params } = parseEncryptionInfo(streams.encryptionInfo);
  const decryptedZip = await decryptAgilePackage(options.password, params, streams.encryptedPackage);

  validateDecryptedOutput(decryptedZip);

  return { data: decryptedZip, wasEncrypted: true };
}
