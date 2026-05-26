/**
 * Version History Demo - Backend Server
 *
 * A simple backend that demonstrates document versioning with SuperDoc.
 * Combines REST API + WebSocket collaboration in a single file.
 *
 * Features:
 *   - Upload documents and track them by room ID
 *   - Save named version snapshots
 *   - Revert to any previous version
 *   - Download version snapshots
 *   - Real-time collaboration via Hocuspocus
 *
 * Limits:
 *   - Max 50 rooms (oldest evicted when exceeded)
 *   - Max 10 versions per room (oldest deleted when exceeded)
 */

import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { Hocuspocus } from '@hocuspocus/server';
import { WebSocketServer } from 'ws';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { nanoid } from 'nanoid';
import { SuperDocClient } from '@superdoc-dev/sdk';

// =============================================================================
// CONFIGURATION
// =============================================================================

const Config = {
  port: parseInt(process.env.PORT || '3001', 10),
  docsDir: resolve('./data/documents'),
  versionsDir: resolve('./data/versions'),
  maxVersions: 10,
  maxRooms: 50,
};

// =============================================================================
// TYPES
// =============================================================================

type Doc = {
  id: string;
  filename: string;
  workingPath: string;
  roomId?: string;
  currentVersionId?: string;
};

type Version = {
  id: string;
  docId: string;
  label?: string;
  createdAt: string;
  path: string;
};

// =============================================================================
// SDK - SuperDoc client management
// =============================================================================

const SDK = {
  /** SDK client singleton */
  _client: null as SuperDocClient | null,

  /** Open document handles, keyed by document ID */
  _handles: new Map<string, any>(),

  /**
   * Get or create the SDK client singleton.
   */
  async getClient(): Promise<SuperDocClient> {
    if (!this._client) {
      this._client = new SuperDocClient({
        startupTimeoutMs: 15000,
        requestTimeoutMs: 90000,
      });
      await this._client.connect();
    }
    return this._client;
  },

  /**
   * Open a document. Returns cached handle if already open.
   */
  async open(id: string, path: string): Promise<any> {
    if (this._handles.has(id)) {
      return this._handles.get(id);
    }
    const client = await this.getClient();
    const handle = await client.open({ doc: path });
    this._handles.set(id, handle);
    return handle;
  },

  /**
   * Close a document handle.
   */
  async close(id: string): Promise<void> {
    const handle = this._handles.get(id);
    if (handle) {
      await handle.close({}).catch(() => {});
      this._handles.delete(id);
    }
  },

  /**
   * Close all handles and dispose the client.
   */
  async shutdown(): Promise<void> {
    for (const [id] of this._handles) {
      await this.close(id);
    }
    if (this._client) {
      await this._client.dispose().catch(() => {});
      this._client = null;
    }
  },
};

// =============================================================================
// DOCS - Document registry and operations
// =============================================================================

const Docs = {
  /** All documents, keyed by document ID */
  _store: new Map<string, Doc>(),

  /** Maps room ID -> document ID (for deduplication) */
  _byRoom: new Map<string, string>(),

  /** Document IDs in creation order (for LRU eviction) */
  _order: [] as string[],

  /**
   * Get a document by ID.
   */
  get(id: string): Doc | undefined {
    return this._store.get(id);
  },

  /**
   * Get a document by room ID.
   */
  getByRoom(roomId: string): Doc | undefined {
    const docId = this._byRoom.get(roomId);
    return docId ? this._store.get(docId) : undefined;
  },

  /**
   * List all documents.
   */
  list(): Doc[] {
    return [...this._store.values()];
  },

  /**
   * Check if a room already has a document.
   */
  hasRoom(roomId: string): boolean {
    return this._byRoom.has(roomId);
  },

  /**
   * Register a new document.
   */
  register(doc: Doc): void {
    this._store.set(doc.id, doc);
    this._order.push(doc.id);
    if (doc.roomId) {
      this._byRoom.set(doc.roomId, doc.id);
    }
  },

  /**
   * Remove a document from all registries.
   */
  unregister(id: string): void {
    const doc = this._store.get(id);
    if (!doc) return;

    this._store.delete(id);
    if (doc.roomId) {
      this._byRoom.delete(doc.roomId);
    }
    const orderIdx = this._order.indexOf(id);
    if (orderIdx !== -1) {
      this._order.splice(orderIdx, 1);
    }
  },

  /**
   * Check if we're at capacity.
   */
  atCapacity(): boolean {
    return this._order.length >= Config.maxRooms;
  },

  /**
   * Get the oldest document ID (for eviction).
   */
  getOldest(): string | undefined {
    return this._order[0];
  },

  /**
   * Evict oldest rooms until under capacity.
   * Cleans up SDK handles, versions, and files.
   */
  async evictOldest(): Promise<void> {
    while (this.atCapacity()) {
      const id = this._order.shift();
      if (!id) break;

      const doc = this._store.get(id);
      if (!doc) continue;

      // Close SDK handle
      await SDK.close(id);

      // Delete all versions
      await Versions.deleteAll(id);

      // Delete working file
      await unlink(doc.workingPath).catch(() => {});

      // Remove from registries
      this._store.delete(id);
      if (doc.roomId) {
        this._byRoom.delete(doc.roomId);
      }
    }
  },
};

