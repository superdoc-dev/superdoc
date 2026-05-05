import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as rm from '../runtime/room-manager.js';
import path from 'node:path';
import os from 'node:os';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLANK_DOC = path.resolve(__dirname, '../../../client/public/blank.docx');
const SAMPLE_DOC = path.resolve(__dirname, '../../../client/public/sample.docx');
const UPLOAD_DIR = path.join(os.tmpdir(), 'superdoc-ai-example');

export async function roomRoutes(app: FastifyInstance) {
  // Register multipart support for file uploads
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 50_000_000 } });

  app.post('/rooms/:roomId/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { roomId } = request.params as { roomId: string };

    let model = 'gpt-5.4';
    let changeMode = 'direct';
    let useSample = false;
    let docPath = BLANK_DOC;

    // Parse multipart form data
    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'model') model = String(part.value);
          if (part.fieldname === 'changeMode') changeMode = String(part.value);
          if (part.fieldname === 'useSample') useSample = part.value === 'true';
        }
        if (part.type === 'file' && part.fieldname === 'file') {
          // Save uploaded file to temp dir
          await mkdir(UPLOAD_DIR, { recursive: true });
          const uploadPath = path.join(UPLOAD_DIR, `${roomId}.docx`);
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          await writeFile(uploadPath, Buffer.concat(chunks));
          docPath = uploadPath;
        }
      }
      if (useSample) docPath = SAMPLE_DOC;
    } else {
      // JSON body fallback
      const body = request.body as { model?: string; changeMode?: string; useSample?: boolean } | null;
      if (body?.model) model = body.model;
      if (body?.changeMode) changeMode = body.changeMode;
      if (body?.useSample) docPath = SAMPLE_DOC;
    }

    console.log(`[routes] POST /rooms/${roomId}/start — model=${model} changeMode=${changeMode} useSample=${useSample} docPath=${docPath}`);
    const result = await rm.startRoom(roomId, { model, changeMode, docPath });
    return reply.code(201).send(result);
  });

  app.get('/rooms/:roomId/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { roomId } = request.params as { roomId: string };
    const status = rm.getRoomStatus(roomId);
    if (!status) return reply.code(404).send({ error: 'Room not found' });
    return status;
  });

  app.post('/rooms/:roomId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const { roomId } = request.params as { roomId: string };
    const body = request.body as { input: string; displayName?: string } | null;
    if (!body?.input) return reply.code(400).send({ error: 'input is required' });

    const result = await rm.sendMessage(roomId, body.input, body.displayName || 'User');
    if (!result) return reply.code(404).send({ error: 'Room not found or agent not ready' });
    return reply.code(202).send(result);
  });

  app.get(
    '/rooms/:roomId/messages/:messageId/stream',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roomId, messageId } = request.params as { roomId: string; messageId: string };

      // Hijack the response so Fastify doesn't try to send its own after we start streaming.
      // Set CORS + SSE headers manually since reply.raw bypasses Fastify's pipeline.
      const origin = request.headers.origin;
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      });

      const unsubscribe = rm.subscribeToRun(roomId, messageId, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'done' || event.type === 'error') {
          reply.raw.end();
        }
      });

      if (!unsubscribe) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: 'Run not found' })}\n\n`);
        reply.raw.end();
        return;
      }

      request.raw.on('close', () => {
        unsubscribe();
      });
    },
  );

  app.post(
    '/rooms/:roomId/messages/:messageId/cancel',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roomId, messageId } = request.params as { roomId: string; messageId: string };
      const ok = rm.cancelRun(roomId, messageId);
      return { ok };
    },
  );

  app.post('/rooms/:roomId/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { roomId } = request.params as { roomId: string };
    const body = request.body as { model?: string; changeMode?: string } | null;
    const ok = rm.updateRoomSettings(roomId, body || {});
    if (!ok) return reply.code(404).send({ error: 'Room not found' });
    return { ok: true };
  });

  app.post('/rooms/:roomId/stop', async (request: FastifyRequest, reply: FastifyReply) => {
    const { roomId } = request.params as { roomId: string };
    await rm.stopRoom(roomId);
    return { ok: true };
  });
}
