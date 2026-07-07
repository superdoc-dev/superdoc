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
  registerPreset,
  unregisterPreset,
  type CacheStrategy,
  type GetSystemPromptOptions,
  type ToolCatalog,
  type ToolCatalogEntry,
  type ToolCatalogOperation,
  type ToolProvider,
} from './presets.js';

export { DEFAULT_PRESET, getPreset, listPresets, registerPreset, unregisterPreset };
export type {
  CacheStrategy,
  GetSystemPromptOptions,
  ToolCatalog,
  ToolCatalogEntry,
  ToolCatalogOperation,
  ToolProvider,
};

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
  /**
   * Action names to REMOVE from the advertised action surface. Supported by
   * the `core` preset (the `superdoc_perform_action` enum, description, and
   * argument properties shrink together); presets without an action surface
   * ignore it. Unknown names throw.
   */
  excludeActions?: readonly string[];
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
    excludeActions: input.excludeActions,
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
  invokeOptions?: InvokeOptions & {
    preset?: string;
    /** Refuse dispatch of these actions (defense-in-depth for exclusion configs). */
    excludeActions?: readonly string[];
  },
): Promise<unknown> {
  const presetId = invokeOptions?.preset ?? DEFAULT_PRESET;
  const { preset: _p, ...rest } = invokeOptions ?? {};
  return getPreset(presetId).dispatch(documentHandle, toolName, args, rest);
}

// ---------------------------------------------------------------------------
// System prompts (preset-scoped; default to DEFAULT_PRESET)
// ---------------------------------------------------------------------------

/**
 * Resolve a preset-id arg that may be a bare string OR a `{preset?: string}`
 * options object. Object form is tolerated for callers (e.g. older eval
 * harnesses) that pass `{...}` instead of a string; any unknown keys on the
 * object are silently dropped and the preset falls through to DEFAULT_PRESET.
 */
function resolvePromptPresetArg(preset?: string | { preset?: string }): string {
  if (typeof preset === 'string') return preset;
  if (preset != null && typeof preset === 'object' && typeof preset.preset === 'string') {
    return preset.preset;
  }
  return DEFAULT_PRESET;
}

/**
 * Read the SDK system prompt for the given preset (default: {@link DEFAULT_PRESET}).
 *
 * Includes a persona preamble ("You are a document editing assistant…")
 * suitable for embedded LLM usage (OpenAI, Anthropic, Vercel APIs). For MCP
 * server instructions, use {@link getMcpPrompt} instead.
 */
export type CreateAgentToolkitInput = ToolChooserInput;

export type AgentToolkit = {
  /** Provider-shaped tool definitions (see {@link chooseTools}). */
  tools: unknown[];
  meta: {
    provider: ToolProvider;
    preset: string;
    toolCount: number;
    cacheStrategy: CacheStrategy;
  };
  /** The preset's system prompt with the SAME exclusions applied. */
  systemPrompt: string;
  /**
   * {@link dispatchSuperDocTool} pre-bound to this toolkit's preset and
   * exclusions — an excluded action is refused here even if the model
   * guesses its name.
   */
  dispatch: (
    documentHandle: BoundDocApi,
    toolName: string,
    args?: Record<string, unknown>,
    invokeOptions?: InvokeOptions,
  ) => Promise<unknown>;
};

/**
 * One-call agent surface: tools, system prompt, and a pre-bound dispatcher
 * that are coherent BY CONSTRUCTION — the same preset and `excludeActions`
 * apply to all three, so an action can never linger in the prompt after
 * being excluded from the tool array (or vice versa).
 *
 * The legacy preset ignores exclusion options everywhere (it has no action
 * surface); passing `excludeActions` with `preset: 'legacy'` is a no-op,
 * matching the standalone functions.
 */
export async function createAgentToolkit(input: CreateAgentToolkitInput): Promise<AgentToolkit> {
  const presetId = input.preset ?? DEFAULT_PRESET;
  const excludeActions = input.excludeActions ? [...input.excludeActions] : undefined;
  const { tools, meta } = await chooseTools({ ...input, preset: presetId, excludeActions });
  const systemPrompt = await getSystemPrompt(presetId, excludeActions ? { excludeActions } : undefined);
  const dispatch: AgentToolkit['dispatch'] = (documentHandle, toolName, args = {}, invokeOptions) =>
    dispatchSuperDocTool(documentHandle, toolName, args, {
      ...invokeOptions,
      preset: presetId,
      ...(excludeActions ? { excludeActions } : {}),
    });
  return { tools, meta, systemPrompt, dispatch };
}

export async function getSystemPrompt(
  preset?: string | { preset?: string },
  options?: GetSystemPromptOptions,
): Promise<string> {
  return getPreset(resolvePromptPresetArg(preset)).getSystemPrompt(options);
}

/**
 * Read the MCP system prompt for the given preset (default: {@link DEFAULT_PRESET}).
 *
 * Omits the persona preamble and includes session lifecycle instructions
 * (open/save/close) suitable for MCP server `instructions`.
 */
export async function getMcpPrompt(preset?: string | { preset?: string }): Promise<string> {
  return getPreset(resolvePromptPresetArg(preset)).getMcpPrompt();
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
  /** Same exclusions as chooseTools — keeps the provider-shaped prompt and the tool surface narrowed together. */
  excludeActions?: readonly string[];
}): Promise<SystemPromptForProviderResult> {
  const text = await getSystemPrompt(
    input.preset,
    input.excludeActions ? { excludeActions: input.excludeActions } : undefined,
  );
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