// =============================================================================
// VERSIONS - Version storage and operations
// =============================================================================

const Versions = {
  /** All versions, keyed by document ID (newest first) */
  _store: new Map<string, Version[]>(),

  /** Cached blobs to avoid disk reads */
  _blobs: new Map<string, Buffer>(),

  /**
   * Get all versions for a document.
   */
  list(docId: string): Version[] {
    return this._store.get(docId) || [];
  },

  /**
   * Get a specific version.
   */
  get(docId: string, versionId: string): Version | undefined {
    const vers = this._store.get(docId) || [];
    return vers.find((v) => v.id === versionId);
  },

  /**
   * Get the latest version for a document.
   */
  getLatest(docId: string): Version | undefined {
    const vers = this._store.get(docId) || [];
    return vers[0];
  },

  /**
   * Get version blob from cache or disk.
   */
  async getBlob(version: Version): Promise<Buffer> {
    const cached = this._blobs.get(version.id);
    if (cached) {
      return cached;
    }
    const blob = await readFile(version.path);
    this._blobs.set(version.id, blob);
    return blob;
  },

  /**
   * Save a new version.
   */
  async save(docId: string, buffer: Buffer, label?: string): Promise<Version> {
    const id = nanoid(8);
    const path = join(Config.versionsDir, `${docId}-${id}.docx`);

    // Write to disk
    await writeFile(path, buffer);

    // Create version record
    const version: Version = {
      id,
      docId,
      label,
      createdAt: new Date().toISOString(),
      path,
    };

    // Cache blob
    this._blobs.set(id, buffer);

    // Add to store (newest first)
    const vers = this._store.get(docId) || [];
    vers.unshift(version);
    this._store.set(docId, vers);

    // Enforce limit
    await this.evictOld(docId);

    return version;
  },

  /**
   * Delete a specific version.
   */
  async delete(docId: string, versionId: string): Promise<Version | null> {
    const vers = this._store.get(docId) || [];
    const idx = vers.findIndex((v) => v.id === versionId);
    if (idx === -1) {
      return null;
    }

    const [version] = vers.splice(idx, 1);
    this._blobs.delete(version.id);
    await unlink(version.path).catch(() => {});

    return version;
  },

  /**
   * Delete all versions for a document.
   */
  async deleteAll(docId: string): Promise<void> {
    const vers = this._store.get(docId) || [];
    for (const v of vers) {
      this._blobs.delete(v.id);
      await unlink(v.path).catch(() => {});
    }
    this._store.delete(docId);
  },

  /**
   * Evict oldest versions when over the limit.
   */
  async evictOld(docId: string): Promise<void> {
    const vers = this._store.get(docId) || [];
    while (vers.length > Config.maxVersions) {
      const old = vers.pop()!;
      this._blobs.delete(old.id);
      await unlink(old.path).catch(() => {});
    }
  },
};

// =============================================================================
// API - HTTP route handlers
// =============================================================================

