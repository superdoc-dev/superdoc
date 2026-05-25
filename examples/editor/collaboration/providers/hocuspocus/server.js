import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '.data');
const PORT = Number(process.env.HOCUSPOCUS_PORT || 1234);

const toSnapshotFilename = (documentName) =>
  encodeURIComponent(documentName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const getSnapshotPath = (documentName) => path.join(DATA_DIR, `${toSnapshotFilename(documentName)}.yjs`);

const server = Server.configure({
  port: PORT,
  debounce: 500,
  maxDebounce: 2000,

  async onLoadDocument({ documentName, document }) {
    try {
      const update = await readFile(getSnapshotPath(documentName));
      Y.applyUpdate(document, update);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    return document;
  },

  async onStoreDocument({ documentName, document }) {
    await mkdir(DATA_DIR, { recursive: true });

    const update = Y.encodeStateAsUpdate(document);
    await writeFile(getSnapshotPath(documentName), Buffer.from(update));
  },
});

server.listen();

console.log(`Hocuspocus server running on ws://localhost:${PORT}`);
console.log(`Yjs snapshots are stored in ${DATA_DIR}`);
