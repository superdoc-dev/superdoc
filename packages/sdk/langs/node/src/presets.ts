/**
 * Preset registry for SuperDoc LLM tools.
 *
 * A preset is a self-contained collection of LLM tools — provider catalogs
 * (openai / anthropic / vercel / generic), a system prompt, and a dispatcher.
 * Multiple presets can coexist in the SDK; consumers select one at runtime via
 * `chooseTools({ preset })`.
 *
 *     const { tools, meta } = await chooseTools({ provider: 'vercel', preset: 'legacy' });
 *
 * v1 ships a single preset: `'legacy'` — a thin wrapper around today's
 * codegen-emitted intent tools. When callers omit `preset`, `legacy` is used.
 * The default may move once a replacement preset reaches parity; bumping it is
 * a coordinated change in this file alone.
 *
 * Presets are NOT versioned. The preset id encodes the variant; a new shape
 * ships as a new id, not a new version of an existing one.
 *
 * @internal
 */

import type { BoundDocApi } from './generated/client.js';
import type { InvokeOptions } from './runtime/process.js';
import { SuperDocCliError } from './runtime/errors.js';
import { legacyPreset } from './presets/legacy.js';

/**
 * Wire format the tools are emitted in.
 *
 * - `openai`     — OpenAI Chat Completions / Responses
 * - `anthropic`  — Anthropic Messages API
 * - `vercel`     — Vercel AI SDK (provider-agnostic adapter)
 * - `generic`    — vendor-neutral JSON Schema shape
 */
export type ToolProvider = 'openai' | 'anthropic' | 'vercel' | 'generic';

/**
 * Prompt-cache strategy returned by `chooseTools.meta.cacheStrategy`.
 *
 * - `explicit`    — preset emitted provider-specific cache markers (Anthropic `cache_control`)
 * - `automatic`   — provider caches automatically (OpenAI ≥ 1024 prompt tokens)
 * - `unsupported` — pass-through; caching depends on the underlying model (vercel/generic)
 * - `disabled`    — caller passed `cache: false` or omitted the flag
 */
export type CacheStrategy = 'explicit' | 'automatic' | 'unsupported' | 'disabled';

/**
 * One operation row in a {@link ToolCatalogEntry}. Each catalog entry can
 * dispatch to one or more operations (e.g. multi-action intent tools), so
 * the catalog records the operation id and the action discriminator that
 * routes to it.
 */
export type ToolCatalogOperation = {
  operationId: string;
  intentAction: string;
  required?: string[];
  requiredOneOf?: string[][];
};

/**
 * One entry in the {@link ToolCatalog}. Matches the shape of the catalog
 * emitted by the legacy preset's codegen — kept stable as the public
 * catalog row shape so TypeScript consumers can introspect `tools[i]`
 * without losing property typing.
 */
export type ToolCatalogEntry = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates: boolean;
  operations: ToolCatalogOperation[];
};

/**
 * Full tool catalog shape. The legacy preset returns the existing codegen
 * catalog with `contractVersion`, `generatedAt`, `toolCount`, `tools`.
 */
export type ToolCatalog = {
  contractVersion: string;
  generatedAt: string | null;
  toolCount: number;
  tools: ToolCatalogEntry[];
};

export interface GetToolsOptions {
  /**
   * When `true`, the preset applies provider-specific prompt-cache markers
   * (Anthropic `cache_control: { type: "ephemeral" }` on the last tool,
   * for example). When omitted or `false`, no markers are added.
   */
  cache?: boolean;
}

export interface GetToolsResult {
  tools: unknown[];
  cacheStrategy: CacheStrategy;
}

/**
 * Self-contained preset of LLM tools.
 *
 * Each preset owns:
 *   - its tool catalogs per provider format
 *   - its system prompt (and MCP-flavored variant)
 *   - its dispatcher (how a named tool call routes against a doc handle)
 *
 * Presets are stateless; the same descriptor handles every call.
 *
 * @internal
 */
export interface PresetDescriptor {
  /** Stable identifier — used as the preset's only "version" reference. */
  readonly id: string;

  /** Human-readable description shown by `listPresets()`. */
  readonly description: string;

  /**
   * Whether this preset's provider adapters emit Anthropic prompt-cache
   * markers when called with `cache: true`. Informational; per-provider
   * behavior is reported via `GetToolsResult.cacheStrategy`.
   */
  readonly supportsCacheControl: boolean;

  /** Tool definitions for the requested provider format. */
  getTools(provider: ToolProvider, options?: GetToolsOptions): Promise<GetToolsResult>;

  /** Full tool catalog with metadata (contract version, tool count, etc.). */
  getCatalog(): Promise<ToolCatalog>;

  /** System prompt for embedded LLM usage (OpenAI/Anthropic/Vercel APIs). */
  getSystemPrompt(): Promise<string>;

  /** System prompt for MCP server `instructions`. */
  getMcpPrompt(): Promise<string>;

  /**
   * Dispatch a tool call against a bound document handle.
   *
   * The handle injects session targeting; `args` must NOT carry `doc` or
   * `sessionId`. Returns whatever the underlying operation produces.
   */
  dispatch(
    documentHandle: BoundDocApi,
    toolName: string,
    args: Record<string, unknown>,
    invokeOptions?: InvokeOptions,
  ): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * The default preset returned when callers omit `preset`. Set to `'legacy'`
 * so consumers built before presets existed (today's intent-tool path) keep
 * working without changes.
 */
export const DEFAULT_PRESET = 'legacy';

const PRESETS: Record<string, PresetDescriptor> = {
  legacy: legacyPreset,
};

/** List the IDs of all registered presets. */
export function listPresets(): readonly string[] {
  return Object.keys(PRESETS);
}

/**
 * Resolve a preset by ID. Throws {@link SuperDocCliError} with code
 * `PRESET_NOT_FOUND` if the ID is not registered. Omit the argument to
 * get the default preset.
 */
export function getPreset(id: string = DEFAULT_PRESET): PresetDescriptor {
  const preset = PRESETS[id];
  if (preset == null) {
    throw new SuperDocCliError(`Unknown LLM-tools preset: "${id}"`, {
      code: 'PRESET_NOT_FOUND',
      details: { id, availablePresets: Object.keys(PRESETS) },
    });
  }
  return preset;
}
