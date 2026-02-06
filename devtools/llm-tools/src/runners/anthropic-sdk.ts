import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z, type ZodTypeAny } from 'zod';
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
type JsonSchema = JsonObject & {
  $ref?: string;
  definitions?: Record<string, unknown>;
  type?: unknown;
  properties?: Record<string, unknown>;
  required?: unknown;
  items?: unknown;
  enum?: unknown;
  const?: unknown;
  oneOf?: unknown;
  anyOf?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  minLength?: unknown;
  maxLength?: unknown;
};

type ToolCallResult = {
  content: Array<{ type: 'text'; text: string }>;
};

const SDK_MCP_SERVER_NAME = 'superdoc';

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return JSON.stringify(String(value));
  }
}

function normalizeToolSchema(schema: unknown): JsonSchema {
  if (!isObject(schema)) {
    return { type: 'object', additionalProperties: true };
  }

  const ref = schema.$ref;
  const definitions = schema.definitions;
  if (typeof ref === 'string' && ref.startsWith('#/definitions/') && isObject(definitions)) {
    const definitionName = ref.slice('#/definitions/'.length);
    const resolved = definitions[definitionName];
    if (isObject(resolved)) {
      return resolved as JsonSchema;
    }
  }

  if (schema.type === 'object') {
    return schema as JsonSchema;
  }

  return { type: 'object', additionalProperties: true };
}

function buildToolSignature(name: string, args: unknown): string {
  try {
    return `${name}:${JSON.stringify(args)}`;
  } catch {
    return `${name}:[unserializable]`;
  }
}

function normalizeToolArgsForSandbox(toolName: string, args: unknown): unknown {
  if (toolName !== 'find_content') {
    return args;
  }

  if (!isObject(args)) {
    return args;
  }

  const selector = args.selector;
  if (!isObject(selector)) {
    return args;
  }

  if (selector.type !== 'regex') {
    return args;
  }

  const pattern = typeof selector.pattern === 'string' ? selector.pattern : '';
  const flags = typeof selector.flags === 'string' ? selector.flags : '';
  const normalized = pattern.replace(/\\s\+/g, ' ').replace(/\\b/g, '').trim();
  const normalizedFlags = flags.replace(/g/g, '');

  return {
    ...args,
    selector: {
      ...selector,
      type: 'text',
      pattern: normalized.length > 0 ? normalized : pattern,
      flags: normalizedFlags,
    },
  };
}

function resolveRef(schema: JsonSchema, rootSchema: JsonSchema): JsonSchema {
  if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/definitions/')) {
    return schema;
  }

  const definitionName = schema.$ref.slice('#/definitions/'.length);
  const definitions = isObject(rootSchema.definitions) ? rootSchema.definitions : undefined;
  const resolved = definitions?.[definitionName];
  if (isObject(resolved)) {
    return resolved as JsonSchema;
  }
  return schema;
}

function jsonSchemaToZodType(schema: JsonSchema, rootSchema: JsonSchema): ZodTypeAny {
  const resolved = resolveRef(schema, rootSchema);

  if (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0) {
    return jsonSchemaToZodType(resolved.oneOf[0] as JsonSchema, rootSchema);
  }

  if (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0) {
    return jsonSchemaToZodType(resolved.anyOf[0] as JsonSchema, rootSchema);
  }

  if ('const' in resolved) {
    return z.literal(resolved.const as never);
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    const enumValues = resolved.enum.filter((value): value is string => typeof value === 'string');
    if (enumValues.length > 0) {
      return z.enum(enumValues as [string, ...string[]]);
    }
  }

  const schemaType = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
  switch (schemaType) {
    case 'string': {
      let value = z.string();
      if (typeof resolved.minLength === 'number') {
        value = value.min(resolved.minLength);
      }
      if (typeof resolved.maxLength === 'number') {
        value = value.max(resolved.maxLength);
      }
      return value;
    }

    case 'integer': {
      let value = z.number().int();
      if (typeof resolved.minimum === 'number') {
        value = value.min(resolved.minimum);
      }
      if (typeof resolved.maximum === 'number') {
        value = value.max(resolved.maximum);
      }
      return value;
    }

    case 'number': {
      let value = z.number();
      if (typeof resolved.minimum === 'number') {
        value = value.min(resolved.minimum);
      }
      if (typeof resolved.maximum === 'number') {
        value = value.max(resolved.maximum);
      }
      return value;
    }

    case 'boolean':
      return z.boolean();

    case 'array': {
      const itemSchema = isObject(resolved.items) ? (resolved.items as JsonSchema) : { type: 'unknown' };
      return z.array(jsonSchemaToZodType(itemSchema, rootSchema));
    }

    case 'object': {
      const properties = isObject(resolved.properties) ? (resolved.properties as Record<string, unknown>) : {};
      const required = Array.isArray(resolved.required)
        ? new Set(resolved.required.filter((entry): entry is string => typeof entry === 'string'))
        : new Set<string>();

      const shape: Record<string, ZodTypeAny> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (!isObject(value)) {
          shape[key] = z.unknown();
          continue;
        }

        const propertySchema = value as JsonSchema;
        const propertyType = jsonSchemaToZodType(propertySchema, rootSchema);
        shape[key] = required.has(key) ? propertyType : propertyType.optional();
      }

      return z.object(shape);
    }

    default:
      return z.unknown();
  }
}

