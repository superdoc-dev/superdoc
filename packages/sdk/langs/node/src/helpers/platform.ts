/**
 * Platform helper methods for the Node SDK.
 *
 * These are hand-written convenience wrappers that handle platform-specific
 * quirks when integrating SuperDoc tools with cloud AI platforms (Bedrock,
 * Vertex AI) and direct APIs (OpenAI, Anthropic). They are NOT generated
 * from the contract and will not be overwritten by `pnpm run generate:all`.
 *
 * Usage:
 * ```ts
 * import { chooseTools, dispatchSuperDocTool } from '@superdoc-dev/sdk';
 * import { sanitizeToolSchemas, formatToolResult, mergeDiscoveredTools } from '@superdoc-dev/sdk/helpers/platform';
 *
 * // Vertex AI: strip unsupported JSON Schema keywords
 * const { tools } = await chooseTools({ provider: 'generic' });
 * const sanitized = sanitizeToolSchemas(tools, 'vertex');
 *
 * // Bedrock: format tool results in platform-native shape
 * const result = await dispatchSuperDocTool(client, name, args);
 * const formatted = formatToolResult(result, { target: 'bedrock', toolUseId });
 *
 * // Merge discover_tools output into platform-native config
 * mergeDiscoveredTools(toolConfig, discoverResult, { provider: 'anthropic', target: 'bedrock' });
 * ```
 */

import type { ToolProvider } from '../tools.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Cloud platforms that need schema or result sanitization. */
export type PlatformTarget = 'bedrock' | 'vertex';

/** All targets that `formatToolResult` supports. */
export type ResultTarget = 'bedrock' | 'vertex' | 'anthropic' | 'openai';

export interface FormatToolResultOptions {
  target: ResultTarget;
  /** Required for bedrock, anthropic, openai. */
  toolUseId?: string;
  /** Required for vertex, openai. */
  name?: string;
}

export interface MergeDiscoveredToolsOptions {
  provider: ToolProvider;
  target?: PlatformTarget;
}

/* ------------------------------------------------------------------ */
/*  sanitizeToolSchemas                                                */
/* ------------------------------------------------------------------ */

/**
 * JSON Schema keywords unsupported by each platform.
 * Extend this map when new platform incompatibilities are discovered.
 */
const UNSUPPORTED_KEYWORDS: Record<PlatformTarget, Set<string>> = {
  vertex: new Set(['const']),
  bedrock: new Set(), // no-op currently — future-proof
};

/**
 * Recursively strip JSON Schema keywords that the target platform doesn't support.
 *
 * Returns a new array — the original tools are not mutated.
 */
export function sanitizeToolSchemas<T>(tools: T[], target: PlatformTarget): T[] {
  const blocked = UNSUPPORTED_KEYWORDS[target];
  if (!blocked || blocked.size === 0) return tools;
  return tools.map((t) => deepStripKeys(t, blocked) as T);
}

function deepStripKeys(obj: unknown, blocked: Set<string>): unknown {
  if (Array.isArray(obj)) return obj.map((item) => deepStripKeys(item, blocked));
  if (typeof obj !== 'object' || obj === null) return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (blocked.has(key)) continue;
    result[key] = deepStripKeys(value, blocked);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  formatToolResult                                                   */
/* ------------------------------------------------------------------ */

/**
 * Wrap a raw `dispatchSuperDocTool` result in the platform-native shape
 * expected by each provider's conversation API.
 */
export function formatToolResult(result: unknown, options: FormatToolResultOptions): unknown {
  const { target, toolUseId, name } = options;

  switch (target) {
    case 'bedrock': {
      // Bedrock requires json content to be a plain object (not array or primitive)
      const json = typeof result === 'object' && result !== null && !Array.isArray(result) ? result : { result };
      return { toolResult: { toolUseId, content: [{ json }] } };
    }

    case 'vertex':
      return { functionResponse: { name, response: result } };

    case 'anthropic':
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: JSON.stringify(result),
      };

    case 'openai':
      return {
        role: 'tool',
        tool_call_id: toolUseId,
        content: JSON.stringify(result),
      };

    default:
      return result;
  }
}

/**
 * Format an error from a failed tool call in the platform-native error shape.
 */
