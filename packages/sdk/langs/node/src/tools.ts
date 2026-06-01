/**
 * Public LLM-tools API. Thin layer over the preset registry — every call here
 * resolves a preset (defaulting to `legacy` for backwards compat) and delegates
 * to it.
 *
 * Presets are the unit of swapping. To add a new tool surface (e.g. handwritten
 * "core" tools, prompt-caching variant, lazy-load experiment), register a new
 * descriptor in `presets.ts` — no changes here required.
 */

import type { BoundDocApi } from './generated/client.js';
import type { InvokeOptions } from './runtime/process.js';
import {
  DEFAULT_PRESET,
  getPreset,
  listPresets,
  type CacheStrategy,
  type ToolCatalog,
  type ToolCatalogEntry,
  type ToolCatalogOperation,
  type ToolProvider,
} from './presets.js';

export { DEFAULT_PRESET, getPreset, listPresets };
export type { CacheStrategy, ToolCatalog, ToolCatalogEntry, ToolCatalogOperation, ToolProvider };

// ---------------------------------------------------------------------------
// chooseTools — provider-shaped tool list with optional cache markers
// ---------------------------------------------------------------------------

export type ToolChooserInput = {
  provider: ToolProvider;
  /**
   * Preset ID to load tools from. Defaults to {@link DEFAULT_PRESET}
   * (`'legacy'`) for backwards compatibility. Use {@link listPresets} to
   * discover available presets.
   */
  preset?: string;
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

/**
 * Select tools for a specific provider from a preset.
 *
 * @example
 * ```ts
 * // Default — legacy preset, no cache markers.
 * const { tools, meta } = await chooseTools({ provider: 'vercel' });
 *
 * // Anthropic — last tool gets cache_control automatically.
 * const { tools, meta } = await chooseTools({ provider: 'anthropic', cache: true });
 *
 * // Pick a specific preset by ID.
 * const { tools, meta } = await chooseTools({ provider: 'openai', preset: 'legacy' });
 * ```
 */
export async function chooseTools(input: ToolChooserInput): Promise<{
  tools: unknown[];
  meta: {
    provider: ToolProvider;
    preset: string;
    toolCount: number;
    cacheStrategy: CacheStrategy;
  };
}> {
  const presetId = input.preset ?? DEFAULT_PRESET;
  const preset = getPreset(presetId);
  const { tools, cacheStrategy } = await preset.getTools(input.provider, {
    cache: input.cache === true,
  });
  return {
    tools,
    meta: {
      provider: input.provider,
      preset: presetId,
      toolCount: tools.length,
      cacheStrategy,
    },
  };
}

// ---------------------------------------------------------------------------
// Catalog + listings (preset-scoped; default to legacy)
// ---------------------------------------------------------------------------

/** Return the full tool catalog for a preset (default: legacy). */
export async function getToolCatalog(preset?: string): Promise<ToolCatalog> {
  return getPreset(preset ?? DEFAULT_PRESET).getCatalog();
}

/**
 * Return the raw tool array for a provider from a preset (default: legacy).
 *
 * No cache markers are applied. Use {@link chooseTools} when you need cache
 * markers and metadata.
 */
export async function listTools(provider: ToolProvider, preset?: string): Promise<unknown[]> {
  const { tools } = await getPreset(preset ?? DEFAULT_PRESET).getTools(provider, { cache: false });
  return tools;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a tool call against a bound document handle using the default
 * preset (`legacy`).
 *
 * The document handle injects session targeting automatically; tool arguments
 * should not contain `doc` or `sessionId`.
 *
 * For preset-aware dispatch — e.g. when comparing two presets — call
 * `getPreset('id').dispatch(...)` directly.
 */
export async function dispatchSuperDocTool(
  documentHandle: BoundDocApi,
  toolName: string,
  args: Record<string, unknown> = {},
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  return getPreset(DEFAULT_PRESET).dispatch(documentHandle, toolName, args, invokeOptions);
}

// ---------------------------------------------------------------------------
// System prompts (preset-scoped; default to legacy)
// ---------------------------------------------------------------------------

/**
 * Read the packaged SDK system prompt (default preset: legacy).
 *
 * Includes a persona preamble ("You are a document editing assistant…")
 * suitable for embedded LLM usage (OpenAI, Anthropic, Vercel APIs). For MCP
 * server instructions, use {@link getMcpPrompt} instead.
 */
export async function getSystemPrompt(preset?: string): Promise<string> {
  return getPreset(preset ?? DEFAULT_PRESET).getSystemPrompt();
}

/**
 * Read the packaged MCP system prompt for intent tools (default preset: legacy).
 *
 * Omits the persona preamble and includes session lifecycle instructions
 * (open/save/close) suitable for MCP server `instructions`.
 */
export async function getMcpPrompt(preset?: string): Promise<string> {
  return getPreset(preset ?? DEFAULT_PRESET).getMcpPrompt();
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
  preset?: string;
  cache?: boolean;
}): Promise<SystemPromptForProviderResult> {
  const text = await getSystemPrompt(input.preset);
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
