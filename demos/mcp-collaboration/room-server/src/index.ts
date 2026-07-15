import Fastify from 'fastify';
import cors from '@fastify/cors';
import { RoomManager } from './room-manager.js';
import { registerRoomRoutes } from './rooms.js';

const host = process.env.ROOM_HTTP_HOST ?? '127.0.0.1';
const port = process.env.ROOM_HTTP_PORT ? Number(process.env.ROOM_HTTP_PORT) : 8090;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173';
const collaborationUrl = process.env.COLLAB_WS_URL ?? 'ws://127.0.0.1:8081';

const rooms = new RoomManager(collaborationUrl);
const app = Fastify({ logger: { level: 'warn' } });

await app.register(cors, { origin: [frontendOrigin], methods: ['GET', 'POST', 'OPTIONS'] });
app.get('/', async () => ({ ok: true, service: 'mcp-collaboration-rooms' }));
await registerRoomRoutes(app, rooms);
await app.listen({ host, port });

console.log(`SuperDoc room server listening at http://${host}:${port}`);

async function shutdown(): Promise<void> {
  await app.close();
  await rooms.stopAll();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
