import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, toCliError } from '../lib/errors';
import { asRecord } from '../lib/guards';
import type { CliIO } from '../lib/types';
import { buildContractOperationDetail, buildContractOverview } from '../lib/contract';
import { InMemoryCollaborationSessionPool, type CollaborationSessionPool } from './collab-session-pool';
import { invokeCliFromHost } from './invoke';
import {
  DEFAULT_MAX_STDIN_BYTES,
  HOST_PROTOCOL_FEATURES,
  HOST_PROTOCOL_NOTIFICATIONS,
  HOST_PROTOCOL_VERSION,
  JsonRpcCode,
  hasRequestId,
  makeError,
  makeSuccess,
  parseJsonRpcLine,
  serializeFrame,
  type JsonRpcRequest,
} from './protocol';

const HOST_HELP = `Usage:\n  superdoc host --stdio\n`;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

type HostServerOptions = {
  io: Pick<CliIO, 'stdout' | 'now'>;
  requestTimeoutMs?: number;
  maxStdinBytes?: number;
  collabSessionPool?: CollaborationSessionPool;
};

function resolveCliVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = resolve(__dirname, '../../package.json');
    const raw = readFileSync(packagePath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // ignore and fall through
  }

  return '0.0.0';
}

function parseHostCommandTokens(tokens: string[]): { stdio: boolean; help: boolean } {
  let stdio = false;
  let help = false;

  for (const token of tokens) {
    if (token === '--stdio') {
      stdio = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }

    throw new CliError('INVALID_ARGUMENT', `host: unknown option ${token}`);
  }

  return { stdio, help };
}

type SettledOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout'; awaitSettle: Promise<void> };

async function settleWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<SettledOutcome<T>> {
  const settled = promise.then(
    (value) => ({ kind: 'success', value }) as const,
    (error) => ({ kind: 'error', error }) as const,
  );

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
    timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });

  const raced = await Promise.race([settled, timeout]);
  if (timeoutHandle != null) {
    clearTimeout(timeoutHandle);
  }

  if (raced.kind !== 'timeout') {
    return raced;
  }

  return {
    kind: 'timeout',
    awaitSettle: settled.then(() => undefined),
  };
}

class HostServer {
  private readonly io: Pick<CliIO, 'stdout' | 'now'>;
  private readonly requestTimeoutMs: number;
  private readonly maxStdinBytes: number;
  private readonly collabSessionPool: CollaborationSessionPool;
  private readonly ownsPool: boolean;
  private queue: Promise<void> = Promise.resolve();
  private shutdownRequested = false;

  constructor(options: HostServerOptions) {
    this.io = options.io;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxStdinBytes = options.maxStdinBytes ?? DEFAULT_MAX_STDIN_BYTES;

    if (options.collabSessionPool) {
      this.collabSessionPool = options.collabSessionPool;
      this.ownsPool = false;
    } else {
      this.collabSessionPool = new InMemoryCollaborationSessionPool();
      this.ownsPool = true;
    }
  }

  isShutdownRequested(): boolean {
    return this.shutdownRequested;
  }

  async handleLine(line: string): Promise<void> {
    const parsed = parseJsonRpcLine(line);
    if (parsed.error) {
      this.writeFrame(makeError(null, parsed.error.code, parsed.error.message));
      return;
    }

    const request = parsed.request;
    if (!request) {
      this.writeFrame(makeError(null, JsonRpcCode.InvalidRequest, 'Invalid JSON-RPC request.'));
      return;
    }

    this.queue = this.queue
      .then(() => this.handleRequest(request))
      .catch((error) => {
        const normalized = toCliError(error);
        if (hasRequestId(request)) {
          this.writeFrame(
            makeError(request.id, JsonRpcCode.InternalError, normalized.message, {
              cliCode: normalized.code,
              details: normalized.details,
              exitCode: normalized.exitCode,
            }),
          );
        }
      });

    await this.queue;
  }

  async dispose(): Promise<void> {
    if (this.ownsPool) {
      await this.collabSessionPool.disposeAll();
    }
  }

