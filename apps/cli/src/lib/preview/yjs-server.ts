import type { WebSocket } from 'ws';
import { Doc as YDoc } from 'yjs';
import { writeSyncStep1, writeSyncStep2, writeUpdate, readSyncMessage } from 'y-protocols/sync';
import {
  createEncoder,
  writeVarUint,
  toUint8Array,
  length as encodingLength,
} from 'lib0/encoding';
import { createDecoder, readVarUint } from 'lib0/decoding';

// ---------------------------------------------------------------------------
// Constants (y-websocket protocol)
// ---------------------------------------------------------------------------

// Message types from y-websocket protocol
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// WebSocket ready states
const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface YjsServerConnection {
  /** Clean up the connection (remove observers, etc.). */
  cleanup(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Sends a message to a WebSocket connection if it's open.
 */
function send(ws: WebSocket, message: Uint8Array): void {
  if (ws.readyState !== WS_READY_STATE_CONNECTING && ws.readyState !== WS_READY_STATE_OPEN) {
    return;
  }
  try {
    ws.send(message);
  } catch {
    // Connection closed, ignore
  }
}

/**
 * Converts incoming WebSocket data to Uint8Array.
 */
function toUint8Message(message: ArrayBuffer | Buffer | Uint8Array | Buffer[]): Uint8Array {
  if (message instanceof Uint8Array) {
    return new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
  }
  if (Buffer.isBuffer(message)) {
    return new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
  }
  if (message instanceof ArrayBuffer) {
    return new Uint8Array(message);
  }
  // Array of buffers - concatenate
  const totalLength = (message as Buffer[]).reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of message as Buffer[]) {
    result.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), offset);
    offset += buf.length;
  }
  return result;
}

/**
 * Sets up a y-websocket server connection for a Yjs document.
 *
 * This implements the y-websocket binary protocol so browsers can connect
 * using the standard y-websocket provider.
 *
 * @param ydoc - The Yjs document to sync.
 * @param ws - The WebSocket connection.
 * @returns A connection object with cleanup methods.
 */
export function setupYjsServer(ydoc: YDoc, ws: WebSocket): YjsServerConnection {
  // Send updates from ydoc to the client
  const updateHandler = (update: Uint8Array, origin: unknown) => {
    // Don't echo updates back to the same connection
    if (origin === ws) return;

    const encoder = createEncoder();
    writeVarUint(encoder, MESSAGE_SYNC);
    writeUpdate(encoder, update);
    send(ws, toUint8Array(encoder));
  };

  ydoc.on('update', updateHandler);

  // Handle messages from the client
  const messageHandler = (data: ArrayBuffer | Buffer | Uint8Array | Buffer[]) => {
    const message = toUint8Message(data);
    handleMessage(ydoc, ws, message);
  };

  ws.on('message', messageHandler);

  // Send initial sync step 1 to the client
  const encoder = createEncoder();
  writeVarUint(encoder, MESSAGE_SYNC);
  writeSyncStep1(encoder, ydoc);
  send(ws, toUint8Array(encoder));

  return {
    cleanup() {
      ydoc.off('update', updateHandler);
    },
  };
}

/**
 * Handle incoming messages from the client.
 */
function handleMessage(ydoc: YDoc, ws: WebSocket, message: Uint8Array): void {
  try {
    const encoder = createEncoder();
    const decoder = createDecoder(message);
    const messageType = readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        writeVarUint(encoder, MESSAGE_SYNC);
        const initialLength = encodingLength(encoder);
        // readSyncMessage reads the sync message and may write a response
        readSyncMessage(decoder, encoder, ydoc, ws);

        // Send response if readSyncMessage added content
        if (encodingLength(encoder) > initialLength) {
          send(ws, toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        // Awareness messages are for presence - ignore for single-client preview
        break;
      }
      default:
        // Unknown message type - ignore
        break;
    }
  } catch (err) {
    console.error('[preview] Error handling message:', err);
  }
}
