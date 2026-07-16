import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { request as sendHttpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSuperDocMcpServer } from '../../../../apps/mcp/src/create-server.js';
import { SessionManager, type Session } from '../../../../apps/mcp/src/session-manager.js';
import { startMcpHttpServer, type RunningMcpHttpServer } from './http-server.js';

const TOKEN = 'superdoc-demo';
const LIVE_MARKER = 'MCP live collaboration test';
const RELAY_FIXTURE = fileURLToPath(new URL('./yjs-relay-fixture.cjs', import.meta.url));
const EXPECTED_TOOLS = [
  'superdoc_attach',
  'superdoc_close',
  'superdoc_comment',
  'superdoc_create',
  'superdoc_edit',
  'superdoc_format',
  'superdoc_get_content',
  'superdoc_list',
  'superdoc_mutations',
  'superdoc_open',
  'superdoc_save',
  'superdoc_search',
  'superdoc_table',
  'superdoc_track_changes',
];

describe('hosted SuperDoc MCP server', { concurrency: false }, () => {
  it('AC-2 rejects invalid authentication and non-local Host headers', async () => {
    const server = await startMcpHttpServer({ port: 0 });

    try {
      assert.equal(await initializeRequest(server), 401);
      assert.equal(await initializeRequest(server, 'Bearer incorrect'), 401);
      assert.equal(await initializeRequest(server, `Bearer ${TOKEN}`, 'remote.example'), 403);
    } finally {
      await server.close();
    }
  });

  it('AC-3 initializes with the official transport and preserves the legacy tool set', async () => {
    const server = await startMcpHttpServer({ port: 0 });
    const connection = createClientConnection(server.url);

    try {
      await connection.client.connect(connection.transport);
      assert.equal(server.sessionCount(), 1);

      const { tools } = await connection.client.listTools();
      assert.deepEqual(tools.map(({ name }) => name).sort(), [...EXPECTED_TOOLS].sort());

      await connection.transport.terminateSession();
      await pollUntil(() => server.sessionCount() === 0, 'protocol session cleanup');
      assert.equal(connection.transport.sessionId, undefined);
    } finally {
      await connection.client.close();
      await server.close();
    }
  });

  it('AC-5 stops the Yjs relay process when startup fails', async () => {
    const relayProcess = spawn(
      process.execPath,
      ['--eval', 'console.log(JSON.stringify({ port: 0 })); setInterval(() => {}, 1_000);'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    await assert.rejects(waitForYjsRelay(relayProcess), /Invalid relay port: 0/);
    assert.equal(relayProcess.killed, true);
    assert.ok(relayProcess.exitCode !== null || relayProcess.signalCode !== null);
  });

  it(
    'AC-4 and AC-5 propagate an MCP edit over Yjs and destroy every session resource',
    { timeout: 30_000 },
    async () => {
      const relay = await startYjsRelay();
      const observerSessions = new SessionManager();
      const roomId = `mcp-live-${Date.now()}`;
      let capturedMcpSessions: SessionManager | undefined;
      let sessionManagerCloseCount = 0;

      const server = await startMcpHttpServer({
        port: 0,
        createMcpServer: async () => {
          const created = await createSuperDocMcpServer();
          const closeAll = created.sessions.closeAll.bind(created.sessions);
          created.sessions.closeAll = async () => {
            sessionManagerCloseCount += 1;
            await closeAll();
          };
          capturedMcpSessions = created.sessions;
          return created;
        },
      });
      const connection = createClientConnection(server.url);

      try {
        const observer = await observerSessions.openRoom(relay.url, roomId, undefined, {
          id: 'browser-observer',
          name: 'Browser',
        });
        await connection.client.connect(connection.transport);

        const attachResult = await connection.client.callTool({
          name: 'superdoc_attach',
          arguments: {
            ws_url: relay.url,
            document_id: roomId,
            user: { id: 'external-agent', name: 'Codex' },
          },
        });
        assert.equal(attachResult.isError, undefined, textContent(attachResult));

        const { session_id: sessionId } = JSON.parse(textContent(attachResult)) as {
          session_id: string;
        };
        assert.ok(capturedMcpSessions);
        const attachedSession = capturedMcpSessions.get(sessionId);
        const destruction = observeDestruction(attachedSession);

        const createResult = await connection.client.callTool({
          name: 'superdoc_create',
          arguments: {
            session_id: sessionId,
            action: 'paragraph',
            text: LIVE_MARKER,
          },
        });
        assert.equal(createResult.isError, undefined, textContent(createResult));
        await pollUntil(
          () => String(observer.api.invoke({ operationId: 'getText', input: {} })).includes(LIVE_MARKER),
          'observer document update',
        );

        await connection.client.callTool({
          name: 'superdoc_close',
          arguments: { session_id: sessionId },
        });
        assert.equal(destruction.providerDestroyed(), true);
        assert.equal(destruction.editorDestroyed(), true);
        assert.deepEqual(capturedMcpSessions.list(), []);

        await connection.transport.terminateSession();
        await pollUntil(
          () => server.sessionCount() === 0 && sessionManagerCloseCount > 0,
          'transport and session-manager cleanup',
        );
        assert.equal(connection.transport.sessionId, undefined);
      } finally {
        await connection.client.close();
        await server.close();
        await observerSessions.closeAll();
        await relay.close();
      }
    },
  );
});

function createClientConnection(url: string): {
  client: Client;
  transport: StreamableHTTPClientTransport;
} {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: 'mcp-collaboration-test', version: '1.0.0' });
  return { client, transport };
}

