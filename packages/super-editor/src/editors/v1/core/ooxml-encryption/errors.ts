import { EditorError } from '../errors/EditorErrors.js';

/**
 * Error codes for OOXML encryption failures.
 * Consumers can switch on `error.code` for programmatic handling.
 */
export const DocxEncryptionErrorCode = {
  PASSWORD_REQUIRED: 'DOCX_PASSWORD_REQUIRED',
  PASSWORD_INVALID: 'DOCX_PASSWORD_INVALID',
  ENCRYPTION_UNSUPPORTED: 'DOCX_ENCRYPTION_UNSUPPORTED',
  DECRYPTION_FAILED: 'DOCX_DECRYPTION_FAILED',
} as const;

export type DocxEncryptionErrorCode = (typeof DocxEncryptionErrorCode)[keyof typeof DocxEncryptionErrorCode];

/**
 * Thrown when a DOCX file is encrypted and cannot be processed.
 *
 * Use `error.code` to distinguish between:
 * - `PASSWORD_REQUIRED` — encrypted file, no password supplied
 * - `PASSWORD_INVALID` — password did not match the encrypted verifier
 * - `ENCRYPTION_UNSUPPORTED` — recognized encryption but not Agile (e.g. Standard, RC4)
 * - `DECRYPTION_FAILED` — crypto operation failed (corrupt data, missing streams, etc.)
 */
export class DocxEncryptionError extends EditorError {
  public readonly code: DocxEncryptionErrorCode;
  public readonly cause?: Error;

  constructor(code: DocxEncryptionErrorCode, message: string, cause?: Error) {
    super(message);
    this.name = 'DocxEncryptionError';
    this.code = code;
    this.cause = cause;
  }
}
