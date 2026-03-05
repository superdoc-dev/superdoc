import { access, readFile } from 'node:fs/promises';
import { constants as FS_CONSTANTS } from 'node:fs';
import { resolve } from 'node:path';

import { Liveblocks } from '@liveblocks/node';
import { Editor } from 'superdoc/super-editor';
import { Doc as YDoc, applyUpdate } from 'yjs';

const FRAGMENT_FIELD = 'supereditor';

const usage = () => {
  console.error('Usage: npm run seed -- [--fresh] <path-to-docx>');
  console.error('Required env: LIVEBLOCKS_SECRET_KEY + VITE_ROOM_ID (or LIVEBLOCKS_ROOM_ID)');
  process.exit(1);
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const docArg = args.find((arg) => !arg.startsWith('--'));
  return { fresh, docArg };
};

const getErrorStatus = (error) => error?.status ?? error?.response?.status ?? null;

const toUint8Array = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('Expected Uint8Array from Liveblocks');
};

const createYUpdateFromDocx = async (docPath, roomId) => {
  const fileBytes = await readFile(docPath);
  const editor = await Editor.open(Buffer.from(fileBytes), {
    isHeadless: true,
    documentId: roomId,
    telemetry: { enabled: false },
    user: { id: 'seed-bot', name: 'Seed Bot', email: 'seed-bot@superdoc.dev' },
  });

  try {
    return await editor.generateCollaborationUpdate();
  } finally {
    editor.destroy();
  }
};

const deleteRoomIfExists = async (liveblocks, roomId) => {
  try {
    await liveblocks.deleteRoom(roomId);
    console.log(`[seed] Deleted room: ${roomId}`);
  } catch (error) {
    if (getErrorStatus(error) === 404) {
      console.log(`[seed] Room did not exist: ${roomId}`);
      return;
    }
    throw error;
  }
};

const verifyRoomHasContent = async (liveblocks, roomId) => {
  const binary = await liveblocks.getYjsDocumentAsBinaryUpdate(roomId);
  const update = toUint8Array(binary);
  const ydoc = new YDoc({ gc: false });
  applyUpdate(ydoc, update);

  const fragment = ydoc.getXmlFragment(FRAGMENT_FIELD);
  const nodeCount = fragment.toArray().length;
  ydoc.destroy();

  if (nodeCount === 0) {
    throw new Error(`Seed failed: room "${roomId}" is empty`);
  }

  console.log(`[seed] Verify OK: ${nodeCount} top-level nodes`);
};

const main = async () => {
  const { fresh, docArg } = parseArgs();
  const secret = process.env.LIVEBLOCKS_SECRET_KEY?.trim();
  const roomId = process.env.LIVEBLOCKS_ROOM_ID?.trim() || process.env.VITE_ROOM_ID?.trim();

  if (!secret || !roomId || !docArg) usage();

  const docPath = resolve(docArg);
  await access(docPath, FS_CONSTANTS.R_OK);

  console.log(`[seed] Room: ${roomId}`);
  console.log(`[seed] DOCX: ${docPath}`);

  const update = await createYUpdateFromDocx(docPath, roomId);
  console.log(`[seed] Generated update bytes: ${update.byteLength}`);

  const liveblocks = new Liveblocks({ secret });

  if (fresh) {
    await deleteRoomIfExists(liveblocks, roomId);
  }

  await liveblocks.getOrCreateRoom(roomId, { defaultAccesses: ['room:write'] });
  await liveblocks.sendYjsBinaryUpdate(roomId, update);
  console.log('[seed] Sent binary update');

  await verifyRoomHasContent(liveblocks, roomId);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed] Failed: ${message}`);
  process.exit(1);
});