function initializeRequest(
  server: RunningMcpHttpServer,
  authorization?: string,
  host = `${server.host}:${server.port}`,
): Promise<number> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    Host: host,
  };
  if (authorization) headers.Authorization = authorization;

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'authentication-test', version: '1.0.0' },
    },
  });

  return new Promise((resolve, reject) => {
    const request = sendHttpRequest({
      hostname: server.host,
      port: server.port,
      path: '/mcp',
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    });
    request.once('error', reject);
    request.once('response', (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    request.end(body);
  });
}

function textContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = 'content' in result ? result.content : [];
  const first = (content as Array<{ type: string; text?: string }>)[0];
  return first?.text ?? '';
}

function observeDestruction(session: Session): {
  providerDestroyed(): boolean;
  editorDestroyed(): boolean;
} {
  assert.ok(session.provider);
  let providerDestroyed = false;
  let editorDestroyed = false;
  const destroyProvider = session.provider.destroy.bind(session.provider);
  const destroyEditor = session.editor.destroy.bind(session.editor);

  session.provider.destroy = () => {
    providerDestroyed = true;
    destroyProvider();
  };
  session.editor.destroy = () => {
    editorDestroyed = true;
    destroyEditor();
  };

  return {
    providerDestroyed: () => providerDestroyed,
    editorDestroyed: () => editorDestroyed,
  };
}

interface RunningYjsRelay {
  url: string;
  close(): Promise<void>;
}

async function startYjsRelay(): Promise<RunningYjsRelay> {
  const relayProcess = spawn(process.execPath, [RELAY_FIXTURE], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return waitForYjsRelay(relayProcess);
}

async function waitForYjsRelay(relayProcess: ChildProcess): Promise<RunningYjsRelay> {
  try {
    const port = await readRelayPort(relayProcess);

    return {
      url: `ws://127.0.0.1:${port}`,
      close: () => stopRelay(relayProcess),
    };
  } catch (error) {
    await stopRelay(relayProcess).catch(() => undefined);
    throw error;
  }
}

function readRelayPort(relayProcess: ChildProcess): Promise<number> {
  if (!relayProcess.stdout || !relayProcess.stderr) {
    return Promise.reject(new Error('Yjs relay did not expose stdout and stderr.'));
  }
  const stdout = relayProcess.stdout;
  const stderrStream = relayProcess.stderr;

  return new Promise((resolve, reject) => {
    let stderr = '';
    const lines = createInterface({ input: stdout });
    const timeout = setTimeout(() => finish(new Error(`Yjs relay startup timed out. ${stderr}`)), 5_000);
    const onErrorOutput = (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    };
    const onExit = (code: number | null) => {
      finish(new Error(`Yjs relay exited before startup with code ${code}. ${stderr}`));
    };
    const finish = (error?: Error, port?: number) => {
      clearTimeout(timeout);
      lines.close();
      stderrStream.off('data', onErrorOutput);
      relayProcess.off('exit', onExit);
      if (error) reject(error);
      else resolve(port!);
    };

    stderrStream.on('data', onErrorOutput);
    relayProcess.once('exit', onExit);
    lines.once('line', (line) => {
      try {
        const { port } = JSON.parse(line) as { port: number };
        if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid relay port: ${port}`);
        finish(undefined, port);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

async function stopRelay(relayProcess: ChildProcess): Promise<void> {
  if (relayProcess.exitCode !== null || relayProcess.signalCode !== null) return;
  relayProcess.kill('SIGTERM');

  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      once(relayProcess, 'exit'),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Yjs relay shutdown timed out.')), 5_000);
      }),
    ]);
  } catch (error) {
    relayProcess.kill('SIGKILL');
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function pollUntil(predicate: () => boolean, description: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
