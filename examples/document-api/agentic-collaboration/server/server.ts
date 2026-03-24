import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';
import type { WebSocket } from 'ws';

import {
  CollaborationBuilder,
  type CollaborationParams,
  type UserContext,
  type ServiceConfig
} from '@superdoc-dev/superdoc-yjs-collaboration';

// ============================================================================
// Chat Types
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

// ============================================================================
// Collaboration Hooks
// ============================================================================

const handleConfig = (config: ServiceConfig): void => {
  console.log('[Server] Collaboration service configured');
};

const handleAuth = async ({ documentId }: CollaborationParams): Promise<UserContext> => {
  console.log(`[Server] Auth for document: ${documentId}`);
  return {
    user: { userid: 'abc', username: 'testuser' },
    organizationid: 'someorg123',
    custom: { someCustomKey: 'somevalue' }
  };
};

const handleLoad = async (params: CollaborationParams): Promise<Uint8Array> => {
  console.log(`[Server] Loading document: ${params.documentId}`);
  const ydoc = new YDoc();
  return encodeStateAsUpdate(ydoc);
};

const SuperDocCollaboration = new CollaborationBuilder()
  .withName('SuperDoc Collaboration service')
  .withDebounce(2000)
  .onConfigure(handleConfig)
  .onLoad(handleLoad)
  .onAuthenticate(handleAuth)
  .build();

// ============================================================================
// Server Setup
// ============================================================================

async function main() {
  const fastify = Fastify({ logger: false });
  const port = parseInt(process.env.PORT || '3050', 10);

  // Register WebSocket plugin
  await fastify.register(websocketPlugin);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Collaboration WebSocket
  fastify.get('/collaboration/:documentId', { websocket: true }, (socket, request) => {
    const documentId = (request.params as { documentId: string }).documentId;
    console.log(`[Server] Collaboration client connected: ${documentId}`);
    SuperDocCollaboration.welcome(socket as any, request as any);
  });

  // Chat WebSocket
  fastify.get('/chat/:roomId', { websocket: true }, (socket, request) => {
    const roomId = (request.params as { roomId: string }).roomId;
    const room = getChatRoom(roomId);
    room.clients.add(socket);
    console.log(`[Server] Chat client joined "${roomId}" (${room.clients.size} clients)`);

    // Send current state
    socket.send(JSON.stringify({ type: 'init', messages: room.messages, agentStatus: room.agentStatus }));

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[Server] Chat ${msg.type} from ${msg.role || 'system'}:`, msg.content?.slice(0, 50) || '');

        if (msg.type === 'message') {
          const chatMsg: ChatMessage = {
            id: msg.id || `${msg.role}-${Date.now()}`,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || Date.now()
          };
          room.messages.push(chatMsg);
          console.log(`[Server] Broadcasting to ${room.clients.size - 1} other clients`);
          broadcastToRoom(roomId, { type: 'message', message: chatMsg }, socket);
        } else if (msg.type === 'status') {
          room.agentStatus = msg.status;
          broadcastToRoom(roomId, { type: 'status', status: msg.status }, socket);
        } else if (msg.type === 'clear') {
          room.messages = [];
          broadcastToRoom(roomId, { type: 'clear' });
        }
      } catch (e) {
        console.error('[Server] Chat parse error:', e);
      }
    });

    socket.on('close', () => {
      room.clients.delete(socket);
      console.log(`[Server] Chat client left "${roomId}" (${room.clients.size} clients)`);
    });
  });

  // Start server
  await fastify.listen({ port, host: '0.0.0.0' });

  console.log('[Server] ' + '='.repeat(50));
  console.log(`[Server] Listening at http://0.0.0.0:${port}`);
  console.log(`[Server] Collaboration: ws://localhost:${port}/collaboration/:documentId`);
  console.log(`[Server] Chat: ws://localhost:${port}/chat/:roomId`);
  console.log('[Server] ' + '='.repeat(50));
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
