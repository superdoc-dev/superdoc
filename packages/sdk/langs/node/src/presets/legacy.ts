/**
 * Legacy preset — wraps the existing codegen-emitted intent tools verbatim.
 *
 * The legacy preset is a read-through over the packaged tool artifacts in
 * `packages/sdk/tools/` (catalog, per-provider tool JSON, system prompts) and
 * delegates dispatch to the codegen-emitted `dispatchIntentTool`. It is the
 * default preset returned by `chooseTools()` when callers omit `preset`.
 *
 * Nothing in this file relocates or rewrites the packaged artifacts. The whole
 * point of the read-through wrapper is that running `generate:all` continues
 * to refresh `packages/sdk/tools/*.json` in place; the legacy preset picks up
 * the new files on the next call.
 *
 * @internal
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoundDocApi } from '../generated/client.js';
import type { InvokeOptions } from '../runtime/process.js';
import { SuperDocCliError } from '../runtime/errors.js';
import { dispatchIntentTool } from '../generated/intent-dispatch.generated.js';
import type {
  GetToolsOptions,
  GetToolsResult,
  PresetDescriptor,
  ToolCatalog,
  ToolCatalogEntry,
  ToolCatalogOperation,
  ToolProvider,
} from '../presets.js';

// Resolve tools directory relative to package root (works from both src/ and dist/)
const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools');

const providerFileByName: Record<ToolProvider, string> = {
  openai: 'tools.openai.json',
  anthropic: 'tools.anthropic.json',
  vercel: 'tools.vercel.json',
  generic: 'tools.generic.json',
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
      details: { filePath, message: error instanceof Error ? error.message : String(error) },
    });
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new SuperDocCliError('Packaged tool artifact is invalid JSON.', {
      code: 'TOOLS_ASSET_INVALID',
      details: { filePath, message: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function readProviderTools(provider: ToolProvider): Promise<{
  contractVersion: string;
  tools: unknown[];
}> {
  return readJson(providerFileByName[provider]);
}

// Cached catalog instance — loaded once per process.
let _catalogCache: ToolCatalog | null = null;

async function getCachedCatalog(): Promise<ToolCatalog> {
  if (_catalogCache == null) {
    _catalogCache = await readJson<ToolCatalog>('catalog.json');
  }
  return _catalogCache;
}

/**
 * Apply provider-specific caching markers to the tools array. Clones the last
 * entry instead of mutating the input. Anthropic gets an explicit
 * `cache_control` on the last tool; other providers pass through.
 */
function applyCacheMarkers(tools: unknown[], provider: ToolProvider, cacheRequested: boolean): GetToolsResult {
  if (!cacheRequested) {
    return { tools, cacheStrategy: 'disabled' };
  }

  if (provider === 'anthropic') {
    if (tools.length === 0) return { tools, cacheStrategy: 'explicit' };
    // Anthropic: marking the LAST tool with cache_control caches the entire
    // tools block (and everything before it in the request — system prompt
    // first if it also has cache_control). Shallow-spread the last entry so we
    // don't mutate the cached tool list in place.
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

  // 1. Reject unknown keys (additionalProperties: false in merged schema)
  const knownKeys = new Set(Object.keys(properties));
  const unknownKeys = Object.keys(args).filter((k) => !knownKeys.has(k));
  if (unknownKeys.length > 0) {
    throw new SuperDocCliError(`Unknown argument(s) for ${toolName}: ${unknownKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, unknownKeys, knownKeys: [...knownKeys] },
    });
  }

  // 2. Reject missing universally-required keys (merged schema `required`)
  const missingKeys = required.filter((k) => args[k] == null);
  if (missingKeys.length > 0) {
    throw new SuperDocCliError(`Missing required argument(s) for ${toolName}: ${missingKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, missingKeys },
    });
  }

  // 3. Reject missing per-operation required keys. For multi-action tools,
  //    resolve the operation by action; for single-op tools, use the sole entry.
  const action = args.action;
  let op: ToolCatalogOperation | undefined;
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
 * Check per-operation required constraints. Handles both flat `required: string[]`
 * and discriminated `requiredOneOf: string[][]` shapes emitted by codegen.
 */
function validateOperationRequired(
  toolName: string,
  action: unknown,
  args: Record<string, unknown>,
  op: ToolCatalogOperation,
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

async function legacyGetTools(provider: ToolProvider, options?: GetToolsOptions): Promise<GetToolsResult> {
  const { tools } = await readProviderTools(provider);
  // Fail fast on malformed provider artifacts so agents don't silently boot
  // with zero tools. Matches the pre-presets behavior of the public
  // `listTools` path (TOOLS_ASSET_INVALID).
  if (!Array.isArray(tools)) {
    throw new SuperDocCliError('Tool provider bundle is missing tools array.', {
      code: 'TOOLS_ASSET_INVALID',
      details: { provider },
    });
  }
  return applyCacheMarkers(tools, provider, options?.cache === true);
}

async function legacyGetCatalog(): Promise<ToolCatalog> {
  return getCachedCatalog();
}

async function legacyGetSystemPrompt(): Promise<string> {
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

async function legacyGetMcpPrompt(): Promise<string> {
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

async function legacyDispatch(
  documentHandle: BoundDocApi,
  toolName: string,
  args: Record<string, unknown>,
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

export const legacyPreset: PresetDescriptor = {
  id: 'legacy',
  description: 'Codegen-emitted intent tools (default). Wraps packages/sdk/tools/ artifacts verbatim.',
  supportsCacheControl: true,

  getTools: legacyGetTools,
  getCatalog: legacyGetCatalog,
  getSystemPrompt: legacyGetSystemPrompt,
  getMcpPrompt: legacyGetMcpPrompt,
  dispatch: legacyDispatch,
};