export function formatToolError(error: unknown, options: FormatToolResultOptions): unknown {
  const { target, toolUseId, name } = options;
  const message = error instanceof Error ? error.message : String(error);

  switch (target) {
    case 'bedrock':
      return {
        toolResult: {
          toolUseId,
          content: [{ text: `Error: ${message}` }],
          status: 'error',
        },
      };

    case 'vertex':
      return { functionResponse: { name, response: { error: message } } };

    case 'anthropic':
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: `Error: ${message}`,
        is_error: true,
      };

    case 'openai':
      return {
        role: 'tool',
        tool_call_id: toolUseId,
        content: `Error: ${message}`,
      };

    default:
      return { error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  mergeDiscoveredTools                                               */
/* ------------------------------------------------------------------ */

/**
 * Extract newly discovered tools from a `discover_tools` result, convert them
 * to the provider's native format, apply platform sanitization, and merge them
 * into an existing tool configuration object.
 *
 * Mutates `toolConfig` in place. Returns the number of new tools added.
 *
 * Supported toolConfig shapes:
 * - **bedrock**: `{ tools: [{ toolSpec: { name, description, inputSchema } }] }`
 * - **vertex**: `[{ functionDeclarations: [...] }]`
 * - **openai/anthropic/vercel/generic**: `unknown[]` (array of tool objects)
 */
export function mergeDiscoveredTools(
  toolConfig: unknown,
  discoverResult: unknown,
  options: MergeDiscoveredToolsOptions,
): number {
  const newTools = extractDiscoveredTools(discoverResult);
  if (newTools.length === 0) return 0;

  const { provider, target } = options;

  // Collect existing tool names to avoid duplicates
  const existingNames = collectExistingNames(toolConfig, target);

  let added = 0;

  for (const tool of newTools) {
    const name = extractToolName(tool, provider);
    if (!name || existingNames.has(name)) continue;
    existingNames.add(name);

    const formatted = formatToolForConfig(tool, provider, target);
    pushToConfig(toolConfig, formatted, target);
    added++;
  }

  return added;
}

/** Pull the `tools` array from a discover_tools result. */
function extractDiscoveredTools(result: unknown): unknown[] {
  if (typeof result !== 'object' || result === null) return [];
  const obj = result as Record<string, unknown>;
  if (Array.isArray(obj.tools)) return obj.tools;
  return [];
}

/** Extract a tool's name regardless of provider format. */
function extractToolName(tool: unknown, provider: ToolProvider): string | null {
  if (typeof tool !== 'object' || tool === null) return null;
  const obj = tool as Record<string, unknown>;

  // Anthropic / Generic: top-level name
  if (typeof obj.name === 'string') return obj.name;

  // OpenAI / Vercel: nested under function.name
  if (typeof obj.function === 'object' && obj.function !== null) {
    const fn = obj.function as Record<string, unknown>;
    if (typeof fn.name === 'string') return fn.name;
  }

  return null;
}

/** Collect existing tool names from a platform-native config. */
function collectExistingNames(toolConfig: unknown, target?: PlatformTarget): Set<string> {
  const names = new Set<string>();

  if (target === 'bedrock' && isRecord(toolConfig)) {
    const tools = (toolConfig as Record<string, unknown>).tools;
    if (Array.isArray(tools)) {
      for (const t of tools) {
        const spec = isRecord(t) ? (t as Record<string, unknown>).toolSpec : null;
        if (isRecord(spec) && typeof (spec as Record<string, unknown>).name === 'string') {
          names.add((spec as Record<string, unknown>).name as string);
        }
      }
    }
  } else if (target === 'vertex' && Array.isArray(toolConfig)) {
    const decls = (toolConfig[0] as Record<string, unknown>)?.functionDeclarations;
    if (Array.isArray(decls)) {
      for (const d of decls) {
        if (isRecord(d) && typeof (d as Record<string, unknown>).name === 'string') {
          names.add((d as Record<string, unknown>).name as string);
        }
      }
    }
  } else if (Array.isArray(toolConfig)) {
    for (const t of toolConfig) {
      if (isRecord(t)) {
        const obj = t as Record<string, unknown>;
        if (typeof obj.name === 'string') names.add(obj.name);
        if (isRecord(obj.function)) {
          const fn = obj.function as Record<string, unknown>;
          if (typeof fn.name === 'string') names.add(fn.name);
        }
      }
    }
  }

  return names;
}

/** Convert a discovered tool to the platform-native shape and push into config. */
function formatToolForConfig(tool: unknown, _provider: ToolProvider, target?: PlatformTarget): unknown {
  const obj = tool as Record<string, unknown>;

  if (target === 'bedrock') {
    // Discovered tools from 'anthropic' provider: { name, description, input_schema }
    return {
      toolSpec: {
        name: obj.name,
        description: obj.description,
        inputSchema: { json: obj.input_schema ?? obj.parameters },
      },
    };
  }

  if (target === 'vertex') {
    // Discovered tools from 'generic' provider: { name, description, parameters }
    const params = obj.parameters ?? obj.input_schema;
    return {
      name: obj.name,
      description: obj.description,
      parameters: params ? deepStripKeys(params, UNSUPPORTED_KEYWORDS.vertex) : params,
    };
  }

  // For direct API providers (openai, anthropic, vercel, generic) — pass through as-is
  return tool;
}

/** Push a formatted tool into the platform-native config structure. */
function pushToConfig(toolConfig: unknown, formatted: unknown, target?: PlatformTarget): void {
  if (target === 'bedrock' && isRecord(toolConfig)) {
    const tools = (toolConfig as Record<string, unknown>).tools;
    if (Array.isArray(tools)) tools.push(formatted);
  } else if (target === 'vertex' && Array.isArray(toolConfig)) {
    const first = toolConfig[0] as Record<string, unknown> | undefined;
    if (first && Array.isArray(first.functionDeclarations)) {
      first.functionDeclarations.push(formatted);
    }
  } else if (Array.isArray(toolConfig)) {
    toolConfig.push(formatted);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
