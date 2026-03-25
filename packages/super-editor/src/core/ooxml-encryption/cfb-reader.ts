/**
 * Minimal read-only Compound File Binary reader for password-protected OOXML.
 *
 * The encrypted DOCX path only needs to locate and read two streams from the
 * root storage, so this implementation intentionally avoids the breadth of a
 * general-purpose CFB library while still supporting the structures real Office
 * files rely on:
 * - FAT and DIFAT chains
 * - directory entries
 * - mini stream / MiniFAT storage for sub-4KB streams
 */

import {
  CFB_BYTE_ORDER,
  CFB_DIRECTORY_ENTRY_SIZE,
  CFB_DIFAT_SECTOR,
  CFB_END_OF_CHAIN,
  CFB_FREE_SECTOR,
  CFB_HEADER_DIFAT_ENTRY_COUNT,
  CFB_HEADER_SIZE,
  CFB_NO_STREAM,
  CFB_OBJECT_TYPE,
  CFB_SIGNATURE,
  CFB_VERSION_3,
  CFB_VERSION_3_SECTOR_SIZE,
  CFB_VERSION_4,
  CFB_VERSION_4_SECTOR_SIZE,
  concatUint8Arrays,
  decodeUtf16Le,
  getSectorOffset,
  readUint16LE,
  readUint32LE,
  readUint64LE,
} from './cfb-shared.js';

export interface CfbDirectoryEntry {
  name: string;
  objectType: number;
  leftSiblingId: number;
  rightSiblingId: number;
  childId: number;
  startSector: number;
  streamSize: number;
}

interface CfbHeader {
  sectorSize: number;
  miniSectorSize: number;
  numberOfFatSectors: number;
  firstDirectorySector: number;
  miniStreamCutoffSize: number;
  firstMiniFatSector: number;
  numberOfMiniFatSectors: number;
  firstDifatSector: number;
  numberOfDifatSectors: number;
  difatEntries: number[];
}

function createDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ensureAvailable(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new Error(`CFB ${label} exceeds available data`);
  }
}

function parseHeader(bytes: Uint8Array): CfbHeader {
  if (bytes.length < CFB_HEADER_SIZE) {
    throw new Error(`CFB header is truncated (${bytes.length} bytes)`);
  }

  for (let i = 0; i < CFB_SIGNATURE.length; i++) {
    if (bytes[i] !== CFB_SIGNATURE[i]) {
      throw new Error('Invalid CFB signature');
    }
  }

  const view = createDataView(bytes);
  const majorVersion = readUint16LE(view, 0x1a);
  const byteOrder = readUint16LE(view, 0x1c);
  const sectorShift = readUint16LE(view, 0x1e);
  const miniSectorShift = readUint16LE(view, 0x20);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;

  if (byteOrder !== CFB_BYTE_ORDER) {
    throw new Error(`Unsupported CFB byte order: 0x${byteOrder.toString(16)}`);
  }

  if (
    !(
      (majorVersion === CFB_VERSION_3 && sectorSize === CFB_VERSION_3_SECTOR_SIZE) ||
      (majorVersion === CFB_VERSION_4 && sectorSize === CFB_VERSION_4_SECTOR_SIZE)
    )
  ) {
    throw new Error(`Unsupported CFB major version ${majorVersion} with sector size ${sectorSize}`);
  }

  const difatEntries: number[] = [];
  for (let i = 0; i < CFB_HEADER_DIFAT_ENTRY_COUNT; i++) {
    const sectorId = readUint32LE(view, 0x4c + i * 4);
    if (sectorId !== CFB_FREE_SECTOR) {
      difatEntries.push(sectorId);
    }
  }

  return {
    sectorSize,
    miniSectorSize,
    numberOfFatSectors: readUint32LE(view, 0x2c),
    firstDirectorySector: readUint32LE(view, 0x30),
    miniStreamCutoffSize: readUint32LE(view, 0x38),
    firstMiniFatSector: readUint32LE(view, 0x3c),
    numberOfMiniFatSectors: readUint32LE(view, 0x40),
    firstDifatSector: readUint32LE(view, 0x44),
    numberOfDifatSectors: readUint32LE(view, 0x48),
    difatEntries,
  };
}

function readSector(bytes: Uint8Array, header: CfbHeader, sectorId: number): Uint8Array {
  if (sectorId >= CFB_DIFAT_SECTOR) {
    throw new Error(`Invalid sector id 0x${sectorId.toString(16)}`);
  }

  const offset = getSectorOffset(sectorId, header.sectorSize);
  ensureAvailable(bytes, offset, header.sectorSize, `sector ${sectorId}`);
  return bytes.subarray(offset, offset + header.sectorSize);
}

