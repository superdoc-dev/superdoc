export type SSEEvent =
  | { type: 'status'; status: string }
  | { type: 'turn_start'; turnIndex: number }
  | { type: 'token'; text: string }
  | { type: 'tool_call_start'; toolName: string; args: Record<string, unknown>; turnIndex: number }
  | { type: 'tool_call_end'; toolName: string; result: unknown; durationMs: number; turnIndex: number }
  | { type: 'done'; status: string; fullOutput: string; totalTurns: number }
  | { type: 'error'; message: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  displayName?: string;
}

export interface StartRoomPayload {
  model: string;
  changeMode: string;
  useSample?: boolean;
}

export interface SendMessagePayload {
  input: string;
  displayName?: string;
}

export interface ToolCallEntry {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'success' | 'error';
  durationMs?: number;
}

export interface TurnGroup {
  turnIndex: number;
  toolCalls: ToolCallEntry[];
}

export interface Trace {
  id: string;
  prompt: string;
  turns: TurnGroup[];
  status: 'running' | 'completed' | 'error';
  startedAt: number;
}
