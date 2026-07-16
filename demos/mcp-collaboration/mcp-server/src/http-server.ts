import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createSuperDocMcpServer, type SuperDocMcpServer } from '../../../../apps/mcp/src/create-server.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8091;
const DEFAULT_TOKEN = 'superdoc-demo';

interface ProtocolSession extends SuperDocMcpServer {
  transport: StreamableHTTPServerTransport;
}

export interface McpHttpServerOptions {
  port?: number;
  createMcpServer?: () => SuperDocMcpServer | Promise<SuperDocMcpServer>;
}

export interface RunningMcpHttpServer {
  host: string;
  port: number;
  url: string;
  sessionCount(): number;
  close(): Promise<void>;
}

export async function startMcpHttpServer(options: McpHttpServerOptions = {}): Promise<RunningMcpHttpServer> {
  const host = DEFAULT_HOST;
  const configuredPort = options.port ?? DEFAULT_PORT;
  const token = DEFAULT_TOKEN;
  const createMcpServer = options.createMcpServer ?? createSuperDocMcpServer;
  const sessions = new Map<string, ProtocolSession>();

  const httpServer = createServer((request, response) => {
    void routeMcpRequest({ request, response, token, sessions, createMcpServer });
  });

  await listen(httpServer, host, configuredPort);
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('MCP HTTP server did not expose a TCP address.');

  return {
    host,
    port: address.port,
    url: `http://${host}:${address.port}/mcp`,
    sessionCount: () => sessions.size,
    close: async () => {
      await Promise.all([...sessions.values()].map(closeProtocolSession));
      sessions.clear();
      await closeHttpServer(httpServer);
    },
  };
}

interface RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  token: string;
  sessions: Map<string, ProtocolSession>;
  createMcpServer: () => SuperDocMcpServer | Promise<SuperDocMcpServer>;
}

async function routeMcpRequest(context: RouteContext): Promise<void> {
  const { request, response, token, sessions, createMcpServer } = context;

  try {
    if (!isLocalHostHeader(request.headers.host)) return sendText(response, 403, 'Forbidden host');
    if (request.headers.authorization !== `Bearer ${token}`) return sendText(response, 401, 'Unauthorized');
    if (request.url !== '/mcp') return sendText(response, 404, 'Not found');

    if (request.method === 'POST') {
      return await handlePost(request, response, sessions, createMcpServer);
    }
    if (request.method === 'GET' || request.method === 'DELETE') {
      return await handleSessionRequest(request, response, sessions);
    }
    return sendText(response, 405, 'Method not allowed');
  } catch (error) {
    console.error('MCP HTTP request failed:', error);
    if (!response.headersSent) sendJsonRpcError(response, 500, 'Internal server error');
    else response.end();
  }
}

async function handlePost(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, ProtocolSession>,
  createMcpServer: () => SuperDocMcpServer | Promise<SuperDocMcpServer>,
): Promise<void> {
  const body = await readJsonBody(request);
  const sessionId = headerValue(request.headers['mcp-session-id']);

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return sendJsonRpcError(response, 404, 'Unknown MCP session');
    await session.transport.handleRequest(request, response, body);
    return;
  }

  if (!isInitializeRequest(body)) return sendJsonRpcError(response, 400, 'MCP initialization required');

  const created = await createMcpServer();
  let protocolSession: ProtocolSession;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (initializedSessionId) => {
      sessions.set(initializedSessionId, protocolSession);
    },
  });
  protocolSession = { ...created, transport };
  transport.onclose = () => {
    const initializedSessionId = transport.sessionId;
    if (initializedSessionId) sessions.delete(initializedSessionId);
    void created.sessions.closeAll();
  };

  try {
    await created.server.connect(transport);
    await transport.handleRequest(request, response, body);
  } catch (error) {
    await closeProtocolSession(protocolSession);
    throw error;
  }
}

async function handleSessionRequest(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, ProtocolSession>,
): Promise<void> {
  const sessionId = headerValue(request.headers['mcp-session-id']);
  if (!sessionId) return sendText(response, 400, 'Missing MCP session ID');

  const session = sessions.get(sessionId);
  if (!session) return sendText(response, 404, 'Unknown MCP session');
  await session.transport.handleRequest(request, response);
}

async function closeProtocolSession(session: ProtocolSession): Promise<void> {
  await session.sessions.closeAll();
  await session.server.close();
}

function isLocalHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    const hostname = new URL(`http://${hostHeader}`).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJsonRpcError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

function sendText(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
