import type { FaceKey } from './resolver';

/**
 * The embedding policy + face axis read from a font's OS/2 table.
 *
 * Used to decide whether a DOCX-embedded font may be REGISTERED for rendering (its license permits
 * embedding) and which weight/style FACE it represents - so embedded fonts become first-class
 * registry faces with the correct {@link FaceKey} instead of being inferred from filenames.
 */
export interface EmbeddingPolicy {
  /** Raw OS/2 `fsType` bit field (the licensing/embedding permissions). */
  fsType: number;
  /** The face this font provides, from OS/2 `usWeightClass` + the `fsSelection` italic bit. */
  face: FaceKey;
  /**
   * The minimal RENDER gate: false only when fsType marks the font Restricted-License / no-embedding
   * (bit 1). This is NOT a complete licensing model - Preview&Print vs Editable vs Installable, the
   * No-Subsetting (0x0100) and Bitmap-only (0x0200) bits, and re-embedding for EXPORT/EDIT (vs
   * display) all need their own policy decisions. The raw {@link fsType} is preserved so callers can
   * apply a stricter policy without re-parsing.
   */
  embeddable: boolean;
}

/** OS/2 fsType: Restricted-License embedding (no embedding permitted). Bits 0-3 are mutually exclusive. */
const FS_TYPE_RESTRICTED = 0x0002;
/** OS/2 fsSelection: ITALIC bit. */
const FS_SELECTION_ITALIC = 0x0001;
/** Word's Bold is usWeightClass 700; treat >= 600 (SemiBold and up) as the bold face for our 400/700 axis. */
const BOLD_WEIGHT_THRESHOLD = 600;

/** The SFNT table directory starts after the 12-byte offset table; each record is 16 bytes. */
const SFNT_TABLE_DIR_OFFSET = 12;
const SFNT_TABLE_RECORD_SIZE = 16;
/** OS/2 field offsets within the table: usWeightClass @4, fsType @8, fsSelection @62 (version 0+). */
const OS2_USWEIGHTCLASS = 4;
const OS2_FSTYPE = 8;
const OS2_FSSELECTION = 62;
/** Bytes we must be able to read past the OS/2 table start (through fsSelection @62-63). */
const OS2_MIN_LENGTH = OS2_FSSELECTION + 2;

/**
 * Parse a font's OS/2 embedding policy + face from its raw bytes (a deobfuscated DOCX-embedded TTF/OTF).
 *
 * Returns `null` when the bytes are not a parseable SFNT or have no readable OS/2 table - callers MUST
 * treat a null result conservatively (do NOT register; fall through to the bundled substitute), since
 * we cannot prove the font is licensed for embedding.
 */
export function parseEmbeddingPolicy(bytes: ArrayBuffer | ArrayBufferView): EmbeddingPolicy | null {
  // Honor a view's byteOffset/byteLength: a Uint8Array.subarray() or a Node Buffer is a window into a
  // larger (often pooled) ArrayBuffer, so `new DataView(bytes.buffer)` would read the wrong bytes.
  const view =
    bytes instanceof ArrayBuffer ? new DataView(bytes) : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < SFNT_TABLE_DIR_OFFSET) return null;

  const numTables = view.getUint16(4);
  let os2Offset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const record = SFNT_TABLE_DIR_OFFSET + i * SFNT_TABLE_RECORD_SIZE;
    if (record + SFNT_TABLE_RECORD_SIZE > view.byteLength) return null;
    // Tag is 4 bytes; the OS/2 table tag is the literal "OS/2" (with the slash).
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    if (tag === 'OS/2') {
      os2Offset = view.getUint32(record + 8);
      break;
    }
  }
  if (os2Offset < 0 || os2Offset + OS2_MIN_LENGTH > view.byteLength) return null;

  const usWeightClass = view.getUint16(os2Offset + OS2_USWEIGHTCLASS);
  const fsType = view.getUint16(os2Offset + OS2_FSTYPE);
  const fsSelection = view.getUint16(os2Offset + OS2_FSSELECTION);

  const weight: '400' | '700' = usWeightClass >= BOLD_WEIGHT_THRESHOLD ? '700' : '400';
  const style: 'normal' | 'italic' = (fsSelection & FS_SELECTION_ITALIC) !== 0 ? 'italic' : 'normal';
  return {
    fsType,
    face: { weight, style },
    embeddable: (fsType & FS_TYPE_RESTRICTED) === 0,
  };
}