function readDifatEntries(bytes: Uint8Array, header: CfbHeader): number[] {
  const difatEntries = [...header.difatEntries];
  let nextDifatSector = header.firstDifatSector;

  for (let i = 0; i < header.numberOfDifatSectors; i++) {
    if (nextDifatSector === CFB_END_OF_CHAIN || nextDifatSector === CFB_FREE_SECTOR) {
      break;
    }

    const sector = readSector(bytes, header, nextDifatSector);
    const view = createDataView(sector);
    const entriesPerDifatSector = header.sectorSize / 4 - 1;

    for (let entryIndex = 0; entryIndex < entriesPerDifatSector; entryIndex++) {
      const fatSectorId = readUint32LE(view, entryIndex * 4);
      if (fatSectorId !== CFB_FREE_SECTOR) {
        difatEntries.push(fatSectorId);
      }
    }

    nextDifatSector = readUint32LE(view, header.sectorSize - 4);
  }

  if (difatEntries.length < header.numberOfFatSectors) {
    throw new Error(`CFB DIFAT only exposed ${difatEntries.length} FAT sectors, expected ${header.numberOfFatSectors}`);
  }

  return difatEntries.slice(0, header.numberOfFatSectors);
}

function readFat(bytes: Uint8Array, header: CfbHeader): number[] {
  const fatSectorIds = readDifatEntries(bytes, header);
  const fatEntries: number[] = [];

  for (const fatSectorId of fatSectorIds) {
    const fatSector = readSector(bytes, header, fatSectorId);
    const view = createDataView(fatSector);
    const entriesPerSector = header.sectorSize / 4;

    for (let i = 0; i < entriesPerSector; i++) {
      fatEntries.push(readUint32LE(view, i * 4));
    }
  }

  return fatEntries;
}

function readSectorChain(bytes: Uint8Array, header: CfbHeader, fat: number[], startSector: number): Uint8Array {
  if (startSector === CFB_END_OF_CHAIN || startSector === CFB_FREE_SECTOR) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  const visited = new Set<number>();
  let sectorId = startSector;

  while (sectorId !== CFB_END_OF_CHAIN) {
    if (visited.has(sectorId)) {
      throw new Error(`CFB sector chain loop detected at sector ${sectorId}`);
    }
    if (sectorId >= fat.length) {
      throw new Error(`CFB sector ${sectorId} is out of FAT bounds`);
    }

    visited.add(sectorId);
    chunks.push(readSector(bytes, header, sectorId));

    const nextSector = fat[sectorId];
    if (nextSector == null) {
      throw new Error(`CFB FAT missing next sector for sector ${sectorId}`);
    }
    sectorId = nextSector;
  }

  return concatUint8Arrays(chunks);
}

function parseStreamSize(view: DataView, offset: number): number {
  const streamSize = readUint64LE(view, offset);
  if (streamSize > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`CFB stream is too large to fit in a JavaScript number: ${streamSize.toString()}`);
  }
  return Number(streamSize);
}

function parseDirectoryEntries(directoryBytes: Uint8Array): CfbDirectoryEntry[] {
  const entries: CfbDirectoryEntry[] = [];

  for (let offset = 0; offset + CFB_DIRECTORY_ENTRY_SIZE <= directoryBytes.length; offset += CFB_DIRECTORY_ENTRY_SIZE) {
    const slice = directoryBytes.subarray(offset, offset + CFB_DIRECTORY_ENTRY_SIZE);
    const view = createDataView(slice);
    const nameLength = readUint16LE(view, 64);
    const rawNameBytes = slice.subarray(0, Math.max(0, Math.min(nameLength, 64) - 2));

    entries.push({
      name: decodeUtf16Le(rawNameBytes),
      objectType: slice[66],
      leftSiblingId: readUint32LE(view, 68),
      rightSiblingId: readUint32LE(view, 72),
      childId: readUint32LE(view, 76),
      startSector: readUint32LE(view, 116),
      streamSize: parseStreamSize(view, 120),
    });
  }

  return entries;
}

function forEachSiblingTree(
  entries: CfbDirectoryEntry[],
  entryId: number,
  visitor: (entry: CfbDirectoryEntry) => boolean | void,
  visited = new Set<number>(),
): boolean {
  if (entryId === CFB_NO_STREAM) return false;
  if (entryId >= entries.length) {
    throw new Error(`CFB directory entry id ${entryId} is out of bounds`);
  }
  if (visited.has(entryId)) {
    throw new Error(`CFB directory tree loop detected at entry id ${entryId}`);
  }

  visited.add(entryId);
  const entry = entries[entryId];

  if (forEachSiblingTree(entries, entry.leftSiblingId, visitor, visited)) return true;
  if (visitor(entry) === true) return true;
  if (forEachSiblingTree(entries, entry.rightSiblingId, visitor, visited)) return true;
  return false;
}

