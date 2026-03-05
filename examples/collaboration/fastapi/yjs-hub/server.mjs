import { createServer as createHttpServer } from 'node:http';
import net from 'node:net';

import { createAuthPlugin, createYHub } from '@y/hub';
import * as Y from '@y/y';
import postgres from 'postgres';

const PORT = Number(process.env.PORT ?? 8081);
const YHUB_INTERNAL_PORT = Number(process.env.YHUB_INTERNAL_PORT ?? 8082);
const YHUB_INTERNAL_HOST = process.env.YHUB_INTERNAL_HOST ?? '127.0.0.1';
const BASE_PATH = '/v1/collaboration';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PREFIX = process.env.REDIS_PREFIX ?? 'superdoc-fastapi';
const POSTGRES_URL =
  process.env.POSTGRES_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/yhub';
const EPHEMERAL = process.env.EPHEMERAL !== '0';
const AUTH_TOKEN = process.env.YHUB_AUTH_TOKEN ?? 'YOUR_PRIVATE_TOKEN';

const ORG = process.env.YHUB_ORG ?? 'superdoc';
const EXAMPLE_DOC_ID = process.env.YHUB_DOC_ID ?? 'superdoc-dev-room';
const roomUpdateCount = new Map();
const ACTIVITY_MAX_EVENTS_PER_ROOM = 250;
const ACTIVITY_SSE_HEARTBEAT_MS = 15_000;
const UPDATE_INSPECTOR_ORIGIN = Symbol('yjs-hub-update-inspector');
const roomActivityEvents = new Map();
const roomActivitySubscribers = new Map();
const roomUpdateInspectors = new Map();
let yhub = null;
let proxyServer = null;
let activityEventSequence = 0;

function formatRoom(room) {
  const org = room?.org ?? 'unknown-org';
  const docid = room?.docid ?? 'unknown-doc';
  const branch = room?.branch ?? 'main';
  return `${org}/${docid}@${branch}`;
}

function createActivityEventId() {
  activityEventSequence += 1;
  return `${Date.now()}-${activityEventSequence}`;
}

function guessUpdateType(bytes) {
  if (bytes > 50_000) return 'likely-seed-from-docx';
  if (bytes > 2_000) return 'likely-seed-or-large-edit';
  if (bytes > 3) return 'small-edit-or-blank-seed';
  return 'noop';
}

function summarizeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Uint8Array) return `Uint8Array(${value.byteLength})`;
  if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
  if (typeof value === 'string') return value.length > 64 ? `string(${value.length})` : JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return value.constructor?.name ?? 'Object';
  return String(value);
}

function normalizeChangeType(action) {
  if (action === 'add') return 'added';
  if (action === 'delete') return 'deleted';
  return 'modified';
}

function summarizeDelta(delta) {
  let insertChars = 0;
  let insertOps = 0;
  let deleteOps = 0;
  let retainOps = 0;
  delta.forEach((op) => {
    if (typeof op.insert === 'string') {
      insertOps += 1;
      insertChars += op.insert.length;
      return;
    }
    if (op.insert != null) {
      insertOps += 1;
      return;
    }
    if (typeof op.delete === 'number') {
      deleteOps += op.delete;
      return;
    }
    if (typeof op.retain === 'number') {
      retainOps += op.retain;
    }
  });
  return `delta(insertOps=${insertOps}, insertChars=${insertChars}, delete=${deleteOps}, retain=${retainOps})`;
}

function classifyDelta(delta) {
  const hasInsert = delta.some((op) => op.insert != null);
  const hasDelete = delta.some((op) => typeof op.delete === 'number' && op.delete > 0);
  if (hasInsert && hasDelete) return 'modified';
  if (hasDelete) return 'deleted';
  if (hasInsert) return 'added';
  return 'modified';
}

function resolveRootType(doc, targetType) {
  let current = targetType;
  while (current?.parent && !(current.parent instanceof Y.Doc)) {
    current = current.parent;
  }
  return current ?? targetType ?? null;
}

function resolveRootName(doc, rootType) {
  if (!rootType) return null;
  for (const [name, type] of doc.share.entries()) {
    if (type === rootType) return name;
  }
  return null;
}

