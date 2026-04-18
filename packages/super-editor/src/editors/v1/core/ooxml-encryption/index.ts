/**
 * OOXML encryption support for password-protected .docx files.
 *
 * Supports Agile Encryption (Office 2010+). Standard Encryption (Office 2007)
 * and legacy RC4 are detected and rejected with a clear error message.
 *
 * Usage:
 *   import { decryptDocxIfNeeded, DocxEncryptionError, DocxEncryptionErrorCode } from './ooxml-encryption';
 *
 *   const result = await decryptDocxIfNeeded(fileBytes, { password: 'secret' });
 *   // result.data is a decrypted ZIP ready for JSZip
 *   // result.wasEncrypted indicates whether decryption was performed
 */

export { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';
export { detectContainerType } from './detect-container.js';
export type { ContainerType } from './detect-container.js';
export { decryptDocxIfNeeded } from './decrypt-docx.js';
export type { DecryptDocxOptions, DecryptDocxResult } from './decrypt-docx.js';
