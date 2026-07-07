import { afterEach, describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CliOperationId } from '../cli';
import { validateOperationResponseData } from '../lib/operation-args';
import { resolveSourceDocFixture } from './fixtures';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const CLI_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const CLI_PACKAGE_JSON = path.join(REPO_ROOT, 'apps/cli/package.json');
const HOST_TEST_TIMEOUT_MS = 20_000;

async function readCliPackageVersion(): Promise<string> {
  const raw = await readFile(CLI_PACKAGE_JSON, 'utf8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error('Expected apps/cli/package.json to include a non-empty version field.');
  }
  return parsed.version;
}

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

function launchHost(
  stateDir: string,
  extraArgs: string[] = [],
): {
  child: ChildProcessWithoutNullStreams;
  request(method: string, params?: unknown): Promise<JsonRpcMessage>;
  sendRaw(frame: string): void;
  nextMessage(): Promise<JsonRpcMessage>;
  shutdown(): Promise<void>;
} {
  const child = spawn('bun', [CLI_BIN, 'host', '--stdio', ...extraArgs], {
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

  test(
    'handles ping/capabilities/describe/cli.invoke/shutdown',
    async () => {
      const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
      cleanup.push(stateDir);
      await mkdir(stateDir, { recursive: true });
      const expectedCliVersion = await readCliPackageVersion();

      const host = launchHost(stateDir);

      const ping = await host.request('host.ping');
      expect(ping.error).toBeUndefined();
      expect((ping.result as { ok: boolean }).ok).toBe(true);

      const capabilities = await host.request('host.capabilities');
      expect(capabilities.error).toBeUndefined();
      const capabilityPayload = capabilities.result as {
        protocolVersion: string;
        features: string[];
        cliVersion: string;
      };
      expect(capabilityPayload.protocolVersion).toBe('1.0');
      expect(capabilityPayload.features).toEqual(
        expect.arrayContaining(['cli.invoke', 'host.shutdown', 'host.describe', 'host.describe.command']),
      );
      expect(capabilityPayload.cliVersion).toBe(expectedCliVersion);

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

      const invokeVersion = await host.request('cli.invoke', {
        argv: ['--version'],
        stdinBase64: '',
      });
      expect(invokeVersion.error).toBeUndefined();
      const invokeVersionResult = invokeVersion.result as {
        command: string;
        data: { version: string };
        meta: { elapsedMs: number };
      };
      expect(invokeVersionResult.command).toBe('version');
      expect(invokeVersionResult.data.version).toBe(expectedCliVersion);
      expect(invokeVersionResult.meta.elapsedMs).toBeGreaterThanOrEqual(0);

      await host.shutdown();
    },
    HOST_TEST_TIMEOUT_MS,
  );

  test(
    'host cli.invoke responses conform to contract for representative commands',
    async () => {
      const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
      cleanup.push(stateDir);
      await mkdir(stateDir, { recursive: true });

      const docPath = path.join(stateDir, 'host-conformance.docx');
      await copyFile(await resolveSourceDocFixture(), docPath);

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
        items?: Array<{
          node?: { kind?: string; [key: string]: unknown };
          address?: { kind?: string; nodeId?: string };
        }>;
      };
      const firstItem = findResult.items?.[0];
      const address = firstItem?.address;
      const nodeKind = firstItem?.node?.kind ?? 'paragraph';
      expect(address?.nodeId).toBeDefined();

      // Build a NodeAddress for getNode which expects { kind: 'block', nodeType, nodeId }
      const blockAddress = { kind: 'block', nodeType: nodeKind, nodeId: address!.nodeId };
      await invokeAndValidate('doc.getNode', ['get-node', docPath, '--address-json', JSON.stringify(blockAddress)]);

      // Build a collapsed text target from the block address
      const collapsedTarget = {
        kind: 'text',
        blockId: address!.nodeId,
        range: { start: 0, end: 0 },
      };
      await invokeAndValidate('doc.insert', [
        'insert',
        docPath,
        '--target-json',
        JSON.stringify(collapsedTarget),
        '--value',
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
    },
    HOST_TEST_TIMEOUT_MS,
  );

  test(
    'surfaces stale track-changes decide failures as TRACK_CHANGE_NOT_FOUND errors in host mode',
    async () => {
      const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
      cleanup.push(stateDir);
      await mkdir(stateDir, { recursive: true });

      const sourceDoc = await resolveSourceDocFixture();
      const docCopy = path.join(stateDir, 'stale-track-change-source.docx');
      const trackedDoc = path.join(stateDir, 'stale-track-change.docx');
      const acceptedDoc = path.join(stateDir, 'stale-track-change-accepted.docx');
      await copyFile(sourceDoc, docCopy);

      const host = launchHost(stateDir);

      const find = await host.request('cli.invoke', {
        argv: ['find', docCopy, '--type', 'text', '--pattern', 'Wilde', '--limit', '1'],
        stdinBase64: '',
      });
      expect(find.error).toBeUndefined();
      const findPayload = find.result as {
        data?: {
          result?: {
            items?: Array<{
              address?: {
                nodeId?: string;
              };
            }>;
          };
        };
      };
      const firstMatch = findPayload.data?.result?.items?.[0]?.address;
      expect(firstMatch?.nodeId).toBeDefined();
      if (!firstMatch?.nodeId) {
        throw new Error('Expected find to return an addressable text match.');
      }

      const selectionTarget = {
        kind: 'selection',
        start: { kind: 'text', blockId: firstMatch.nodeId, offset: 0 },
        end: { kind: 'text', blockId: firstMatch.nodeId, offset: 0 },
      };

      const insert = await host.request('cli.invoke', {
        argv: [
          'insert',
          docCopy,
          '--target-json',
          JSON.stringify(selectionTarget),
          '--value',
          'HOST_STALE_TRACKED_TOKEN',
          '--change-mode',
          'tracked',
          '--out',
          trackedDoc,
        ],
        stdinBase64: '',
      });
      expect(insert.error).toBeUndefined();

      const firstSessionId = 'host-stale-track-change-session-a';
      const openTracked = await host.request('cli.invoke', {
        argv: ['open', trackedDoc, '--session', firstSessionId],
        stdinBase64: '',
      });
      expect(openTracked.error).toBeUndefined();

      const list = await host.request('cli.invoke', {
        argv: ['track-changes', 'list', '--session', firstSessionId, '--limit', '1'],
        stdinBase64: '',
      });
      expect(list.error).toBeUndefined();
      const listPayload = list.result as {
        data?: {
          result?: {
            items?: Array<{
              address?: {
                entityId?: string;
              };
            }>;
          };
        };
      };
      const changeId = listPayload.data?.result?.items?.[0]?.address?.entityId;
      expect(changeId).toBeDefined();
      if (!changeId) {
        throw new Error('Expected track-changes list to return a tracked change id.');
      }

      const accept = await host.request('cli.invoke', {
        argv: ['track-changes', 'accept', '--session', firstSessionId, '--id', changeId],
        stdinBase64: '',
      });
      expect(accept.error).toBeUndefined();
      const acceptPayload = accept.result as {
        command: string;
        data: unknown;
      };
      validateOperationResponseData('doc.trackChanges.decide', acceptPayload.data, acceptPayload.command);
      const acceptData = acceptPayload.data as {
        receipt?: { success?: boolean };
        document?: { revision?: number };
      };
      expect(acceptData.receipt?.success).toBe(true);
      expect(acceptData.document?.revision).toBe(1);

      const save = await host.request('cli.invoke', {
        argv: ['save', '--session', firstSessionId, '--out', acceptedDoc],
        stdinBase64: '',
      });
      expect(save.error).toBeUndefined();

      await host.shutdown();

      const staleHost = launchHost(stateDir);
      const sessionId = 'host-stale-track-change-session-b';
      const open = await staleHost.request('cli.invoke', {
        argv: ['open', acceptedDoc, '--session', sessionId],
        stdinBase64: '',
      });
      expect(open.error).toBeUndefined();

      const staleAccept = await staleHost.request('cli.invoke', {
        argv: ['track-changes', 'accept', '--session', sessionId, '--id', changeId],
        stdinBase64: '',
      });
      expect(staleAccept.result).toBeUndefined();
      expect(staleAccept.error).toMatchObject({
        code: expect.any(Number),
        message: expect.stringContaining('Tracked change'),
        data: {
          cliCode: 'TRACK_CHANGE_NOT_FOUND',
        },
      });

      await staleHost.shutdown();
    },
    HOST_TEST_TIMEOUT_MS,
  );

  test(
    'returns parse errors for malformed frames',
    async () => {
      const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
      cleanup.push(stateDir);
      await mkdir(stateDir, { recursive: true });

      const host = launchHost(stateDir);

      host.sendRaw('{');
      const message = await host.nextMessage();
      expect(message.error?.code).toBe(-32700);
      expect(message.id).toBe(null);

      await host.shutdown();
    },
    HOST_TEST_TIMEOUT_MS,
  );

  test(
    'returns invalid request and cli invoke validation errors',
    async () => {
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
    },
    HOST_TEST_TIMEOUT_MS,
  );

  test(
    'honors --request-timeout-ms for a real cli.invoke ceiling',
    async () => {
      const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
      cleanup.push(stateDir);
      await mkdir(stateDir, { recursive: true });

      const sourceDoc = await resolveSourceDocFixture();
      const docCopy = path.join(stateDir, 'doc.docx');
      await copyFile(sourceDoc, docCopy);

      // 1ms is well below any real cli.invoke wall time, so the host's
      // settleWithTimeout must fire and return a RequestTimeout error
      // carrying the configured value.
      const host = launchHost(stateDir, ['--request-timeout-ms', '1']);

      const response = await host.request('cli.invoke', {
        argv: ['open', docCopy],
        stdinBase64: '',
      });

      expect(response.error?.code).toBe(-32011);
      const errorData = response.error?.data as { timeoutMs?: number };
      expect(errorData.timeoutMs).toBe(1);

      await host.shutdown();
    },
    HOST_TEST_TIMEOUT_MS,
  );

  test(
    'host request timeout blocks delayed execute-code mutations',
    async () => {
      const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-host-test-'));
      cleanup.push(stateDir);
      await mkdir(stateDir, { recursive: true });

      const docCopy = path.join(stateDir, 'doc.docx');
      await copyFile(await resolveSourceDocFixture(), docCopy);

      const host = launchHost(stateDir, ['--request-timeout-ms', '1000']);
      const sessionId = 'timeout-guard';
      const marker = 'HOST_TIMEOUT_LATE_MUTATION';

      const open = await host.request('cli.invoke', {
        argv: ['open', docCopy, '--session', sessionId],
        stdinBase64: '',
      });
      expect(open.error).toBeUndefined();

      const delayedMutation = await host.request('cli.invoke', {
        argv: [
          'preset',
          'dispatch',
          '--session',
          sessionId,
          '--preset',
          'core',
          '--tool-name',
          'superdoc_execute_code',
          '--args-json',
          JSON.stringify({
            code: `await new Promise((resolve) => setTimeout(resolve, 1200)); doc.create.paragraph({ text: '${marker}' }); return 'late';`,
          }),
        ],
        stdinBase64: '',
      });
      if (delayedMutation.error) {
        expect(delayedMutation.error.code).toBe(-32011);
      } else {
        const payload = delayedMutation.result as { data?: { ok?: boolean; error?: { message?: string } } };
        expect(payload.data?.ok).toBe(false);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const text = await host.request('cli.invoke', {
        argv: ['get-text', '--session', sessionId],
        stdinBase64: '',
      });
      expect(text.error).toBeUndefined();
      expect(JSON.stringify(text.result)).not.toContain(marker);

      await host.shutdown();
    },
    HOST_TEST_TIMEOUT_MS,
  );

  test(
    'rejects --request-timeout-ms with a non-numeric value',
    async () => {
      const child = spawn('bun', [CLI_BIN, 'host', '--stdio', '--request-timeout-ms', 'not-a-number'], {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderrBuffer = '';
      child.stderr.on('data', (chunk) => {
        stderrBuffer += String(chunk);
      });

      const exitCode = await withTimeout(
        new Promise<number>((resolve) => {
          child.on('close', (code) => resolve(code ?? -1));
        }),
        5_000,
        'Timed out waiting for host to exit on invalid --request-timeout-ms.',
      );

      expect(exitCode).not.toBe(0);
      expect(stderrBuffer).toContain('--request-timeout-ms');
      expect(stderrBuffer).toContain('positive finite number');
    },
    HOST_TEST_TIMEOUT_MS,
  );
});
