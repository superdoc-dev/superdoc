import { describe, expect, test } from 'bun:test';
import { chooseTools, getMcpPrompt, getSystemPrompt, getSystemPromptForProvider, listTools } from '../tools.ts';

// superdoc_execute_code is WIP: dispatchable, not advertised.
const EXPECTED_PUBLIC_TOOL_NAMES = ['superdoc_inspect', 'superdoc_perform_action'] as const;

function toolNameFromProviderShape(tool: unknown): string | undefined {
  if (typeof tool !== 'object' || tool == null) return undefined;
  const entry = tool as Record<string, unknown>;
  if (typeof entry.name === 'string') return entry.name;
  if (entry.type === 'function' && typeof entry.function === 'object' && entry.function != null) {
    const fn = entry.function as Record<string, unknown>;
    if (typeof fn.name === 'string') return fn.name;
  }
  return undefined;
}

describe('chooseTools — core preset', () => {
  test('returns the 2 advertised agent tools', async () => {
    const result = await chooseTools({ provider: 'openai', preset: 'core' });
    const names = result.tools.map((tool) => toolNameFromProviderShape(tool));
    expect(names).toEqual(EXPECTED_PUBLIC_TOOL_NAMES as readonly string[]);
    expect(result.meta.toolCount).toBe(2);
  });

  test('anthropic + cache: marks the last tool with cache_control', async () => {
    const { tools, meta } = await chooseTools({ provider: 'anthropic', cache: true });
    expect(meta.provider).toBe('anthropic');
    expect(meta.cacheStrategy).toBe('explicit');
    expect(tools.length).toBeGreaterThan(0);
    const last = tools[tools.length - 1] as { cache_control?: { type: string } };
    expect(last.cache_control).toEqual({ type: 'ephemeral' });
    for (let i = 0; i < tools.length - 1; i++) {
      const t = tools[i] as { cache_control?: unknown };
      expect(t.cache_control).toBeUndefined();
    }
  });

  test('anthropic without cache: returns tools unchanged', async () => {
    const { tools, meta } = await chooseTools({ provider: 'anthropic' });
    expect(meta.cacheStrategy).toBe('disabled');
    for (const t of tools) {
      expect((t as { cache_control?: unknown }).cache_control).toBeUndefined();
    }
  });

  test('openai + cache: pass-through, reports automatic strategy', async () => {
    const { tools, meta } = await chooseTools({ provider: 'openai', cache: true });
    expect(meta.cacheStrategy).toBe('automatic');
    for (const t of tools) {
      expect((t as { cache_control?: unknown }).cache_control).toBeUndefined();
    }
  });

  test('vercel + cache: reports unsupported', async () => {
    const { meta } = await chooseTools({ provider: 'vercel', cache: true });
    expect(meta.cacheStrategy).toBe('unsupported');
  });

  test('does not mutate the underlying bundle on repeated calls', async () => {
    const a = await chooseTools({ provider: 'anthropic', cache: true });
    const b = await chooseTools({ provider: 'anthropic' });
    for (const t of b.tools) {
      expect((t as { cache_control?: unknown }).cache_control).toBeUndefined();
    }
    const lastA = a.tools[a.tools.length - 1] as { cache_control?: unknown };
    expect(lastA.cache_control).toBeDefined();
  });
});

describe('listTools — core preset', () => {
  test('returns the 2 advertised agent tools (provider shape)', async () => {
    const tools = await listTools('openai', 'core');
    const names = tools.map((tool) => toolNameFromProviderShape(tool));
    expect(names).toEqual(EXPECTED_PUBLIC_TOOL_NAMES as readonly string[]);
  });
});

describe('getSystemPromptForProvider', () => {
  test('returns a string content for openai/vercel/generic and an array for anthropic', async () => {
    const openai = await getSystemPromptForProvider({ provider: 'openai' });
    expect(openai.provider).toBe('openai');
    expect(typeof openai.content).toBe('string');

    const anthropic = await getSystemPromptForProvider({ provider: 'anthropic' });
    expect(anthropic.provider).toBe('anthropic');
    if (anthropic.provider !== 'anthropic') return;
    expect(Array.isArray(anthropic.content)).toBe(true);
    expect(anthropic.content[0]?.type).toBe('text');
    expect(typeof anthropic.content[0]?.text).toBe('string');
  });

  test('anthropic + cache: returns content array with cache_control', async () => {
    const result = await getSystemPromptForProvider({ provider: 'anthropic', cache: true });
    expect(result.cacheStrategy).toBe('explicit');
    if (result.provider !== 'anthropic') return;
    expect(result.content[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  test('openai + cache: returns string, reports automatic strategy', async () => {
    const result = await getSystemPromptForProvider({ provider: 'openai', cache: true });
    expect(typeof result.content).toBe('string');
    expect(result.cacheStrategy).toBe('automatic');
  });
});

describe('system + mcp prompts — core preset', () => {
  test('getSystemPrompt and getMcpPrompt return non-empty strings', async () => {
    const sys = await getSystemPrompt('core');
    const mcp = await getMcpPrompt('core');
    expect(typeof sys).toBe('string');
    expect(sys.length).toBeGreaterThan(0);
    expect(typeof mcp).toBe('string');
    expect(mcp.length).toBeGreaterThan(0);
  });
});
