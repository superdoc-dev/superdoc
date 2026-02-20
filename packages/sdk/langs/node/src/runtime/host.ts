import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import {
  buildOperationArgv,
  resolveInvocation,
  type ChangeMode,
  type InvokeOptions,
  type OperationSpec,
  type SuperDocClientOptions,
} from './transport-common.js';
import { SuperDocCliError } from './errors.js';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: SuperDocCliError) => void;
  timer: NodeJS.Timeout;
};

type JsonRpcErrorData = {
  cliCode?: unknown;
  message?: unknown;
  details?: unknown;
  exitCode?: unknown;
};

type JsonRpcError = {
  code: number;
  message: string;
  data?: JsonRpcErrorData;
};

const HOST_PROTOCOL_VERSION = '1.0';
const REQUIRED_FEATURES = ['cli.invoke', 'host.shutdown'];
const CHANGE_MODES: readonly ChangeMode[] = ['direct', 'tracked'];

const JSON_RPC_TIMEOUT_CODE = -32011;

/**
 * Transport that communicates with a long-lived CLI host process over JSON-RPC stdio.
 */
export class HostTransport {
  private readonly cliBin: string;
  private readonly env?: Record<string, string | undefined>;
  private readonly startupTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly requestTimeoutMs?: number;
  private readonly watchdogTimeoutMs: number;
  private readonly maxQueueDepth: number;
  private readonly defaultChangeMode?: ChangeMode;

  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: ReadlineInterface | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private connecting: Promise<void> | null = null;
  private stopping = false;

  constructor(options: { cliBin: string } & SuperDocClientOptions) {
    this.cliBin = options.cliBin;
    this.env = options.env;

    this.startupTimeoutMs = options.startupTimeoutMs ?? 5_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5_000;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.watchdogTimeoutMs = options.watchdogTimeoutMs ?? 30_000;
    this.maxQueueDepth = options.maxQueueDepth ?? 100;
    if (options.defaultChangeMode != null && !CHANGE_MODES.includes(options.defaultChangeMode)) {
      throw new SuperDocCliError('defaultChangeMode must be "direct" or "tracked".', {
        code: 'INVALID_ARGUMENT',
        details: { defaultChangeMode: options.defaultChangeMode },
      });
    }
    this.defaultChangeMode = options.defaultChangeMode;
  }

  async connect(): Promise<void> {
    await this.ensureConnected();
  }

  async dispose(): Promise<void> {
    if (!this.child) return;

    this.stopping = true;

    const child = this.child;
    try {
      await this.sendJsonRpcRequest('host.shutdown', {}, this.shutdownTimeoutMs);
    } catch {
      // ignore and force shutdown below
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, this.shutdownTimeoutMs);

      child.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.cleanupProcess(null);
    this.stopping = false;
  }

  async invoke<TData extends Record<string, unknown>>(
    operation: OperationSpec,
    params: Record<string, unknown> = {},
    options: InvokeOptions = {},
  ): Promise<TData> {
    await this.ensureConnected();

    const argv = buildOperationArgv(operation, params, options, this.requestTimeoutMs, this.defaultChangeMode);
    const stdinBase64 = options.stdinBytes ? Buffer.from(options.stdinBytes).toString('base64') : '';
    const watchdogTimeout = this.resolveWatchdogTimeout(options.timeoutMs);

    const response = await this.sendJsonRpcRequest(
      'cli.invoke',
      {
        argv,
        stdinBase64,
      },
      watchdogTimeout,
    );

    if (typeof response !== 'object' || response == null || Array.isArray(response)) {
      throw new SuperDocCliError('Host returned invalid cli.invoke result.', {
        code: 'HOST_PROTOCOL_ERROR',
        details: { result: response },
      });
    }

    const resultRecord = response as Record<string, unknown>;
    return resultRecord.data as TData;
  }