  private writeFrame(frame: ReturnType<typeof makeSuccess> | ReturnType<typeof makeError>): void {
    this.io.stdout(serializeFrame(frame));
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const id = hasRequestId(request) ? request.id : null;
    const isNotification = !hasRequestId(request);

    if (request.method === 'host.ping') {
      if (!isNotification) {
        this.writeFrame(
          makeSuccess(id, {
            ok: true,
            now: this.io.now(),
          }),
        );
      }
      return;
    }

    if (request.method === 'host.capabilities') {
      if (!isNotification) {
        this.writeFrame(
          makeSuccess(id, {
            protocolVersion: HOST_PROTOCOL_VERSION,
            features: [...HOST_PROTOCOL_FEATURES],
            notifications: [...HOST_PROTOCOL_NOTIFICATIONS],
            cliVersion: resolveCliVersion(),
          }),
        );
      }
      return;
    }

    if (request.method === 'host.describe') {
      if (!isNotification) {
        this.writeFrame(makeSuccess(id, buildContractOverview()));
      }
      return;
    }

    if (request.method === 'host.describe.command') {
      const params = asRecord(request.params);
      const operationId = typeof params?.operationId === 'string' ? params.operationId.trim() : '';
      if (!operationId) {
        if (!isNotification) {
          this.writeFrame(
            makeError(id, JsonRpcCode.InvalidParams, 'host.describe.command requires params.operationId (string).'),
          );
        }
        return;
      }

      const detail = buildContractOperationDetail(operationId);
      if (!detail) {
        if (!isNotification) {
          this.writeFrame(
            makeError(id, JsonRpcCode.InvalidParams, `Unknown operation: ${operationId}`, {
              operationId,
            }),
          );
        }
        return;
      }

      if (!isNotification) {
        this.writeFrame(makeSuccess(id, detail));
      }
      return;
    }

    if (request.method === 'host.shutdown') {
      this.shutdownRequested = true;
      if (!isNotification) {
        this.writeFrame(
          makeSuccess(id, {
            shutdown: true,
          }),
        );
      }
      return;
    }

    if (request.method !== 'cli.invoke') {
      if (!isNotification) {
        this.writeFrame(makeError(id, JsonRpcCode.MethodNotFound, `Method not found: ${request.method}`));
      }
      return;
    }

    const outcome = await settleWithTimeout(
      invokeCliFromHost(request.params, {
        ioNow: this.io.now,
        collabSessionPool: this.collabSessionPool,
        maxStdinBytes: this.maxStdinBytes,
      }),
      this.requestTimeoutMs,
    );

    if (outcome.kind === 'timeout') {
      if (!isNotification) {
        this.writeFrame(
          makeError(id, JsonRpcCode.RequestTimeout, `Host request timed out after ${this.requestTimeoutMs}ms.`, {
            timeoutMs: this.requestTimeoutMs,
          }),
        );
      }

      // The invoke operation has no cooperative cancellation yet. Wait for it to
      // settle so queued requests cannot overlap with a timed-out mutation.
      await outcome.awaitSettle;
      return;
    }

    if (outcome.kind === 'success') {
      if (!isNotification) {
        this.writeFrame(makeSuccess(id, outcome.value));
      }
      return;
    }

    const cliError = toCliError(outcome.error);
    if (isNotification) return;

    const isHostTimeout = cliError.code === 'TIMEOUT';
    const isPayloadTooLarge =
      cliError.code === 'INVALID_ARGUMENT' &&
      typeof cliError.message === 'string' &&
      cliError.message.includes('stdin payload exceeds');

    this.writeFrame(
      makeError(
        id,
        isHostTimeout
          ? JsonRpcCode.RequestTimeout
          : isPayloadTooLarge
            ? JsonRpcCode.RequestTooLarge
            : JsonRpcCode.CliInvokeFailed,
        cliError.message,
        {
          cliCode: cliError.code,
          message: cliError.message,
          details: cliError.details,
          exitCode: cliError.exitCode,
        },
      ),
    );
  }
}

/**
 * Starts the host server in stdio mode, reading newline-delimited JSON-RPC requests from stdin
 * and writing responses to stdout.
 *
 * @param tokens - CLI tokens after "host" (e.g. `["--stdio"]`)
 * @param io - I/O adapter for stdout output and clock
 * @returns Exit code (0 on clean shutdown)
 * @throws {CliError} If an unsupported transport is requested
 */
export async function runHostStdio(tokens: string[], io: CliIO): Promise<number> {
  const parsed = parseHostCommandTokens(tokens);
  if (parsed.help) {
    io.stdout(HOST_HELP);
    return 0;
  }

  if (!parsed.stdio) {
    throw new CliError('INVALID_ARGUMENT', 'host: only --stdio is supported in v1.');
  }

  const server = new HostServer({ io });
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  try {
    for await (const line of rl) {
      await server.handleLine(line);
      if (server.isShutdownRequested()) {
        rl.close();
        break;
      }
    }
  } finally {
    await server.dispose();
  }

  return 0;
}

export { HostServer };
