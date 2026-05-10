import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoundDocApi } from './generated/client.js';
import type { InvokeOptions } from './runtime/process.js';
import { SuperDocCliError } from './runtime/errors.js';
import { dispatchIntentTool } from './generated/intent-dispatch.generated.js';

export type ToolProvider = 'openai' | 'anthropic' | 'vercel' | 'generic';

// Resolve tools directory relative to package root (works from both src/ and dist/)
const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const providerFileByName: Record<ToolProvider, string> = {
  openai: 'tools.openai.json',
  anthropic: 'tools.anthropic.json',
  vercel: 'tools.vercel.json',
  generic: 'tools.generic.json',
};

export type ToolCatalog = {
  contractVersion: string;
  generatedAt: string | null;
  toolCount: number;
  tools: ToolCatalogEntry[];
};

type OperationEntry = {
  operationId: string;
  intentAction: string;
  required?: string[];
  requiredOneOf?: string[][];
};

type ToolCatalogEntry = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates: boolean;
  operations: OperationEntry[];
};

const STRIP_EMPTY_OPTIONAL_ARGS = new Set(['parentId', 'parentCommentId', 'id', 'status']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isObviouslyCorruptedToolArgKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length === 0 || !/[\p{L}\p{N}]/u.test(trimmed);
}

function stripCorruptedToolArgKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripCorruptedToolArgKeys(item));
  }

  if (!isRecord(value)) return value;

  const clean: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isObviouslyCorruptedToolArgKey(key)) continue;
    clean[key] = stripCorruptedToolArgKeys(entryValue);
  }
  return clean;
}

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(toolsDir, fileName);
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new SuperDocCliError('Unable to load packaged tool artifact.', {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new SuperDocCliError('Packaged tool artifact is invalid JSON.', {
      code: 'TOOLS_ASSET_INVALID',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function loadProviderBundle(provider: ToolProvider): Promise<{
  contractVersion: string;
  tools: unknown[];
}> {
  return readJson(providerFileByName[provider]);
}

async function loadCatalog(): Promise<ToolCatalog> {
  return readJson<ToolCatalog>('catalog.json');
}

export async function getToolCatalog(): Promise<ToolCatalog> {
  return getCachedCatalog();
}

export async function listTools(provider: ToolProvider): Promise<unknown[]> {
  const bundle = await loadProviderBundle(provider);
  const tools = bundle.tools;
  if (!Array.isArray(tools)) {
    throw new SuperDocCliError('Tool provider bundle is missing tools array.', {
      code: 'TOOLS_ASSET_INVALID',
      details: { provider },
    });
  }
  return tools;
}

export type ToolChooserInput = {
  provider: ToolProvider;
  /**
   * When `true`, applies provider-specific prompt-caching markers to the
   * returned tools so subsequent identical requests reuse the cached prefix.
   *
   * Per-provider behavior:
   * - **anthropic**: marks the last tool entry with
   *   `cache_control: { type: "ephemeral" }`. The full tools block becomes
   *   cacheable; cache TTL is ~5 minutes by default.
   * - **openai**: no-op. OpenAI caches prompts ≥ 1024 tokens automatically;
   *   the helper returns tools unchanged but still reports
   *   `cacheStrategy: 'automatic'` so callers can rely on the indicator.
   * - **vercel** / **generic**: pass-through. Caching depends on the
   *   underlying model; reported as `'unsupported'`.
   */
  cache?: boolean;
};

export type CacheStrategy = 'explicit' | 'automatic' | 'unsupported' | 'disabled';

/**
 * Select all intent tools for a specific provider.
 *
 * Returns all intent tools in the requested provider format. Pass
 * `cache: true` to apply provider-specific caching markers (see
 * {@link ToolChooserInput.cache}).
 *
 * @example
 * ```ts
 * // Anthropic — last tool gets cache_control automatically.
 * const { tools, meta } = await chooseTools({ provider: 'anthropic', cache: true });
 *
 * // OpenAI — caching is automatic when prompts exceed 1024 tokens.
 * const { tools } = await chooseTools({ provider: 'openai', cache: true });
 * ```
 */
export async function chooseTools(input: ToolChooserInput): Promise<{
  tools: unknown[];
  meta: {
    provider: ToolProvider;
    toolCount: number;
    cacheStrategy: CacheStrategy;
  };
}> {
  const bundle = await loadProviderBundle(input.provider);
  const rawTools = Array.isArray(bundle.tools) ? bundle.tools : [];
  const cacheRequested = input.cache === true;

  const { tools, cacheStrategy } = applyCacheMarkers(rawTools, input.provider, cacheRequested);

  return {
    tools,
    meta: {
      provider: input.provider,
      toolCount: tools.length,
      cacheStrategy,
    },
  };
}

/**
 * Apply provider-specific caching markers to the tools array. Mutates a clone,
 * never the input. Anthropic gets an explicit `cache_control` on the last
 * tool; other providers pass through.
 */
function applyCacheMarkers(
  tools: unknown[],
  provider: ToolProvider,
  cacheRequested: boolean,
): { tools: unknown[]; cacheStrategy: CacheStrategy } {
  if (!cacheRequested) {
    return { tools, cacheStrategy: 'disabled' };
  }

  if (provider === 'anthropic') {
    if (tools.length === 0) return { tools, cacheStrategy: 'explicit' };
    // Anthropic: marking the LAST tool with cache_control caches the entire
    // tools block (and everything before it in the request — system prompt
    // first if it also has cache_control). Shallow-spread the last entry so we
    // don't mutate the cached bundle in place.
    const next = tools.slice(0, -1);
    const last = {
      ...(tools[tools.length - 1] as Record<string, unknown>),
      cache_control: { type: 'ephemeral' },
    };
    next.push(last);
    return { tools: next, cacheStrategy: 'explicit' };
  }

  if (provider === 'openai') {
    // OpenAI caches prompts ≥ 1024 tokens automatically. No marker needed,
    // but we still report cacheStrategy:'automatic' so callers can branch on
    // it (e.g. for measurement).
    return { tools, cacheStrategy: 'automatic' };
  }

  // vercel / generic — depends on underlying model.
  return { tools, cacheStrategy: 'unsupported' };
}

function resolveDocApiMethod(
  documentHandle: BoundDocApi,
  operationId: string,
): (args: unknown, options?: InvokeOptions) => Promise<unknown> {
  const tokens = operationId.split('.').slice(1);
  let cursor: unknown = documentHandle;

  for (const token of tokens) {
    if (!isRecord(cursor) || !(token in cursor)) {
      throw new SuperDocCliError(`No SDK doc method found for operation ${operationId}.`, {
        code: 'TOOL_DISPATCH_NOT_FOUND',
        details: { operationId, token },
      });
    }
    cursor = cursor[token];
  }

  if (typeof cursor !== 'function') {
    throw new SuperDocCliError(`Resolved member for ${operationId} is not callable.`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { operationId },
    });
  }

  return cursor as (args: unknown, options?: InvokeOptions) => Promise<unknown>;
}

// Cached catalog instance — loaded once per process.
let _catalogCache: ToolCatalog | null = null;

async function getCachedCatalog(): Promise<ToolCatalog> {
  if (_catalogCache == null) {
    _catalogCache = await loadCatalog();
  }
  return _catalogCache;
}

/**
 * Validate tool arguments against the catalog schema.
 *
 * Checks three things in order:
 * 1. No unknown keys (additionalProperties: false in merged schema)
 * 2. All universally-required keys present (merged schema `required`)
 * 3. All action-specific required keys present (per-operation `required`)
 */
function validateToolArgs(toolName: string, args: Record<string, unknown>, tool: ToolCatalogEntry): void {
  const schema = tool.inputSchema;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required: string[] = Array.isArray(schema.required) ? (schema.required as string[]) : [];

  // 1. Reject unknown keys
  const knownKeys = new Set(Object.keys(properties));
  const unknownKeys = Object.keys(args).filter((k) => !knownKeys.has(k));
  if (unknownKeys.length > 0) {
    throw new SuperDocCliError(`Unknown argument(s) for ${toolName}: ${unknownKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, unknownKeys, knownKeys: [...knownKeys] },
    });
  }

  // 2. Reject missing universally-required keys
  const missingKeys = required.filter((k) => args[k] == null);
  if (missingKeys.length > 0) {
    throw new SuperDocCliError(`Missing required argument(s) for ${toolName}: ${missingKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, missingKeys },
    });
  }

  // 3. Reject missing per-operation required keys.
  //    For multi-action tools, resolve the operation by action; for single-op
  //    tools, use the sole operation entry.
  const action = args.action;
  let op: OperationEntry | undefined;
  if (typeof action === 'string' && tool.operations.length > 1) {
    op = tool.operations.find((o) => o.intentAction === action);
  } else if (tool.operations.length === 1) {
    op = tool.operations[0];
  }

  if (op) {
    validateOperationRequired(toolName, action, args, op);
  }
}

/**
 * Check per-operation required constraints.
 *
 * Handles two shapes emitted by the codegen:
 *   - `required: string[]`        — all listed keys must be present
 *   - `requiredOneOf: string[][]`  — at least one branch must be fully satisfied
 *     (mirrors JSON Schema `oneOf` with per-branch `required` arrays)
 */
function validateOperationRequired(
  toolName: string,
  action: unknown,
  args: Record<string, unknown>,
  op: OperationEntry,
): void {
  const actionLabel = typeof action === 'string' ? ` action "${action}"` : '';

  if (op.requiredOneOf && op.requiredOneOf.length > 0) {
    const satisfied = op.requiredOneOf.some((branch) => branch.every((k) => args[k] != null));
    if (!satisfied) {
      const options = op.requiredOneOf.map((b) => b.join(' + ')).join(' | ');
      throw new SuperDocCliError(
        `Missing required argument(s) for ${toolName}${actionLabel}: must provide one of: ${options}`,
        {
          code: 'INVALID_ARGUMENT',
          details: { toolName, action, requiredOneOf: op.requiredOneOf },
        },
      );
    }
  } else if (op.required && op.required.length > 0) {
    const missingActionKeys = op.required.filter((k) => args[k] == null);
    if (missingActionKeys.length > 0) {
      throw new SuperDocCliError(
        `Missing required argument(s) for ${toolName}${actionLabel}: ${missingActionKeys.join(', ')}`,
        {
          code: 'INVALID_ARGUMENT',
          details: { toolName, action, missingKeys: missingActionKeys },
        },
      );
    }
  }
}

/**
 * Dispatch a tool call against a bound document handle.
 *
 * The document handle injects session targeting automatically.
 * Tool arguments should not contain `doc` or `sessionId`.
 */
export async function dispatchSuperDocTool(
  documentHandle: BoundDocApi,
  toolName: string,
  args: Record<string, unknown> = {},
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  if (!isRecord(args)) {
    throw new SuperDocCliError(`Tool arguments for ${toolName} must be an object.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName },
    });
  }

  const sanitizedArgs = stripCorruptedToolArgKeys(args);
  if (!isRecord(sanitizedArgs)) {
    throw new SuperDocCliError(`Tool arguments for ${toolName} must be an object.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName },
    });
  }

  // Validate against the tool schema before dispatch.
  const catalog = await getCachedCatalog();
  const tool = catalog.tools.find((t) => t.toolName === toolName);
  if (tool == null) {
    throw new SuperDocCliError(`Unknown tool: ${toolName}`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { toolName },
    });
  }
  validateToolArgs(toolName, sanitizedArgs, tool);

  // Strip empty strings for known optional ID/enum params that LLMs fill with ""
  // instead of omitting. Only target params where "" is never a valid value.
  const cleanArgs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitizedArgs)) {
    if (value === '' && STRIP_EMPTY_OPTIONAL_ARGS.has(key)) continue;
    cleanArgs[key] = value;
  }

  return dispatchIntentTool(toolName, cleanArgs, (operationId, input) => {
    const method = resolveDocApiMethod(documentHandle, operationId);
    return method(input, invokeOptions);
  });
}

