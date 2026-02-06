import OpenAI from 'openai';
import type { ToolDefinition } from '../tools/snapshot.js';
import type { Runner } from './types.js';
import {
  DEFAULT_SYSTEM_PROMPT,
  makeMissingEnvTrace,
  runSdkToolLoop,
  type ExecutedToolResult,
  type RunnerToolCall,
} from './sdk-loop.js';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return JSON.stringify(String(value));
  }
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

  return schema;
}

function toOpenAITools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: normalizeToolSchema(tool.parameters),
    // Keep tool schemas permissive while we ingest generic snapshot JSON Schema.
    strict: false,
  }));
}

function normalizeToolArgsForSandbox(toolName: string, args: unknown): unknown {
  if (toolName !== 'find_content') {
    return args;
  }

  const normalize = (value: unknown): unknown => {
    if (!isObject(value)) {
      return value;
    }

    const selector = value.selector;
    if (!isObject(selector) || selector.type !== 'regex') {
      return value;
    }

    return {
      ...value,
      selector: {
        ...selector,
        type: 'text',
      },
    };
  };

  if (typeof args === 'string') {
    try {
      return normalize(JSON.parse(args));
    } catch {
      return args;
    }
  }

  return normalize(args);
}

function extractOpenAIToolCalls(response: unknown): RunnerToolCall[] {
  if (!isObject(response) || !Array.isArray(response.output)) {
    return [];
  }

  const calls: RunnerToolCall[] = [];
  for (const item of response.output) {
    if (!isObject(item) || item.type !== 'function_call') {
      continue;
    }

    if (typeof item.name !== 'string') {
      continue;
    }

    calls.push({
      id: typeof item.call_id === 'string' ? item.call_id : undefined,
      name: item.name,
      args: normalizeToolArgsForSandbox(item.name, item.arguments),
    });
  }

  return calls;
}

function extractOpenAIText(response: unknown): string | undefined {
  if (!isObject(response)) {
    return undefined;
  }

  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const item of response.output) {
    if (!isObject(item) || item.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (!isObject(part) || part.type !== 'output_text' || typeof part.text !== 'string') {
        continue;
      }

      chunks.push(part.text);
    }
  }

  const text = chunks.join('').trim();
  return text.length > 0 ? text : undefined;
}

function toFunctionCallOutput(toolResults: ExecutedToolResult[]): Array<Record<string, unknown>> {
  return toolResults.map(({ toolCall, result }) => {
    if (!toolCall.id) {
      throw new Error(`OpenAI function call is missing call_id for tool "${toolCall.name}".`);
    }

    return {
      type: 'function_call_output',
      call_id: toolCall.id,
      output: serializeJson(result),
    };
  });
}

export const openaiSdkRunner: Runner = {
  name: 'openai-sdk',
  async runCase(input, options) {
    if (!process.env.OPENAI_API_KEY) {
      return makeMissingEnvTrace('openai-sdk', input, options, 'OPENAI_API_KEY');
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const systemPrompt = input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const tools = toOpenAITools(input.toolSnapshot.tools);

    let previousResponseId: string | null = null;

    return runSdkToolLoop({
      runnerName: 'openai-sdk',
      input,
      options,
      callModel: async (toolResults) => {
        const request: Record<string, unknown> = {
          model: options.model,
          tools,
        };
        if (typeof options.temperature === 'number' && options.temperature !== 0) {
          request.temperature = options.temperature;
        }

        if (toolResults == null) {
          request.instructions = systemPrompt;
          request.input = input.caseDef.user;
        } else {
          if (!previousResponseId) {
            throw new Error('OpenAI response loop is missing previous_response_id.');
          }

          request.previous_response_id = previousResponseId;
          request.input = toFunctionCallOutput(toolResults);
        }

        const response = await client.responses.create(request as never);
        previousResponseId = response.id;

        const toolCalls = extractOpenAIToolCalls(response);
        if (toolCalls.length > 0) {
          return { toolCalls, raw: response };
        }

        return {
          message: extractOpenAIText(response),
          raw: response,
        };
      },
    });
  },
};
