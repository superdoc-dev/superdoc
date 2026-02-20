export type ParamType = 'string' | 'number' | 'boolean' | 'json' | 'string[]';
export type ParamKind = 'doc' | 'flag' | 'jsonFlag';

export interface OperationParamSpec {
  readonly name: string;
  readonly kind: ParamKind;
  readonly flag?: string;
  readonly type: ParamType;
  readonly required?: boolean;
}

export interface OperationSpec {
  readonly operationId: string;
  readonly commandTokens: readonly string[];
  readonly params: readonly OperationParamSpec[];
}

export interface InvokeOptions {
  timeoutMs?: number;
  stdinBytes?: Uint8Array;
}

export type ChangeMode = 'direct' | 'tracked';

export interface SuperDocClientOptions {
  env?: Record<string, string | undefined>;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  requestTimeoutMs?: number;
  watchdogTimeoutMs?: number;
  maxQueueDepth?: number;
  defaultChangeMode?: ChangeMode;
}

export interface CliInvocation {
  command: string;
  prefixArgs: string[];
}

function hasExtension(filePath: string, extension: string): boolean {
  return filePath.toLowerCase().endsWith(extension);
}

export function resolveInvocation(cliBin: string): CliInvocation {
  if (hasExtension(cliBin, '.js')) {
    return { command: 'node', prefixArgs: [cliBin] };
  }

  if (hasExtension(cliBin, '.ts')) {
    return { command: 'bun', prefixArgs: [cliBin] };
  }

  return { command: cliBin, prefixArgs: [] };
}

/**
 * Build the CLI argument vector for an operation invocation.
 *
 * Key design choices vs old SDK:
 * - changeMode injection BEFORE argv loop, not after. changeMode is already a
 *   param in operationSpec.params (envelope param for mutations). Appending after
 *   the loop would duplicate it.
 * - Booleans encoded as `--flag true`/`--flag false` explicitly, matching current CLI.
 */
export function buildOperationArgv(
  operation: OperationSpec,
  params: Record<string, unknown>,
  options: InvokeOptions,
  runtimeTimeoutMs: number | undefined,
  defaultChangeMode?: ChangeMode,
): string[] {
  // Inject defaultChangeMode into params BEFORE encoding — single source of truth.
  const normalizedParams =
    defaultChangeMode != null && params.changeMode == null && operation.params.some((p) => p.name === 'changeMode')
      ? { ...params, changeMode: defaultChangeMode }
      : params;

  const argv: string[] = [...operation.commandTokens];

  for (const spec of operation.params) {
    const value = normalizedParams[spec.name];
    if (value == null) continue;

    const flag = `--${spec.flag ?? spec.name}`;

    switch (spec.kind) {
      case 'doc':
        argv.push(String(value));
        break;
      case 'flag':
        if (spec.type === 'boolean') {
          // Explicit true/false — matches current CLI operation-executor.ts.
          argv.push(flag, value === true ? 'true' : 'false');
        } else if (spec.type === 'string[]') {
          if (Array.isArray(value)) {
            for (const entry of value) argv.push(flag, String(entry));
          }
        } else {
          argv.push(flag, String(value));
        }
        break;
      case 'jsonFlag':
        argv.push(flag, JSON.stringify(value));
        break;
    }
  }

  const timeoutMs = options.timeoutMs ?? runtimeTimeoutMs;
  if (timeoutMs != null) {
    argv.push('--timeout-ms', String(timeoutMs));
  }

  argv.push('--output', 'json');
  return argv;
}