  private async ensureConnected(): Promise<void> {
    if (this.child && !this.child.killed) {
      return;
    }

    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = this.startHostProcess();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async startHostProcess(): Promise<void> {
    const { command, prefixArgs } = resolveInvocation(this.cliBin);
    const args = [...prefixArgs, 'host', '--stdio'];

    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...(this.env ?? {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;

    const stdoutReader = createInterface({
      input: child.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    this.stdoutReader = stdoutReader;

    stdoutReader.on('line', (line) => {
      this.onStdoutLine(line);
    });

    child.stderr.on('data', () => {
      // stderr intentionally ignored in host mode
    });

    child.on('error', (error) => {
      this.handleDisconnect(
        new SuperDocCliError('Host process failed.', {
          code: 'HOST_DISCONNECTED',
          details: {
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    });

    child.on('close', (code, signal) => {
      if (this.stopping) {
        this.cleanupProcess(null);
        return;
      }

      this.handleDisconnect(
        new SuperDocCliError('Host process disconnected.', {
          code: 'HOST_DISCONNECTED',
          details: { exitCode: code, signal },
        }),
      );
    });

    try {
      const capabilities = await this.sendJsonRpcRequest('host.capabilities', {}, this.startupTimeoutMs);
      this.assertCapabilities(capabilities);
    } catch (error) {
      const normalized =
        error instanceof SuperDocCliError
          ? error
          : new SuperDocCliError('Host handshake failed.', {
              code: 'HOST_HANDSHAKE_FAILED',
              details: {
                message: error instanceof Error ? error.message : String(error),
              },
            });
      this.handleDisconnect(normalized);
      throw normalized;
    }
  }

  private assertCapabilities(response: unknown): void {
    if (typeof response !== 'object' || response == null || Array.isArray(response)) {
      throw new SuperDocCliError('Host capabilities response is invalid.', {
        code: 'HOST_HANDSHAKE_FAILED',
        details: { response },
      });
    }

    const record = response as Record<string, unknown>;
    const protocolVersion = record.protocolVersion;
    const features = record.features;

    if (protocolVersion !== HOST_PROTOCOL_VERSION) {
      throw new SuperDocCliError('Host protocol version is unsupported.', {
        code: 'HOST_HANDSHAKE_FAILED',
        details: {
          expected: HOST_PROTOCOL_VERSION,
          actual: protocolVersion,
        },
      });
    }

    if (!Array.isArray(features) || features.some((f) => typeof f !== 'string')) {
      throw new SuperDocCliError('Host capabilities.features must be a string array.', {
        code: 'HOST_HANDSHAKE_FAILED',
        details: { features },
      });
    }

    for (const requiredFeature of REQUIRED_FEATURES) {
      if (!features.includes(requiredFeature)) {
        throw new SuperDocCliError(`Host does not support required feature: ${requiredFeature}`, {
          code: 'HOST_HANDSHAKE_FAILED',
          details: { features },
        });
      }
    }
  }

  private resolveWatchdogTimeout(timeoutMsOverride: number | undefined): number {
    if (timeoutMsOverride != null) {
      return Math.max(this.watchdogTimeoutMs, timeoutMsOverride + 1_000);
    }

    if (this.requestTimeoutMs != null) {
      return Math.max(this.watchdogTimeoutMs, this.requestTimeoutMs + 1_000);
    }

    return this.watchdogTimeoutMs;
  }

  private async sendJsonRpcRequest(method: string, params: unknown, watchdogTimeoutMs: number): Promise<unknown> {
    const child = this.child;
    if (!child || !child.stdin.writable) {
      throw new SuperDocCliError('Host process is not available.', {
        code: 'HOST_DISCONNECTED',
      });
    }

    if (this.pending.size >= this.maxQueueDepth) {
      throw new SuperDocCliError('Host request queue is full.', {
        code: 'HOST_QUEUE_FULL',
        details: { maxQueueDepth: this.maxQueueDepth },
      });
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);

        reject(
          new SuperDocCliError(`Host watchdog timed out waiting for ${method}.`, {
            code: 'HOST_TIMEOUT',
            details: { method, timeoutMs: watchdogTimeoutMs },
          }),
        );

        this.handleDisconnect(
          new SuperDocCliError('Host watchdog timeout; host process will be restarted on next request.', {
            code: 'HOST_DISCONNECTED',
            details: { method, timeoutMs: watchdogTimeoutMs },
          }),
        );
      }, watchdogTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      child.stdin.write(`${payload}\n`, (error) => {
        if (!error) return;

        const pending = this.pending.get(id);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pending.delete(id);
        reject(
          new SuperDocCliError('Failed to write request to host process.', {
            code: 'HOST_DISCONNECTED',
            details: { method, message: error.message },
          }),
        );
      });
    });

    return promise;
  }

  private onStdoutLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
      return;
    }

    const record = parsed as Record<string, unknown>;
    if (record.jsonrpc !== '2.0') {
      return;
    }

    // Notification (no id) — reserved for future eventing
    if ('method' in record && !('id' in record)) {
      return;
    }

    const idRaw = record.id;
    if (typeof idRaw !== 'number') {
      return;
    }

    const pending = this.pending.get(idRaw);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(idRaw);

    if ('error' in record) {
      pending.reject(this.mapJsonRpcError(record.error));
      return;
    }

    pending.resolve(record.result);
  }

  private mapJsonRpcError(rawError: unknown): SuperDocCliError {
    if (typeof rawError !== 'object' || rawError == null || Array.isArray(rawError)) {
      return new SuperDocCliError('Host returned an unknown JSON-RPC error.', {
        code: 'HOST_PROTOCOL_ERROR',
        details: { error: rawError },
      });
    }

    const error = rawError as JsonRpcError;
    const data = error.data as JsonRpcErrorData | undefined;
    const cliCode = typeof data?.cliCode === 'string' ? data.cliCode : undefined;
    const cliMessage = typeof data?.message === 'string' ? data.message : undefined;
    const exitCode = typeof data?.exitCode === 'number' ? data.exitCode : undefined;

    if (cliCode) {
      return new SuperDocCliError(cliMessage ?? error.message ?? 'Command failed.', {
        code: cliCode,
        details: data?.details,
        exitCode,
      });
    }

    if (error.code === JSON_RPC_TIMEOUT_CODE) {
      return new SuperDocCliError(error.message, {
        code: 'TIMEOUT',
        details: data,
      });
    }

    return new SuperDocCliError(error.message, {
      code: 'COMMAND_FAILED',
      details: data,
    });
  }

  private handleDisconnect(error: SuperDocCliError): void {
    this.cleanupProcess(error);
  }

  private cleanupProcess(error: SuperDocCliError | null): void {
    const child = this.child;
    if (child) {
      child.removeAllListeners();
      child.kill('SIGKILL');
    }

    this.child = null;

    if (this.stdoutReader) {
      this.stdoutReader.removeAllListeners();
      this.stdoutReader.close();
      this.stdoutReader = null;
    }

    const pendingEntries = Array.from(this.pending.values());
    this.pending.clear();

    const rejection =
      error ??
      new SuperDocCliError('Host process was disposed while request was in flight.', {
        code: 'HOST_DISCONNECTED',
      });

    for (const pending of pendingEntries) {
      clearTimeout(pending.timer);
      pending.reject(rejection);
    }
  }
}
