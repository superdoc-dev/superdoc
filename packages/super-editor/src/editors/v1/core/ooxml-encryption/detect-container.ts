/**
 * Detect whether a file is a standard ZIP archive or an OLE/CFB compound file.
 *
 * ZIP files (normal .docx) start with bytes: 50 4B 03 04
 * CFB files (encrypted .docx) start with bytes: D0 CF 11 E0 A1 B1 1A E1
 */

export type ContainerType = 'zip' | 'cfb' | 'unknown';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function matchesMagic(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Detect the container format from the first bytes of a file.
 *
 * @param data Raw file bytes
 * @returns `'zip'` for normal OOXML, `'cfb'` for encrypted compound file, `'unknown'` otherwise
 */
export function detectContainerType(data: ArrayBuffer | Uint8Array | Buffer): ContainerType {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (matchesMagic(bytes, ZIP_MAGIC)) return 'zip';
  if (matchesMagic(bytes, CFB_MAGIC)) return 'cfb';
  return 'unknown';
}
