import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';
import type { WebSocket } from 'ws';
import type { FastifyRequest } from 'fastify';

import {
  CollaborationBuilder,
  type CollaborationParams,
  type CollaborationWebSocket,
  type SocketRequest,
  type UserContext,
  type ServiceConfig
} from '@superdoc-dev/superdoc-yjs-collaboration';


/** Create an example server */
const fastify = Fastify({ logger: false });
fastify.register(websocketPlugin);




/** We create some basic hooks */
const handleConfig = (config: ServiceConfig): void => {
  console.debug('[handleConfig] Service has been configured', config);
}

const handleAuth = async ({ documentId, socket, request }: CollaborationParams): Promise<UserContext> => {
  console.debug(`[handleAuth] Authenticating connection for document ${documentId}`);
  const user = { userid: 'abc', username: 'testuser' };
  const organizationid = "someorg123";
  const custom = { someCustomKey: 'somevalue' }
  const context = { user, organizationid, custom };
  return context;
};

const handleLoad = async (params: CollaborationParams): Promise<Uint8Array> => {
  const ydoc = new YDoc();
  console.debug('[handleLoad] loaded', params)
  return encodeStateAsUpdate(ydoc);
}

const handleOnChange = async (params: CollaborationParams): Promise<void> => {
  console.debug(`[handleOnChange Document ${params.documentId} changed.`);
};

const handleAutoSave = async (params: CollaborationParams): Promise<void> => {
  console.debug('handleAutoSave]')
  // console.debug('handleAutoSave] params', params)
}


const SuperDocCollaboration = new CollaborationBuilder()
  .withName('SuperDoc Collaboration service')
  .withDebounce(2000)
  .onConfigure(handleConfig)
  .onLoad(handleLoad)
  .onAuthenticate(handleAuth)
  .onChange(handleOnChange)
  .onAutoSave(handleAutoSave)
  .build();


/** Health check route (works even with static file serving) */
fastify.get('/health', async (request, reply) => ({ status: 'ok' }));


/** An example route for websocket collaboration connection */
fastify.register(async function (fastify) {
  fastify.get('/collaboration/:documentId', { websocket: true }, (socket, request) => {
    SuperDocCollaboration.welcome(socket as any, request as any)
  })
});


// ============================================================================
// Simple Chat WebSocket (separate from Yjs collaboration)
// ============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatRoom {
  messages: ChatMessage[];
  clients: Set<WebSocket>;
  agentStatus: string;
}

const chatRooms = new Map<string, ChatRoom>();

function getChatRoom(roomId: string): ChatRoom {
  if (!chatRooms.has(roomId)) {
    chatRooms.set(roomId, { messages: [], clients: new Set(), agentStatus: 'offline' });
  }
  return chatRooms.get(roomId)!;
}

function broadcastToRoom(roomId: string, data: object, exclude?: WebSocket) {
  const room = getChatRoom(roomId);
  const msg = JSON.stringify(data);
  for (const client of room.clients) {
    if (client !== exclude && client.readyState === 1) client.send(msg);
  }
}

fastify.register(async function (fastify) {
  fastify.get('/chat/:roomId', { websocket: true }, (socket, request) => {
    const roomId = (request.params as { roomId: string }).roomId;
    const room = getChatRoom(roomId);
    room.clients.add(socket);
    console.log(`[Chat] Client joined ${roomId} (${room.clients.size} clients)`);

    // Send current state
    socket.send(JSON.stringify({ type: 'init', messages: room.messages, agentStatus: room.agentStatus }));

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message') {
          const chatMsg: ChatMessage = { id: msg.id || `${msg.role}-${Date.now()}`, role: msg.role, content: msg.content, timestamp: msg.timestamp || Date.now() };
          room.messages.push(chatMsg);
          broadcastToRoom(roomId, { type: 'message', message: chatMsg });
        } else if (msg.type === 'status') {
          room.agentStatus = msg.status;
          broadcastToRoom(roomId, { type: 'status', status: msg.status }, socket);
        } else if (msg.type === 'clear') {
          room.messages = [];
          broadcastToRoom(roomId, { type: 'clear' });
        }
      } catch (e) { console.error('[Chat] Invalid message:', e); }
    });

    socket.on('close', () => {
      room.clients.delete(socket);
      console.log(`[Chat] Client left ${roomId} (${room.clients.size} clients)`);
    });
  });
});


/** Start the example! */
const start = async (): Promise<void> => {
  const port = parseInt(process.env.PORT || '3050', 10);
  fastify.listen({ port, host: '0.0.0.0' }, errorHandler);
  console.log(`Server listening at http://0.0.0.0:${port}`);
};

/** Basic error handler example */
const errorHandler = (err: Error | null, address?: string): void => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
