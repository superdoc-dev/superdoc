import OpenAI from 'openai';
import { dispatchSuperDocTool, loadSystemPrompt, loadTools } from './tools.js';

const MAX_TURNS = 50;

export interface RunParams {
  input: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentHandle: any; // BoundDocApi
  model: string;
  signal?: AbortSignal;
}

export type RunEvent =
  | { type: 'status'; status: string }
  | { type: 'turn_start'; turnIndex: number }
  | { type: 'token'; text: string }
  | { type: 'tool_call_start'; toolName: string; args: Record<string, unknown>; turnIndex: number }
  | { type: 'tool_call_end'; toolName: string; result: unknown; durationMs: number; turnIndex: number }
  | { type: 'done'; status: string; fullOutput: string; totalTurns: number }
  | { type: 'error'; message: string };

interface ToolCallAccumulator {
  id: string;
  name: string;
  argsChunks: string[];
}

export async function* executeRun(params: RunParams): AsyncGenerator<RunEvent> {
  const { input, conversationHistory, documentHandle, model, signal } = params;

  yield { type: 'status', status: 'running' };

  const [tools, systemPrompt] = await Promise.all([loadTools(), loadSystemPrompt()]);

  const openai = new OpenAI();
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: input },
  ];

  let fullOutput = '';

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    if (signal?.aborted) {
      yield { type: 'done', status: 'cancelled', fullOutput, totalTurns: turn - 1 };
      return;
    }

    yield { type: 'turn_start', turnIndex: turn };

    const stream = await openai.chat.completions.create(
      {
        model,
        messages,
        tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[],
        stream: true,
      },
      { signal },
    );

    // Accumulate streaming response
    const accumulators = new Map<number, ToolCallAccumulator>();
    let assistantContent = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Stream text tokens
      if (delta.content) {
        assistantContent += delta.content;
        fullOutput += delta.content;
        yield { type: 'token', text: delta.content };
      }

      // Accumulate tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!accumulators.has(tc.index)) {
            accumulators.set(tc.index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              argsChunks: [],
            });
          }
          const acc = accumulators.get(tc.index)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.argsChunks.push(tc.function.arguments);
        }
      }
    }

    // No tool calls -> done
    if (accumulators.size === 0) {
      yield { type: 'done', status: 'completed', fullOutput, totalTurns: turn };
      return;
    }

    // Build assistant message with tool_calls
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    const openaiToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

    for (const [, acc] of accumulators) {
      const argsStr = acc.argsChunks.join('');
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsStr || '{}');
      } catch {
        // malformed JSON from LLM
      }
      toolCalls.push({ id: acc.id, name: acc.name, args });
      openaiToolCalls.push({
        id: acc.id,
        type: 'function',
        function: { name: acc.name, arguments: argsStr },
      });
    }

    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: openaiToolCalls,
    });

    // Execute tool calls
    for (const tc of toolCalls) {
      yield { type: 'tool_call_start', toolName: tc.name, args: tc.args, turnIndex: turn };

      const start = Date.now();
      let result: unknown;
      try {
        result = await dispatchSuperDocTool(documentHandle, tc.name, tc.args);
      } catch (err: any) {
        result = { ok: false, error: err?.message ?? String(err) };
      }
      const durationMs = Date.now() - start;

      yield { type: 'tool_call_end', toolName: tc.name, result, durationMs, turnIndex: turn };

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
  }

  yield { type: 'done', status: 'max_turns', fullOutput, totalTurns: MAX_TURNS };
}
