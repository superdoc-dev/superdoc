import { createServer } from 'node:http';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  CollaborationBuilder,
  type CollaborationWebSocket,
  type SocketRequest,
} from '@superdoc-dev/superdoc-yjs-collaboration';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

const PORT = 8081;
const BASE_PATH = '/v1/collaboration';

const collaboration = new CollaborationBuilder()
  .withName('superdoc-dev-collab')
  .withDebounce(500)
  // Zero security / zero persistence: always start from an empty Yjs doc.
  .onLoad(() => encodeStateAsUpdate(new YDoc()))
  .build();

type UpgradeValidationResult = { ok: true; documentId: string } | { ok: false; statusCode: 400 | 404 };

export function validateUpgradePath(pathname: string): UpgradeValidationResult {
  const prefix = `${BASE_PATH}/`;
  if (!pathname.startsWith(prefix)) {
    return { ok: false, statusCode: 404 };
  }

  const encodedDocumentId = pathname.slice(prefix.length);
  if (!encodedDocumentId) {
    return { ok: false, statusCode: 400 };
  }

  try {
    const documentId = decodeURIComponent(encodedDocumentId);
    if (!documentId) {
      return { ok: false, statusCode: 400 };
    }
    return { ok: true, documentId };
  } catch {
    return { ok: false, statusCode: 400 };
  }
}

function createUpgradeRequest(
  requestUrl: string,
  documentId: string,
  headers?: SocketRequest['headers'],
): SocketRequest {
  return {
    url: requestUrl,
    params: { documentId },
    headers,
  };
}

function writeUpgradeError(
  socket: { write: (chunk: string) => void; destroy: () => void },
  statusCode: 400 | 404,
): void {
  const statusText = statusCode === 404 ? 'Not Found' : 'Bad Request';
  socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\n\r\n`);
  socket.destroy();
}

export function createCollabServer(): ReturnType<typeof createServer> {
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not Found');
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host ?? `localhost:${PORT}`;
    const requestUrl = request.url ?? '/';
    const url = new URL(requestUrl, `http://${host}`);
    const validation = validateUpgradePath(url.pathname);

    if (!validation.ok) {
      writeUpgradeError(socket, validation.statusCode);
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const collaborationSocket: CollaborationWebSocket = ws;
      const upgradeRequest = createUpgradeRequest(requestUrl, validation.documentId, request.headers);
      collaboration.welcome(collaborationSocket, upgradeRequest).catch((error: unknown) => {
        console.error('[collab] welcome failed:', error);
        try {
          ws.close(1011, 'collaboration init failed');
        } catch {
          // no-op
        }
      });
    });
  });

  return server;
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return resolvePath(entryPath) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  const server = createCollabServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[collab] SuperDoc Yjs server running on ws://localhost:${PORT}${BASE_PATH}/:documentId`);
    console.log('[collab] Example room: superdoc-dev-room');
  });
}
