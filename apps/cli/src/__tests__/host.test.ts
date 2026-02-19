import { afterEach, describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CliOperationId } from '../cli';
import { validateOperationResponseData } from '../lib/operation-args';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const CLI_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const SOURCE_DOC = path.join(REPO_ROOT, 'e2e-tests/test-data/basic-documents/advanced-text.docx');

type JsonRpcMessage = {
  jsonrpc: '2.0';
  id?: number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function launchHost(stateDir: string): {
  child: ChildProcessWithoutNullStreams;
  request(method: string, params?: unknown): Promise<JsonRpcMessage>;
  sendRaw(frame: string): void;
  nextMessage(): Promise<JsonRpcMessage>;
  shutdown(): Promise<void>;
} {
  const child = spawn('bun', [CLI_BIN, 'host', '--stdio'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SUPERDOC_CLI_STATE_DIR: stateDir,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (msg: JsonRpcMessage) => void; reject: (error: Error) => void }>();
  const inbox: JsonRpcMessage[] = [];
  const inboxWaiters: Array<(msg: JsonRpcMessage) => void> = [];
  let stdoutBuffer = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += String(chunk);
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith('{')) continue;

      const message = JSON.parse(trimmed) as JsonRpcMessage;

      if (typeof message.id === 'number') {
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          waiter.resolve(message);
          continue;
        }
      }

      const inboxWaiter = inboxWaiters.shift();
      if (inboxWaiter) {
        inboxWaiter(message);
      } else {
        inbox.push(message);
      }
    }
  });

  child.on('close', () => {
    for (const [id, waiter] of pending) {
      pending.delete(id);
      waiter.reject(new Error('Host exited before response.'));
    }
  });

  function request(method: string, params?: unknown): Promise<JsonRpcMessage> {
    const id = nextId;
    nextId += 1;

    const frame = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    const responsePromise = new Promise<JsonRpcMessage>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${frame}\n`);
    });

    return withTimeout(responsePromise, 10_000, `Timed out waiting for response to ${method}.`);
  }

  function sendRaw(frame: string): void {
    child.stdin.write(`${frame}\n`);
  }

  function nextMessage(): Promise<JsonRpcMessage> {
    if (inbox.length > 0) {
      return Promise.resolve(inbox.shift() as JsonRpcMessage);
    }

    return withTimeout(
      new Promise<JsonRpcMessage>((resolve) => {
        inboxWaiters.push(resolve);
      }),
      10_000,
      'Timed out waiting for host message.',
    );
  }

  async function shutdown(): Promise<void> {
    try {
      await request('host.shutdown');
    } catch {
      child.kill('SIGKILL');
    }

    await withTimeout(
      new Promise<void>((resolve) => {
        child.once('close', () => resolve());
      }),
      10_000,
      'Timed out waiting for host shutdown.',
    );
  }

  return {
    child,
    request,
    sendRaw,
    nextMessage,
    shutdown,
  };
}

describe('CLI host mode', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const pathToRemove = cleanup.pop();
      if (pathToRemove) {
        await rm(pathToRemove, { recursive: true, force: true });
      }
    }
  });

  test('handles ping/capabilities/describe/cli.invoke/shutdown', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
    cleanup.push(stateDir);
    await mkdir(stateDir, { recursive: true });

    const host = launchHost(stateDir);

    const ping = await host.request('host.ping');
    expect(ping.error).toBeUndefined();
    expect((ping.result as { ok: boolean }).ok).toBe(true);

    const capabilities = await host.request('host.capabilities');
    expect(capabilities.error).toBeUndefined();
    const capabilityPayload = capabilities.result as {
      protocolVersion: string;
      features: string[];
    };
    expect(capabilityPayload.protocolVersion).toBe('1.0');
    expect(capabilityPayload.features).toEqual(
      expect.arrayContaining(['cli.invoke', 'host.shutdown', 'host.describe', 'host.describe.command']),
    );

    const describe = await host.request('host.describe');
    expect(describe.error).toBeUndefined();
    const describePayload = describe.result as { operationCount: number };
    expect(describePayload.operationCount).toBeGreaterThan(0);

    const describeCommand = await host.request('host.describe.command', {
      operationId: 'doc.find',
    });
    expect(describeCommand.error).toBeUndefined();
    const describeCommandPayload = describeCommand.result as {
      operation: { id: string };
    };
    expect(describeCommandPayload.operation.id).toBe('doc.find');

    const invoke = await host.request('cli.invoke', {
      argv: ['status'],
      stdinBase64: '',
    });
    expect(invoke.error).toBeUndefined();

    const invokeResult = invoke.result as {
      command: string;
      data: { active: boolean };
      meta: { elapsedMs: number };
    };

    expect(invokeResult.command).toBe('status');
    expect(invokeResult.data.active).toBe(false);
    expect(invokeResult.meta.elapsedMs).toBeGreaterThanOrEqual(0);

    await host.shutdown();
  });

  test('host cli.invoke responses conform to contract for representative commands', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
    cleanup.push(stateDir);
    await mkdir(stateDir, { recursive: true });

    const docPath = path.join(stateDir, 'host-conformance.docx');
    await copyFile(SOURCE_DOC, docPath);

    const host = launchHost(stateDir);

    async function invokeAndValidate(operationId: CliOperationId, argv: string[]) {
      const response = await host.request('cli.invoke', {
        argv,
        stdinBase64: '',
      });
      expect(response.error).toBeUndefined();
      const payload = response.result as {
        command: string;
        data: unknown;
        meta: { elapsedMs: number };
      };
      validateOperationResponseData(operationId, payload.data, payload.command);
      expect(payload.meta.elapsedMs).toBeGreaterThanOrEqual(0);
      return payload.data as Record<string, unknown>;
    }

    const findData = await invokeAndValidate('doc.find', [
      'find',
      docPath,
      '--type',
      'text',
      '--pattern',
      'Wilde',
      '--limit',
      '1',
    ]);
    const findResult = findData.result as {
      matches?: Array<Record<string, unknown>>;
      context?: Array<{ textRanges?: Array<{ kind: 'text'; blockId: string; range: { start: number; end: number } }> }>;
    };
    const firstMatch = findResult.matches?.[0];
    expect(firstMatch).toBeDefined();
    await invokeAndValidate('doc.getNode', ['get-node', docPath, '--address-json', JSON.stringify(firstMatch)]);

    const textTarget = findResult.context?.[0]?.textRanges?.[0];
    expect(textTarget).toBeDefined();
    const collapsedTarget = {
      ...textTarget,
      range: {
        start: textTarget!.range.start,
        end: textTarget!.range.start,
      },
    };
    await invokeAndValidate('doc.insert', [
      'insert',
      docPath,
      '--target-json',
      JSON.stringify(collapsedTarget),
      '--text',
      'HOST_CONFORMANCE_INSERT',
      '--out',
      path.join(stateDir, 'host-conformance-insert.docx'),
    ]);

    const sessionId = 'host-conformance-session';
    await invokeAndValidate('doc.open', ['open', docPath, '--session', sessionId]);
    await invokeAndValidate('doc.status', ['status', '--session', sessionId]);
    await invokeAndValidate('doc.close', ['close', '--session', sessionId, '--discard']);

    await invokeAndValidate('doc.trackChanges.list', ['track-changes', 'list', docPath, '--limit', '1']);
    await invokeAndValidate('doc.comments.list', ['comments', 'list', docPath, '--include-resolved', 'false']);

    await host.shutdown();
  });

  test('returns parse errors for malformed frames', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
    cleanup.push(stateDir);
    await mkdir(stateDir, { recursive: true });

    const host = launchHost(stateDir);

    host.sendRaw('{');
    const message = await host.nextMessage();
    expect(message.error?.code).toBe(-32700);
    expect(message.id).toBe(null);

    await host.shutdown();
  });

  test('returns invalid request and cli invoke validation errors', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
    cleanup.push(stateDir);
    await mkdir(stateDir, { recursive: true });

    const host = launchHost(stateDir);

    host.sendRaw(JSON.stringify({ jsonrpc: '2.0', id: 99 }));
    const invalidRequest = await host.nextMessage();
    expect(invalidRequest.error?.code).toBe(-32600);

    const invalidInvoke = await host.request('cli.invoke', {
      argv: ['status'],
      stdinBase64: '***',
    });

    expect(invalidInvoke.error?.code).toBe(-32010);
    const errorData = invalidInvoke.error?.data as { cliCode?: string };
    expect(errorData.cliCode).toBe('INVALID_ARGUMENT');

    const invalidDescribe = await host.request('host.describe.command', {
      operationId: 'doc.missing',
    });
    expect(invalidDescribe.error?.code).toBe(-32602);

    await host.shutdown();
  });
});
