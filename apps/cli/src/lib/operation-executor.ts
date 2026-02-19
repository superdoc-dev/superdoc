import { getActiveSessionId } from './context';
import { CliError } from './errors';
import { isRecord } from './guards';
import { hasNonEmptyString } from './input-readers';
import { dispatchDocOperation } from './generic-dispatch.js';
import { dispatchIntrospectionOperation } from './introspection-dispatch.js';
import { parseWrapperOperationInput } from './operation-wrapper-input';
import { getLegacyRunner } from './legacy-operation-dispatch';
import { MANUAL_OPERATION_ALLOWLIST } from './manual-command-allowlist';
import { validateOperationInputData } from './operation-args';
import { getOperationRuntimeMetadata } from './operation-runtime-metadata';
import {
  CLI_OPERATION_METADATA,
  isDocBackedOperation,
  toDocApiId,
  type CliOperationId,
  type CliOperationParamSpec,
} from '../cli';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import type { CommandContext, CommandExecution } from './types';

type ExecuteOperationWrapperRequest = {
  mode: 'wrapper';
  operationId: CliOperationId;
  commandName: string;
  tokens: string[];
  context: CommandContext;
};

type ExecuteOperationCallRequest = {
  mode: 'call';
  operationId: CliOperationId;
  input: unknown;
  context: CommandContext;
};

export type ExecuteOperationRequest = ExecuteOperationWrapperRequest | ExecuteOperationCallRequest;

const MANUAL_OPERATION_ALLOWLIST_SET = new Set<CliOperationId>(MANUAL_OPERATION_ALLOWLIST);

function pruneUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefinedDeep(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    normalized[key] = pruneUndefinedDeep(entry);
  }
  return normalized;
}

function serializeJsonValue(value: unknown, operationId: CliOperationId, param: CliOperationParamSpec): string {
  try {
    const encoded = JSON.stringify(value);
    if (encoded == null) {
      throw new CliError('VALIDATION_ERROR', `call: input.${param.name} for ${operationId} must be JSON-serializable.`);
    }
    return encoded;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('VALIDATION_ERROR', `call: input.${param.name} for ${operationId} must be JSON-serializable.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function serializeOperationInputToTokens(operationId: CliOperationId, input: Record<string, unknown>): string[] {
  const metadata = CLI_OPERATION_METADATA[operationId];
  const params = metadata.params as readonly CliOperationParamSpec[];
  const tokens: string[] = [];

  for (const positionalName of metadata.positionalParams) {
    const positionalValue = input[positionalName];
    if (positionalValue == null) continue;
    tokens.push(String(positionalValue));
  }

  for (const param of params) {
    if (param.kind === 'doc') continue;

    const value = input[param.name];
    if (value == null) continue;

    const flag = `--${param.flag ?? param.name}`;
    if (param.type === 'boolean') {
      tokens.push(flag, value === true ? 'true' : 'false');
      continue;
    }

    if (param.type === 'string[]') {
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        tokens.push(flag, String(entry));
      }
      continue;
    }

    if (param.type === 'json') {
      tokens.push(flag, serializeJsonValue(value, operationId, param));
      continue;
    }

    tokens.push(flag, String(value));
  }

  return tokens;
}

function applySessionInputToContext(context: CommandContext, input: Record<string, unknown>): CommandContext {
  const inputSessionId = input.sessionId;
  if (typeof inputSessionId !== 'string' || inputSessionId.length === 0) {
    return context;
  }

  if (context.sessionId && context.sessionId !== inputSessionId) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `call: conflicting session ids. Global --session (${context.sessionId}) does not match input.sessionId (${inputSessionId}).`,
    );
  }

  return {
    ...context,
    sessionId: inputSessionId,
  };
}

async function preflightCallContext(
  operationId: CliOperationId,
  input: Record<string, unknown>,
  context: CommandContext,
): Promise<void> {
  const runtime = getOperationRuntimeMetadata(operationId);
  const hasDocInput = hasNonEmptyString(input.doc);
  const hasInputSessionId = hasNonEmptyString(input.sessionId);
  const hasContextSessionId = hasNonEmptyString(context.sessionId);
  const hasExplicitSessionTarget = hasInputSessionId || hasContextSessionId;
  const allowsDocAndSessionTarget = operationId === 'doc.open';

  if (hasDocInput && hasExplicitSessionTarget && !allowsDocAndSessionTarget) {
    throw new CliError(
      'INVALID_ARGUMENT',
      'call: stateless input.doc cannot be combined with a session target (--session or input.sessionId).',
    );
  }

  if (hasDocInput && !runtime.context.supportsStateless) {
    throw new CliError('INVALID_ARGUMENT', `call: ${operationId} does not support stateless execution.`);
  }

  const selectedMode = hasDocInput ? 'stateless' : runtime.context.supportsSession ? 'session' : 'stateless';

  if (selectedMode === 'stateless' && !runtime.context.supportsStateless) {
    throw new CliError('INVALID_ARGUMENT', `call: ${operationId} requires session execution.`);
  }

  if (selectedMode === 'session' && !runtime.context.supportsSession) {
    throw new CliError('INVALID_ARGUMENT', `call: ${operationId} does not support session execution.`);
  }

  if (runtime.context.requiresDocument && !hasDocInput) {
    throw new CliError('MISSING_REQUIRED', `call: ${operationId} requires input.doc for stateless execution.`);
  }

  if (!runtime.context.requiresSession || hasExplicitSessionTarget) {
    return;
  }

  const activeSessionId = await getActiveSessionId();
  if (!hasNonEmptyString(activeSessionId)) {
    throw new CliError('NO_ACTIVE_DOCUMENT', `call: ${operationId} requires an active session or input.sessionId.`);
  }
}

export async function executeOperation(request: ExecuteOperationRequest): Promise<CommandExecution> {
  let input: Record<string, unknown>;
  const baseContext = request.context;
  let commandName: string;

  if (request.mode === 'wrapper') {
    commandName = request.commandName;
    input = (pruneUndefinedDeep(
      await parseWrapperOperationInput(request.operationId, request.tokens, request.commandName),
    ) ?? {}) as Record<string, unknown>;
  } else {
    commandName = 'call';
    if (!isRecord(request.input)) {
      throw new CliError('VALIDATION_ERROR', 'call: --input-json/--input-file must be a JSON object.');
    }
    input = (pruneUndefinedDeep(request.input) ?? {}) as Record<string, unknown>;
  }

  validateOperationInputData(request.operationId, input, commandName);
  await preflightCallContext(request.operationId, input, baseContext);
  const effectiveContext = applySessionInputToContext(baseContext, input);

  // Doc-backed operations → generic dispatch
  const docApiId = toDocApiId(request.operationId);
  if (docApiId) {
    return dispatchDocOperation({
      operationId: docApiId as CliExposedOperationId,
      input,
      context: effectiveContext,
    });
  }

  // CLI-only introspection operations (describe, describeCommand, status)
  const introspectionResult = await dispatchIntrospectionOperation(request.operationId, input, effectiveContext);
  if (introspectionResult) {
    return introspectionResult;
  }

  // Lifecycle/session operations → legacy runners
  if (!MANUAL_OPERATION_ALLOWLIST_SET.has(request.operationId)) {
    throw new CliError('COMMAND_FAILED', `No operation invoker is registered for ${request.operationId}.`);
  }

  const runner = getLegacyRunner(request.operationId);
  if (!runner) {
    throw new CliError('COMMAND_FAILED', `No operation runner is registered for ${request.operationId}.`);
  }

  const tokens = serializeOperationInputToTokens(request.operationId, input);
  return runner(tokens, effectiveContext);
}