function schemaToToolShape(schema: unknown): Record<string, ZodTypeAny> {
  const rootSchema = normalizeToolSchema(schema);
  const resolved = resolveRef(rootSchema, rootSchema);

  if (resolved.type !== 'object' || !isObject(resolved.properties)) {
    return {};
  }

  const required = Array.isArray(resolved.required)
    ? new Set(resolved.required.filter((entry): entry is string => typeof entry === 'string'))
    : new Set<string>();
  const shape: Record<string, ZodTypeAny> = {};

  for (const [key, value] of Object.entries(resolved.properties)) {
    if (!isObject(value)) {
      shape[key] = z.unknown().optional();
      continue;
    }

    const propertyType = jsonSchemaToZodType(value as JsonSchema, rootSchema);
    shape[key] = required.has(key) ? propertyType : propertyType.optional();
  }

  return shape;
}

function extractToolCallsFromAssistantMessage(content: unknown): Array<{ name: string; args: unknown }> {
  if (!Array.isArray(content)) {
    return [];
  }

  const calls: Array<{ name: string; args: unknown }> = [];
  for (const block of content) {
    if (!isObject(block) || block.type !== 'tool_use') {
      continue;
    }

    if (typeof block.name !== 'string') {
      continue;
    }

    calls.push({
      name: block.name,
      args: block.input ?? {},
    });
  }

  return calls;
}

function extractAssistantText(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const block of content) {
    if (!isObject(block) || block.type !== 'text' || typeof block.text !== 'string') {
      continue;
    }

    chunks.push(block.text);
  }

  const text = chunks.join('\n').trim();
  return text.length > 0 ? text : undefined;
}

function toToolCallResult(value: unknown): ToolCallResult {
  return {
    content: [{ type: 'text', text: serializeJson(value) }],
  };
}

function buildRunnableTools(
  defineTool: (
    name: string,
    description: string,
    inputSchema: unknown,
    handler: (args: Record<string, unknown>) => Promise<ToolCallResult>,
  ) => unknown,
  tools: ToolDefinition[],
  onExecute: (toolName: string, args: Record<string, unknown>) => Promise<unknown>,
): unknown[] {
  return tools.map((toolDef) =>
    defineTool(
      toolDef.name,
      toolDef.description ?? toolDef.name,
      schemaToToolShape(toolDef.parameters) as unknown as never,
      async (args: Record<string, unknown>) => toToolCallResult(await onExecute(toolDef.name, args)),
    ),
  );
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
    runner: 'anthropic-sdk',
    model: options.model,
    steps,
    finalState: input.state,
    startedAt,
    finishedAt: nowIso(),
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function isRetriableAgentError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('aborted by user') ||
    normalized.includes('runner timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  );
}

async function writeFileIfMissing(filePath: string, contents: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, contents, 'utf8');
  }
}

