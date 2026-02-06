import { executeTool, type SandboxToolName } from '../sandbox/executor.js';
import type { NormalizedTrace, TraceStep } from '../traces/types.js';
import type {
  ModelAdapter,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelToolCall,
  Runner,
  RunnerInput,
  RunnerOptions,
} from './types.js';
import { DEFAULT_MAX_STEPS, DEFAULT_MAX_TOOL_CALLS, DEFAULT_SYSTEM_PROMPT, DEFAULT_TIMEOUT_MS } from './sdk-loop.js';

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

function makeTrace(input: RunnerInput, options: RunnerOptions, steps: TraceStep[], startedAt: string): NormalizedTrace {
  steps.push({ type: 'final_state', state: input.state });
  return {
    testId: input.caseDef.testId,
    runner: 'openai-raw',
    model: options.model,
    steps,
    finalState: input.state,
    startedAt,
    finishedAt: nowIso(),
  };
}

export function createHeuristicAdapter(): ModelAdapter {
  return {
    id: 'heuristic-adapter',
    async call(request: ModelRequest): Promise<ModelResponse> {
      const last = request.messages[request.messages.length - 1];
      if (!last) {
        return { message: 'No messages provided.' };
      }

      if (last.role === 'user') {
        const prompt = last.content;
        const quoted = /['"]([^'"]+)['"]/i.exec(prompt);
        const pattern = quoted ? quoted[1] : '';

        if (pattern) {
          return {
            toolCalls: [
              {
                name: 'find_content',
                args: {
                  selector: {
                    type: 'text',
                    pattern,
                    flags: 'i',
                  },
                },
              },
            ],
          };
        }

        return { message: 'Please specify the text to find.' };
      }

      if (last.role === 'tool') {
        return { message: 'Done.' };
      }

      return { message: 'OK.' };
    },
  };
}

export const openaiRawRunner: Runner = {
  name: 'openai-raw',
  async runCase(input: RunnerInput, options: RunnerOptions) {
    const startedAt = nowIso();
    const steps: TraceStep[] = [];
    const messages: ModelMessage[] = [];

    const systemPrompt = input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    if (systemPrompt.length > 0) {
      messages.push({ role: 'system', content: systemPrompt });
      steps.push({ type: 'message', role: 'system', content: systemPrompt });
    }

    const userPrompt = input.caseDef.user;
    messages.push({ role: 'user', content: userPrompt });
    steps.push({ type: 'message', role: 'user', content: userPrompt });

    const adapter = options.adapter ?? createHeuristicAdapter();
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxToolCalls = options.maxToolCallsPerStep ?? DEFAULT_MAX_TOOL_CALLS;

    const deadline = Date.now() + timeoutMs;
    let lastToolSignature = '';
    let repeatedToolCount = 0;

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      if (Date.now() > deadline) {
        steps.push({
          type: 'error',
          message: `Runner timeout after ${timeoutMs}ms`,
        });
        break;
      }

      const response = await adapter.call({
        model: options.model,
        messages,
        tools: input.toolSnapshot.tools,
        temperature: options.temperature,
      });

      if (response.toolCalls && response.toolCalls.length > 0) {
        if (response.toolCalls.length > maxToolCalls) {
          steps.push({
            type: 'error',
            message: `Too many tool calls in one step (${response.toolCalls.length} > ${maxToolCalls}).`,
          });
          break;
        }

        for (const toolCall of response.toolCalls) {
          const parsed = coerceToolArgs(toolCall.args);
          if (!parsed.ok) {
            steps.push({ type: 'error', message: parsed.error });
            return makeTrace(input, options, steps, startedAt);
          }

          const signature = buildToolSignature(toolCall.name, parsed.args);
          if (signature === lastToolSignature) {
            repeatedToolCount += 1;
          } else {
            repeatedToolCount = 0;
            lastToolSignature = signature;
          }

          if (repeatedToolCount >= 2) {
            steps.push({
              type: 'error',
              message: `Repeated tool call loop detected for ${toolCall.name}.`,
            });
            return makeTrace(input, options, steps, startedAt);
          }

          steps.push({ type: 'tool_call', name: toolCall.name, args: parsed.args });

          const execution = executeTool(input.state, toolCall.name as SandboxToolName, parsed.args, input.toolSnapshot);

          if (!execution.ok) {
            steps.push({ type: 'error', message: execution.error });
            return makeTrace(input, options, steps, startedAt);
          }

          steps.push({ type: 'tool_result', name: toolCall.name, result: execution.result });
          messages.push({ role: 'tool', content: JSON.stringify(execution.result) });
        }

        continue;
      }

      if (response.message) {
        messages.push({ role: 'assistant', content: response.message });
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

    return makeTrace(input, options, steps, startedAt);
  },
};

export function buildToolCall(name: string, args: unknown): ModelToolCall {
  return { name, args };
}
