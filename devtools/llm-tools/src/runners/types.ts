import type { CaseDefinition } from '../cases/types.js';
import type { SandboxState } from '../sandbox/state.js';
import type { ToolSnapshot } from '../tools/snapshot.js';
import type { NormalizedTrace } from '../traces/types.js';

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export type ModelToolCall = {
  name: string;
  args: unknown;
};

export type ModelRequest = {
  model: string;
  messages: ModelMessage[];
  tools?: unknown;
  temperature?: number;
};

export type ModelResponse = {
  message?: string;
  toolCalls?: ModelToolCall[];
  raw?: unknown;
};

export type ModelAdapter = {
  id: string;
  call(request: ModelRequest): Promise<ModelResponse>;
};

export type RunnerInput = {
  caseDef: CaseDefinition;
  state: SandboxState;
  toolSnapshot: ToolSnapshot;
  systemPrompt?: string;
};

export type RunnerOptions = {
  model: string;
  temperature?: number;
  maxSteps?: number;
  timeoutMs?: number;
  maxToolCallsPerStep?: number;
  adapter?: ModelAdapter;
};

export type Runner = {
  name: string;
  runCase(input: RunnerInput, options: RunnerOptions): Promise<NormalizedTrace>;
};
