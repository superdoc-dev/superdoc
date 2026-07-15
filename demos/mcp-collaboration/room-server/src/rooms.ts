import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RoomManager } from './room-manager.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const CLIENT_PUBLIC_DIR = resolve(currentDir, '../../client/public');
const SAMPLE_DOC = join(CLIENT_PUBLIC_DIR, 'sample.docx');
const BLANK_DOC = join(CLIENT_PUBLIC_DIR, 'blank.docx');
const UPLOAD_DIR = join(tmpdir(), 'superdoc-mcp-collaboration', 'uploads');
const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

export async function registerRoomRoutes(app: FastifyInstance, rooms: RoomManager): Promise<void> {
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 50_000_000 } });

  app.post('/rooms/:roomId/start', async (request, reply) => {
    const roomId = readRoomId(request, reply);
    if (!roomId) return;

    let sourcePath = BLANK_DOC;
    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'useSample' && part.value === 'true') {
          sourcePath = SAMPLE_DOC;
        }
        if (part.type === 'file' && part.fieldname === 'file') {
          await mkdir(UPLOAD_DIR, { recursive: true });
          sourcePath = join(UPLOAD_DIR, `${roomId}.docx`);
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(Buffer.from(chunk));
          await writeFile(sourcePath, Buffer.concat(chunks));
        }
      }
    } else if ((request.body as { useSample?: boolean } | null)?.useSample) {
      sourcePath = SAMPLE_DOC;
    }

    return reply.code(201).send(rooms.start(roomId, sourcePath));
  });

  app.get('/rooms/:roomId/status', async (request, reply) => {
    const roomId = readRoomId(request, reply);
    if (!roomId) return;
    const status = rooms.status(roomId);
    return status ?? reply.code(404).send({ error: 'Room not found' });
  });

  app.get('/rooms/:roomId/download', async (request, reply) => {
    const roomId = readRoomId(request, reply);
    if (!roomId) return;
    const outputPath = await rooms.export(roomId);
    if (!outputPath) return reply.code(404).send({ error: 'Room not found' });
    reply.header('Content-Disposition', `attachment; filename="${roomId}.docx"`);
    reply.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return reply.send(createReadStream(outputPath));
  });

  app.post('/rooms/:roomId/stop', async (request, reply) => {
    const roomId = readRoomId(request, reply);
    if (!roomId) return;
    return { ok: await rooms.stop(roomId) };
  });
}

function readRoomId(request: FastifyRequest, reply: FastifyReply): string | null {
  const { roomId } = request.params as { roomId: string };
  if (ROOM_ID_PATTERN.test(roomId)) return roomId;
  void reply.code(400).send({ error: 'Invalid room ID' });
  return null;
}
