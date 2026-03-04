import { createReadStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuperDocClient } from '@superdoc-dev/sdk';

const EXAMPLE_ROOT = dirname(fileURLToPath(import.meta.url));

// Reuse FastAPI sample assets to keep this example bare-bones.
const DOC_PATH = join(EXAMPLE_ROOT, '../fastapi/assets/doc-template.docx');
const MARKDOWN_PATH = join(EXAMPLE_ROOT, '../fastapi/assets/fake-nda.md');
const DOWNLOAD_PATH = join(EXAMPLE_ROOT, '.superdoc-state', 'download.docx');

const COLLAB_PROVIDER = 'y-websocket';
const COLLAB_URL = 'ws://127.0.0.1:8081/v1/collaboration';
const COLLAB_DOCUMENT_ID = 'superdoc-dev-room';
const COLLAB_TOKEN_ENV = 'YHUB_AUTH_TOKEN';
const COLLAB_TOKEN_DEFAULT = 'YOUR_PRIVATE_TOKEN';
const COLLAB_SYNC_TIMEOUT_MS = 60_000;

const OPEN_TIMEOUT_MS = 90_000;
const WATCHDOG_TIMEOUT_MS = 120_000;
const PORT = Number(process.env.PORT ?? 8001);

/** @type {SuperDocClient | null} */
let client = null;
let openResult = null;
let initialized = false;
let shuttingDown = false;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function ensureInitialized() {
  if (initialized) return;

  process.env[COLLAB_TOKEN_ENV] ??= COLLAB_TOKEN_DEFAULT;

  client = new SuperDocClient({ watchdogTimeoutMs: WATCHDOG_TIMEOUT_MS });
  await client.connect();

  openResult = await client.doc.open(
    {
      doc: DOC_PATH,
      collaboration: {
        providerType: COLLAB_PROVIDER,
        url: COLLAB_URL,
        documentId: COLLAB_DOCUMENT_ID,
        tokenEnv: COLLAB_TOKEN_ENV,
        syncTimeoutMs: COLLAB_SYNC_TIMEOUT_MS,
      },
    },
    { timeoutMs: OPEN_TIMEOUT_MS },
  );

  const markdownContent = await readFile(MARKDOWN_PATH, 'utf8');
  await client.doc.insert({ value: markdownContent, type: 'markdown' });
  initialized = true;
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!client) return;
  try {
    await client.doc.close({});
  } catch (error) {
    console.error('[node-sdk] doc.close failed:', error);
  }
  try {
    await client.dispose();
  } catch (error) {
    console.error('[node-sdk] dispose failed:', error);
  }
}

function listenSignals(server) {
  const handleSignal = (signal) => {
    console.log(`[node-sdk] received ${signal}, shutting down...`);
    server.close(async () => {
      await shutdown();
      process.exit(0);
    });
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
}

async function handleRequest(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Only GET is supported in this demo.' });
    return;
  }

  await ensureInitialized();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${PORT}`}`);

  if (url.pathname === '/') {
    sendJson(res, 200, {
      ok: true,
      openResult,
      collab: {
        providerType: COLLAB_PROVIDER,
        url: COLLAB_URL,
        documentId: COLLAB_DOCUMENT_ID,
        tokenEnv: COLLAB_TOKEN_ENV,
      },
    });
    return;
  }

  if (url.pathname === '/status') {
    sendJson(res, 200, await client.doc.status({}));
    return;
  }

  if (url.pathname === '/insert') {
    const text = url.searchParams.get('text');
    if (!text) {
      sendJson(res, 400, { ok: false, error: 'Missing query param: text' });
      return;
    }
    sendJson(res, 200, await client.doc.insert({ value: text }));
    return;
  }

  if (url.pathname === '/markdown') {
    const markdown = await client.doc.getMarkdown({});
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Document Markdown</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
  </style>
</head>
<body>
  <h1>Document as Markdown</h1>
  <pre>${escapeHtml(String(markdown))}</pre>
</body>
</html>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (url.pathname === '/download') {
    await mkdir(dirname(DOWNLOAD_PATH), { recursive: true });
    await client.doc.save({ out: DOWNLOAD_PATH, force: true });

    res.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${basename(DOWNLOAD_PATH)}"`,
    });
    createReadStream(DOWNLOAD_PATH).pipe(res);
    return;
  }

  sendJson(res, 404, { ok: false, error: `Not found: ${url.pathname}` });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('[node-sdk] request failed:', error);
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  });
});

listenSignals(server);
server.listen(PORT, () => {
  console.log(`[node-sdk] server running at http://127.0.0.1:${PORT}`);
  console.log(`[node-sdk] collaboration room: ${COLLAB_URL}/${COLLAB_DOCUMENT_ID}`);
});
