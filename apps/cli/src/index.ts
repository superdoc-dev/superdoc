#!/usr/bin/env node

import { parseGlobalArgs } from './lib/args';
import { createFailureEnvelope, createSuccessEnvelope } from './lib/envelope';
import { CliError, toCliError } from './lib/errors';
import { normalizeJsonValue } from './lib/input-readers';
import type { CliIO, CommandContext, CommandExecution, ExecutionMode, GlobalOptions, OutputMode } from './lib/types';
import { runCall } from './commands/call';
import { runClose } from './commands/close';
import { runOpen } from './commands/open';
import { runSessionClose } from './commands/session-close';
import { runSessionList } from './commands/session-list';
import { runSessionSave } from './commands/session-save';
import { runSessionSetDefault, runSessionUse } from './commands/session-set-default';
import { runSave } from './commands/save';
import { tryRunLegacyCompatCommand } from './commands/legacy-compat';
import { runCommandWrapper } from './lib/wrapper-dispatch';
import { MANUAL_COMMAND_ALLOWLIST, type ManualCommandKey } from './lib/manual-command-allowlist';
import { validateOperationResponseData } from './lib/operation-args';
import { runInstall } from './commands/install';
import { runUninstall } from './commands/uninstall';
import {
  CLI_COMMAND_SPECS,
  CLI_COMMAND_KEYS,
  CLI_HELP,
  CLI_MAX_COMMAND_TOKENS,
  type CliCommandKey,
  type CliOperationId,
} from './cli';

const HELP = [
  CLI_HELP,
  '',
  'Legacy compatibility (v0.x):',
  '  superdoc search <pattern> <files...>',
  '  superdoc replace-legacy <find> <to> <files...>',
  '  superdoc read <file>',
  '',
  'Canonical machine call:',
  '  superdoc call <operationId> [--input-json "{...}"|--input-file payload.json]',
].join('\n');

type CommandRunner = (tokens: string[], context: CommandContext) => Promise<CommandExecution>;

type ParsedInvocation = {
  globals: GlobalOptions;
  rest: string[];
};

/** The result of a programmatic CLI invocation via {@link invokeCommand}. */
export type InvokeCommandResult = {
  globals: GlobalOptions;
  execution?: CommandExecution;
  helpText?: string;
  elapsedMs: number;
};

/** Options accepted by {@link invokeCommand}. */
export type InvokeCommandOptions = {
  ioOverrides?: Partial<CliIO>;
  executionMode?: ExecutionMode;
  collabSessionPool?: CommandContext['collabSessionPool'];
};

const MANUAL_COMMANDS = {
  call: runCall,
  close: runClose,
  open: runOpen,
  save: runSave,
  'session list': runSessionList,
  'session save': runSessionSave,
  'session close': runSessionClose,
  'session set-default': runSessionSetDefault,
  'session use': runSessionUse,
} satisfies Record<ManualCommandKey, CommandRunner>;

const EXTRA_COMMAND_KEYS = ['call'] as const;
const COMMAND_KEY_SET = new Set<string>([...CLI_COMMAND_KEYS, ...EXTRA_COMMAND_KEYS]);
const CLI_COMMAND_KEY_SET = new Set<string>(CLI_COMMAND_KEYS);
const MANUAL_COMMAND_KEY_SET = new Set<string>(MANUAL_COMMAND_ALLOWLIST);
const COMMAND_OPERATION_ID_BY_KEY = new Map<string, CliOperationId>(
  CLI_COMMAND_SPECS.map((spec) => [spec.key, spec.operationId as CliOperationId] as const),
);