/**
 * Read the bundled SDK system prompt for intent tools.
 *
 * This prompt includes a persona preamble ("You are a document editing assistant…")
 * suitable for embedded LLM usage (OpenAI, Anthropic, Vercel APIs).
 * For MCP server instructions, use {@link getMcpPrompt} instead.
 */
export async function getSystemPrompt(): Promise<string> {
  const promptPath = path.join(toolsDir, 'system-prompt.md');
  try {
    return await readFile(promptPath, 'utf8');
  } catch {
    throw new SuperDocCliError('System prompt not found.', {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: { filePath: promptPath },
    });
  }
}

/**
 * Read the bundled MCP system prompt for intent tools.
 *
 * This prompt omits the persona preamble and includes session lifecycle
 * instructions (open/save/close) suitable for MCP server `instructions`.
 */
export async function getMcpPrompt(): Promise<string> {
  const promptPath = path.join(toolsDir, 'system-prompt-mcp.md');
  try {
    return await readFile(promptPath, 'utf8');
  } catch {
    throw new SuperDocCliError('MCP system prompt not found.', {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: { filePath: promptPath },
    });
  }
}

// ---------------------------------------------------------------------------
// Provider-aware system prompt (with optional caching markers)
// ---------------------------------------------------------------------------

/**
 * Anthropic content block representation of the system prompt with optional
 * `cache_control` for prompt caching.
 */