function resolveParentSub(type) {
  const parentSub = type?._item?.parentSub;
  return typeof parentSub === 'string' && parentSub.length > 0 ? parentSub : null;
}

function dedupeActivityItems(items) {
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const key = JSON.stringify([
      item.changedKeys,
      item.entryKey,
      item.type,
      item.valueSummary,
      item.targetType,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function extractActivityItemsFromTransaction(doc, transaction) {
  if (!(transaction.changedParentTypes instanceof Map)) {
    return [];
  }
  const items = [];
  for (const [changedType, events] of transaction.changedParentTypes.entries()) {
    if (!Array.isArray(events) || events.length === 0) continue;
    for (const event of events) {
      const targetType = event?.target ?? changedType;
      const rootType = resolveRootType(doc, targetType);
      const rootName = resolveRootName(doc, rootType);
      const changedKeys = rootName ? [rootName] : [];

      if (event.keysChanged instanceof Set && event.changes?.keys instanceof Map && event.keysChanged.size > 0) {
        for (const entryKeyValue of event.keysChanged) {
          const entryKey = String(entryKeyValue);
          const keyChange = event.changes.keys.get(entryKeyValue);
          const changeType = normalizeChangeType(keyChange?.action);
          let valueSummary = summarizeValue(keyChange?.oldValue);
          if (changeType !== 'deleted' && typeof event.target?.get === 'function') {
            valueSummary = summarizeValue(event.target.get(entryKeyValue));
          }
          items.push({
            changedKeys,
            entryKey,
            type: changeType,
            valueSummary,
            targetType: targetType?.constructor?.name ?? 'UnknownType',
          });
        }
        continue;
      }

      if (Array.isArray(event.changes?.delta) && event.changes.delta.length > 0) {
        items.push({
          changedKeys,
          entryKey: resolveParentSub(targetType),
          type: classifyDelta(event.changes.delta),
          valueSummary: summarizeDelta(event.changes.delta),
          targetType: targetType?.constructor?.name ?? 'UnknownType',
        });
      }
    }
  }
  return dedupeActivityItems(items);
}

function inspectUpdateActivity(room, update) {
  const roomKey = formatRoom(room);
  let inspector = roomUpdateInspectors.get(roomKey);
  if (!inspector) {
    inspector = { doc: new Y.Doc() };
    roomUpdateInspectors.set(roomKey, inspector);
  }

  const items = [];
  const onAfterTransaction = (transaction) => {
    if (transaction.origin !== UPDATE_INSPECTOR_ORIGIN) return;
    items.push(...extractActivityItemsFromTransaction(inspector.doc, transaction));
  };

  inspector.doc.on('afterTransaction', onAfterTransaction);
  try {
    Y.applyUpdate(inspector.doc, update, UPDATE_INSPECTOR_ORIGIN);
  } catch (error) {
    console.warn(`[yjs-hub] failed to inspect update for room=${roomKey}:`, error);
  } finally {
    inspector.doc.off('afterTransaction', onAfterTransaction);
  }

  return dedupeActivityItems(items);
}

function extractAttributionSummary(contentMapBin) {
  const result = {
    actors: [],
    customAttributions: [],
    clocks: [],
  };
  if (!(contentMapBin instanceof Uint8Array)) {
    return result;
  }

  try {
    const contentMap = Y.decodeContentMap(contentMapBin);
    const actorSet = new Set();
    const customAttributionSet = new Set();
    const customAttributions = [];
    const clockSet = new Set();

    const addClock = (value) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && !clockSet.has(numeric)) {
        clockSet.add(numeric);
      }
    };

    const addActors = (value) => {
      if (typeof value !== 'string') return;
      value
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((actor) => actorSet.add(actor));
    };

    const addCustomAttribution = (name, value) => {
      if (typeof name !== 'string' || typeof value !== 'string') return;
      if (!name.startsWith('insert:') && !name.startsWith('delete:')) return;
      const key = name.slice(name.indexOf(':') + 1);
      const uniqueKey = `${key}=${value}`;
      if (customAttributionSet.has(uniqueKey)) return;
      customAttributionSet.add(uniqueKey);
      customAttributions.push({ k: key, v: value });
    };

    const scanRanges = (ranges) => {
      ranges?.forEach((range) => {
        range.attrs?.forEach((attr) => {
          if (attr.name === 'insert' || attr.name === 'delete') {
            addActors(attr.val);
            return;
          }
          if (attr.name === 'insertAt' || attr.name === 'deleteAt') {
            addClock(attr.val);
            return;
          }
          addCustomAttribution(attr.name, attr.val);
        });
      });
    };

    scanRanges(contentMap.inserts);
    scanRanges(contentMap.deletes);

    result.actors = Array.from(actorSet);
    result.customAttributions = customAttributions;
    result.clocks = Array.from(clockSet).sort((a, b) => a - b);
    return result;
  } catch (error) {
    console.warn('[yjs-hub] failed to decode contentmap for attribution summary:', error);
    return result;
  }
}

function getActivityRoomBucket(roomKey) {
  const existing = roomActivityEvents.get(roomKey);
  if (existing) return existing;
  const next = [];
  roomActivityEvents.set(roomKey, next);
  return next;
}

function writeSseEvent(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function publishActivityEvent(room, event) {
  const roomKey = formatRoom(room);
  const bucket = getActivityRoomBucket(roomKey);
  bucket.push(event);
  if (bucket.length > ACTIVITY_MAX_EVENTS_PER_ROOM) {
    bucket.splice(0, bucket.length - ACTIVITY_MAX_EVENTS_PER_ROOM);
  }

  const subscribers = roomActivitySubscribers.get(roomKey);
  if (!subscribers || subscribers.size === 0) return;
  for (const response of subscribers) {
    if (response.writableEnded || response.destroyed) continue;
    writeSseEvent(response, 'activity', event);
  }
}

function safeGetParameter(req, index) {
  try {
    const value = req.getParameter(index);
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

function safeGetQuery(req, key) {
  try {
    const value = req.getQuery(key);
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

async function inspectRoomState(room) {
  if (!yhub) return 'unknown';
  try {
    const snapshot = await yhub.getDoc(room, { gc: true });
    const hasState = snapshot.lastClock !== '0' || (snapshot.gcDoc?.byteLength ?? 0) > 3;
    return hasState ? 'existing' : 'missing';
  } catch (error) {
    console.warn(`[yjs-hub] failed to inspect room state for ${formatRoom(room)}:`, error);
    return 'unknown';
  }
}

function attachUpdateLogging(hub) {
  const originalAddMessage = hub.stream.addMessage.bind(hub.stream);
  hub.stream.addMessage = (room, message) => {
    if (message?.type === 'ydoc:update:v1') {
      const key = formatRoom(room);
      const count = (roomUpdateCount.get(key) ?? 0) + 1;
      roomUpdateCount.set(key, count);
      const bytes = message.update?.byteLength ?? 0;
      const guess = guessUpdateType(bytes);
      const attribution = extractAttributionSummary(message.contentmap);
      const activityItems = inspectUpdateActivity(room, message.update);
      const changedKeys = Array.from(
        new Set(activityItems.flatMap((item) => item.changedKeys ?? [])),
      );
      const primaryItem = activityItems[0] ?? null;
      console.log(`[yjs-hub] ydoc:update room=${key} count=${count} bytes=${bytes} guess=${guess}`);

      publishActivityEvent(room, {
        id: createActivityEventId(),
        type: 'ydoc:update:v1',
        source: 'yhub-stream',
        room: {
          org: room?.org ?? ORG,
          docid: room?.docid ?? 'unknown-doc',
          branch: room?.branch ?? 'main',
        },
        count,
        bytes,
        guess,
        receivedAt: new Date().toISOString(),
        by: attribution.actors[0] ?? null,
        actors: attribution.actors,
        customAttributions: attribution.customAttributions,
        clocks: attribution.clocks,
        changedKeys,
        entryKey: primaryItem?.entryKey ?? null,
        changeType: primaryItem?.type ?? null,
        valueSummary: primaryItem?.valueSummary ?? null,
        activityItems,
      });
    }

    return originalAddMessage(room, message);
  };
}

async function ensureSchema() {
  const sql = postgres(POSTGRES_URL, { max: 1, connect_timeout: 60 });
  try {
    await sql`SELECT 1`;
    await sql`
      CREATE TABLE IF NOT EXISTS yhub_ydoc_v1 (
        org text,
        docid text,
        branch text,
        t text,
        created BIGINT,
        gcDoc bytea,
        nongcDoc bytea,
        contentmap bytea,
        contentids bytea,
        PRIMARY KEY (org, docid, branch, t)
      )
    `;

    if (EPHEMERAL) {
      await sql`TRUNCATE TABLE yhub_ydoc_v1`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearRedisPrefix(redisClient, prefix) {
  if (!EPHEMERAL) return;

  const keys = await redisClient.keys(`${prefix}:*`);
  // createYHub initializes an internal worker stream/group under `${prefix}:worker`.
  // Deleting it after startup causes NOGROUP errors on incoming updates.
  const keysToDelete = keys.filter((key) => key !== `${prefix}:worker`);

  if (keysToDelete.length > 0) {
    await redisClient.del(...keysToDelete);
  }
}

function parseClientPath(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  const prefix = `${BASE_PATH}/`;
  if (!url.pathname.startsWith(prefix)) {
    return { ok: false, statusCode: 404, reason: 'expected /v1/collaboration/:documentId' };
  }

  const encodedDocumentId = url.pathname.slice(prefix.length);
  if (!encodedDocumentId) {
    return { ok: false, statusCode: 400, reason: 'missing documentId path segment' };
  }

  try {
    const documentId = decodeURIComponent(encodedDocumentId);
    if (!documentId) {
      return { ok: false, statusCode: 400, reason: 'empty documentId' };
    }

    const targetPath = `/ws/${encodeURIComponent(ORG)}/${encodeURIComponent(documentId)}${url.search}`;
    return { ok: true, documentId, targetPath };
  } catch {
    return { ok: false, statusCode: 400, reason: 'invalid encoded documentId' };
  }
}

function parseActivityPath(requestUrl, tailSegment) {
  const url = new URL(requestUrl, 'http://localhost');
  const prefix = `${BASE_PATH}/`;
  if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith(tailSegment)) {
    return { ok: false };
  }

  const encodedDocumentId = url.pathname.slice(prefix.length, url.pathname.length - tailSegment.length);
  if (!encodedDocumentId) {
    return { ok: false, statusCode: 400, reason: 'missing documentId path segment' };
  }

  try {
    const documentId = decodeURIComponent(encodedDocumentId);
    if (!documentId) {
      return { ok: false, statusCode: 400, reason: 'empty documentId' };
    }
    const branch = url.searchParams.get('branch') || 'main';
    return { ok: true, documentId, branch };
  } catch {
    return { ok: false, statusCode: 400, reason: 'invalid encoded documentId' };
  }
}

function writeJsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  response.end(JSON.stringify(payload));
}

function handleActivityRecentRequest(request, response) {
  const parsed = parseActivityPath(request.url ?? '/', '/activity/recent');
  if (!parsed.ok && !parsed.statusCode) return false;
  if (parsed.statusCode) {
    writeJsonResponse(response, parsed.statusCode, {
      ok: false,
      error: parsed.reason ?? 'invalid request',
    });
    return true;
  }

  const room = { org: ORG, docid: parsed.documentId, branch: parsed.branch };
  const roomKey = formatRoom(room);
  const events = roomActivityEvents.get(roomKey) ?? [];
  writeJsonResponse(response, 200, {
    ok: true,
    room,
    count: events.length,
    events,
  });
  return true;
}

function handleActivityStreamRequest(request, response) {
  const parsed = parseActivityPath(request.url ?? '/', '/activity/stream');
  if (!parsed.ok && !parsed.statusCode) return false;
  if (parsed.statusCode) {
    writeJsonResponse(response, parsed.statusCode, {
      ok: false,
      error: parsed.reason ?? 'invalid request',
    });
    return true;
  }

  const room = { org: ORG, docid: parsed.documentId, branch: parsed.branch };
  const roomKey = formatRoom(room);
  const subscribers = roomActivitySubscribers.get(roomKey) ?? new Set();
  roomActivitySubscribers.set(roomKey, subscribers);

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
  response.flushHeaders?.();

  response.write(`: connected room=${roomKey}\n\n`);

  const bufferedEvents = roomActivityEvents.get(roomKey) ?? [];
  bufferedEvents.forEach((event) => {
    writeSseEvent(response, 'activity', event);
  });

  subscribers.add(response);
  const heartbeat = setInterval(() => {
    if (response.writableEnded || response.destroyed) return;
    response.write(': heartbeat\n\n');
  }, ACTIVITY_SSE_HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    subscribers.delete(response);
    if (subscribers.size === 0) {
      roomActivitySubscribers.delete(roomKey);
    }
  };

  request.on('close', cleanup);
  response.on('close', cleanup);
  response.on('error', cleanup);
  return true;
}

function writeUpgradeError(socket, statusCode, statusText) {
  socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function buildForwardRequest(request, targetPath) {
  const requestLine = `${request.method ?? 'GET'} ${targetPath} HTTP/${request.httpVersion}\r\n`;
  let hasHostHeader = false;
  const headerLines = [];

  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const key = request.rawHeaders[i];
    const value = request.rawHeaders[i + 1] ?? '';

    if (key.toLowerCase() === 'host') {
      hasHostHeader = true;
      headerLines.push(`Host: ${YHUB_INTERNAL_HOST}:${YHUB_INTERNAL_PORT}`);
      continue;
    }

    headerLines.push(`${key}: ${value}`);
  }

  if (!hasHostHeader) {
    headerLines.push(`Host: ${YHUB_INTERNAL_HOST}:${YHUB_INTERNAL_PORT}`);
  }

  return `${requestLine}${headerLines.join('\r\n')}\r\n\r\n`;
}

function startPublicProxyServer() {
  proxyServer = createHttpServer((request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      response.end();
      return;
    }

    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === 'GET' && handleActivityRecentRequest(request, response)) {
      return;
    }

    if (request.method === 'GET' && handleActivityStreamRequest(request, response)) {
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not Found');
  });

  proxyServer.on('upgrade', (request, socket, head) => {
    const parsed = parseClientPath(request.url ?? '/');
    if (!parsed.ok) {
      console.log(
        `[yjs-hub] rejected websocket path=${request.url ?? '/'} reason=${parsed.reason}`,
      );
      writeUpgradeError(socket, parsed.statusCode, parsed.statusCode === 404 ? 'Not Found' : 'Bad Request');
      return;
    }

    const upstream = net.connect(
      {
        host: YHUB_INTERNAL_HOST,
        port: YHUB_INTERNAL_PORT,
      },
      () => {
        const forwardedRequest = buildForwardRequest(request, parsed.targetPath);
        upstream.write(forwardedRequest);
        if (head.length > 0) {
          upstream.write(head);
        }

        socket.pipe(upstream);
        upstream.pipe(socket);

        console.log(
          `[yjs-hub] proxy ws room=${ORG}/${parsed.documentId} external=${request.url ?? '/'} internal=${parsed.targetPath}`,
        );
      },
    );

    upstream.on('error', (error) => {
      console.error('[yjs-hub] upstream connection error:', error);
      if (!socket.destroyed) {
        writeUpgradeError(socket, 502, 'Bad Gateway');
      }
    });

    socket.on('error', (error) => {
      console.error('[yjs-hub] client socket error:', error);
      upstream.destroy();
    });
  });

  proxyServer.listen(PORT, '127.0.0.1', () => {
    console.log('[yjs-hub] running');
    console.log(`[yjs-hub] websocket room URL pattern: ws://127.0.0.1:${PORT}${BASE_PATH}/:documentId`);
    console.log(`[yjs-hub] activity stream URL pattern: http://127.0.0.1:${PORT}${BASE_PATH}/:documentId/activity/stream`);
    console.log(`[yjs-hub] activity recent URL pattern: http://127.0.0.1:${PORT}${BASE_PATH}/:documentId/activity/recent`);
    console.log(`[yjs-hub] FastAPI settings: COLLAB_URL=ws://127.0.0.1:${PORT}${BASE_PATH} COLLAB_DOCUMENT_ID=${EXAMPLE_DOC_ID}`);
    console.log(`[yjs-hub] internal @y/hub ws target: ws://${YHUB_INTERNAL_HOST}:${YHUB_INTERNAL_PORT}/ws/${ORG}/:documentId`);
    console.log(`[yjs-hub] ephemeral mode=${EPHEMERAL ? 'on' : 'off'}`);
    console.log('[yjs-hub] websocket auth requires query param token=*** (demo shared secret)');
    console.log('[yjs-hub] auth token env: YHUB_AUTH_TOKEN (default value: YOUR_PRIVATE_TOKEN)');
    console.log('[yjs-hub] visibility logs enabled: connect params, inferred roomState, and update-size seed guesses');
  });
}

const auth = createAuthPlugin({
  async readAuthInfo(req) {
    const org = safeGetParameter(req, 0) ?? 'unknown-org';
    const docid = safeGetParameter(req, 1) ?? 'unknown-doc';
    const branch = safeGetQuery(req, 'branch') ?? 'main';
    const token = safeGetQuery(req, 'token');
    const userId =
      safeGetQuery(req, 'userId') ??
      safeGetQuery(req, 'userid') ??
      safeGetQuery(req, 'user') ??
      'local-dev-user';
    const onMissing =
      safeGetQuery(req, 'onMissing') ??
      safeGetQuery(req, 'openMode') ??
      safeGetQuery(req, 'seed') ??
      null;
    const gc = safeGetQuery(req, 'gc');
    const path = req.getUrl?.() ?? '/unknown';

    if (token !== AUTH_TOKEN) {
      console.log(
        `[yjs-hub] reject path=${path} room=${org}/${docid}@${branch} reason=invalid-token tokenPresent=${token ? 'yes' : 'no'}`,
      );
      return null;
    }

    console.log(
      `[yjs-hub] connect path=${path} room=${org}/${docid}@${branch} userId=${userId} onMissing=${onMissing ?? 'not-provided'} gc=${gc ?? 'default'} token=ok`,
    );

    return {
      userid: userId,
      _debug: { onMissing, userId, tokenValid: true },
    };
  },
  async getAccessType(authInfo, room) {
    const roomState = await inspectRoomState(room);
    const onMissing = authInfo?._debug?.onMissing ?? null;
    console.log(
      `[yjs-hub] authorize room=${formatRoom(room)} roomState=${roomState} onMissing=${onMissing ?? 'not-provided'} access=rw`,
    );
    return 'rw';
  },
});

await ensureSchema();

yhub = await createYHub({
  redis: {
    url: REDIS_URL,
    prefix: REDIS_PREFIX,
  },
  postgres: POSTGRES_URL,
  persistence: [],
  worker: EPHEMERAL ? null : { taskConcurrency: 1 },
  server: {
    port: YHUB_INTERNAL_PORT,
    auth,
  },
});
await clearRedisPrefix(yhub.stream.redis, REDIS_PREFIX);
attachUpdateLogging(yhub);
startPublicProxyServer();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[yjs-hub] shutting down (${signal})`);

  try {
    await new Promise((resolve) => {
      proxyServer?.close(() => resolve());
      if (!proxyServer?.listening) {
        resolve();
      }
    });
  } catch {}

  for (const subscribers of roomActivitySubscribers.values()) {
    for (const response of subscribers) {
      try {
        response.end();
      } catch {}
    }
  }
  roomActivitySubscribers.clear();
  roomUpdateInspectors.clear();

  try {
    yhub.stopWorker();
  } catch {}

  try {
    await yhub.server?.destroy();
  } catch {}

  try {
    await yhub.persistence.destroy();
  } catch {}

  try {
    await yhub.stream.redis.quit();
  } catch {}

  try {
    await yhub.stream.redisSubscriptions?.quit();
  } catch {}

  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
