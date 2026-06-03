import { writeUpdate, readSyncMessage, writeSyncStep1, writeSyncStep2 } from 'y-protocols/sync';
import { createEncoder, writeVarUint, writeVarUint8Array, toUint8Array, length as encodingLength } from 'lib0/encoding';
import { readVarUint8Array, createDecoder, readVarUint } from 'lib0/decoding';
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates, applyAwarenessUpdate } from 'y-protocols/awareness';
import { Doc as YDoc } from 'yjs';
import { createLogger } from '@superdoc/common/logger';
import { callbackHandler, isCallbackSet } from './callback.js';
import { debouncer } from './utils.js';
import { messageSync, messageAwareness, wsReadyStateConnecting, wsReadyStateOpen } from './constants.js';
import type { CollaborationWebSocket } from '../types/service-types.js';

const log = createLogger('shared-doc');

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

interface YDocWithEmit extends YDoc {
  emit(event: string, args: unknown[]): void;
}

export class SharedSuperDoc extends YDoc {
  public name: string;
  public conns = new Map<CollaborationWebSocket, Set<number>>();
  public awareness: Awareness;
  public whenInitialized: Promise<void>;

  constructor(name: string) {
    super({ gc: false });
    this.name = name;

    this.awareness = new Awareness(this);
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = (
      { added, updated, removed }: AwarenessChange,
      conn: CollaborationWebSocket | null
    ) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach((clientID) => {
            connControlledIDs.add(clientID);
          });
          removed.forEach((clientID) => {
            connControlledIDs.delete(clientID);
          });
        }
      }

      const encoder = createEncoder();
      writeVarUint(encoder, messageAwareness);
      writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, changedClients));
      const buff = toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };

    this.awareness.on('update', awarenessChangeHandler);
    this.on('update', updateHandler);
    if (isCallbackSet) {
      this.on('update', (_update, _origin, doc) => {
        debouncer(() => callbackHandler(doc as SharedSuperDoc));
      });
    }

    this.whenInitialized = contentInitializer();
  }
}

const contentInitializer: () => Promise<void> = () => Promise.resolve();

const updateHandler = (update: Uint8Array, _origin: unknown, docInstance: YDoc) => {
  const doc = docInstance as SharedSuperDoc;
  const encoder = createEncoder();
  writeVarUint(encoder, messageSync);
  writeUpdate(encoder, update);
  const message = toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
};

const closeConn = (doc: SharedSuperDoc, conn: CollaborationWebSocket) => {
  const controlledIds = doc.conns.get(conn);
  if (controlledIds) {
    removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
  }
  doc.conns.delete(conn);
  conn.close();
};

export const send = (doc: SharedSuperDoc, conn: CollaborationWebSocket, message: Uint8Array) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, {}, (err) => {
      if (err) {
        closeConn(doc, conn);
      }
    });
  } catch {
    closeConn(doc, conn);
  }
};

const toUint8Message = (message: ArrayBuffer | Buffer | Uint8Array): Uint8Array => {
  if (message instanceof Uint8Array) {
    return new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
  }
  return new Uint8Array(message);
};

export const setupConnection = (conn: CollaborationWebSocket, doc: SharedSuperDoc) => {
  doc.conns.set(conn, new Set());

  conn.on('message', (...args: unknown[]) => {
    const [message] = args as [ArrayBuffer | Buffer | Uint8Array];
    if (!message) {
      return;
    }
    return messageListener(conn, doc, toUint8Message(message));
  });

  const encoder = createEncoder();
  writeVarUint(encoder, messageSync);
  writeSyncStep1(encoder, doc);
  send(doc, conn, toUint8Array(encoder));
};

const messageListener = (conn: CollaborationWebSocket, doc: SharedSuperDoc, message: Uint8Array) => {
  try {
    const encoder = createEncoder();
    const decoder = createDecoder(message);
    const messageType = readVarUint(decoder);

    switch (messageType) {
      case messageSync: {
        writeVarUint(encoder, messageSync);
        readSyncMessage(decoder, encoder, doc, conn);

        if (encodingLength(encoder) > 1) {
          send(doc, conn, toUint8Array(encoder));
        } else {
          writeSyncStep2(encoder, doc);
          if (encodingLength(encoder) > 1) {
            send(doc, conn, toUint8Array(encoder));
          }
        }
        break;
      }

      case messageAwareness: {
        applyAwarenessUpdate(doc.awareness, readVarUint8Array(decoder), conn);
        break;
      }

      default:
        log.warn('Unknown message type:', messageType);
    }
  } catch (err) {
    log.error('Error in messageListener:', err);
    (doc as YDocWithEmit).emit('error', [err]);
  }
};
