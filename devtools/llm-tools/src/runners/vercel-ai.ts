import { dynamicTool, generateText, jsonSchema, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { executeTool, type SandboxToolName } from '../sandbox/executor.js';
import type { ToolDefinition } from '../tools/snapshot.js';
import type { NormalizedTrace, TraceStep } from '../traces/types.js';
import type { Runner } from './types.js';
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TIMEOUT_MS,
  makeMissingEnvTrace,
} from './sdk-loop.js';

type JsonObject = Record<string, unknown>;
export type VercelProviderMode = 'ollama' | 'openai' | 'openai-compatible';
type GenerateTextModel = Parameters<typeof generateText>[0]['model'];

type ResolvedVercelModel =
  | {
      ok: true;
      mode: VercelProviderMode;
      model: GenerateTextModel;
      modelLabel: string;
    }
  | {
      ok: false;
      mode: VercelProviderMode | 'unknown';
      error: string;
      missingEnvVar?: string;
    };

function nowIso(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function normalizeToolSchema(schema: unknown): JsonObject {
  if (!isObject(schema)) {
    return { type: 'object', additionalProperties: true };
  }

  const ref = schema.$ref;
  const definitions = schema.definitions;
  if (typeof ref === 'string' && ref.startsWith('#/definitions/') && isObject(definitions)) {
    const definitionName = ref.slice('#/definitions/'.length);
    const resolved = definitions[definitionName];
    if (isObject(resolved)) {
      return resolved;
    }
  }

  if (schema.type === 'object') {
    return schema;
  }

  return { type: 'object', additionalProperties: true };
}

function normalizeToolArgsForSandbox(toolName: string, args: unknown): unknown {
  if (toolName !== 'find_content') {
    return args;
  }

  if (!isObject(args)) {
    return args;
  }

  const selector = args.selector;
  if (!isObject(selector) || selector.type !== 'regex') {
    return args;
  }

  return {
    ...args,
    selector: {
      ...selector,
      type: 'text',
    },
  };
}

function buildToolSignature(name: string, args: unknown): string {
  try {
    return `${name}:${JSON.stringify(args)}`;
  } catch {
    return `${name}:[unserializable]`;
  }
}

function buildFallbackAssistantMessage(steps: TraceStep[]): string | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.type !== 'tool_result') {
      continue;
    }

    if (
      step.name === 'find_content' &&
      typeof step.result === 'object' &&
      step.result !== null &&
      'total' in step.result
    ) {
      const result = step.result as { total?: unknown; matches?: unknown };
      const total = typeof result.total === 'number' ? result.total : null;
      if (total == null) {
        continue;
      }

      if (total === 0) {
        return 'Found 0 matches.';
      }

      if (Array.isArray(result.matches)) {
        const blockIds = result.matches
          .map((entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            'address' in entry &&
            typeof entry.address === 'object' &&
            entry.address !== null &&
            'blockId' in entry.address &&
            typeof entry.address.blockId === 'string'
              ? entry.address.blockId
              : null,
          )
          .filter((value): value is string => value !== null);
        if (blockIds.length > 0) {
          return `Found ${total} matches in blocks: ${blockIds.join(', ')}.`;
        }
      }

      return `Found ${total} matches.`;
    }
  }

  return null;
}

export function detectProviderMode(): VercelProviderMode | 'unknown' {
  const raw = (process.env.VERCEL_AI_PROVIDER ?? '').trim().toLowerCase();
  if (raw.length === 0) {
    return 'ollama';
  }

  if (raw === 'ollama') return 'ollama';
  if (raw === 'openai') return 'openai';
  if (raw === 'openai-compatible' || raw === 'openai_compatible' || raw === 'compatible' || raw === 'lmstudio') {
    return 'openai-compatible';
  }

  return 'unknown';
}

function stripModelPrefix(model: string, prefix: string): string {
  const needle = `${prefix}/`;
  return model.startsWith(needle) ? model.slice(needle.length) : model;
}

function resolveVercelModel(requestedModel: string): ResolvedVercelModel {
  const mode = detectProviderMode();
  if (mode === 'unknown') {
    return {
      ok: false,
      mode,
      error: 'Unknown VERCEL_AI_PROVIDER. Expected one of: ollama, openai, openai-compatible.',
    };
  }

  if (mode === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: false,
        mode,
        error: 'Missing required environment variable: OPENAI_API_KEY',
        missingEnvVar: 'OPENAI_API_KEY',
      };
    }

    const modelId = stripModelPrefix(requestedModel, 'openai');
    const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return {
      ok: true,
      mode,
      model: provider(modelId),
      modelLabel: modelId,
    };
  }

  if (mode === 'openai-compatible') {
    const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
    if (!baseURL) {
      return {
        ok: false,
        mode,
        error: 'Missing required environment variable: OPENAI_COMPATIBLE_BASE_URL',
        missingEnvVar: 'OPENAI_COMPATIBLE_BASE_URL',
      };
    }

    const provider = createOpenAICompatible({
      name: process.env.OPENAI_COMPATIBLE_PROVIDER_NAME ?? 'openai-compatible',
      baseURL,
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
    });

    const modelId = stripModelPrefix(requestedModel, 'openai-compatible');
    return {
      ok: true,
      mode,
      model: provider(modelId),
      modelLabel: modelId,
    };
  }

  const ollamaProvider = createOpenAICompatible({
    name: 'ollama',
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1',
    apiKey: process.env.OLLAMA_API_KEY,
  });
  const modelId = stripModelPrefix(requestedModel, 'ollama');
  return {
    ok: true,
    mode,
    model: ollamaProvider(modelId),
    modelLabel: modelId,
  };
}

