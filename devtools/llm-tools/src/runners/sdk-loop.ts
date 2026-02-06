import { executeTool, type SandboxToolName } from '../sandbox/executor.js';
import type { NormalizedTrace, TraceStep } from '../traces/types.js';
import type { RunnerInput, RunnerOptions } from './types.js';

export const DEFAULT_SYSTEM_PROMPT = 'You are a tool-using assistant. Use available tools to satisfy the user request.';
export const DEFAULT_MAX_STEPS = 8;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_TOOL_CALLS = 3;

export type RunnerToolCall = {
  id?: string;
  name: string;
  args: unknown;
};

export type ExecutedToolResult = {
  toolCall: RunnerToolCall;
  result: unknown;
};

export type ModelTurnResponse = {
  toolCalls?: RunnerToolCall[];
  message?: string;
  raw?: unknown;
};

type RunSdkToolLoopArgs = {
  runnerName: string;
  input: RunnerInput;
  options: RunnerOptions;
  callModel: (toolResults: ExecutedToolResult[] | null) => Promise<ModelTurnResponse>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function coerceToolArgs(raw: unknown): { ok: true; args: unknown } | { ok: false; error: string } {
  if (typeof raw === 'string') {
    try {
      return { ok: true, args: JSON.parse(raw) };
    } catch (error) {
      return { ok: false, error: `Failed to parse tool args JSON: ${String(error)}` };
    }
  }

  return { ok: true, args: raw };
}

function buildToolSignature(name: string, args: unknown): string {
  try {
    return `${name}:${JSON.stringify(args)}`;
  } catch {
    return `${name}:[unserializable]`;
  }
}

function finalizeTrace(
  runnerName: string,
  input: RunnerInput,
  options: RunnerOptions,
  steps: TraceStep[],
  startedAt: string,
): NormalizedTrace {
  steps.push({ type: 'final_state', state: input.state });
  return {
    testId: input.caseDef.testId,
    runner: runnerName,
    model: options.model,
    steps,
    finalState: input.state,
    startedAt,
    finishedAt: nowIso(),
  };
}

export function makeMissingEnvTrace(
  runnerName: string,
  input: RunnerInput,
  options: RunnerOptions,
  envVar: string,
): NormalizedTrace {
  const startedAt = nowIso();
  return finalizeTrace(
    runnerName,
    input,
    options,
    [{ type: 'error', message: `Missing required environment variable: ${envVar}` }],
    startedAt,
  );
}

export async function runSdkToolLoop({
  runnerName,
  input,
  options,
  callModel,
}: RunSdkToolLoopArgs): Promise<NormalizedTrace> {
  const startedAt = nowIso();
  const steps: TraceStep[] = [];

  const systemPrompt = input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  if (systemPrompt.length > 0) {
    steps.push({ type: 'message', role: 'system', content: systemPrompt });
  }

  const userPrompt = input.caseDef.user;
  steps.push({ type: 'message', role: 'user', content: userPrompt });

  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxToolCalls = options.maxToolCallsPerStep ?? DEFAULT_MAX_TOOL_CALLS;
  const deadline = Date.now() + timeoutMs;

  let lastToolSignature = '';
  let repeatedToolCount = 0;
  let pendingToolResults: ExecutedToolResult[] | null = null;

  try {
    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      if (Date.now() > deadline) {
        steps.push({
          type: 'error',
          message: `Runner timeout after ${timeoutMs}ms`,
        });
        break;
      }

      const response = await callModel(pendingToolResults);
      pendingToolResults = null;

      if (response.toolCalls && response.toolCalls.length > 0) {
        if (response.toolCalls.length > maxToolCalls) {
          steps.push({
            type: 'error',
            message: `Too many tool calls in one step (${response.toolCalls.length} > ${maxToolCalls}).`,
          });
          break;
        }

        const executed: ExecutedToolResult[] = [];

        for (const toolCall of response.toolCalls) {
          const parsed = coerceToolArgs(toolCall.args);
          if (!parsed.ok) {
            steps.push({ type: 'error', message: parsed.error });
            return finalizeTrace(runnerName, input, options, steps, startedAt);
          }

          const normalizedToolCall: RunnerToolCall = {
            id: toolCall.id,
            name: toolCall.name,
            args: parsed.args,
          };

          const signature = buildToolSignature(normalizedToolCall.name, normalizedToolCall.args);
          if (signature === lastToolSignature) {
            repeatedToolCount += 1;
          } else {
            repeatedToolCount = 0;
            lastToolSignature = signature;
          }

          if (repeatedToolCount >= 2) {
            steps.push({
              type: 'error',
              message: `Repeated tool call loop detected for ${normalizedToolCall.name}.`,
            });
            return finalizeTrace(runnerName, input, options, steps, startedAt);
          }

          steps.push({ type: 'tool_call', name: normalizedToolCall.name, args: normalizedToolCall.args });

          const execution = executeTool(
            input.state,
            normalizedToolCall.name as SandboxToolName,
            normalizedToolCall.args,
            input.toolSnapshot,
          );

          if (!execution.ok) {
            steps.push({ type: 'error', message: execution.error });
            return finalizeTrace(runnerName, input, options, steps, startedAt);
          }

          steps.push({ type: 'tool_result', name: normalizedToolCall.name, result: execution.result });
          executed.push({ toolCall: normalizedToolCall, result: execution.result });
        }

        pendingToolResults = executed;
        continue;
      }

      if (response.message) {
        steps.push({ type: 'message', role: 'assistant', content: response.message });
        break;
      }

      steps.push({
        type: 'error',
        message: 'Model response contained no message or tool calls.',
        details: response.raw,
      });
      break;
    }
  } catch (error) {
    steps.push({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return finalizeTrace(runnerName, input, options, steps, startedAt);
}
