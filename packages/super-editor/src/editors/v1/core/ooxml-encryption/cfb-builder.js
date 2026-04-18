import {
  CFB_BYTE_ORDER,
  CFB_DIRECTORY_ENTRY_SIZE,
  CFB_END_OF_CHAIN,
  CFB_FAT_SECTOR,
  CFB_FREE_SECTOR,
  CFB_HEADER_DIFAT_ENTRY_COUNT,
  CFB_HEADER_SIZE,
  CFB_MINI_SECTOR_SHIFT,
  CFB_MINI_SECTOR_SIZE,
  CFB_MINI_STREAM_CUTOFF_SIZE,
  CFB_NO_STREAM,
  CFB_OBJECT_TYPE,
  CFB_SIGNATURE,
  CFB_VERSION_3,
  CFB_VERSION_3_SECTOR_SIZE,
  concatUint8Arrays,
  encodeUtf16Le,
  padToLength,
  roundUp,
  splitIntoPaddedChunks,
  writeUint16LE,
  writeUint32LE,
  writeUint64LE,
} from './cfb-shared.js';

const DIRECTORY_COLOR_BLACK = 1;

function normalizeEntries(entries) {
  return Object.entries(entries).map(([path, content]) => {
    if (!path.startsWith('/')) {
      throw new Error(`CFB builder only accepts absolute paths, received "${path}"`);
    }

    const name = path.slice(1);
    if (!name || name.includes('/')) {
      throw new Error(`CFB builder only supports root-level streams, received "${path}"`);
    }

    return {
      name,
      content,
      streamSize: content.length,
      startSector: CFB_END_OF_CHAIN,
      leftSiblingId: CFB_NO_STREAM,
      rightSiblingId: CFB_NO_STREAM,
      childId: CFB_NO_STREAM,
    };
  });
}

function buildBalancedSiblingTree(entries) {
  const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  sortedEntries.forEach((entry, index) => {
    entry.directoryId = index + 1;
    entry.leftSiblingId = CFB_NO_STREAM;
    entry.rightSiblingId = CFB_NO_STREAM;
  });

  function assign(start, end) {
    if (start > end) return CFB_NO_STREAM;
    const mid = Math.floor((start + end) / 2);
    const entry = sortedEntries[mid];
    // CFB directory children are stored as a sibling tree, not a flat array.
    // A balanced tree keeps the lookup shape deterministic for fixtures/tests.
    entry.leftSiblingId = assign(start, mid - 1);
    entry.rightSiblingId = assign(mid + 1, end);
    return entry.directoryId;
  }

  return {
    entries: sortedEntries,
    rootChildId: assign(0, sortedEntries.length - 1),
  };
}

function createSectorChain(startSector, sectorCount, specialValue = CFB_END_OF_CHAIN) {
  const chain = new Map();
  if (sectorCount === 0) return chain;

  for (let i = 0; i < sectorCount; i++) {
    const sectorId = startSector + i;
    const nextSector = i === sectorCount - 1 ? specialValue : sectorId + 1;
    chain.set(sectorId, nextSector);
  }

  return chain;
}

function encodeDirectoryName(name) {
  return padToLength(encodeUtf16Le(`${name}\u0000`), 64);
}

function getDirectoryNameLength(nameBytes) {
  let firstNullIndex = nameBytes.length;
  for (let i = 0; i < nameBytes.length; i += 2) {
    if (nameBytes[i] === 0x00 && nameBytes[i + 1] === 0x00) {
      firstNullIndex = i;
      break;
    }
  }
  return Math.min(firstNullIndex + 2, 64);
}

function writeDirectoryEntry(view, offset, entry) {
  const nameBytes = encodeDirectoryName(entry.name);
  new Uint8Array(view.buffer, view.byteOffset + offset, 64).set(nameBytes);

  writeUint16LE(view, offset + 64, getDirectoryNameLength(nameBytes));
  view.setUint8(offset + 66, entry.objectType);
  view.setUint8(offset + 67, DIRECTORY_COLOR_BLACK);
  writeUint32LE(view, offset + 68, entry.leftSiblingId ?? CFB_NO_STREAM);
  writeUint32LE(view, offset + 72, entry.rightSiblingId ?? CFB_NO_STREAM);
  writeUint32LE(view, offset + 76, entry.childId ?? CFB_NO_STREAM);
  writeUint32LE(view, offset + 116, entry.startSector ?? CFB_END_OF_CHAIN);
  writeUint64LE(view, offset + 120, BigInt(entry.streamSize ?? 0));
}

/**
 * Build a minimal version-3 CFB container containing root-level streams.
 *
 * This helper exists solely for internal tests and fixture generation. It is
 * intentionally narrow: root-level streams only, no storages, and no DIFAT.
 */