async function prepareClaudeAgentHome(cwd: string): Promise<string> {
  const configuredHome = process.env.CLAUDE_AGENT_HOME?.trim();
  const baseHomeDir =
    configuredHome && configuredHome.length > 0
      ? path.isAbsolute(configuredHome)
        ? configuredHome
        : path.join(cwd, configuredHome)
      : path.join(cwd, '.tmp', 'claude-agent-home');
  const homeDir = path.join(baseHomeDir, `run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const claudeDir = path.join(homeDir, '.claude');

  await fs.mkdir(path.join(claudeDir, 'todos'), { recursive: true });
  await fs.mkdir(path.join(claudeDir, 'debug'), { recursive: true });
  await writeFileIfMissing(path.join(claudeDir, 'remote-settings.json'), '{}\n');
  await writeFileIfMissing(path.join(homeDir, '.claude.json'), '{}\n');

  return homeDir;
}

export const anthropicSdkRunner: Runner = {
  name: 'anthropic-sdk',
  async runCase(input, options) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return makeMissingEnvTrace('anthropic-sdk', input, options, 'ANTHROPIC_API_KEY');
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
    const cwd = process.cwd();
    const { createSdkMcpServer, query: runQuery, tool: defineTool } = await import('@anthropic-ai/claude-agent-sdk');
    let finalAssistantText = '';

    const toolAllowList = input.toolSnapshot.tools.map((toolDef) => `mcp__${SDK_MCP_SERVER_NAME}__${toolDef.name}`);
    const maxAttempts = 2;
    let lastError: string | null = null;

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
      const attemptSteps: TraceStep[] = [];
      const attemptDeadline = Date.now() + timeoutMs;
      const claudeAgentHome = await prepareClaudeAgentHome(cwd);
      const previousHome = process.env.HOME;
      process.env.HOME = claudeAgentHome;

      let attemptAssistantText = '';
      let attemptError: string | null = null;
      let lastToolSignature = '';
      let repeatedToolCount = 0;

      const abortController = new AbortController();
      const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

      const runnableTools = buildRunnableTools(
        defineTool as unknown as (
          name: string,
          description: string,
          inputSchema: unknown,
          handler: (args: Record<string, unknown>) => Promise<ToolCallResult>,
        ) => unknown,
        input.toolSnapshot.tools,
        async (toolName, args) => {
          if (Date.now() > attemptDeadline) {
            const message = `Runner timeout after ${timeoutMs}ms`;
            attemptSteps.push({ type: 'error', message });
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
            attemptSteps.push({ type: 'error', message });
            throw new Error(message);
          }

          attemptSteps.push({ type: 'tool_call', name: toolName, args: normalizedArgs });
          const execution = executeTool(input.state, toolName as SandboxToolName, normalizedArgs, input.toolSnapshot);

          if (!execution.ok) {
            attemptSteps.push({ type: 'error', message: execution.error });
            throw new Error(execution.error);
          }

          attemptSteps.push({ type: 'tool_result', name: toolName, result: execution.result });
          return execution.result;
        },
      );

      const mcpServer = createSdkMcpServer({
        name: SDK_MCP_SERVER_NAME,
        version: '1.0.0',
        tools: runnableTools as never,
      });

      try {
        const agentQuery = runQuery({
          prompt: input.caseDef.user,
          options: {
            model: options.model,
            maxTurns: maxSteps,
            cwd,
            tools: [],
            mcpServers: {
              [SDK_MCP_SERVER_NAME]: mcpServer,
            },
            allowedTools: toolAllowList,
            permissionMode: 'dontAsk',
            systemPrompt,
            settingSources: [],
            abortController,
            persistSession: false,
            env: {
              ...process.env,
              HOME: claudeAgentHome,
            },
            pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH,
          },
        });

        for await (const message of agentQuery) {
          if (Date.now() > attemptDeadline) {
            throw new Error(`Runner timeout after ${timeoutMs}ms`);
          }

          if (message.type === 'assistant') {
            const toolCalls = extractToolCallsFromAssistantMessage(message.message.content);
            if (toolCalls.length > maxToolCalls) {
              throw new Error(`Too many tool calls in one step (${toolCalls.length} > ${maxToolCalls}).`);
            }

            const assistantText = extractAssistantText(message.message.content);
            if (assistantText) {
              attemptAssistantText = assistantText;
            }
            continue;
          }

          if (message.type === 'result') {
            if (message.subtype === 'success') {
              if (typeof message.result === 'string' && message.result.trim().length > 0) {
                attemptAssistantText = message.result.trim();
              }
            } else {
              const detail = Array.isArray(message.errors) ? message.errors.join(' | ') : message.subtype;
              throw new Error(detail || 'Anthropic Agent SDK run failed.');
            }
          }
        }
      } catch (error) {
        attemptError = toErrorMessage(error);
      } finally {
        if (previousHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previousHome;
        }
        clearTimeout(timeoutHandle);
        const closeFn = mcpServer.instance && (mcpServer.instance as { close?: () => unknown }).close;
        if (typeof closeFn === 'function') {
          try {
            await Promise.resolve(closeFn.call(mcpServer.instance));
          } catch {
            // Ignore MCP shutdown errors because trace output is already complete.
          }
        }
      }

      if (attemptAssistantText.length > 0) {
        steps.push(...attemptSteps);
        finalAssistantText = attemptAssistantText;
        lastError = null;
        break;
      }

      if (attemptError) {
        lastError = attemptError;
        const isLastAttempt = attemptIndex === maxAttempts - 1;
        if (!isLastAttempt && isRetriableAgentError(attemptError)) {
          continue;
        }

        steps.push(...attemptSteps);
        const hasMatchingAttemptError = attemptSteps.some(
          (step) => step.type === 'error' && step.message === attemptError,
        );
        if (!hasMatchingAttemptError) {
          steps.push({ type: 'error', message: attemptError });
        }
        break;
      }

      lastError = 'Model response contained no assistant text.';
      if (attemptIndex < maxAttempts - 1) {
        continue;
      }

      steps.push(...attemptSteps);
    }

    if (finalAssistantText.length > 0) {
      steps.push({ type: 'message', role: 'assistant', content: finalAssistantText });
    } else {
      steps.push({ type: 'error', message: lastError ?? 'Model response contained no assistant text.' });
    }

    return makeTrace(input, options, steps, startedAt);
  },
};
