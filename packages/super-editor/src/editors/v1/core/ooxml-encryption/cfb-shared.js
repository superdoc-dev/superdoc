/**
 * Shared CFB/OLE constants and byte helpers used by the internal reader/writer.
 *
 * The OOXML encryption pipeline only needs a narrow slice of MS-CFB:
 * reading and writing root-level streams, plus the mini-stream structures used
 * for sub-4KB streams like EncryptionInfo.
 */

export const CFB_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export const CFB_HEADER_SIZE = 512;
export const CFB_DIRECTORY_ENTRY_SIZE = 128;
export const CFB_HEADER_DIFAT_ENTRY_COUNT = 109;
export const CFB_MINI_STREAM_CUTOFF_SIZE = 0x1000;
export const CFB_MINI_SECTOR_SIZE = 64;
export const CFB_VERSION_3_SECTOR_SIZE = 512;
export const CFB_VERSION_4_SECTOR_SIZE = 4096;

export const CFB_FREE_SECTOR = 0xffffffff;
export const CFB_END_OF_CHAIN = 0xfffffffe;
export const CFB_FAT_SECTOR = 0xfffffffd;
export const CFB_DIFAT_SECTOR = 0xfffffffc;
export const CFB_NO_STREAM = 0xffffffff;

export const CFB_OBJECT_TYPE = {
  STORAGE: 1,
  STREAM: 2,
  ROOT: 5,
};

export const CFB_BYTE_ORDER = 0xfffe;
export const CFB_VERSION_3 = 3;
export const CFB_VERSION_4 = 4;
export const CFB_MINI_SECTOR_SHIFT = 6;

/** @param {Uint8Array[]} chunks */
export function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** @param {number} value @param {number} multiple */
export function roundUp(value, multiple) {
  if (value === 0) return 0;
  return Math.ceil(value / multiple) * multiple;
}

/** @param {number} sectorId @param {number} sectorSize */
export function getSectorOffset(sectorId, sectorSize) {
  return (sectorId + 1) * sectorSize;
}

/** @param {DataView} view @param {number} offset */
export function readUint16LE(view, offset) {
  return view.getUint16(offset, true);
}

/** @param {DataView} view @param {number} offset */
export function readUint32LE(view, offset) {
  return view.getUint32(offset, true);
}

/** @param {DataView} view @param {number} offset */
export function readUint64LE(view, offset) {
  const low = BigInt(view.getUint32(offset, true));
  const high = BigInt(view.getUint32(offset + 4, true));
  return (high << 32n) | low;
}

/** @param {DataView} view @param {number} offset @param {number} value */
export function writeUint16LE(view, offset, value) {
  view.setUint16(offset, value, true);
}

/** @param {DataView} view @param {number} offset @param {number} value */
export function writeUint32LE(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

/** @param {DataView} view @param {number} offset @param {bigint} value */
export function writeUint64LE(view, offset, value) {
  view.setUint32(offset, Number(value & 0xffffffffn), true);
  view.setUint32(offset + 4, Number((value >> 32n) & 0xffffffffn), true);
}

const utf16LeDecoder = new TextDecoder('utf-16le');

/** @param {Uint8Array} bytes */
export function decodeUtf16Le(bytes) {
  return utf16LeDecoder.decode(bytes).replace(/\u0000+$/g, '');
}

/** @param {string} value */
export function encodeUtf16Le(value) {
  const result = new Uint8Array(value.length * 2);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    result[i * 2] = code & 0xff;
    result[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return result;
}

/** @param {Uint8Array} data @param {number} size */
export function padToLength(data, size) {
  if (data.length === size) return data;
  const padded = new Uint8Array(size);
  padded.set(data.subarray(0, size));
  return padded;
}

/** @param {Uint8Array} data @param {number} chunkSize */
export function splitIntoPaddedChunks(data, chunkSize) {
  if (data.length === 0) return [];
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    chunks.push(padToLength(data.subarray(offset, offset + chunkSize), chunkSize));
  }
  return chunks;
}