export type AnthropicSystemPrompt = Array<{
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}>;

export type SystemPromptForProviderResult =
  | { provider: 'anthropic'; content: AnthropicSystemPrompt; cacheStrategy: CacheStrategy }
  | { provider: 'openai' | 'vercel' | 'generic'; content: string; cacheStrategy: CacheStrategy };

/**
 * Get the system prompt formatted for a specific LLM provider, with optional
 * prompt caching applied.
 *
 * - **anthropic** with `cache: true`: returns a content array with
 *   `cache_control: { type: "ephemeral" }` so the system prompt block is
 *   cached. Pass directly as the `system` parameter on `messages.create()`.
 * - **openai**: returns the prompt as a string. OpenAI caches prompts
 *   ≥ 1024 tokens automatically — `cache: true` is informational only and
 *   sets `cacheStrategy: 'automatic'`.
 * - **vercel** / **generic**: returns the prompt as a string. Caching is
 *   delegated to the underlying model.
 *
 * @example
 * ```ts
 * // Anthropic
 * const sys = await getSystemPromptForProvider({ provider: 'anthropic', cache: true });
 * await client.messages.create({ system: sys.content, tools, messages, model });
 *
 * // OpenAI
 * const sys = await getSystemPromptForProvider({ provider: 'openai', cache: true });
 * messages.unshift({ role: 'system', content: sys.content });
 * ```
 */
export async function getSystemPromptForProvider(input: {
  provider: ToolProvider;
  cache?: boolean;
}): Promise<SystemPromptForProviderResult> {
  const text = await getSystemPrompt();
  const cacheRequested = input.cache === true;

  if (input.provider === 'anthropic') {
    const block: AnthropicSystemPrompt[number] = { type: 'text', text };
    if (cacheRequested) block.cache_control = { type: 'ephemeral' };
    return {
      provider: 'anthropic',
      content: [block],
      cacheStrategy: cacheRequested ? 'explicit' : 'disabled',
    };
  }

  const cacheStrategy: CacheStrategy = !cacheRequested
    ? 'disabled'
    : input.provider === 'openai'
      ? 'automatic'
      : 'unsupported';

  return { provider: input.provider, content: text, cacheStrategy };
}