export function buildCfbContainer(entries) {
  const normalizedEntries = normalizeEntries(entries);
  const miniEntries = normalizedEntries.filter((entry) => entry.streamSize < CFB_MINI_STREAM_CUTOFF_SIZE);
  const regularEntries = normalizedEntries.filter((entry) => entry.streamSize >= CFB_MINI_STREAM_CUTOFF_SIZE);

  const miniFatEntries = [];
  const miniStreamChunks = [];
  let nextMiniSector = 0;

  for (const entry of miniEntries) {
    const chunks = splitIntoPaddedChunks(entry.content, CFB_MINI_SECTOR_SIZE);
    entry.startSector = chunks.length === 0 ? CFB_END_OF_CHAIN : nextMiniSector;

    for (let i = 0; i < chunks.length; i++) {
      const miniSectorId = nextMiniSector + i;
      miniFatEntries[miniSectorId] = i === chunks.length - 1 ? CFB_END_OF_CHAIN : miniSectorId + 1;
      miniStreamChunks.push(chunks[i]);
    }

    nextMiniSector += chunks.length;
  }

  const miniStreamBytes = concatUint8Arrays(miniStreamChunks);
  const miniStreamSectorCount = Math.ceil(miniStreamBytes.length / CFB_VERSION_3_SECTOR_SIZE);
  const miniFatSectorCount = Math.ceil((miniFatEntries.length * 4) / CFB_VERSION_3_SECTOR_SIZE);

  const regularSectorCounts = regularEntries.map((entry) => Math.ceil(entry.streamSize / CFB_VERSION_3_SECTOR_SIZE));
  const regularSectorCount = regularSectorCounts.reduce((sum, count) => sum + count, 0);

  const directoryEntries = buildBalancedSiblingTree(normalizedEntries);
  const rootDirectoryEntry = {
    name: 'Root Entry',
    objectType: CFB_OBJECT_TYPE.ROOT,
    leftSiblingId: CFB_NO_STREAM,
    rightSiblingId: CFB_NO_STREAM,
    childId: directoryEntries.rootChildId,
    startSector: CFB_END_OF_CHAIN,
    streamSize: miniStreamBytes.length,
  };

  const directoryEntryCount = 1 + directoryEntries.entries.length;
  const directoryStreamSize = roundUp(directoryEntryCount * CFB_DIRECTORY_ENTRY_SIZE, CFB_VERSION_3_SECTOR_SIZE);
  const directorySectorCount = directoryStreamSize / CFB_VERSION_3_SECTOR_SIZE;

  const baseSectorCount = directorySectorCount + miniStreamSectorCount + regularSectorCount + miniFatSectorCount;
  const entriesPerFatSector = CFB_VERSION_3_SECTOR_SIZE / 4;
  let fatSectorCount = 0;
  while (true) {
    // FAT sectors describe every regular sector, including the FAT sectors
    // themselves, so solve the count to a fixed point.
    const nextFatSectorCount = Math.ceil((baseSectorCount + fatSectorCount) / entriesPerFatSector);
    if (nextFatSectorCount === fatSectorCount) break;
    fatSectorCount = nextFatSectorCount;
  }

  if (fatSectorCount > CFB_HEADER_DIFAT_ENTRY_COUNT) {
    throw new Error('CFB builder does not support DIFAT sectors');
  }

  let nextSectorId = 0;
  const directoryStartSector = nextSectorId;
  nextSectorId += directorySectorCount;

  if (miniStreamSectorCount > 0) {
    rootDirectoryEntry.startSector = nextSectorId;
    nextSectorId += miniStreamSectorCount;
  }

  regularEntries.forEach((entry, index) => {
    entry.startSector = nextSectorId;
    nextSectorId += regularSectorCounts[index];
  });

  const miniFatStartSector = miniFatSectorCount > 0 ? nextSectorId : CFB_END_OF_CHAIN;
  nextSectorId += miniFatSectorCount;

  const fatSectorIds = [];
  for (let i = 0; i < fatSectorCount; i++) {
    fatSectorIds.push(nextSectorId++);
  }

  const totalSectorCount = nextSectorId;
  const fatEntries = new Array(fatSectorCount * entriesPerFatSector).fill(CFB_FREE_SECTOR);

  for (const [sectorId, nextSector] of createSectorChain(directoryStartSector, directorySectorCount)) {
    fatEntries[sectorId] = nextSector;
  }

  if (miniStreamSectorCount > 0) {
    for (const [sectorId, nextSector] of createSectorChain(rootDirectoryEntry.startSector, miniStreamSectorCount)) {
      fatEntries[sectorId] = nextSector;
    }
  }

  regularEntries.forEach((entry, index) => {
    for (const [sectorId, nextSector] of createSectorChain(entry.startSector, regularSectorCounts[index])) {
      fatEntries[sectorId] = nextSector;
    }
  });

  if (miniFatSectorCount > 0) {
    for (const [sectorId, nextSector] of createSectorChain(miniFatStartSector, miniFatSectorCount)) {
      fatEntries[sectorId] = nextSector;
    }
  }

  fatSectorIds.forEach((sectorId) => {
    fatEntries[sectorId] = CFB_FAT_SECTOR;
  });

  const directoryStream = new Uint8Array(directoryStreamSize);
  const directoryView = new DataView(directoryStream.buffer);
  writeDirectoryEntry(directoryView, 0, rootDirectoryEntry);
  directoryEntries.entries.forEach((entry, index) => {
    writeDirectoryEntry(directoryView, (index + 1) * CFB_DIRECTORY_ENTRY_SIZE, {
      ...entry,
      objectType: CFB_OBJECT_TYPE.STREAM,
      childId: CFB_NO_STREAM,
    });
  });

  const miniFatBytes = new Uint8Array(miniFatSectorCount * CFB_VERSION_3_SECTOR_SIZE);
  const miniFatView = new DataView(miniFatBytes.buffer);
  miniFatEntries.forEach((entry, index) => {
    writeUint32LE(miniFatView, index * 4, entry);
  });
  for (let index = miniFatEntries.length; index < miniFatBytes.length / 4; index++) {
    writeUint32LE(miniFatView, index * 4, CFB_FREE_SECTOR);
  }

  const fatBytes = new Uint8Array(fatSectorCount * CFB_VERSION_3_SECTOR_SIZE);
  const fatView = new DataView(fatBytes.buffer);
  for (let index = 0; index < fatEntries.length; index++) {
    writeUint32LE(fatView, index * 4, fatEntries[index]);
  }

  const sectors = new Array(totalSectorCount);

  for (let i = 0; i < directorySectorCount; i++) {
    sectors[directoryStartSector + i] = directoryStream.subarray(
      i * CFB_VERSION_3_SECTOR_SIZE,
      (i + 1) * CFB_VERSION_3_SECTOR_SIZE,
    );
  }

  if (miniStreamSectorCount > 0) {
    const paddedMiniStream = padToLength(miniStreamBytes, miniStreamSectorCount * CFB_VERSION_3_SECTOR_SIZE);
    for (let i = 0; i < miniStreamSectorCount; i++) {
      sectors[rootDirectoryEntry.startSector + i] = paddedMiniStream.subarray(
        i * CFB_VERSION_3_SECTOR_SIZE,
        (i + 1) * CFB_VERSION_3_SECTOR_SIZE,
      );
    }
  }

  regularEntries.forEach((entry, index) => {
    const paddedContent = padToLength(entry.content, regularSectorCounts[index] * CFB_VERSION_3_SECTOR_SIZE);
    for (let i = 0; i < regularSectorCounts[index]; i++) {
      sectors[entry.startSector + i] = paddedContent.subarray(
        i * CFB_VERSION_3_SECTOR_SIZE,
        (i + 1) * CFB_VERSION_3_SECTOR_SIZE,
      );
    }
  });

  for (let i = 0; i < miniFatSectorCount; i++) {
    sectors[miniFatStartSector + i] = miniFatBytes.subarray(
      i * CFB_VERSION_3_SECTOR_SIZE,
      (i + 1) * CFB_VERSION_3_SECTOR_SIZE,
    );
  }

  fatSectorIds.forEach((sectorId, index) => {
    sectors[sectorId] = fatBytes.subarray(index * CFB_VERSION_3_SECTOR_SIZE, (index + 1) * CFB_VERSION_3_SECTOR_SIZE);
  });

  const header = new Uint8Array(CFB_HEADER_SIZE);
  header.set(CFB_SIGNATURE, 0);
  const headerView = new DataView(header.buffer);
  writeUint16LE(headerView, 0x18, 0x003e);
  writeUint16LE(headerView, 0x1a, CFB_VERSION_3);
  writeUint16LE(headerView, 0x1c, CFB_BYTE_ORDER);
  writeUint16LE(headerView, 0x1e, 9);
  writeUint16LE(headerView, 0x20, CFB_MINI_SECTOR_SHIFT);
  writeUint32LE(headerView, 0x28, 0);
  writeUint32LE(headerView, 0x2c, fatSectorCount);
  writeUint32LE(headerView, 0x30, directoryStartSector);
  writeUint32LE(headerView, 0x34, 0);
  writeUint32LE(headerView, 0x38, CFB_MINI_STREAM_CUTOFF_SIZE);
  writeUint32LE(headerView, 0x3c, miniFatStartSector);
  writeUint32LE(headerView, 0x40, miniFatSectorCount);
  writeUint32LE(headerView, 0x44, CFB_END_OF_CHAIN);
  writeUint32LE(headerView, 0x48, 0);

  for (let index = 0; index < CFB_HEADER_DIFAT_ENTRY_COUNT; index++) {
    writeUint32LE(headerView, 0x4c + index * 4, fatSectorIds[index] ?? CFB_FREE_SECTOR);
  }

  return concatUint8Arrays([header, ...sectors]);
}
