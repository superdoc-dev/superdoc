/** A JSON Schema object (draft 2020-12 compatible). */
export type JsonSchema = Record<string, unknown>;

/** MCP-style tool annotations. */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** A single LLM tool definition — what the model sees. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: ToolAnnotations;
}

/**
 * Transport-agnostic executor.
 * MCP: `(opId, input, opts) => api.invoke({ operationId, input, options })`
 * SDK: routes through CLI transport.
 */
export type Executor = (
  operationId: string,
  input: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<unknown>;

/** A router function that dispatches tool params through an executor. */
export type ToolRouter = (params: Record<string, unknown>, execute: Executor) => Promise<unknown>;
