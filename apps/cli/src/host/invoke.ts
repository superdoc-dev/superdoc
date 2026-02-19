import { invokeCommand } from '../index';
import { CliError } from '../lib/errors';
import { asRecord } from '../lib/guards';
import type { CliIO } from '../lib/types';
import type { CollaborationSessionPool } from './collab-session-pool';
import { DEFAULT_MAX_STDIN_BYTES } from './protocol';

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

type CliInvokeParams = {
  argv: string[];
  stdinBytes?: Uint8Array;
};

/**
 * Options for invoking CLI commands from the host process.
 *
 * @param ioNow - Clock function used for elapsed-time tracking
 * @param collabSessionPool - Pool for reusing collaboration sessions across invocations
 * @param maxStdinBytes - Maximum allowed size (bytes) for base64-decoded stdin payloads
 */
export interface HostInvokeCliOptions {
  ioNow?: () => number;
  collabSessionPool?: CollaborationSessionPool;
  maxStdinBytes?: number;
}

function estimateBase64RawLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function decodeStdinBase64(value: string, maxStdinBytes: number): Uint8Array {
  const normalized = value.trim();
  if (!normalized) {
    return new Uint8Array();
  }

  if (normalized.length % 4 !== 0 || !BASE64_PATTERN.test(normalized)) {
    throw new CliError('INVALID_ARGUMENT', 'cli.invoke params.stdinBase64 must be valid base64.');
  }

  const estimatedBytes = estimateBase64RawLength(normalized);
  if (estimatedBytes > maxStdinBytes) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `cli.invoke stdin payload exceeds ${maxStdinBytes} bytes; use file-path input instead of stdin.`,
      {
        maxStdinBytes,
        estimatedBytes,
      },
    );
  }

  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.byteLength > maxStdinBytes) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `cli.invoke stdin payload exceeds ${maxStdinBytes} bytes; use file-path input instead of stdin.`,
      {
        maxStdinBytes,
        byteLength: buffer.byteLength,
      },
    );
  }

  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function parseCliInvokeParams(rawParams: unknown, maxStdinBytes: number): CliInvokeParams {
  const record = asRecord(rawParams);
  if (!record) {
    throw new CliError('INVALID_ARGUMENT', 'cli.invoke params must be an object.');
  }

  const argvRaw = record.argv;
  if (!Array.isArray(argvRaw) || argvRaw.length === 0 || argvRaw.some((token) => typeof token !== 'string')) {
    throw new CliError('INVALID_ARGUMENT', 'cli.invoke params.argv must be a non-empty string array.');
  }

  const stdinBase64 = record.stdinBase64;
  if (stdinBase64 == null) {
    return { argv: argvRaw as string[] };
  }

  if (typeof stdinBase64 !== 'string') {
    throw new CliError('INVALID_ARGUMENT', 'cli.invoke params.stdinBase64 must be a string when provided.');
  }

  return {
    argv: argvRaw as string[],
    stdinBytes: decodeStdinBase64(stdinBase64, maxStdinBytes),
  };
}

/**
 * Parses raw JSON-RPC params and executes a CLI command within the host process.
 *
 * @param rawParams - Untyped params from the JSON-RPC request (expected shape: `{ argv: string[], stdinBase64?: string }`)
 * @param options - Host invocation options (clock, session pool, stdin size limit)
 * @returns The command name, result data, and elapsed-time metadata
 * @throws {CliError} On invalid params, stdin size violations, or command failures
 */
export async function invokeCliFromHost(
  rawParams: unknown,
  options: HostInvokeCliOptions = {},
): Promise<{ command: string; data: unknown; meta: { elapsedMs: number } }> {
  const maxStdinBytes = options.maxStdinBytes ?? DEFAULT_MAX_STDIN_BYTES;
  const params = parseCliInvokeParams(rawParams, maxStdinBytes);

  const stdinBytes = params.stdinBytes;
  const readStdinBytes = async () => stdinBytes ?? new Uint8Array();

  const io: Partial<CliIO> = {
    readStdinBytes,
    now: options.ioNow,
    stdout() {},
    stderr() {},
  };

  const invocation = await invokeCommand(params.argv, {
    ioOverrides: io,
    executionMode: 'host',
    collabSessionPool: options.collabSessionPool,
  });

  if (invocation.helpText) {
    return {
      command: 'help',
      data: {
        usage: invocation.helpText,
      },
      meta: {
        elapsedMs: invocation.elapsedMs,
      },
    };
  }

  if (!invocation.execution) {
    throw new CliError('COMMAND_FAILED', 'cli.invoke produced no command result.');
  }

  return {
    command: invocation.execution.command,
    data: invocation.execution.data,
    meta: {
      elapsedMs: invocation.elapsedMs,
    },
  };
}
