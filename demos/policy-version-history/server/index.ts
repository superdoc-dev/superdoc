import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Hocuspocus } from '@hocuspocus/server';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';

type PublishedVersion = {
  id: string;
  number: string;
  publishedAt: string;
  publishedBy: { name: string; email: string };
  yjsState: string;
  sizeBytes: number;
};

type RoomQuery = { roomId?: string };

const PORT = Number(process.env.PORT ?? 3011);
const versionsByRoom = new Map<string, PublishedVersion[]>();
const roomVersions = (roomId = 'policy-handbook') => {
  const existing = versionsByRoom.get(roomId);
  if (existing) return existing;
  const versions: PublishedVersion[] = [];
  versionsByRoom.set(roomId, versions);
  return versions;
};
// Full collaborative Yjs snapshots can exceed Fastify's 1 MB default,
// especially after importing a DOCX with fonts, media, or Custom XML parts.
// Base64 JSON adds roughly 33% transport overhead, so keep a demo-friendly cap.
const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ status: 'ok' }));

app.get<{ Querystring: RoomQuery }>('/api/versions', async (request) => ({
  versions: roomVersions(request.query.roomId).map(({ yjsState: _state, ...version }) => version),
}));

app.get<{ Params: { id: string }; Querystring: RoomQuery }>('/api/versions/:id', async (request, reply) => {
  const version = roomVersions(request.query.roomId).find((item) => item.id === request.params.id);
  if (!version) return reply.status(404).send({ error: 'Version not found' });
  return version;
});

app.post<{
  Body: { roomId?: string; yjsState?: string; publishedBy?: { name?: string; email?: string } };
}>('/api/versions', async (request, reply) => {
  const { roomId = 'policy-handbook', yjsState, publishedBy } = request.body ?? {};
  if (!yjsState || !publishedBy?.name || !publishedBy.email) {
    return reply.status(400).send({ error: 'yjsState and publisher identity are required' });
  }

  const buffer = Buffer.from(yjsState, 'base64');
  const versions = roomVersions(roomId);
  const version: PublishedVersion = {
    id: nanoid(10),
    number: `1.${versions.length + 1}`,
    publishedAt: new Date().toISOString(),
    publishedBy: { name: publishedBy.name, email: publishedBy.email },
    yjsState,
    sizeBytes: buffer.byteLength,
  };
  versions.unshift(version);
  const { yjsState: _state, ...summary } = version;
  return reply.status(201).send(summary);
});

const hocuspocus = new Hocuspocus({
  quiet: true,
  onConnect: async ({ documentName }) => app.log.info({ documentName }, 'collaborator connected'),
  onDisconnect: async ({ documentName }) => app.log.info({ documentName }, 'collaborator disconnected'),
});
const websocketServer = new WebSocketServer({ noServer: true });
websocketServer.on('connection', (socket, request) => {
  void hocuspocus.handleConnection(socket, request);
});

app.server.on('upgrade', (request, socket, head) => {
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocketServer.emit('connection', websocket, request);
  });
});

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`Policy version history server listening on http://localhost:${PORT}`);
