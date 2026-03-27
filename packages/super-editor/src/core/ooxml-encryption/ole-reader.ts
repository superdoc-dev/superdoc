/**
 * Extract EncryptionInfo and EncryptedPackage streams from an OLE/CFB container.
 *
 * This stays intentionally narrow. Password-protected OOXML documents only
 * need two root-level streams from the compound file:
 * - /EncryptionInfo
 * - /EncryptedPackage
 *
 * Keeping the reader focused on those streams avoids carrying a larger
 * general-purpose CFB dependency through both the browser and Node bundles.
 */

import { createCfbReader } from './cfb-reader.js';
import { DocxEncryptionError, DocxEncryptionErrorCode } from './errors.js';

export interface OleEncryptionStreams {
  encryptionInfo: Uint8Array;
  encryptedPackage: Uint8Array;
}

/**
 * Parse a CFB container and extract the encryption streams.
 *
 * @param data Raw bytes of the OLE/CFB file
 * @returns The EncryptionInfo and EncryptedPackage stream contents
 * @throws {DocxEncryptionError} DECRYPTION_FAILED if required streams are missing
 */
export function extractEncryptionStreams(data: ArrayBuffer | Uint8Array | Buffer): OleEncryptionStreams {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  let reader: ReturnType<typeof createCfbReader>;
  try {
    reader = createCfbReader(bytes);
  } catch (err) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'Failed to parse OLE/CFB container',
      err instanceof Error ? err : undefined,
    );
  }

  const encryptionInfo = reader.getStream('/EncryptionInfo');
  if (!encryptionInfo) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'CFB container missing EncryptionInfo stream',
    );
  }

  const encryptedPackage = reader.getStream('/EncryptedPackage');
  if (!encryptedPackage) {
    throw new DocxEncryptionError(
      DocxEncryptionErrorCode.DECRYPTION_FAILED,
      'CFB container missing EncryptedPackage stream',
    );
  }

  return {
    encryptionInfo,
    encryptedPackage,
  };
}
