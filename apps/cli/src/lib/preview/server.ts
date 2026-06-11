import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateViewerHtml } from './viewer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewServerOptions {
  /** Port to listen on. Defaults to 9095. */
  port?: number;
  /** Host to bind to. Defaults to '127.0.0.1'. */
  host?: string;
  /** Path to the document file on disk. */
  documentPath: string;
  /** Poll interval in milliseconds for checking file changes. Defaults to 1000. */
  pollIntervalMs?: number;
}

export interface PreviewServer {
  /** The HTTP server instance. */
  httpServer: HttpServer;
  /** The URL to open in a browser. */
  url: string;
  /** The port the server is listening on. */
  port: number;
  /** Path to the document being served. */
  documentPath: string;
  /** Stop the server. */
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 9095;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_POLL_INTERVAL_MS = 500;

// Content type mapping for static assets
const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Resolves the path to the superdoc package dist folder.
 * Tries multiple strategies to find it in the monorepo.
 */
async function getSuperdocDistPath(): Promise<string> {
  // Try resolving from CWD (works when running from monorepo root)
  const fromCwd = join(process.cwd(), 'packages', 'superdoc', 'dist');
  try {
    await stat(join(fromCwd, 'superdoc.min.js'));
    return fromCwd;
  } catch {
    // Not found from CWD
  }

  // Try resolving from this file's location using import.meta.url
  // This handles the case where we're running the unbundled TypeScript
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const thisDir = dirname(thisFile);
    // apps/cli/src/lib/preview/server.ts -> packages/superdoc/dist
    const fromSource = join(thisDir, '..', '..', '..', '..', '..', 'packages', 'superdoc', 'dist');
    await stat(join(fromSource, 'superdoc.min.js'));
    return fromSource;
  } catch {
    // Not found from source location
  }

  // Try common monorepo structures
  const candidates = [
    join(process.cwd(), '..', 'packages', 'superdoc', 'dist'),
    join(process.cwd(), '..', '..', 'packages', 'superdoc', 'dist'),
  ];

  for (const candidate of candidates) {
    try {
      await stat(join(candidate, 'superdoc.min.js'));
      return candidate;
    } catch {
      // Try next
    }
  }

  // Fallback - return the most likely path even if it doesn't exist
  // This will cause a 404 for assets which is easier to debug
  return fromCwd;
}

const MAX_PORT_ATTEMPTS = 10;

/**
 * Try to start a server on the given port.
 * Returns the server if successful, or throws if the port is in use or another error occurs.
 */
async function tryListenOnPort(
  requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
  port: number,
  host: string,
): Promise<HttpServer> {
  const httpServer = createServer(requestHandler);

  return new Promise<HttpServer>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      httpServer.off('error', onError);
      reject(err);
    };
    httpServer.on('error', onError);
    httpServer.listen(port, host, () => {
      httpServer.off('error', onError);
      resolve(httpServer);
    });
  });
}

/**
 * Creates a preview server that serves a document from disk.
 * The browser polls for changes and reloads when the file is modified.
 * If the default port is in use, tries up to 10 additional ports.
 */
export async function createPreviewServer(
  options: PreviewServerOptions,
): Promise<PreviewServer> {
  const startPort = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const documentPath = options.documentPath;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const superdocDistPath = await getSuperdocDistPath();

  // Track file modification time for change detection
  let lastModifiedMs = 0;
  try {
    const stats = await stat(documentPath);
    lastModifiedMs = stats.mtimeMs;
  } catch {
    // File might not exist yet
  }

  // Create request handler (shared across port retry attempts)
  const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${host}:${startPort}`);

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Check for file changes (for polling)
    if (url.pathname === '/check') {
      try {
        const stats = await stat(documentPath);
        const currentModifiedMs = stats.mtimeMs;
        const changed = currentModifiedMs > lastModifiedMs;
        if (changed) {
          lastModifiedMs = currentModifiedMs;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ changed, lastModified: currentModifiedMs }));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to check file' }));
      }
      return;
    }

    // Serve the document file
    if (url.pathname === '/document.docx') {
      try {
        const bytes = await readFile(documentPath);
        const stats = await stat(documentPath);
        lastModifiedMs = stats.mtimeMs;

        res.writeHead(200, {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'content-length': bytes.byteLength.toString(),
          'cache-control': 'no-store',
          'last-modified': new Date(lastModifiedMs).toUTCString(),
        });
        res.end(bytes);
      } catch (err) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Document not found');
      }
      return;
    }

    // Serve SuperDoc assets from /superdoc/*
    if (url.pathname.startsWith('/superdoc/')) {
      const assetPath = url.pathname.slice('/superdoc/'.length);

      // Security: prevent path traversal
      if (assetPath.includes('..') || assetPath.startsWith('/')) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('Invalid path');
        return;
      }

      const filePath = join(superdocDistPath, assetPath);

      try {
        const bytes = await readFile(filePath);
        const ext = extname(filePath);
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'content-type': contentType,
          'content-length': bytes.byteLength.toString(),
          'cache-control': 'public, max-age=31536000', // Cache assets for 1 year
        });
        res.end(bytes);
      } catch (err) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end(`Asset not found: ${assetPath}`);
      }
      return;
    }

    // Main viewer page
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = generateViewerHtml({
        documentUrl: '/document.docx',
        pollIntervalMs,
      });
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      });
      res.end(html);
      return;
    }

    // 404 for unknown paths
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  };

  // Start the HTTP server, trying multiple ports if needed
  let httpServer: HttpServer | null = null;
  let actualPort = startPort;

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const tryPort = startPort + attempt;
    try {
      httpServer = await tryListenOnPort(requestHandler, tryPort, host);
      actualPort = tryPort;
      break;
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'EADDRINUSE') {
        // Port in use, try next one
        continue;
      }
      // Other error, throw immediately
      throw err;
    }
  }

  if (!httpServer) {
    throw new Error(`Could not find open port (tried ${startPort}-${startPort + MAX_PORT_ATTEMPTS - 1})`);
  }

  const serverUrl = `http://${host}:${actualPort}`;

  return {
    httpServer,
    url: serverUrl,
    port: actualPort,
    documentPath,
    async stop() {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

/**
 * Opens a URL in the default browser.
 */
export async function openInBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    // Linux and others
    command = `xdg-open "${url}"`;
  }

  await execAsync(command);
}
