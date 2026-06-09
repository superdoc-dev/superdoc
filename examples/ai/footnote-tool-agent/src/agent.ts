/**
 * The tool-use loop. SDK-agnostic: this file doesn't import the OpenAI
 * SDK. It speaks the Chat Completions message shape that the server
 * proxy already emits, and routes any `tool_calls` the model returns to
 * local handlers. Bring your own transport via `postTurn`.
 *
 * One pass of `runAgentTurn`:
 *   1. POST the user message → model returns either text or tool_calls.
 *   2. Execute each tool call locally, push the result as a `role: 'tool'`
 *      message, POST again.
 *   3. Repeat until the model returns plain text, capped at maxIterations.
 *
 * The caller supplies `postTurn` so the demo's `/api/turn` contract stays
 * out of this file. Bring your own transport.
 */

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; reason: string };

export type ToolHandler = (args: Record<string, unknown>) => ToolResult;

export type AssistantReply = { content: string | null; tool_calls?: ToolCall[] };

export type AgentEvent =
  | { kind: 'tool'; name: string; result: ToolResult }
  | { kind: 'assistant'; text: string };

export type RunAgentTurnArgs = {
  userText: string;
  handlers: Record<string, ToolHandler>;
  postTurn: (messages: ChatMessage[], signal: AbortSignal) => Promise<AssistantReply>;
  onEvent: (event: AgentEvent) => void;
  signal: AbortSignal;
  maxIterations?: number;
};

export async function runAgentTurn(args: RunAgentTurnArgs): Promise<void> {
  const { userText, handlers, postTurn, onEvent, signal, maxIterations = 6 } = args;
  const messages: ChatMessage[] = [{ role: 'user', content: userText }];

  for (let i = 0; i < maxIterations; i++) {
    const reply = await postTurn(messages, signal);
    messages.push({ role: 'assistant', content: reply.content, tool_calls: reply.tool_calls });

    const toolCalls = reply.tool_calls ?? [];
    if (toolCalls.length === 0) {
      if (reply.content) onEvent({ kind: 'assistant', text: reply.content });
      return;
    }

    for (const call of toolCalls) {
      const result = dispatch(handlers, call);
      onEvent({ kind: 'tool', name: call.function.name, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  throw new Error(`Tool loop exceeded ${maxIterations} iterations.`);
}

function dispatch(handlers: Record<string, ToolHandler>, call: ToolCall): ToolResult {
  const handler = handlers[call.function.name];
  if (!handler) return { ok: false, reason: `unknown tool: ${call.function.name}` };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch (err) {
    return { ok: false, reason: `invalid arguments: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    return handler(parsed);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