const API = {
  /**
   * POST /api/documents
   * Upload a new document. If roomId is provided and a document already exists
   * for that room, returns the existing document instead.
   */
  async uploadDocument(req: FastifyRequest, reply: FastifyReply) {
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file' });
    }

    const buffer = await file.toBuffer();
    const roomId = (file.fields.roomId as any)?.value as string | undefined;
    req.log.info({ filename: file.filename, roomId }, '→ upload');

    // If room already has a document, return it
    if (roomId && Docs.hasRoom(roomId)) {
      const existing = Docs.getByRoom(roomId)!;
      return reply.send({
        documentId: existing.id,
        filename: existing.filename,
      });
    }

    // Evict oldest room if at capacity
    await Docs.evictOldest();

    // Create new document
    const id = nanoid(12);
    const workingPath = join(Config.docsDir, `${id}-${basename(file.filename)}`);
    await writeFile(workingPath, buffer);

    const doc: Doc = {
      id,
      filename: basename(file.filename),
      workingPath,
      roomId,
    };

    // Register and open
    Docs.register(doc);
    await SDK.open(id, workingPath);

    req.log.info({ id }, '← created');
    return reply.status(201).send({
      documentId: id,
      filename: doc.filename,
    });
  },

  /**
   * GET /api/documents
   * List all documents.
   */
  async listDocuments(_req: FastifyRequest, reply: FastifyReply) {
    const documents = Docs.list().map((d) => ({
      id: d.id,
      filename: d.filename,
      currentVersionId: d.currentVersionId,
    }));
    return reply.send({ documents });
  },

  /**
   * GET /api/documents/:id
   * Get a single document with its versions.
   */
  async getDocument(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const doc = Docs.get(req.params.id);
    if (!doc) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const vers = Versions.list(doc.id);
    return reply.send({
      documentId: doc.id,
      filename: doc.filename,
      currentVersionId: doc.currentVersionId,
      versions: vers.map((v) => ({
        id: v.id,
        label: v.label,
        createdAt: v.createdAt,
      })),
    });
  },

  /**
   * POST /api/documents/:id/versions
   * Save the current document state as a new version.
   * Client exports the DOCX and uploads it here.
   */
  async saveVersion(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const doc = Docs.get(req.params.id);
    if (!doc) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file' });
    }

    const buffer = await file.toBuffer();
    const label = (file.fields.label as any)?.value as string | undefined;
    req.log.info({ docId: doc.id, label }, '→ save version');

    // Save version
    const version = await Versions.save(doc.id, buffer, label);

    // Update current version pointer
    doc.currentVersionId = version.id;

    req.log.info({ id: version.id }, '← saved');
    return reply.status(201).send({
      versionId: version.id,
      label: version.label,
      createdAt: version.createdAt,
    });
  },

  /**
   * GET /api/documents/:id/versions
   * List all versions for a document.
   */
  async listVersions(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const doc = Docs.get(req.params.id);
    if (!doc) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const vers = Versions.list(doc.id);
    return reply.send({
      documentId: doc.id,
      currentVersionId: doc.currentVersionId,
      versions: vers.map((v) => ({
        id: v.id,
        label: v.label,
        createdAt: v.createdAt,
      })),
    });
  },

  /**
   * POST /api/documents/:id/versions/:versionId/revert
   * Revert document to a previous version.
   * Overwrites the working file and reopens with SDK.
   */
  async revertVersion(
    req: FastifyRequest<{ Params: { id: string; versionId: string } }>,
    reply: FastifyReply,
  ) {
    const doc = Docs.get(req.params.id);
    if (!doc) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const version = Versions.get(doc.id, req.params.versionId);
    if (!version) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    req.log.info({ docId: doc.id, versionId: version.id }, '→ revert');

    // Get version blob and overwrite working file
    const blob = await Versions.getBlob(version);
    await SDK.close(doc.id);
    await writeFile(doc.workingPath, blob);
    await SDK.open(doc.id, doc.workingPath);

    doc.currentVersionId = version.id;

    req.log.info({ versionId: version.id }, '← reverted');
    return reply.send({
      reverted: true,
      versionId: version.id,
      restoredAt: new Date().toISOString(),
    });
  },

  /**
   * GET /api/documents/:id/versions/:versionId/download
   * Download a version snapshot as DOCX.
   */
  async downloadVersion(
    req: FastifyRequest<{ Params: { id: string; versionId: string } }>,
    reply: FastifyReply,
  ) {
    const doc = Docs.get(req.params.id);
    if (!doc) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const version = Versions.get(doc.id, req.params.versionId);
    if (!version) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    const blob = await Versions.getBlob(version);
    return reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      .header(
        'Content-Disposition',
        `attachment; filename="${doc.id}-${version.id}.docx"`,
      )
      .send(blob);
  },

  /**
   * DELETE /api/documents/:id/versions/:versionId
   * Delete a version snapshot.
   */
  async deleteVersion(
    req: FastifyRequest<{ Params: { id: string; versionId: string } }>,
    reply: FastifyReply,
  ) {
    const doc = Docs.get(req.params.id);
    if (!doc) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const version = await Versions.delete(doc.id, req.params.versionId);
    if (!version) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    req.log.info({ versionId: version.id }, '← deleted');
    return reply.send({
      deleted: true,
      versionId: version.id,
    });
  },
};