function makeTrace(
  input: Parameters<Runner['runCase']>[0],
  options: Parameters<Runner['runCase']>[1],
  steps: TraceStep[],
  startedAt: string,
): NormalizedTrace {
  steps.push({ type: 'final_state', state: input.state });
  return {
    testId: input.caseDef.testId,
    runner: 'vercel-ai',
    model: options.model,
    steps,
    finalState: input.state,
    startedAt,
    finishedAt: nowIso(),
  };
}

function buildAiTools(
  tools: ToolDefinition[],
  onExecute: (toolName: string, args: unknown) => Promise<unknown>,
): Record<string, ReturnType<typeof dynamicTool>> {
  const entries = tools.map((tool) => [
    tool.name,
    dynamicTool({
      description: tool.description,
      inputSchema: jsonSchema<unknown>(normalizeToolSchema(tool.parameters)),
      execute: async (input) => onExecute(tool.name, input),
    }),
  ]);

  return Object.fromEntries(entries);
}

export const vercelAiRunner: Runner = {
  name: 'vercel-ai',
  async runCase(input, options) {
    const resolvedModel = resolveVercelModel(options.model);
    if (!resolvedModel.ok) {
      if (resolvedModel.missingEnvVar) {
        return makeMissingEnvTrace('vercel-ai', input, options, resolvedModel.missingEnvVar);
      }

      const startedAt = nowIso();
      const steps: TraceStep[] = [{ type: 'error', message: resolvedModel.error }];
      return makeTrace(input, options, steps, startedAt);
    }

    const startedAt = nowIso();
    const steps: TraceStep[] = [];

    const systemPrompt = input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    if (systemPrompt.length > 0) {
      steps.push({ type: 'message', role: 'system', content: systemPrompt });
    }

    steps.push({ type: 'message', role: 'user', content: input.caseDef.user });

    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxToolCalls = options.maxToolCallsPerStep ?? DEFAULT_MAX_TOOL_CALLS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    let lastToolSignature = '';
    let repeatedToolCount = 0;

    const tools = buildAiTools(input.toolSnapshot.tools, async (toolName, args) => {
      if (Date.now() > deadline) {
        const message = `Runner timeout after ${timeoutMs}ms`;
        steps.push({ type: 'error', message });
        throw new Error(message);
      }

      const normalizedArgs = normalizeToolArgsForSandbox(toolName, args);
      const signature = buildToolSignature(toolName, normalizedArgs);
      if (signature === lastToolSignature) {
        repeatedToolCount += 1;
      } else {
        repeatedToolCount = 0;
        lastToolSignature = signature;
      }

      if (repeatedToolCount >= 2) {
        const message = `Repeated tool call loop detected for ${toolName}.`;
        steps.push({ type: 'error', message });
        throw new Error(message);
      }

      steps.push({ type: 'tool_call', name: toolName, args: normalizedArgs });
      const execution = executeTool(input.state, toolName as SandboxToolName, normalizedArgs, input.toolSnapshot);

      if (!execution.ok) {
        steps.push({ type: 'error', message: execution.error });
        throw new Error(execution.error);
      }

      steps.push({ type: 'tool_result', name: toolName, result: execution.result });
      return execution.result;
    });

    try {
      const request: Parameters<typeof generateText>[0] = {
        model: resolvedModel.model,
        system: systemPrompt,
        prompt: input.caseDef.user,
        tools,
        stopWhen: stepCountIs(maxSteps),
        timeout: timeoutMs,
        maxRetries: 0,
        onStepFinish: ({ toolCalls }) => {
          if (toolCalls.length > maxToolCalls) {
            throw new Error(`Too many tool calls in one step (${toolCalls.length} > ${maxToolCalls}).`);
          }
        },
      };
      if (typeof options.temperature === 'number' && options.temperature !== 0) {
        request.temperature = options.temperature;
      }

      const result = await generateText(request);

      const finalText = result.text.trim();
      if (finalText.length > 0) {
        steps.push({ type: 'message', role: 'assistant', content: finalText });
      } else {
        const fallback = buildFallbackAssistantMessage(steps);
        if (fallback) {
          steps.push({ type: 'message', role: 'assistant', content: fallback });
        } else {
          steps.push({ type: 'error', message: 'Model response contained no assistant text.' });
        }
      }
    } catch (error) {
      steps.push({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const trace = makeTrace(input, options, steps, startedAt);
    trace.metadata = {
      ...(trace.metadata ?? {}),
      providerMode: resolvedModel.mode,
      resolvedModel: resolvedModel.modelLabel,
    };
    return trace;
  },
};
