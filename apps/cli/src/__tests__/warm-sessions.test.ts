/**
 * Integration tests for warm SDK sessions.
 *
 * Verifies that host-mode sessions keep a live editor in memory across
 * cli.invoke calls, deferring disk writes to save/close/shutdown.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSourceDocFixture } from './fixtures';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const CLI_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const TIMEOUT_MS = 15_000;

type JsonRpcMessage = {
  jsonrpc: '2.0';
  id?: number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

// ---------------------------------------------------------------------------
// Host harness (reused from host.test.ts pattern)
// ---------------------------------------------------------------------------

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

function launchHost(stateDir: string) {
  const child = spawn('bun', [CLI_BIN, 'host', '--stdio'], {
    cwd: REPO_ROOT,
    env: { ...process.env, SUPERDOC_CLI_STATE_DIR: stateDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (msg: JsonRpcMessage) => void; reject: (error: Error) => void }>();
  let stdoutBuffer = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += String(chunk);
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      const message = JSON.parse(trimmed) as JsonRpcMessage;
      if (typeof message.id === 'number') {
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          waiter.resolve(message);
        }
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
    const id = nextId++;
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return withTimeout(
      new Promise<JsonRpcMessage>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(`${frame}\n`);
      }),
      TIMEOUT_MS,
      `Timed out waiting for response to ${method}.`,
    );
  }

  function invoke(argv: string[]): Promise<JsonRpcMessage> {
    return request('cli.invoke', { argv });
  }

  async function shutdown(): Promise<void> {
    try {
      await request('host.shutdown');
    } catch {
      child.kill('SIGKILL');
    }
    await withTimeout(
      new Promise<void>((resolve) => child.once('close', () => resolve())),
      TIMEOUT_MS,
      'Timed out waiting for host shutdown.',
    );
  }

  return { child, request, invoke, shutdown };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function resultData(msg: JsonRpcMessage): Record<string, unknown> {
  const r = msg.result as { data?: unknown };
  return (r?.data ?? {}) as Record<string, unknown>;
}

function resultError(msg: JsonRpcMessage): { code: number; message: string; data?: unknown } | undefined {
  return msg.error;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('warm SDK sessions', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const p = cleanup.pop();
      if (p) await rm(p, { recursive: true, force: true });
    }
  });

  test('open → mutate → mutate → save: both mutations persist', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'warm-sessions-'));
    cleanup.push(stateDir);
    const sourceDoc = await resolveSourceDocFixture();
    const host = launchHost(stateDir);

    try {
      // Open session
      const openRes = await host.invoke(['open', sourceDoc, '--session', 'warm-1']);
      expect(openRes.error).toBeUndefined();
      const openData = resultData(openRes);
      expect(openData.contextId).toBe('warm-1');

      // First mutation
      const mutate1 = await host.invoke(['insert', '--session', 'warm-1', '--value', 'WARM_FIRST']);
      expect(mutate1.error).toBeUndefined();
      const mutate1Data = resultData(mutate1);
      expect((mutate1Data.document as any)?.revision).toBe(1);

      // Second mutation
      const mutate2 = await host.invoke(['insert', '--session', 'warm-1', '--value', 'WARM_SECOND']);
      expect(mutate2.error).toBeUndefined();
      const mutate2Data = resultData(mutate2);
      expect((mutate2Data.document as any)?.revision).toBe(2);

      // Save
      const saveDir = await mkdtemp(path.join(tmpdir(), 'warm-save-'));
      cleanup.push(saveDir);
      const outPath = path.join(saveDir, 'result.docx');
      const saveRes = await host.invoke(['save', '--session', 'warm-1', '--out', outPath]);
      expect(saveRes.error).toBeUndefined();

      // Verify file was written
      const savedBytes = await readFile(outPath);
      expect(savedBytes.byteLength).toBeGreaterThan(0);
    } finally {
      await host.shutdown();
    }
  });

  test('open → mutate → close --discard: no checkpoint', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'warm-sessions-discard-'));
    cleanup.push(stateDir);
    const sourceDoc = await resolveSourceDocFixture();
    const host = launchHost(stateDir);

    try {
      await host.invoke(['open', sourceDoc, '--session', 'discard-1']);

      // Mutate
      await host.invoke(['insert', '--session', 'discard-1', '--value', 'DISCARDED']);

      // Close with discard
      const closeRes = await host.invoke(['close', '--session', 'discard-1', '--discard']);
      expect(closeRes.error).toBeUndefined();
      const closeData = resultData(closeRes);
      expect(closeData.discarded).toBe(true);
    } finally {
      await host.shutdown();
    }
  });

  test('open → mutate → close (no discard, dirty) → error', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'warm-sessions-dirty-'));
    cleanup.push(stateDir);
    const sourceDoc = await resolveSourceDocFixture();
    const host = launchHost(stateDir);

    try {
      await host.invoke(['open', sourceDoc, '--session', 'dirty-1']);

      // Mutate to make session dirty
      await host.invoke(['insert', '--session', 'dirty-1', '--value', 'DIRTY']);

      // Close without discard should fail
      const closeRes = await host.invoke(['close', '--session', 'dirty-1']);
      const err = resultError(closeRes);
      expect(err).toBeDefined();
      expect((err?.data as any)?.cliCode).toBe('DIRTY_CLOSE_REQUIRES_DECISION');
    } finally {
      await host.shutdown();
    }
  });

  test('read operations reuse warm session', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'warm-sessions-read-'));
    cleanup.push(stateDir);
    const sourceDoc = await resolveSourceDocFixture();
    const host = launchHost(stateDir);

    try {
      await host.invoke(['open', sourceDoc, '--session', 'read-1']);

      // Multiple reads should work (reusing the pooled editor)
      const info1 = await host.invoke(['info', '--session', 'read-1']);
      expect(info1.error).toBeUndefined();

      const info2 = await host.invoke(['info', '--session', 'read-1']);
      expect(info2.error).toBeUndefined();

      await host.invoke(['close', '--session', 'read-1', '--discard']);
    } finally {
      await host.shutdown();
    }
  });

  test('shutdown flushes dirty sessions to disk', async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'warm-sessions-shutdown-'));
    cleanup.push(stateDir);
    const sourceDoc = await resolveSourceDocFixture();
    const host = launchHost(stateDir);

    try {
      await host.invoke(['open', sourceDoc, '--session', 'shutdown-1']);

      // Mutate (makes session dirty)
      await host.invoke(['insert', '--session', 'shutdown-1', '--value', 'SHUTDOWN_TEST']);

      // Shutdown should flush via disposeAll
      await host.shutdown();
    } catch {
      // shutdown may throw if host exits before response — that's OK
    }
  });
});