function hasCommandHelpFlag(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

function defaultIo(): CliIO {
  let stdinCache: Promise<Uint8Array> | null = null;

  return {
    stdout(message: string) {
      process.stdout.write(message);
    },
    stderr(message: string) {
      process.stderr.write(message);
    },
    readStdinBytes() {
      if (stdinCache) return stdinCache;

      stdinCache = new Promise<Uint8Array>((resolve, reject) => {
        const chunks: Buffer[] = [];
        process.stdin.on('data', (chunk: Buffer | Uint8Array | string) => {
          if (typeof chunk === 'string') {
            chunks.push(Buffer.from(chunk));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        process.stdin.on('end', () => {
          resolve(new Uint8Array(Buffer.concat(chunks)));
        });
        process.stdin.on('error', (error) => {
          reject(error);
        });
      });

      return stdinCache;
    },
    now() {
      return Date.now();
    },
  };
}

function mergeIo(overrides?: Partial<CliIO>): CliIO {
  const base = defaultIo();
  if (!overrides) return base;

  return {
    stdout: overrides.stdout ?? base.stdout,
    stderr: overrides.stderr ?? base.stderr,
    readStdinBytes: overrides.readStdinBytes ?? base.readStdinBytes,
    now: overrides.now ?? base.now,
  };
}

function parseCommand(rest: string[]): { key: string; args: string[] } {
  if (rest.length === 0) {
    throw new CliError('MISSING_REQUIRED', 'Missing command.');
  }

  const maxTokens = Math.min(Math.max(CLI_MAX_COMMAND_TOKENS, 1), rest.length);
  for (let tokenCount = maxTokens; tokenCount >= 1; tokenCount -= 1) {
    const candidate = rest.slice(0, tokenCount).join(' ');
    if (!COMMAND_KEY_SET.has(candidate)) continue;
    return {
      key: candidate,
      args: rest.slice(tokenCount),
    };
  }

  const attempted = rest.slice(0, maxTokens).join(' ');
  throw new CliError('UNKNOWN_COMMAND', `Unknown command: ${attempted}`);
}

async function executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs) return operation();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new CliError('TIMEOUT', `Command timed out after ${timeoutMs}ms.`, {
          timeoutMs,
        }),
      );
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function writeSuccess(io: CliIO, mode: OutputMode, payload: CommandExecution, elapsedMs: number): void {
  if (mode === 'json') {
    io.stdout(`${JSON.stringify(createSuccessEnvelope(payload.command, payload.data, elapsedMs))}\n`);
    return;
  }

  io.stdout(`${payload.pretty}\n`);
}

function writeFailure(io: CliIO, mode: OutputMode, error: CliError, elapsedMs: number): void {
  if (mode === 'json') {
    io.stderr(`${JSON.stringify(createFailureEnvelope(error, elapsedMs))}\n`);
    return;
  }

  io.stderr(`Error [${error.code}]: ${error.message}\n`);
}

function parseInvocation(argv: string[]): ParsedInvocation {
  const { globals, rest } = parseGlobalArgs(argv);
  return { globals, rest };
}

async function executeParsedInvocation(
  parsed: ParsedInvocation,
  io: CliIO,
  executionMode: ExecutionMode,
  collabSessionPool?: CommandContext['collabSessionPool'],
): Promise<{ execution?: CommandExecution; helpText?: string }> {
  if (parsed.globals.help || parsed.rest.length === 0) {
    return { helpText: HELP };
  }

  const { key, args } = parseCommand(parsed.rest);

  const context: CommandContext = {
    io,
    timeoutMs: parsed.globals.timeoutMs,
    sessionId: parsed.globals.sessionId,
    executionMode,
    collabSessionPool,
  };

  const execution = await executeWithTimeout(async () => {
    if (MANUAL_COMMAND_KEY_SET.has(key)) {
      const handler = MANUAL_COMMANDS[key as ManualCommandKey];
      return handler(args, context);
    }

    if (CLI_COMMAND_KEY_SET.has(key)) {
      return runCommandWrapper(key as CliCommandKey, args, context);
    }

    throw new CliError('UNKNOWN_COMMAND', `Unknown command: ${key}`);
  }, parsed.globals.timeoutMs);

  const operationId = COMMAND_OPERATION_ID_BY_KEY.get(key) as CliOperationId | undefined;
  const shouldValidateResponse = operationId != null && !hasCommandHelpFlag(args);
  if (!shouldValidateResponse) {
    return { execution };
  }

  const normalizedData = normalizeJsonValue(execution.data, key);
  validateOperationResponseData(operationId, normalizedData, key);
  return {
    execution: {
      ...execution,
      data: normalizedData as Record<string, unknown>,
    },
  };
}

/**
 * Programmatically invokes a CLI command without process-level I/O side effects.
 *
 * @param argv - The argument tokens (e.g. `["find", "doc.docx", "--type", "text"]`)
 * @param options - I/O overrides, execution mode, and collaboration pool
 * @returns Parsed globals, optional execution result or help text, and elapsed time
 * @throws {CliError} On unknown commands, validation failures, or command errors
 */
export async function invokeCommand(argv: string[], options: InvokeCommandOptions = {}): Promise<InvokeCommandResult> {
  const io = mergeIo(options.ioOverrides);
  const startedAt = io.now();
  const parsed = parseInvocation(argv);
  const output = await executeParsedInvocation(
    parsed,
    io,
    options.executionMode ?? 'oneshot',
    options.collabSessionPool,
  );

  return {
    globals: parsed.globals,
    execution: output.execution,
    helpText: output.helpText,
    elapsedMs: io.now() - startedAt,
  };
}

async function runHostCommand(tokens: string[], io: CliIO): Promise<number> {
  const { runHostStdio } = await import('./host/server');
  return runHostStdio(tokens, io);
}

/**
 * Top-level CLI entry point. Parses arguments, routes to the appropriate command,
 * and writes JSON or pretty output to the provided I/O streams.
 *
 * @param argv - Raw process arguments (after stripping the binary path)
 * @param ioOverrides - Optional overrides for stdout, stderr, stdin, and clock
 * @returns Process exit code (0 on success, non-zero on error)
 */
export async function run(argv: string[], ioOverrides?: Partial<CliIO>): Promise<number> {
  const io = mergeIo(ioOverrides);
  const startedAt = io.now();
  let outputMode: OutputMode = 'json';

  try {
    const parsed = parseInvocation(argv);
    outputMode = parsed.globals.output;

    if (parsed.rest[0] === 'host') {
      const hostTokens = parsed.rest.slice(1);
      if (parsed.globals.help) hostTokens.push('--help');
      return await runHostCommand(hostTokens, io);
    }

    if (parsed.rest[0] === 'install' && !parsed.globals.help) {
      return await runInstall(parsed.rest.slice(1), io);
    }

    if (parsed.rest[0] === 'uninstall' && !parsed.globals.help) {
      return await runUninstall(parsed.rest.slice(1), io);
    }

    if (parsed.rest[0] === 'call' && outputMode !== 'json') {
      throw new CliError('INVALID_ARGUMENT', 'call: only --output json is supported.');
    }

    if (!parsed.globals.help) {
      const legacyCompat = await tryRunLegacyCompatCommand(argv, parsed.rest, io);
      if (legacyCompat.handled) {
        return legacyCompat.exitCode;
      }
    }

    const output = await executeParsedInvocation(parsed, io, 'oneshot');
    if (output.helpText) {
      io.stdout(output.helpText);
      return 0;
    }
    if (!output.execution) {
      throw new CliError('COMMAND_FAILED', 'Command produced no execution result and no help text.');
    }

    const elapsedMs = io.now() - startedAt;
    writeSuccess(io, outputMode, output.execution, elapsedMs);
    return 0;
  } catch (error) {
    const cliError = toCliError(error);
    const elapsedMs = io.now() - startedAt;
    writeFailure(io, outputMode, cliError, elapsedMs);
    return cliError.exitCode;
  }
}

if (import.meta.main) {
  const exitCode = await run(process.argv.slice(2));
  process.exit(exitCode);
}