// =============================================================================
// ROUTES
// =============================================================================

const routes: Array<{
  method: 'get' | 'post' | 'delete';
  path: string;
  handler: any;
}> = [
  { method: 'get', path: '/health', handler: async () => ({ status: 'ok' }) },
  { method: 'post', path: '/api/documents', handler: API.uploadDocument },
  { method: 'get', path: '/api/documents', handler: API.listDocuments },
  { method: 'get', path: '/api/documents/:id', handler: API.getDocument },
  { method: 'post', path: '/api/documents/:id/versions', handler: API.saveVersion },
  { method: 'get', path: '/api/documents/:id/versions', handler: API.listVersions },
  { method: 'post', path: '/api/documents/:id/versions/:versionId/revert', handler: API.revertVersion },
  { method: 'get', path: '/api/documents/:id/versions/:versionId/download', handler: API.downloadVersion },
  { method: 'delete', path: '/api/documents/:id/versions/:versionId', handler: API.deleteVersion },
];

// =============================================================================
// COLLABORATION SERVER (Hocuspocus)
// =============================================================================

const Collab = {
  _server: null as Hocuspocus | null,

  /**
   * Log a collab event with timestamp.
   */
  log(event: string, data: Record<string, any> = {}): void {
    const timestamp = new Date().toISOString().slice(11, 19);
    const dataStr = Object.keys(data).length ? JSON.stringify(data) : '';
    console.log(
      `\x1b[2m[${timestamp}]\x1b[0m \x1b[36m[collab]\x1b[0m ${event}`,
      dataStr,
    );
  },

  /**
   * Create the Hocuspocus server (doesn't start listening yet).
   * We'll attach it to Fastify's HTTP server for WebSocket upgrades.
   */
  create(): Hocuspocus {
    this._server = new Hocuspocus({
      // Don't listen on a separate port - we'll handle upgrades manually
      onConnect: async ({ documentName, socketId }) => {
        this.log('connect', { doc: documentName, socket: socketId.slice(0, 8) });
      },
      onDisconnect: async ({ documentName, socketId }) => {
        this.log('disconnect', { doc: documentName, socket: socketId.slice(0, 8) });
      },
      onLoadDocument: async ({ documentName }) => {
        this.log('load', { doc: documentName });
        return null;
      },
      onChange: async ({ documentName }) => {
        this.log('change', { doc: documentName });
      },
    });
    return this._server;
  },

  /**
   * Get the server instance.
   */
  get(): Hocuspocus | null {
    return this._server;
  },

  /**
   * Stop the collaboration server.
   */
  async stop(): Promise<void> {
    if (this._server) {
      await this._server.destroy();
      this._server = null;
    }
  },
};

// =============================================================================
// STARTUP
// =============================================================================

// Ensure data directories exist
await mkdir(Config.docsDir, { recursive: true });
await mkdir(Config.versionsDir, { recursive: true });

// Create collaboration server (will attach to Fastify)
const hocuspocus = Collab.create();

// Create REST API server
const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  },
});

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

// Register all routes
routes.forEach((r) => app[r.method](r.path, r.handler));

// Start listening
await app.listen({ port: Config.port, host: '0.0.0.0' });

// Attach Hocuspocus to handle WebSocket upgrades on the same port.
// Simple single-port setup for demo purposes. In production you might run
// HTTP and WebSocket on separate services for independent scaling.
const wss = new WebSocketServer({ noServer: true });
const httpServer = app.server;
httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    hocuspocus.handleConnection(ws, request);
  });
});

console.log(`
┌─────────────────────────────────────────┐
│  Version History Demo                   │
├─────────────────────────────────────────┤
│  HTTP + WS: http://localhost:${String(Config.port).padEnd(10)}│
│  Limits:    ${Config.maxRooms} rooms, ${Config.maxVersions} versions/room   │
└─────────────────────────────────────────┘
`);

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await SDK.shutdown();
  await Collab.stop();
  await app.close();
  process.exit(0);
});