function findEntryByPath(entries: CfbDirectoryEntry[], path: string): CfbDirectoryEntry | null {
  const components = path
    .split('/')
    .map((component) => component.trim())
    .filter(Boolean);

  let currentEntry = entries[0];
  for (const component of components) {
    if (currentEntry.objectType !== CFB_OBJECT_TYPE.ROOT && currentEntry.objectType !== CFB_OBJECT_TYPE.STORAGE) {
      return null;
    }

    let nextEntry: CfbDirectoryEntry | null = null;
    forEachSiblingTree(entries, currentEntry.childId, (candidate) => {
      if (candidate.name.toLowerCase() === component.toLowerCase()) {
        nextEntry = candidate;
        return true;
      }
      return false;
    });

    if (!nextEntry) return null;
    currentEntry = nextEntry;
  }

  return currentEntry;
}

function readMiniStream(rootEntry: CfbDirectoryEntry, bytes: Uint8Array, header: CfbHeader, fat: number[]): Uint8Array {
  if (rootEntry.streamSize === 0 || rootEntry.startSector === CFB_END_OF_CHAIN) {
    return new Uint8Array(0);
  }

  // The root entry's stream payload is the mini stream backing storage for all
  // sub-cutoff streams. We load it once and slice mini sectors out of it later.
  return readSectorChain(bytes, header, fat, rootEntry.startSector).subarray(0, rootEntry.streamSize);
}

function readMiniFat(bytes: Uint8Array, header: CfbHeader, fat: number[]): number[] {
  if (header.numberOfMiniFatSectors === 0 || header.firstMiniFatSector === CFB_END_OF_CHAIN) {
    return [];
  }

  const miniFatBytes = readSectorChain(bytes, header, fat, header.firstMiniFatSector);
  const view = createDataView(miniFatBytes);
  const entryCount = Math.floor(miniFatBytes.length / 4);
  const entries: number[] = [];

  for (let i = 0; i < entryCount; i++) {
    entries.push(readUint32LE(view, i * 4));
  }

  return entries;
}

function readMiniSectorChain(
  miniStream: Uint8Array,
  miniFat: number[],
  miniSectorSize: number,
  startSector: number,
): Uint8Array {
  if (startSector === CFB_END_OF_CHAIN || startSector === CFB_FREE_SECTOR) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  const visited = new Set<number>();
  let sectorId = startSector;

  while (sectorId !== CFB_END_OF_CHAIN) {
    if (visited.has(sectorId)) {
      throw new Error(`CFB mini sector chain loop detected at mini sector ${sectorId}`);
    }
    if (sectorId >= miniFat.length) {
      throw new Error(`CFB mini sector ${sectorId} is out of MiniFAT bounds`);
    }

    visited.add(sectorId);
    const offset = sectorId * miniSectorSize;
    ensureAvailable(miniStream, offset, miniSectorSize, `mini sector ${sectorId}`);
    chunks.push(miniStream.subarray(offset, offset + miniSectorSize));

    const nextSector = miniFat[sectorId];
    if (nextSector == null) {
      throw new Error(`CFB MiniFAT missing next sector for mini sector ${sectorId}`);
    }
    sectorId = nextSector;
  }

  return concatUint8Arrays(chunks);
}

export interface CfbReader {
  getStream(path: string): Uint8Array | null;
}

/**
 * Create a minimal read-only CFB reader for encrypted OOXML containers.
 */
export function createCfbReader(data: ArrayBuffer | Uint8Array | Buffer): CfbReader {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const header = parseHeader(bytes);
  const fat = readFat(bytes, header);
  const directoryEntries = parseDirectoryEntries(readSectorChain(bytes, header, fat, header.firstDirectorySector));

  if (directoryEntries.length === 0 || directoryEntries[0].objectType !== CFB_OBJECT_TYPE.ROOT) {
    throw new Error('CFB root directory entry is missing');
  }

  const rootEntry = directoryEntries[0];
  const miniFat = readMiniFat(bytes, header, fat);
  const miniStream = readMiniStream(rootEntry, bytes, header, fat);

  return {
    getStream(path: string): Uint8Array | null {
      const entry = findEntryByPath(directoryEntries, path);
      if (!entry || entry.objectType !== CFB_OBJECT_TYPE.STREAM) {
        return null;
      }

      // EncryptionInfo is usually stored in the mini stream while
      // EncryptedPackage typically lives in the normal FAT chain, so the
      // reader must dispatch to the correct storage path based on stream size.
      if (entry.streamSize < header.miniStreamCutoffSize) {
        return readMiniSectorChain(miniStream, miniFat, header.miniSectorSize, entry.startSector).subarray(
          0,
          entry.streamSize,
        );
      }

      return readSectorChain(bytes, header, fat, entry.startSector).subarray(0, entry.streamSize);
    },
  };
}
