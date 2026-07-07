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
 * Two presets ship built-in: `'legacy'` (codegen-emitted intent tools; the
 * default when callers omit `preset`) and `'core'` (the actions-only LLM
 * surface). The default may move once core fully replaces legacy; bumping it
 * is a coordinated change in this file alone.
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
import { corePreset } from './presets/core.js';

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
  /**
   * Action names to REMOVE from the advertised action surface (the `core`
   * preset's `superdoc_perform_action` enum/description/args shrink together).
   * Unknown names throw. Presets without an action surface (e.g. `legacy`)
   * ignore this option.
   */
  excludeActions?: readonly string[];
}

/**
 * Options for {@link PresetDescriptor.getSystemPrompt}. Mirrors the exclusion
 * options on getTools so the prompt and the advertised tool surface can be
 * narrowed TOGETHER — a prompt that documents an uncallable action teaches the
 * model to call it.
 */
export interface GetSystemPromptOptions {
  /** Drop the per-action documentation lines for these actions (core preset). */
  excludeActions?: readonly string[];
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
  getSystemPrompt(options?: GetSystemPromptOptions): Promise<string>;

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
 * The default preset returned when callers omit `preset`. Stays as `'legacy'`
 * for backward compatibility — consumers built before presets existed (today's
 * intent-tool path) keep working without changes. To exercise the `core`
 * preset, callers pass `preset: 'core'` explicitly.
 */
export const DEFAULT_PRESET = 'legacy';

const BUILTIN_PRESETS: Record<string, PresetDescriptor> = {
  legacy: legacyPreset,
  core: corePreset,
};

/**
 * Mutable registry, seeded with the built-ins. Customers add their own presets
 * via {@link registerPreset} (e.g. one produced by `extendPreset` /
 * `composePreset`) so `getPreset`/`chooseTools` can resolve them by id.
 */
const PRESETS: Record<string, PresetDescriptor> = { ...BUILTIN_PRESETS };

/** List the IDs of all registered presets. */
export function listPresets(): readonly string[] {
  return Object.keys(PRESETS);
}

/**
 * Register one or more presets so they resolve by id through `getPreset` and
 * the `chooseTools`/`dispatchSuperDocTool` plumbing. Re-registering a custom id
 * replaces the previously registered preset for that id (tests / hot-reload
 * rely on this). Built-in ids (legacy / core) cannot
 * be overwritten.
 */
export function registerPreset(...presets: PresetDescriptor[]): void {
  for (const preset of presets) {
    if (preset == null || typeof preset.id !== 'string' || preset.id.length === 0) {
      throw new SuperDocCliError('registerPreset requires a preset with a non-empty string id.', {
        code: 'INVALID_ARGUMENT',
      });
    }
    if (preset.id in BUILTIN_PRESETS) {
      throw new SuperDocCliError(`Cannot overwrite built-in preset "${preset.id}".`, {
        code: 'INVALID_ARGUMENT',
        details: { id: preset.id },
      });
    }
    PRESETS[preset.id] = preset;
  }
}

/**
 * Unregister a customer-registered preset. Idempotent (no-op if absent).
 * Rejects unregistering a built-in preset id.
 */
export function unregisterPreset(id: string): void {
  if (id in BUILTIN_PRESETS) {
    throw new SuperDocCliError(`Cannot unregister built-in preset "${id}".`, {
      code: 'INVALID_ARGUMENT',
      details: { id },
    });
  }
  delete PRESETS[id];
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
